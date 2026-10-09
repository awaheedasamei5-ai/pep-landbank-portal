/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { enableStaticRendering } from "mobx-react";
// plane imports
import { FALLBACK_LANGUAGE, setLanguage } from "@plane/i18n";
import type { IWorkItemFilterStore } from "@plane/shared-state";
import { WorkItemFilterStore } from "@plane/shared-state";
// plane web store
import type { IBaseAnalyticsStore as IAnalyticsStore } from "@openplane-web/store/analytics.store";
import { BaseAnalyticsStore as AnalyticsStore } from "@openplane-web/store/analytics.store";
import type { IStateStore } from "@openplane-web/store/state.store";
import { StateStore } from "@openplane-web/store/state.store";
import type { ICommandPaletteStore } from "@openplane-web/store/base-command-palette.store";
import { CommandPaletteStore } from "@openplane-web/store/base-command-palette.store";
import { WorkspaceRootStore } from "@openplane-web/store/workspace";
// stores
import type { ICycleStore } from "./cycle.store";
import { CycleStore } from "./cycle.store";
import type { ICycleFilterStore } from "./cycle_filter.store";
import { CycleFilterStore } from "./cycle_filter.store";
import type { IDashboardStore } from "./dashboard.store";
import { DashboardStore } from "./dashboard.store";
import type { IEditorAssetStore } from "./editor/asset.store";
import { EditorAssetStore } from "./editor/asset.store";
import type { IProjectEstimateStore } from "./estimates/project-estimate.store";
import { ProjectEstimateStore } from "./estimates/project-estimate.store";
import type { IFavoriteStore } from "./favorite.store";
import { FavoriteStore } from "./favorite.store";
import type { IGlobalViewStore } from "./global-view.store";
import { GlobalViewStore } from "./global-view.store";
import type { IProjectInboxStore } from "./inbox/project-inbox.store";
import { ProjectInboxStore } from "./inbox/project-inbox.store";
import type { IInstanceStore } from "./instance.store";
import { InstanceStore } from "./instance.store";
import type { IIssueRootStore } from "./issue/root.store";
import { IssueRootStore } from "./issue/root.store";
import type { ILabelStore } from "./label.store";
import { LabelStore } from "./label.store";
import type { IMemberRootStore } from "./member";
import { MemberRootStore } from "./member";
import type { IModuleStore } from "./module.store";
import { ModulesStore } from "./module.store";
import type { IModuleFilterStore } from "./module_filter.store";
import { ModuleFilterStore } from "./module_filter.store";
import type { IMultipleSelectStore } from "./multiple_select.store";
import { MultipleSelectStore } from "./multiple_select.store";
import type { IWorkspaceNotificationStore } from "./notifications/workspace-notifications.store";
import { WorkspaceNotificationStore } from "./notifications/workspace-notifications.store";
import type { IProjectRootStore } from "./project";
import { ProjectRootStore } from "./project";
import type { IProjectViewStore } from "./project-view.store";
import { ProjectViewStore } from "./project-view.store";
import type { IRouterStore } from "./router.store";
import { RouterStore } from "./router.store";
import type { IStickyStore } from "./sticky/sticky.store";
import { StickyStore } from "./sticky/sticky.store";
import type { IThemeStore } from "./theme.store";
import { ThemeStore } from "./theme.store";
import type { IUserStore } from "./user";
import { UserStore } from "./user";
import type { IWorkspaceRootStore } from "./workspace";

enableStaticRendering(typeof window === "undefined");

export class CoreRootStore {
  workspaceRoot: IWorkspaceRootStore;
  projectRoot: IProjectRootStore;
  memberRoot: IMemberRootStore;
  cycle: ICycleStore;
  cycleFilter: ICycleFilterStore;
  module: IModuleStore;
  moduleFilter: IModuleFilterStore;
  projectView: IProjectViewStore;
  globalView: IGlobalViewStore;
  issue: IIssueRootStore;
  state: IStateStore;
  label: ILabelStore;
  dashboard: IDashboardStore;
  analytics: IAnalyticsStore;
  router: IRouterStore;
  commandPalette: ICommandPaletteStore;
  theme: IThemeStore;
  instance: IInstanceStore;
  user: IUserStore;
  projectInbox: IProjectInboxStore;
  projectEstimate: IProjectEstimateStore;
  multipleSelect: IMultipleSelectStore;
  workspaceNotification: IWorkspaceNotificationStore;
  favorite: IFavoriteStore;
  stickyStore: IStickyStore;
  editorAssetStore: IEditorAssetStore;
  workItemFilters: IWorkItemFilterStore;
  // powerK (command palette) and timelineStore (Gantt) are deferred -- see
  // docs/plans/03-operations-tracker-plane-port.md's deferred-subsystems note.

  constructor() {
    this.router = new RouterStore();
    this.commandPalette = new CommandPaletteStore();
    this.instance = new InstanceStore();
    this.user = new UserStore(this);
    this.theme = new ThemeStore();
    this.workspaceRoot = new WorkspaceRootStore(this);
    this.projectRoot = new ProjectRootStore(this);
    this.memberRoot = new MemberRootStore(this);
    this.cycle = new CycleStore(this);
    this.cycleFilter = new CycleFilterStore(this);
    this.module = new ModulesStore(this);
    this.moduleFilter = new ModuleFilterStore(this);
    this.projectView = new ProjectViewStore(this);
    this.globalView = new GlobalViewStore(this);
    this.issue = new IssueRootStore(this);
    this.state = new StateStore(this);
    this.label = new LabelStore(this);
    this.dashboard = new DashboardStore(this);
    this.multipleSelect = new MultipleSelectStore();
    this.projectInbox = new ProjectInboxStore(this);
    this.projectEstimate = new ProjectEstimateStore(this);
    this.workspaceNotification = new WorkspaceNotificationStore(this);
    this.favorite = new FavoriteStore(this);
    this.stickyStore = new StickyStore();
    this.editorAssetStore = new EditorAssetStore();
    this.analytics = new AnalyticsStore();
    this.workItemFilters = new WorkItemFilterStore();
  }

  resetOnSignOut() {
    // handling the system theme when user logged out from the app
    localStorage.setItem("theme", "system");
    void setLanguage(FALLBACK_LANGUAGE);
    this.router = new RouterStore();
    this.commandPalette = new CommandPaletteStore();
    this.instance = new InstanceStore();
    this.user = new UserStore(this);
    this.workspaceRoot = new WorkspaceRootStore(this);
    this.projectRoot = new ProjectRootStore(this);
    this.memberRoot = new MemberRootStore(this);
    this.cycle = new CycleStore(this);
    this.cycleFilter = new CycleFilterStore(this);
    this.module = new ModulesStore(this);
    this.moduleFilter = new ModuleFilterStore(this);
    this.projectView = new ProjectViewStore(this);
    this.globalView = new GlobalViewStore(this);
    this.issue = new IssueRootStore(this);
    this.state = new StateStore(this);
    this.label = new LabelStore(this);
    this.dashboard = new DashboardStore(this);
    this.projectInbox = new ProjectInboxStore(this);
    this.multipleSelect = new MultipleSelectStore();
    this.projectEstimate = new ProjectEstimateStore(this);
    this.workspaceNotification = new WorkspaceNotificationStore(this);
    this.favorite = new FavoriteStore(this);
    this.stickyStore = new StickyStore();
    this.editorAssetStore = new EditorAssetStore();
    this.workItemFilters = new WorkItemFilterStore();
  }
}

export { CoreRootStore as RootStore };
