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

export interface WritableArrayLike<T> {
  length: number;
  [n: number]: T;
}

/**
 * Partitions array[start:end] such that all elements for which predicate
 * returns true are before the elements for which predicate returns false.
 *
 * predicate will be called exactly once for each element in array[start:end],
 * in order.
 *
 * @returns {number} The index of the first element for which predicate returns
 * false, or end if there is no such element.
 */
export function partitionArray<T>(
  array: T[],
  start: number,
  end: number,
  predicate: (x: T) => boolean,
): number {
  while (start < end) {
    const x = array[start];
    if (predicate(x)) {
      ++start;
      continue;
    }
    --end;
    array[start] = array[end];
    array[end] = x;
  }
  return end;
}

export function filterArrayInplace<T>(
  array: T[],
  predicate: (x: T, index: number, array: T[]) => boolean,
) {
  const length = array.length;
  let outIndex = 0;
  for (let i = 0; i < length; ++i) {
    if (predicate(array[i], i, array)) {
      array[outIndex] = array[i];
      ++outIndex;
    }
  }
  array.length = outIndex;
}

export type TypedNumberArrayConstructor<
  TArrayBuffer extends ArrayBufferLike = ArrayBufferLike,
> = (
  | typeof Int8Array<TArrayBuffer>
  | typeof Uint8Array<TArrayBuffer>
  | typeof Int16Array<TArrayBuffer>
  | typeof Uint16Array<TArrayBuffer>
  | typeof Int32Array<TArrayBuffer>
  | typeof Uint32Array<TArrayBuffer>
  | typeof Float32Array<TArrayBuffer>
  | typeof Float64Array<TArrayBuffer>
) &
  (TArrayBuffer extends ArrayBuffer
    ? { new (count: number): TypedNumberArray<ArrayBuffer> }
    : Record<string, never>);

export type TypedBigIntArrayConstructor<
  TArrayBuffer extends ArrayBufferLike = ArrayBufferLike,
> = (typeof BigUint64Array<TArrayBuffer> | typeof BigInt64Array<TArrayBuffer>) &
  (TArrayBuffer extends ArrayBuffer
    ? { new (count: number): TypedBigIntArray<ArrayBuffer> }
    : Record<string, never>);

export type TypedArrayConstructor<
  TArrayBuffer extends ArrayBufferLike = ArrayBufferLike,
> =
  | TypedNumberArrayConstructor<TArrayBuffer>
  | TypedBigIntArrayConstructor<TArrayBuffer>;

export type TypedNumberArray<
  TArrayBuffer extends ArrayBufferLike = ArrayBufferLike,
> =
  | Int8Array<TArrayBuffer>
  | Uint8Array<TArrayBuffer>
  | Int16Array<TArrayBuffer>
  | Uint16Array<TArrayBuffer>
  | Int32Array<TArrayBuffer>
  | Uint32Array<TArrayBuffer>
  | Float32Array<TArrayBuffer>
  | Float64Array<TArrayBuffer>;

export type TypedBigIntArray<
  TArrayBuffer extends ArrayBufferLike = ArrayBufferLike,
> = BigInt64Array<TArrayBuffer> | BigUint64Array<TArrayBuffer>;

export type TypedArray<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> =
  TypedNumberArray<TArrayBuffer> | TypedBigIntArray<TArrayBuffer>;

/**
 * Returns an array of size newSize that starts with the contents of array.
 * Either returns array if it has the correct size, or a new array with zero
 * padding at the end.
 */
export function maybePadArray<
  TArrayBuffer extends ArrayBufferLike,
  T extends TypedNumberArray<TArrayBuffer>,
>(array: T, newSize: number): T {
  if (array.length === newSize) {
    return array;
  }
  const newArray = new (<any>array.constructor)(newSize);
  newArray.set(array);
  return newArray;
}

export function getFortranOrderStrides(
  size: ArrayLike<number>,
  baseStride = 1,
) {
  const length = size.length;
  const strides = new Array<number>(length);
  let stride = (strides[0] = baseStride);
  for (let i = 1; i < length; ++i) {
    stride *= size[i - 1];
    strides[i] = stride;
  }
  return strides;
}

/**
 * Converts an array of shape [majorSize, minorSize] to
 * [minorSize, majorSize].
 */
