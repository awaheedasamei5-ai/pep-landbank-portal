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

export let rootStore = new RootStore();

export const StoreContext = createContext<RootStore>(rootStore);

const initializeStore = () => {
  const newRootStore = rootStore ?? new RootStore();
  if (typeof window === "undefined") return newRootStore;
  if (!rootStore) rootStore = newRootStore;
  return newRootStore;
};

export const store = initializeStore();

export function StoreProvider({ children }: { children: ReactElement }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
