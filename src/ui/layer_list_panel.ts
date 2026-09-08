/**
 * @license
 * Copyright 2021 Google Inc.
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

import "#src/ui/layer_list_panel.css";
import svg_controls_alt from "ikonate/icons/controls-alt.svg?raw";
import svg_eye_crossed from "ikonate/icons/eye-crossed.svg?raw";
import svg_eye from "ikonate/icons/eye.svg?raw";
import svg_plus from "ikonate/icons/plus.svg?raw";
import type {
  LayerManager,
  ManagedUserLayer,
  TopLevelLayerListSpecification,
} from "#src/layer/index.js";
import { addNewLayer, deleteLayer, makeLayer } from "#src/layer/index.js";
import { TrackableBooleanCheckbox } from "#src/trackable_boolean.js";
import type { WatchableValueInterface } from "#src/trackable_value.js";
import type { DropLayers } from "#src/ui/layer_drag_and_drop.js";
import {
  registerLayerBarDragLeaveHandler,
  registerLayerBarDropHandlers,
  registerLayerDragHandlers,
} from "#src/ui/layer_drag_and_drop.js";
import { LayerNameWidget } from "#src/ui/layer_side_panel.js";
import type { SidePanelManager } from "#src/ui/side_panel.js";
import { SidePanel } from "#src/ui/side_panel.js";
import type { SidePanelLocation } from "#src/ui/side_panel_location.js";
import {
  DEFAULT_SIDE_PANEL_LOCATION,
  TrackableSidePanelLocation,
} from "#src/ui/side_panel_location.js";
import { animationFrameDebounce } from "#src/util/animation_frame_debounce.js";
import { RefCounted } from "#src/util/disposable.js";
import { updateChildren } from "#src/util/dom.js";
import { emptyToUndefined } from "#src/util/json.js";
import type { Trackable } from "#src/util/trackable.js";
import { CheckboxIcon } from "#src/widget/checkbox_icon.js";
import { makeDeleteButton } from "#src/widget/delete_button.js";
import { makeIcon } from "#src/widget/icon.js";
import { LayerTypeIndicatorWidget } from "#src/widget/layer_type_indicator.js";

const DEFAULT_LAYER_LIST_PANEL_LOCATION: SidePanelLocation = {
  ...DEFAULT_SIDE_PANEL_LOCATION,
  side: "left",
  row: 0,
  visible: true,
};

export class LayerListPanelState implements Trackable {
  location = new TrackableSidePanelLocation(DEFAULT_LAYER_LIST_PANEL_LOCATION);
  get changed() {
    return this.location.changed;
  }

  restoreState(obj: unknown) {
    if (obj === undefined) return;
    this.location.restoreState(obj);
  }
  reset() {
    this.location.reset();
  }
  toJSON() {
    return emptyToUndefined(this.location.toJSON());
  }
}

export class LayerVisibilityWidget extends RefCounted {
  element = document.createElement("div");
  constructor(public layer: ManagedUserLayer) {
    super();
    const { element } = this;
    const hideIcon = makeIcon({
      svg: svg_eye,
      title: "Hide layer",
      onClick: () => {
        this.layer.setVisible(false);
      },
    });
    const showIcon = makeIcon({
      svg: svg_eye_crossed,
      title: "Show layer",
      onClick: () => {
        this.layer.setVisible(true);
      },
    });
    hideIcon.classList.add("neuroglancer-layer-list-panel-eye-icon");
    showIcon.classList.add("neuroglancer-layer-list-panel-eye-icon");
    element.appendChild(showIcon);
    element.appendChild(hideIcon);
    const updateView = () => {
      const visible = this.layer.visible;
      hideIcon.style.display = visible ? "" : "none";
      showIcon.style.display = !visible ? "" : "none";
    };
    updateView();
    this.registerDisposer(layer.layerChanged.add(updateView));
  }
}

function makeSelectedLayerSidePanelCheckboxIcon(layer: ManagedUserLayer) {
  const { selectedLayer } = layer.manager.root;
  const icon = new CheckboxIcon(
    {
      get value() {
        return selectedLayer.layer === layer && selectedLayer.visible;
      },
      set value(value: boolean) {
        if (value) {
          selectedLayer.layer = layer;
          selectedLayer.visible = true;
        } else {
          selectedLayer.visible = false;
        }
      },
      changed: selectedLayer.changed,
    },
    {
      backgroundScheme: "dark",
      enableTitle: "Show layer side panel",
      disableTitle: "Hide layer side panel",
      svg: svg_controls_alt,
    },
  );
  icon.element.classList.add("neuroglancer-layer-list-panel-item-controls");
  return icon;
}

class LayerListItem extends RefCounted {
  element = document.createElement("div");
  numberElement = document.createElement("div");
  valueElement = document.createElement("div");
  generation = -1;
  constructor(
    public panel: LayerListPanel,
    public layer: ManagedUserLayer,
  ) {
    super();
    const { element, numberElement } = this;
    element.classList.add("neuroglancer-layer-list-panel-item");
    numberElement.classList.add("neuroglancer-layer-list-panel-item-number");
    const layerNameWidget = this.registerDisposer(new LayerNameWidget(layer));
    layerNameWidget.element.classList.add(
      "neuroglancer-layer-list-panel-item-name",
    );
    element.appendChild(
      this.registerDisposer(
        new TrackableBooleanCheckbox(
          {
            get value() {
              return !layer.archived;
            },
            set value(value: boolean) {
              layer.setArchived(!value);
            },
            changed: layer.layerChanged,
          },
          {
            enableTitle: "Archive layer (disable and remove from layer groups)",
            disableTitle:
              "Unarchive layer (enable and add to all layer groups)",
          },
        ),
      ).element,
    );
    element.appendChild(numberElement);
    element.appendChild(
      this.registerDisposer(new LayerVisibilityWidget(layer)).element,
    );
    element.appendChild(new LayerTypeIndicatorWidget(layer).element);
    element.appendChild(layerNameWidget.element);
    const { valueElement } = this;
    valueElement.classList.add("neuroglancer-layer-list-panel-item-value");
    valueElement.style.display = panel.showLayerHoverValues.value
      ? ""
      : "none";
    element.appendChild(valueElement);
    element.appendChild(
      this.registerDisposer(makeSelectedLayerSidePanelCheckboxIcon(layer))
        .element,
    );
    const deleteButton = makeDeleteButton({
      title: "Delete layer",
      onClick: () => {
        deleteLayer(this.layer);
      },
    });
    deleteButton.classList.add("neuroglancer-layer-list-panel-item-delete");
    element.appendChild(deleteButton);
    registerLayerDragHandlers(panel, element, layer, {
      isLayerListPanel: true,
      getLayoutSpec: () => undefined,
    });
    registerLayerBarDropHandlers(
      panel,
      element,
      layer,
      /*allowArchived=*/ true,
    );

    element.addEventListener("click", (event: MouseEvent) => {
      if (event.ctrlKey) {
        panel.selectedLayer.toggle(layer);
        event.preventDefault();
      } else if (event.altKey) {
        layer.pickEnabled = !layer.pickEnabled;
        event.preventDefault();
      }
    });

    element.addEventListener("contextmenu", (event: MouseEvent) => {
      panel.selectedLayer.toggle(layer);
      event.stopPropagation();
      event.preventDefault();
    });
  }
}

