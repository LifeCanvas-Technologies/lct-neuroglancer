/**
 * @license
 * Copyright 2017 Google Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @file Viewer for a group of layers.
 */

import "#src/layer_group_viewer.css";
import { debounce } from "lodash-es";
import type { InputEventBindings as DataPanelInputEventBindings } from "#src/data_panel_layout.js";
import { DataPanelLayoutContainer } from "#src/data_panel_layout.js";
import type { DisplayContext } from "#src/display_context.js";
import type {
  LayerListSpecification,
  MouseSelectionState,
  SelectedLayerState,
} from "#src/layer/index.js";
import { LayerSubsetSpecification } from "#src/layer/index.js";
import type {
  CoordinateSpacePlaybackVelocity,
  TrackableCrossSectionZoom,
  TrackableNavigationLink,
  TrackableProjectionZoom,
} from "#src/navigation_state.js";
import {
  DisplayPose,
  LinkedCoordinateSpacePlaybackVelocity,
  LinkedDepthRange,
  LinkedDisplayDimensions,
  LinkedOrientationState,
  LinkedPosition,
  LinkedRelativeDisplayScales,
  linkedStateLegacyJsonView,
  LinkedZoomState,
  NavigationLinkType,
  NavigationState,
  PlaybackManager,
  WatchableDisplayDimensionRenderInfo,
} from "#src/navigation_state.js";
import type { RenderLayerRole } from "#src/renderlayer.js";
import { TrackableBoolean } from "#src/trackable_boolean.js";
import type {
  WatchableSet,
  WatchableValueInterface,
} from "#src/trackable_value.js";
import { registerNested } from "#src/trackable_value.js";
import { ContextMenu } from "#src/ui/context_menu.js";
import { popDragStatus, pushDragStatus } from "#src/ui/drag_and_drop.js";
import { LayerBar } from "#src/ui/layer_bar.js";
import { endLayerDrag, startLayerDrag } from "#src/ui/layer_drag_and_drop.js";
import { setupPositionDropHandlers } from "#src/ui/position_drag_and_drop.js";
import { LocalToolBinder } from "#src/ui/tool.js";
import { AutomaticallyFocusedElement } from "#src/util/automatic_focus.js";
import type { TrackableRGB } from "#src/util/color.js";
import type { Borrowed, Owned } from "#src/util/disposable.js";
import { RefCounted } from "#src/util/disposable.js";
import { removeChildren } from "#src/util/dom.js";
import { getDropEffectFromModifiers } from "#src/util/drag_and_drop.js";
import {
  dispatchEventAction,
  registerActionListener,
} from "#src/util/event_action_map.js";
import {
  CompoundTrackable,
  optionallyRestoreFromJsonMember,
} from "#src/util/trackable.js";
import type { WatchableVisibilityPriority } from "#src/visibility_priority/frontend.js";
import { EnumSelectWidget } from "#src/widget/enum_widget.js";
import type { TrackableScaleBarOptions } from "#src/widget/scale_bar.js";

declare let NEUROGLANCER_SHOW_LAYER_BAR_EXTRA_BUTTONS: boolean | undefined;

export interface LayerGroupViewerState {
  display: Borrowed<DisplayContext>;
  navigationState: Owned<NavigationState>;
  perspectiveNavigationState: Owned<NavigationState>;
  velocity: Owned<CoordinateSpacePlaybackVelocity>;
  mouseState: MouseSelectionState;
  showAxisLines: TrackableBoolean;
  wireFrame: TrackableBoolean;
  enableAdaptiveDownsampling: TrackableBoolean;
  showScaleBar: TrackableBoolean;
  scaleBarOptions: TrackableScaleBarOptions;
  showPerspectiveSliceViews: TrackableBoolean;
  layerSpecification: Owned<LayerListSpecification>;
  inputEventBindings: DataPanelInputEventBindings;
  visibility: WatchableVisibilityPriority;
  selectedLayer: SelectedLayerState;
  visibleLayerRoles: WatchableSet<RenderLayerRole>;
  crossSectionBackgroundColor: TrackableRGB;
  perspectiveViewBackgroundColor: TrackableRGB;
  hideCrossSectionBackground3D: TrackableBoolean;
}

export interface LayerGroupViewerOptions {
  showLayerPanel: WatchableValueInterface<boolean>;
  showViewerMenu: boolean;
  showLayerHoverValues: WatchableValueInterface<boolean>;
}

