/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactElement } from "react";
import { createContext } from "react";
import { configure } from "mobx";
// plane web store
import { RootStore } from "@openplane-web/store/root.store";

// Real warning found live: several of plane's own store files (e.g.
// issue/root.store.ts's autorun syncing workspaceSlug/projectId from the
// router) mutate observables outside a MobX action by design. Their real
// app presumably configures MobX permissively somewhere outside the
// store/services/hooks/lib slice this port copied -- matching that here
// rather than editing plane's own store logic to add action wrappers.
configure({ enforceActions: "never" });

// Real bug found live: the original `export const rootStore = new RootStore()`
// constructed the WHOLE store tree synchronously at this module's own
// top-level evaluation. That's fine for plane's real webpack build, but
// under Turbopack it collides with a genuine circular import inside
// plane's own copied code (issue/helpers/base-issues-utils.ts imports
// `store` from this very file, and gets reached mid-construction via
// root.store.ts -> issue/root.store.ts -> issue-details/sub_issues.store.ts
// -> sub_issues_filter.store.ts -> base-issues-utils.ts) -- producing
// "Cannot access 'IssueSubIssuesStore' before initialization". Deferring
// construction to first real property access (via this Proxy) lets every
// module in that cycle finish its own evaluation first, which is enough
// to break the TDZ without touching plane's own store logic.
let instance: RootStore | undefined;
function getInstance(): RootStore {
  if (!instance) instance = new RootStore();
  return instance;
}

export const store: RootStore = new Proxy({} as RootStore, {
  get(_target, prop, receiver) {
    return Reflect.get(getInstance() as object, prop, receiver);
  },
  set(_target, prop, value) {
    return Reflect.set(getInstance() as object, prop, value);
  },
});

export const rootStore = store;

export const StoreContext = createContext<RootStore>(rootStore);

export function StoreProvider({ children }: { children: ReactElement }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
