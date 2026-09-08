/**
 * @license
 * Copyright 2016 Google Inc.
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
 * @file A small, global undo stack for interactive annotation edits (moving
 * points/edges, inserting/deleting points, placing a polygon). Each entry
 * groups every mutation from a single user gesture so one undo reverts the
 * whole gesture, not just one annotation within it.
 */

import type { MultiscaleAnnotationSource } from "#src/annotation/frontend_source.js";
import type {
  Annotation,
  AnnotationId,
  AnnotationSource,
} from "#src/annotation/index.js";

export interface AnnotationUndoEntry {
  id: AnnotationId;
  /** The annotation's value before the gesture; `null` if it did not exist. */
  previous: Annotation | null;
}

export interface AnnotationUndoRecord {
  source: AnnotationSource | MultiscaleAnnotationSource;
  entries: AnnotationUndoEntry[];
}

const MAX_UNDO_STACK_SIZE = 100;
const undoStack: AnnotationUndoRecord[] = [];

export function pushAnnotationUndoRecord(record: AnnotationUndoRecord) {
  if (record.entries.length === 0) return;
  undoStack.push(record);
  if (undoStack.length > MAX_UNDO_STACK_SIZE) {
    undoStack.shift();
  }
}

/**
 * Reverts the most recent recorded annotation gesture. Returns whether there
 * was anything to undo.
 */
export function undoLastAnnotationChange(): boolean {
  const record = undoStack.pop();
  if (record === undefined) return false;
  const { source } = record;
  for (const { id, previous } of record.entries) {
    const ref = source.getReference(id);
    try {
      if (previous === null) {
        source.delete(ref);
        continue;
      }
      if (ref.value === null) {
        // Was deleted (or never existed) by the gesture being undone.
        source.add({ ...previous }, /*commit=*/ true);
      } else {
        source.update(ref, previous);
        source.commit(ref);
      }
    } finally {
      ref.dispose();
    }
  }
  return true;
}