export const viewerDragType = "neuroglancer-layer-group-viewer";

export function hasViewerDrag(event: DragEvent) {
  return event.dataTransfer!.types.indexOf(viewerDragType) !== -1;
}

let dragSource: { viewer: LayerGroupViewer; disposer: () => void } | undefined;

export function getCompatibleViewerDragSource(
  manager: Borrowed<LayerListSpecification>,
): LayerGroupViewer | undefined {
  if (
    dragSource &&
    dragSource.viewer.layerSpecification.rootLayers === manager.rootLayers
  ) {
    return dragSource.viewer;
  }
  return undefined;
}

export function getViewerDropEffect(
  event: DragEvent,
  manager: Borrowed<LayerListSpecification>,
): { dropEffect: "move" | "copy"; dropEffectMessage: string } {
  const source = getCompatibleViewerDragSource(manager);
  let defaultDropEffect: "move" | "copy";
  let moveAllowed = false;
  if (
    source === undefined ||
    source.layerSpecification === source.layerSpecification.root
  ) {
    // Either drag source is from another window, or there is only a single layer group.  If the
    // drag source is from another window, move is not supported because we cannot reliably
    // communicate the drop effect back to the source window anyway.  If there is only a single
    // layer group, move is not supported since it would be a no-op.
    defaultDropEffect = "copy";
  } else {
    moveAllowed = true;
    defaultDropEffect = "move";
  }
  return getDropEffectFromModifiers(event, defaultDropEffect, moveAllowed);
}

export class LinkedViewerNavigationState extends RefCounted {
  position: LinkedPosition;
  velocity: LinkedCoordinateSpacePlaybackVelocity;
  relativeDisplayScales: LinkedRelativeDisplayScales;
  displayDimensions: LinkedDisplayDimensions;
  displayDimensionRenderInfo: WatchableDisplayDimensionRenderInfo;
  crossSectionOrientation: LinkedOrientationState;
  crossSectionScale: LinkedZoomState<TrackableCrossSectionZoom>;
  projectionOrientation: LinkedOrientationState;
  projectionScale: LinkedZoomState<TrackableProjectionZoom>;
  crossSectionDepthRange: LinkedDepthRange;
  projectionDepthRange: LinkedDepthRange;

  navigationState: NavigationState;
  projectionNavigationState: NavigationState;

  constructor(parent: {
    navigationState: Borrowed<NavigationState>;
    velocity: Borrowed<CoordinateSpacePlaybackVelocity>;
    perspectiveNavigationState: Borrowed<NavigationState>;
  }) {
    super();
    this.relativeDisplayScales = new LinkedRelativeDisplayScales(
      parent.navigationState.pose.relativeDisplayScales.addRef(),
    );
    this.displayDimensions = new LinkedDisplayDimensions(
      parent.navigationState.pose.displayDimensions.addRef(),
    );
    this.position = new LinkedPosition(
      parent.navigationState.position.addRef(),
    );
    this.velocity = this.registerDisposer(
      new LinkedCoordinateSpacePlaybackVelocity(
        parent.velocity,
        this.position.link,
      ),
    );
    this.crossSectionOrientation = new LinkedOrientationState(
      parent.navigationState.pose.orientation.addRef(),
    );
    this.displayDimensionRenderInfo = this.registerDisposer(
      new WatchableDisplayDimensionRenderInfo(
        this.relativeDisplayScales.value,
        this.displayDimensions.value,
      ),
    );
    this.crossSectionScale = new LinkedZoomState(
      parent.navigationState.zoomFactor.addRef() as TrackableCrossSectionZoom,
      this.displayDimensionRenderInfo.addRef(),
    );
    this.crossSectionDepthRange = new LinkedDepthRange(
      parent.navigationState.depthRange.addRef(),
      this.displayDimensionRenderInfo,
    );
    this.projectionDepthRange = new LinkedDepthRange(
      parent.perspectiveNavigationState.depthRange.addRef(),
      this.displayDimensionRenderInfo,
    );
    this.navigationState = this.registerDisposer(
      new NavigationState(
        new DisplayPose(
          this.position.value,
          this.displayDimensionRenderInfo.addRef(),
          this.crossSectionOrientation.value,
        ),
        this.crossSectionScale.value,
        this.crossSectionDepthRange.value,
      ),
    );
    this.projectionOrientation = new LinkedOrientationState(
      parent.perspectiveNavigationState.pose.orientation.addRef(),
    );
    this.projectionScale = new LinkedZoomState(
      parent.perspectiveNavigationState.zoomFactor.addRef() as TrackableProjectionZoom,
      this.displayDimensionRenderInfo.addRef(),
    );
    this.projectionNavigationState = this.registerDisposer(
      new NavigationState(
        new DisplayPose(
          this.position.value.addRef(),
          this.displayDimensionRenderInfo.addRef(),
          this.projectionOrientation.value,
        ),
        this.projectionScale.value,
        this.projectionDepthRange.value,
      ),
    );
  }