export function transposeArray2d<T extends TypedNumberArray>(
  array: T,
  majorSize: number,
  minorSize: number,
): T {
  const transpose = new (<any>array.constructor)(array.length);
  for (let i = 0; i < majorSize * minorSize; i += minorSize) {
    for (let j = 0; j < minorSize; j++) {
      const index: number = i / minorSize;
      transpose[j * majorSize + index] = array[i + j];
    }
  }
  return transpose;
}

export function tile2dArray<T extends TypedNumberArray>(
  array: T,
  majorDimension: number,
  minorTiles: number,
  majorTiles: number,
) {
  const minorDimension = array.length / majorDimension;
  const length = array.length * minorTiles * majorTiles;
  const result: T = new (<any>array.constructor)(length);
  const minorTileStride = array.length * majorTiles;
  const majorTileStride = majorDimension;
  const minorStride = majorDimension * majorTiles;
  for (let minor = 0; minor < minorDimension; ++minor) {
    for (let major = 0; major < majorDimension; ++major) {
      const inputValue = array[minor * majorDimension + major];
      const baseOffset = minor * minorStride + major;
      for (let minorTile = 0; minorTile < minorTiles; ++minorTile) {
        for (let majorTile = 0; majorTile < majorTiles; ++majorTile) {
          result[
            minorTile * minorTileStride +
              majorTile * majorTileStride +
              baseOffset
          ] = inputValue;
        }
      }
    }
  }
  return result;
}

export function binarySearch<Hay, Needle>(
  haystack: ArrayLike<Hay>,
  needle: Needle,
  compare: (a: Needle, b: Hay) => number,
  low = 0,
  high = haystack.length,
): number {
  while (low < high) {
    const mid = (low + high - 1) >> 1;
    const compareResult = compare(needle, haystack[mid]);
    if (compareResult > 0) {
      low = mid + 1;
    } else if (compareResult < 0) {
      high = mid;
    } else {
      return mid;
    }
  }
  return ~low;
}

/**
 * Returns the index of the element in `haystack` that is closest to `needle`, according to
 * `compare`.  If there are multiple elements that are equally close, the index of the first such
 * element encountered is returned.  If `haystack` is empty, returns -1.
 */
export function findClosestMatchInSortedArray<T>(
  haystack: ArrayLike<T>,
  needle: T,
  compare: (a: T, b: T) => number,
  low = 0,
  high = haystack.length,
): number {
  let bestIndex = -1;
  let bestDistance = Infinity;
  while (low < high) {
    const mid = (low + high - 1) >> 1;
    const compareResult = compare(needle, haystack[mid]);
    if (compareResult > 0) {
      low = mid + 1;
    } else if (compareResult < 0) {
      high = mid;
    } else {
      return mid;
    }
    const distance = Math.abs(compareResult);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = mid;
    }
  }
  return bestIndex;
}

/**
 * Returns the first index in `[begin, end)` for which `predicate` is `true`, or returns `end` if no
 * such index exists.
 *
 * For any index `i` in `(begin, end)`, it must be the case that `predicate(i) >= predicate(i - 1)`.
 */
export function binarySearchLowerBound(
  begin: number,
  end: number,
  predicate: (index: number) => boolean,
): number {
  let count = end - begin;
  while (count > 0) {
    const step = Math.floor(count / 2);
    const i = begin + step;
    if (predicate(i)) {
      count = step;
    } else {
      begin = i + 1;
      count -= step + 1;
    }
  }
  return begin;
}

/**
 * Returns an array of indices into `input` that equal (under `===`) `value`.
 */
export function findMatchingIndices<T>(input: T[], value: T) {
  const out: number[] = [];
  for (let i = 0, length = input.length; i < length; ++i) {
    if (input[i] === value) {
      out.push(i);
    }
  }
  return out;
}

/**
 * Returns an array of the indices in `[0, ..., max)` not in `indices`.
 */
export function getIndicesComplement(indices: number[], max: number) {
  const mask: boolean[] = [];
  mask.length = max;
  for (const i of indices) {
    mask[i] = true;
  }
  return findMatchingIndices(mask, undefined);
}