export class LayerListPanel extends SidePanel {
  private items = new Map<ManagedUserLayer, LayerListItem>();
  itemContainer = document.createElement("div");
  layerDropZone = document.createElement("div");
  titleElement: HTMLElement;
  get layerManager() {
    return this.manager.layerManager;
  }
  get selectedLayer() {
    return this.manager.selectedLayer;
  }
  dropLayers: DropLayers | undefined;
  dragEnterCount = 0;
  private generation = -1;
  constructor(
    sidePanelManager: SidePanelManager,
    public manager: TopLevelLayerListSpecification,
    public state: LayerListPanelState,
    public showLayerHoverValues: WatchableValueInterface<boolean>,
  ) {
    super(sidePanelManager, state.location);
    const { itemContainer, layerDropZone } = this;
    const { titleBar, titleElement } = this.addTitleBar({ title: "" });
    this.titleElement = titleElement!;
    const addButton = makeIcon({
      svg: svg_plus,
      title:
        "Click to add layer, control+click/right click/⌘+click to add local annotation layer.",
    });
    const addLayer = (event: MouseEvent) => {
      if (event.ctrlKey || event.metaKey || event.type === "contextmenu") {
        const layer = makeLayer(this.manager, "annotation", {
          type: "annotation",
          source: "local://annotations",
        });
        this.manager.add(layer);
        this.selectedLayer.layer = layer;
        this.selectedLayer.visible = true;
      } else {
        addNewLayer(this.manager, this.selectedLayer);
      }
    };
    this.registerEventListener(addButton, "click", addLayer);
    this.registerEventListener(addButton, "contextmenu", addLayer);
    titleBar.appendChild(addButton);
    itemContainer.classList.add("neuroglancer-layer-list-panel-items");
    this.addBody(itemContainer);
    layerDropZone.style.flex = "1";
    const debouncedUpdateView = this.registerCancellable(
      animationFrameDebounce(() => this.render()),
    );
    this.visibility.changed.add(debouncedUpdateView);
    this.registerDisposer(
      this.layerManager.layersChanged.add(debouncedUpdateView),
    );
    this.registerDisposer(this.selectedLayer.changed.add(debouncedUpdateView));
    const scheduleValuesUpdate = this.registerCancellable(
      animationFrameDebounce(() => this.updateValues()),
    );
    this.registerDisposer(
      this.manager.layerSelectedValues.changed.add(scheduleValuesUpdate),
    );
    this.registerDisposer(
      showLayerHoverValues.changed.add(() => this.updateValuesVisibility()),
    );
    registerLayerBarDragLeaveHandler(this);
    registerLayerBarDropHandlers(
      this,
      layerDropZone,
      undefined,
      /*allowArchived=*/ true,
    );
    this.render();
  }