  copyToParent() {
    for (const x of [
      this.relativeDisplayScales,
      this.displayDimensions,
      this.position,
      this.velocity,
      this.crossSectionOrientation,
      this.crossSectionScale,
      this.projectionOrientation,
      this.projectionScale,
    ]) {
      x.copyToPeer();
    }
  }

  register(state: CompoundTrackable) {
    state.add("dimensionRenderScales", this.relativeDisplayScales);
    state.add("displayDimensions", this.displayDimensions);
    state.add("position", linkedStateLegacyJsonView(this.position));
    state.add("velocity", this.velocity);
    state.add("crossSectionOrientation", this.crossSectionOrientation);
    state.add("crossSectionScale", this.crossSectionScale);
    state.add("crossSectionDepth", this.crossSectionDepthRange);
    state.add("projectionOrientation", this.projectionOrientation);
    state.add("projectionScale", this.projectionScale);
    state.add("projectionDepth", this.projectionDepthRange);
  }
}

function makeViewerMenu(parent: HTMLElement, viewer: LayerGroupViewer) {
  const contextMenu = new ContextMenu(parent);
  const menu = contextMenu.element;
  menu.classList.add("neuroglancer-layer-group-viewer-context-menu");
  const closeButton = document.createElement("button");
  closeButton.textContent = "Remove layer group";
  menu.appendChild(closeButton);
  contextMenu.registerEventListener(closeButton, "click", () => {
    viewer.layerSpecification.layerManager.clear();
  });
  const { viewerNavigationState } = viewer;
  for (const [name, model] of <[string, TrackableNavigationLink][]>[
    ["Render scale factors", viewerNavigationState.relativeDisplayScales.link],
    ["Render dimensions", viewerNavigationState.displayDimensions.link],
    ["Position", viewerNavigationState.position.link],
    [
      "Cross-section orientation",
      viewerNavigationState.crossSectionOrientation.link,
    ],
    ["Cross-section zoom", viewerNavigationState.crossSectionScale.link],
    [
      "Cross-section depth range",
      viewerNavigationState.crossSectionDepthRange.link,
    ],
    [
      "3-D projection orientation",
      viewerNavigationState.projectionOrientation.link,
    ],
    ["3-D projection zoom", viewerNavigationState.projectionScale.link],
    [
      "3-D projection depth range",
      viewerNavigationState.projectionDepthRange.link,
    ],
  ]) {
    const widget = contextMenu.registerDisposer(new EnumSelectWidget(model));
    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.flexDirection = "row";
    label.style.whiteSpace = "nowrap";
    label.textContent = name;
    label.appendChild(widget.element);
    menu.appendChild(label);
  }
  return contextMenu;
}

export class LayerGroupViewer extends RefCounted {
  layerSpecification: LayerListSpecification;
  viewerNavigationState: LinkedViewerNavigationState;
  get perspectiveNavigationState() {
    return this.viewerNavigationState.projectionNavigationState;
  }
  get navigationState() {
    return this.viewerNavigationState.navigationState;
  }

  get selectionDetailsState() {
    return this.layerSpecification.root.selectionState;
  }

  // FIXME: don't make viewerState a property, just make these things properties directly
  get display() {
    return this.viewerState.display;
  }
  get selectedLayer() {
    return this.viewerState.selectedLayer;
  }
  get layerManager() {
    return this.layerSpecification.layerManager;
  }

