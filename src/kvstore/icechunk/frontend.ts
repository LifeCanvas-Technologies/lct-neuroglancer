/**
 * @license
 * Copyright 2025 Google Inc.
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

import type { SharedKvStoreContext } from "#src/kvstore/frontend.js";
import type { RefSpec } from "#src/kvstore/icechunk/url.js";
import { getIcechunkUrl } from "#src/kvstore/icechunk/url.js";
import type { KvStore } from "#src/kvstore/index.js";
import { ProxyKvStore } from "#src/kvstore/proxy.js";

export class IcechunkKvStore extends ProxyKvStore implements KvStore {
  constructor(
    sharedKvStoreContext: SharedKvStoreContext,
    public baseUrl: string,
    public refSpec: RefSpec | undefined,
  ) {
    super(sharedKvStoreContext);
  }

  getUrl(key: string) {
    return getIcechunkUrl(this, key);
  }

  get supportsOffsetReads() {
    return true;
  }
  get supportsSuffixReads() {
    return true;
  }
}