  render() {
    const self = this;
    const selectedLayer = this.selectedLayer.layer;
    const generation = ++this.generation;
    let numVisible = 0;
    let numHidden = 0;
    let numArchived = 0;
    this.layerManager.updateNonArchivedLayerIndices();
    function* getItems() {
      const { items } = self;
      let numNonArchivedLayers = 0;
      for (const layer of self.layerManager.managedLayers) {
        if (!layer.archived) ++numNonArchivedLayers;
      }
      const numberElementWidth = `${numNonArchivedLayers.toString().length}ch`;
      for (const layer of self.layerManager.managedLayers) {
        if (layer.visible) {
          ++numVisible;
        } else if (!layer.archived) {
          ++numHidden;
        } else {
          ++numArchived;
        }
        let item = items.get(layer);
        if (item === undefined) {
          item = self.registerDisposer(new LayerListItem(self, layer));
          items.set(layer, item);
          item.generation = generation;
        } else {
          item.generation = generation;
        }
        const { nonArchivedLayerIndex } = layer;
        item.numberElement.style.width = numberElementWidth;
        if (layer.archived) {
          item.numberElement.style.visibility = "hidden";
        } else {
          item.numberElement.style.visibility = "";
          item.numberElement.textContent = `${nonArchivedLayerIndex + 1}`;
        }
        item.element.dataset.selected = (layer === selectedLayer).toString();
        item.element.dataset.archived = layer.archived.toString();
        yield item.element;
      }
      for (const [userLayer, item] of items) {
        if (generation !== item.generation) {
          items.delete(userLayer);
          self.unregisterDisposer(item);
          item.dispose();
        }
      }
      yield self.layerDropZone;
    }
    updateChildren(this.itemContainer, getItems());
    let title = "Layers";
    if (numVisible || numHidden || numArchived) {
      title += " (";
      let sep = "";
      if (numVisible + numHidden) {
        title += `${numVisible}/${numHidden + numVisible} visible`;
        sep = ", ";
      }
      if (numArchived) {
        title += `${sep}${numArchived} archived`;
      }
      title += ")";
    }
    this.titleElement.textContent = title;
  }

  private updateValues() {
    const { layerSelectedValues } = this.manager;
    for (const [layer, item] of this.items) {
      const userLayer = layer.layer;
      let text = "";
      if (userLayer !== null) {
        const state = layerSelectedValues.get(userLayer);
        if (state !== undefined && state.value !== undefined) {
          text = "" + state.value;
        }
      }
      item.valueElement.textContent = text;
      // The text can be long (e.g. a segmentation label), and `max-width`
      // ellipsis-truncates it visually; a title tooltip still shows it in
      // full on hover.
      item.valueElement.title = text;
    }
  }

  private updateValuesVisibility() {
    const show = this.showLayerHoverValues.value;
    for (const item of this.items.values()) {
      item.valueElement.style.display = show ? "" : "none";
    }
  }
}

export class LayerArchiveCountWidget extends RefCounted {
  element = document.createElement("div");
  constructor(public layerManager: LayerManager) {
    super();
    const debouncedRender = this.registerCancellable(
      animationFrameDebounce(() => this.render()),
    );
    this.registerDisposer(layerManager.layersChanged.add(debouncedRender));
    this.render();
  }

  private render() {
    let numArchived = 0;
    const { managedLayers } = this.layerManager;
    for (const layer of managedLayers) {
      if (layer.archived) ++numArchived;
    }
    const { element } = this;
    if (numArchived !== 0) {
      const numLayers = managedLayers.length;
      element.textContent = `${numLayers - numArchived}/${numLayers}`;
    } else {
      element.textContent = "";
    }
  }
}