  get chunkManager() {
    return this.layerSpecification.chunkManager;
  }
  get mouseState() {
    return this.viewerState.mouseState;
  }
  get showAxisLines() {
    return this.viewerState.showAxisLines;
  }
  get wireFrame() {
    return this.viewerState.wireFrame;
  }
  get enableAdaptiveDownsampling() {
    return this.viewerState.enableAdaptiveDownsampling;
  }
  get hideCrossSectionBackground3D() {
    return this.viewerState.hideCrossSectionBackground3D;
  }
  get showScaleBar() {
    return this.viewerState.showScaleBar;
  }
  get showPerspectiveSliceViews() {
    return this.viewerState.showPerspectiveSliceViews;
  }
  get inputEventBindings() {
    return this.viewerState.inputEventBindings;
  }
  get visibility() {
    return this.viewerState.visibility;
  }
  get visibleLayerRoles() {
    return this.viewerState.visibleLayerRoles;
  }
  get crossSectionBackgroundColor() {
    return this.viewerState.crossSectionBackgroundColor;
  }
  get perspectiveViewBackgroundColor() {
    return this.viewerState.perspectiveViewBackgroundColor;
  }
  get scaleBarOptions() {
    return this.viewerState.scaleBarOptions;
  }
  layerPanel: LayerBar | undefined;
  layout: DataPanelLayoutContainer;
  toolBinder: LocalToolBinder<this>;

  options: LayerGroupViewerOptions;

  state = new CompoundTrackable();

  get changed() {
    return this.state.changed;
  }

  constructor(
    public element: HTMLElement,
    public viewerState: LayerGroupViewerState,
    options: Partial<LayerGroupViewerOptions> = {},
  ) {
    super();
    this.options = {
      showLayerPanel: new TrackableBoolean(true),
      showViewerMenu: false,
      showLayerHoverValues: new TrackableBoolean(true),
      ...options,
    };
    this.layerSpecification = this.registerDisposer(
      viewerState.layerSpecification,
    );
    this.toolBinder = this.registerDisposer(
      new LocalToolBinder(this, this.layerSpecification.root.toolBinder),
    );
    this.viewerNavigationState = this.registerDisposer(
      new LinkedViewerNavigationState(viewerState),
    );
    this.viewerNavigationState.register(this.state);
    this.registerDisposer(
      registerNested((context, linkValue) => {
        if (linkValue !== NavigationLinkType.UNLINKED) return;
        context.registerDisposer(
          new PlaybackManager(
            this.layerSpecification.root.display,
            this.viewerNavigationState.position.value,
            this.viewerNavigationState.velocity.velocity,
          ),
        );
      }, this.viewerNavigationState.position.link),
    );
    if (!(this.layerSpecification instanceof LayerSubsetSpecification)) {
      this.state.add("layers", {
        changed: this.layerSpecification.changed,
        toJSON: () =>
          this.layerSpecification.layerManager.managedLayers.map((x) => x.name),
        reset: () => {
          throw new Error("not implemented");
        },
        restoreState: () => {
          throw new Error("not implemented");
        },
      });
    } else {
      this.state.add("layers", this.layerSpecification);
    }
    element.classList.add("neuroglancer-layer-group-viewer");
    this.registerDisposer(new AutomaticallyFocusedElement(element));

    this.layout = this.registerDisposer(
      new DataPanelLayoutContainer(this, "xy"),
    );
    this.state.add("layout", this.layout);
    this.state.add("toolBindings", this.toolBinder);
    this.registerActionBindings();
    this.registerDisposer(this.layerManager.useDirectly());
    this.registerDisposer(
      setupPositionDropHandlers(element, this.navigationState.position),
    );
    this.registerDisposer(
      this.options.showLayerPanel.changed.add(
        this.registerCancellable(debounce(() => this.updateUI(), 0)),
      ),
    );
    this.makeUI();
  }

  bindAction(action: string, handler: () => void) {
    this.registerDisposer(
      registerActionListener(this.element, action, handler),
    );
  }

  private registerActionBindings() {
    this.bindAction("add-layer", () => {
      if (this.layerPanel) {
        this.layerPanel.addLayerMenu();
      }
    });
    this.bindAction("t-", () => {
      this.navigationState.pose.translateNonDisplayDimension(0, -1);
    });
    this.bindAction("t+", () => {
      this.navigationState.pose.translateNonDisplayDimension(0, +1);
    });
  }

  toJSON(): any {
    return { type: "viewer", ...this.state.toJSON() };
  }

  reset() {
    this.state.reset();
  }