export function arraysEqual<T>(a: ArrayLike<T>, b: ArrayLike<T>) {
  const length = a.length;
  if (b.length !== length) return false;
  for (let i = 0; i < length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function arraysEqualWithPredicate<T>(
  a: ArrayLike<T>,
  b: ArrayLike<T>,
  elementsEqual: (a: T, b: T) => boolean = (a, b) => a === b,
) {
  const length = a.length;
  if (b.length !== length) return false;
  for (let i = 0; i < length; ++i) {
    if (!elementsEqual(a[i], b[i])) return false;
  }
  return true;
}

export function getInsertPermutation(
  n: number,
  sourceIndex: number,
  targetIndex: number,
) {
  const newToOld: number[] = [];
  if (targetIndex === sourceIndex) {
    for (let i = 0; i < n; ++i) {
      newToOld[i] = i;
    }
    return newToOld;
  }
  newToOld[targetIndex] = sourceIndex;
  for (let oldDim = 0, newDim = 0; oldDim < n; ) {
    if (oldDim === sourceIndex) {
      ++oldDim;
      continue;
    }
    if (newDim === targetIndex) {
      ++newDim;
    }
    newToOld[newDim++] = oldDim++;
  }
  return newToOld;
}

export function scatterUpdate<
  T,
  Dest extends { [index: number]: T },
  Source extends { readonly [index: number]: T },
>(dest: Dest, source: Source, indices: ArrayLike<number>): Dest {
  for (
    let sourceIndex = 0, length = indices.length;
    sourceIndex < length;
    ++sourceIndex
  ) {
    const destIndex = indices[sourceIndex];
    if (destIndex === -1) continue;
    dest[destIndex] = source[sourceIndex];
  }
  return dest;
}

export function gatherUpdate<
  T,
  Dest extends { [index: number]: T },
  Source extends { readonly [index: number]: T },
>(dest: Dest, source: Source, indices: ArrayLike<number>): Dest {
  for (
    let destIndex = 0, length = indices.length;
    destIndex < length;
    ++destIndex
  ) {
    const sourceIndex = indices[destIndex];
    if (sourceIndex === -1) continue;
    dest[destIndex] = source[sourceIndex];
  }
  return dest;
}

export function transposeNestedArrays<T>(x: T[][]) {
  const result: T[][] = [];
  for (
    let outerIndex = 0, outerLength = x.length;
    outerIndex < outerLength;
    ++outerIndex
  ) {
    const inner = x[outerIndex];
    for (
      let innerIndex = 0, innerLength = inner.length;
      innerIndex < innerLength;
      ++innerIndex
    ) {
      let resultInner = result[innerIndex];
      if (resultInner === undefined) {
        resultInner = result[innerIndex] = [];
      }
      resultInner.push(inner[innerIndex]);
    }
  }
  return result;
}

export interface ArraySpliceOp {
  retainCount: number;
  deleteCount: number;
  insertCount: number;
}

export function spliceArray<T>(
  array: T[],
  splices: readonly Readonly<ArraySpliceOp>[],
) {
  const parts: T[][] = [];
  let origOffset = 0;
  for (let i = 0, numSplices = splices.length; i < numSplices; ++i) {
    const { retainCount, deleteCount, insertCount } = splices[i];
    if (retainCount !== 0) {
      parts.push(array.slice(origOffset, origOffset + retainCount));
      origOffset += retainCount;
    }
    origOffset += deleteCount;
    if (insertCount !== 0) {
      parts.push(new Array<T>(insertCount));
    }
  }
  const origLength = array.length;
  if (origOffset !== origLength) {
    parts.push(array.slice(origOffset));
  }
  return new Array(0).concat(...parts);
}

export function getMergeSplices<T>(
  oldArray: readonly T[],
  newArray: readonly T[],
  compare: (a: T, b: T) => number,
): ArraySpliceOp[] {
  const splices: ArraySpliceOp[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  const oldCount = oldArray.length;
  const newCount = newArray.length;
  while (oldIndex < oldCount && newIndex < newCount) {
    let c: number;
    const oldValue = oldArray[oldIndex];
    const newValue = newArray[newIndex];
    c = compare(oldValue, newValue);
    if (c === 0) {
      let retainCount = 1;
      ++oldIndex;
      ++newIndex;
      while (
        oldIndex < oldCount &&
        newIndex < newCount &&
        (c = compare(oldArray[oldIndex], newArray[newIndex])) === 0
      ) {
        ++retainCount;
        ++oldIndex;
        ++newIndex;
      }
      splices.push({ retainCount, deleteCount: 0, insertCount: 0 });
      continue;
    }
    if (c < 0) {
      let deleteCount = 1;
      while (
        ++oldIndex < oldCount &&
        (c = compare(oldArray[oldIndex], newValue)) < 0
      ) {
        ++deleteCount;
      }
      splices.push({ retainCount: 0, deleteCount, insertCount: 0 });
      continue;
    }
    if (c > 0) {
      let insertCount = 1;
      while (
        ++newIndex < newCount &&
        (c = compare(oldValue, newArray[newIndex])) > 0
      ) {
        ++insertCount;
      }
      splices.push({ retainCount: 0, deleteCount: 0, insertCount });
    }
  }
  if (oldIndex < oldCount || newIndex < newCount) {
    splices.push({
      retainCount: 0,
      deleteCount: oldCount - oldIndex,
      insertCount: newCount - newIndex,
    });
  }
  return splices;
}

export function getFixedOrderMergeSplices<T>(
  oldArray: readonly T[],
  newArray: readonly T[],
  equal: (a: T, b: T) => boolean,
): ArraySpliceOp[] {
  const splices: ArraySpliceOp[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  const oldCount = oldArray.length;
  const newCount = newArray.length;
  while (oldIndex < oldCount) {
    let retainCount = 0;
    while (
      oldIndex < oldCount &&
      newIndex < newCount &&
      equal(oldArray[oldIndex], newArray[newIndex])
    ) {
      ++retainCount;
      ++oldIndex;
      ++newIndex;
    }
    if (retainCount !== 0) {
      splices.push({ retainCount, deleteCount: 0, insertCount: 0 });
    }
    let deleteCount = 0;
    while (
      oldIndex < oldCount &&
      (newIndex === newCount || !equal(oldArray[oldIndex], newArray[newIndex]))
    ) {
      ++deleteCount;
      ++oldIndex;
    }
    if (deleteCount !== 0) {
      splices.push({ retainCount: 0, deleteCount, insertCount: 0 });
    }
  }
  if (newIndex !== newCount) {
    splices.push({
      retainCount: 0,
      deleteCount: 0,
      insertCount: newCount - newIndex,
    });
  }
  return splices;
}

export function mergeSequences(
  aCount: number,
  bCount: number,
  compare: (a: number, b: number) => number,
  aCallback: (a: number) => void,
  bCallback: (b: number) => void,
  abCallback: (a: number, b: number) => void,
) {
  let a = 0;
  let b = 0;
  if (aCount !== 0 && bCount !== 0) {
    while (true) {
      const x = compare(a, b);
      if (x < 0) {
        aCallback(a);
        if (++a === aCount) break;
      } else if (x > 0) {
        bCallback(b);
        if (++b === bCount) break;
      } else {
        abCallback(a, b);
        ++a;
        ++b;
        if (a === aCount || b === bCount) break;
      }
    }
  }
  while (a < aCount) {
    aCallback(a);
    ++a;
  }
  while (b < bCount) {
    bCallback(b);
    ++b;
  }
}

export class TypedArrayBuilder<T extends TypedArray<ArrayBuffer>> {
  data: T;
  length: number = 0;
  constructor(cls: { new (count: number): T }, initialCapacity: number = 16) {
    this.data = new cls(initialCapacity);
  }

  resize(newLength: number) {
    const { data } = this;
    if (newLength > data.length) {
      const newData = new (data.constructor as { new (count: number): T })(
        Math.max(newLength, data.length * 2),
      );
      newData.set(data.subarray(0, this.length) as any);
      this.data = newData;
    }
    this.length = newLength;
  }

  get view(): T {
    return this.data.subarray(0, this.length) as T;
  }

  shrinkToFit() {
    this.data = this.data.slice(0, length) as T;
  }

  clear() {
    this.length = 0;
  }

  appendArray(other: ArrayLike<T extends TypedBigIntArray ? bigint : number>) {
    const { length } = this;
    this.resize(length + other.length);
    this.data.set(other as any, length);
  }

  eraseRange(start: number, end: number) {
    this.data.copyWithin(start, end, this.length);
    this.length -= end - start;
  }
}
