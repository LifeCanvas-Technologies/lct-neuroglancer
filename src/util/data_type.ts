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

import type { TypedArrayConstructor } from "#src/util/array.js";

/**
 * If this is updated, DATA_TYPE_BYTES must also be updated.
 */
export enum DataType {
  UINT8 = 0,
  INT8 = 1,
  UINT16 = 2,
  INT16 = 3,
  UINT32 = 4,
  INT32 = 5,
  UINT64 = 6,
  FLOAT32 = 7,
}

export const DATA_TYPE_SIGNED: Record<DataType, boolean | undefined> = {
  [DataType.UINT8]: false,
  [DataType.INT8]: true,
  [DataType.UINT16]: false,
  [DataType.INT16]: true,
  [DataType.UINT32]: false,
  [DataType.INT32]: true,
  [DataType.UINT64]: false,
  [DataType.FLOAT32]: undefined,
};

export const DATA_TYPE_BYTES: Record<DataType, number> = {
  [DataType.UINT8]: 1,
  [DataType.INT8]: 1,
  [DataType.UINT16]: 2,
  [DataType.INT16]: 2,
  [DataType.UINT32]: 4,
  [DataType.INT32]: 4,
  [DataType.UINT64]: 8,
  [DataType.FLOAT32]: 4,
};

export const DATA_TYPE_ARRAY_CONSTRUCTOR: Record<
  DataType,
  TypedArrayConstructor
> = {
  [DataType.UINT8]: Uint8Array,
  [DataType.INT8]: Int8Array,
  [DataType.UINT16]: Uint16Array,
  [DataType.INT16]: Int16Array,
  [DataType.UINT32]: Uint32Array,
  [DataType.INT32]: Int32Array,
  [DataType.UINT64]: BigUint64Array,
  [DataType.FLOAT32]: Float32Array,
};

export function makeDataTypeArrayView<TArrayBuffer extends ArrayBufferLike>(
  dataType: DataType,
  buffer: TArrayBuffer,
  byteOffset = 0,
  byteLength: number = buffer.byteLength,
): ArrayBufferView<TArrayBuffer> {
  const bytesPerElement = DATA_TYPE_BYTES[dataType];
  return new (DATA_TYPE_ARRAY_CONSTRUCTOR[
    dataType
  ] as TypedArrayConstructor<TArrayBuffer>)(
    buffer,
    byteOffset,
    byteLength / bytesPerElement,
  );
}