  restoreState(obj: unknown) {
    this.state.restoreState(obj);
    // Handle legacy properties
    optionallyRestoreFromJsonMember(
      obj,
      "crossSectionZoom",
      linkedStateLegacyJsonView(this.viewerNavigationState.crossSectionScale),
    );
    optionallyRestoreFromJsonMember(
      obj,
      "perspectiveZoom",
      linkedStateLegacyJsonView(this.viewerNavigationState.projectionScale),
    );
    optionallyRestoreFromJsonMember(
      obj,
      "perspectiveOrientation",
      this.viewerNavigationState.projectionOrientation,
    );
  }

  private makeUI() {
    this.element.style.flex = "1";
    this.element.style.display = "flex";
    this.element.style.flexDirection = "column";
    this.element.appendChild(this.layout.element);
    this.updateUI();
  }

  private updateUI() {
    const { options } = this;
    const showLayerPanel = options.showLayerPanel.value;
    if (this.layerPanel !== undefined && !showLayerPanel) {
      this.layerPanel.dispose();
      this.layerPanel = undefined;
      return;
    }
    if (showLayerPanel && this.layerPanel === undefined) {
      const layerPanel = (this.layerPanel = new LayerBar(
        this,
        () => this.layout.toJSON(),
        this.options.showLayerHoverValues,
      ));
      if (options.showViewerMenu) {
        layerPanel.registerDisposer(makeViewerMenu(layerPanel.element, this));
        layerPanel.element.title =
          "Right click for options, drag to move/copy layer group.";
      } else {
        layerPanel.element.title = "Drag to move/copy layer group.";
      }

      if (
        typeof NEUROGLANCER_SHOW_LAYER_BAR_EXTRA_BUTTONS !== "undefined" &&
        NEUROGLANCER_SHOW_LAYER_BAR_EXTRA_BUTTONS === true
      ) {
        {
          const button = document.createElement("button");
          button.textContent = "Clear segments";
          button.title = `De-select all objects ("x")`;
          button.addEventListener("click", (event: MouseEvent) => {
            dispatchEventAction(event, event, { action: "clear-segments" });
          });
          layerPanel.element.appendChild(button);
        }
        for (const layout of ["3d", "xy", "xz", "yz"]) {
          const button = document.createElement("button");
          button.textContent = layout;
          button.title = `Switch to ${layout} layout`;
          button.addEventListener("click", () => {
            let newLayout: string;
            if (this.layout.name === layout) {
              if (layout !== "3d") {
                newLayout = `${layout}-3d`;
              } else {
                newLayout = "4panel-alt";
              }
            } else {
              newLayout = layout;
            }
            this.layout.name = newLayout;
          });
          layerPanel.element.appendChild(button);
        }
      }
      layerPanel.element.draggable = true;
      const layerPanelElement = layerPanel.element;
      layerPanelElement.addEventListener("dragstart", (event: DragEvent) => {
        pushDragStatus(
          event,
          layerPanel.element,
          "drag",
          "Drag layer group to the left/top/right/bottom edge of a layer group, or to another layer bar/panel (including in another Neuroglancer window)",
        );
        startLayerDrag(event, {
          manager: this.layerSpecification,
          layers: this.layerManager.managedLayers,
          layoutSpec: this.layout.toJSON(),
        });
        const disposer = () => {
          if (dragSource && dragSource.viewer === this) {
            dragSource = undefined;
          }
          this.unregisterDisposer(disposer);
        };
        dragSource = { viewer: this, disposer };
        this.registerDisposer(disposer);
        const dragData = this.toJSON();
        dragData.layers = undefined;
        event.dataTransfer!.setData(viewerDragType, JSON.stringify(dragData));
        layerPanel.element.style.backgroundColor = "black";
        setTimeout(() => {
          layerPanel.element.style.backgroundColor = "";
        }, 0);
      });
      layerPanel.element.addEventListener("dragend", (event: DragEvent) => {
        popDragStatus(event, layerPanelElement, "drag");
        endLayerDrag();
        if (dragSource !== undefined && dragSource.viewer === this) {
          dragSource.disposer();
        }
      });
      this.element.insertBefore(layerPanelElement, this.element.firstChild);
    }
  }

  disposed() {
    removeChildren(this.element);
    const { layerPanel } = this;
    if (layerPanel !== undefined) {
      layerPanel.dispose();
      this.layerPanel = undefined;
    }
    super.disposed();
  }
}
