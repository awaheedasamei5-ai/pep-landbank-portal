"use client";

import { ensureCurrentPlaneUser } from "@openplane-web/lib/palmstead-adapters";
import { store } from "@openplane-web/lib/store-context";
import { Plus } from "lucide-react";
import { observer } from "mobx-react";
import { PortalBackLink, PortalForwardLink, usePortalTab } from "../../_components/portal-navigation";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

import { MyScheduleScreen } from "./my-schedule-screen";
import { OperationsAuditLog } from "./operations-audit-log";
import { OperationsCommandCenter } from "./operations-command-center";
import { OperationsWorkQueuePage } from "./operations-work-queue-page";

// Home page: a real Command Center (operations-command-center.tsx) built
// from real op_issues/op_states/op_issue_activity rows across every
// project, same house pattern as dashboard/default's manager overview.
// Work Queue and Audit Log are the reference dashboard's own standalone
// nav items -- given real top-level tabs here rather than folded back
// into the Overview, since the reference treats them as primary pages,
// not widgets. The project list stays as the real project switcher.
const WORKSPACE_SLUG = "palmstead";

export const OperationsTrackerScreen = observer(
	function OperationsTrackerScreen() {
		const [view, setView] = usePortalTab("view", ["overview", "schedule", "queue", "audit"] as const, "overview");
		const [loading, setLoading] = useState(true);
		const [error, setError] = useState<string | null>(null);
		const [showNewProject, setShowNewProject] = useState(false);
		const [newName, setNewName] = useState("");
		const [newIdentifier, setNewIdentifier] = useState("");
		const [creating, setCreating] = useState(false);
		const projectStore = store.projectRoot.project;
		const canResetData = useAuthStore((state) => state.profile?.role === "manager" && state.profile.active);

		useEffect(() => {
			store.router.setQuery({ workspaceSlug: WORKSPACE_SLUG });
			let cancelled = false;
			(async () => {
				try {
					await ensureCurrentPlaneUser(requireSupabase(), store.user);
					await store.workspaceRoot.fetchWorkspaces();
					await projectStore.fetchProjects(WORKSPACE_SLUG);
				} catch (err) {
					if (!cancelled)
						setError(
							err instanceof Error
								? err.message
								: "Failed to load Operations Tracker data.",
						);
				} finally {
					if (!cancelled) setLoading(false);
				}
			})();
			return () => {
				cancelled = true;
			};
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, []);

		const projectIds = projectStore.workspaceProjectIds ?? [];

		async function createProject() {
			if (!newName.trim() || !newIdentifier.trim()) return;
			setCreating(true);
			try {
				await projectStore.createProject(WORKSPACE_SLUG, {
					name: newName.trim(),
					identifier: newIdentifier.trim().toUpperCase(),
				});
				setNewName("");
				setNewIdentifier("");
				setShowNewProject(false);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to create project.",
				);
			} finally {
				setCreating(false);
			}
		}

		return (
			<div>
				<PortalBackLink fallback="/dashboard/default" className="mb-3" />
				{canResetData && <div className="mb-3 flex justify-end"><Button variant="outline" size="sm" asChild><PortalForwardLink href="/dashboard/operations/settings/data">Reset test data</PortalForwardLink></Button></div>}
				<PageHeader
					title="Operations Tracker"
					description="Company-wide view across every real project."
					action={
						<Tabs value={view} onValueChange={setView} className="min-w-0 max-w-full overflow-x-auto pb-2">
							<TabsList aria-label="Operations sections">
								<TabsTrigger value="overview">Overview</TabsTrigger>
								<TabsTrigger value="schedule">My Schedule</TabsTrigger>
								<TabsTrigger value="queue">Work Queue</TabsTrigger>
								<TabsTrigger value="audit">Audit Log</TabsTrigger>
							</TabsList>
						</Tabs>
					}
				/>

				{view === "overview" && (
					<>
						<div className="mb-6">
							<OperationsCommandCenter
								onNewProject={() => setShowNewProject(true)}
							/>
						</div>

						<div
							id="projects-section"
							className="mb-3 flex scroll-mt-20 items-center justify-between"
						>
							<h2 className="font-semibold text-lg">Projects</h2>
							<Button onClick={() => setShowNewProject((v) => !v)} size="sm">
								<Plus />
								New project
							</Button>
						</div>

						{showNewProject && (
							<Card className="mb-4">
								<CardContent className="grid grid-cols-1 gap-2 pt-6 sm:flex sm:flex-wrap sm:items-center">
									<Input
										placeholder="Project name"
										value={newName}
										onChange={(e) => setNewName(e.target.value)}
										className="w-full sm:max-w-xs"
									/>
									<Input
										placeholder="Identifier (e.g. OPS)"
										value={newIdentifier}
										onChange={(e) => setNewIdentifier(e.target.value)}
										className="w-full sm:max-w-40"
									/>
									<SubmitButton
										type="button"
										loading={creating}
										onClick={createProject}
										className="w-full sm:w-auto"
									>
										Create
									</SubmitButton>
								</CardContent>
							</Card>
						)}

						{error && <p className="text-sm text-destructive">{error}</p>}

						{loading && (
							<div className="grid gap-4 xl:grid-cols-12">
								{Array.from({ length: 3 }).map((_, i) => (
									<div key={i} className="xl:col-span-4">
										<Card>
											<CardHeader>
												<Skeleton className="h-5 w-32" />
											</CardHeader>
											<CardContent>
												<Skeleton className="h-4 w-full" />
											</CardContent>
										</Card>
									</div>
								))}
							</div>
						)}

						{!loading && !error && (
							<div className="grid gap-4 xl:grid-cols-12">
								{projectIds.length === 0 && (
									<Card className="xl:col-span-12">
										<CardContent className="pt-6 text-sm text-muted-foreground">
											No projects yet in the "{WORKSPACE_SLUG}" workspace.
										</CardContent>
									</Card>
								)}
								{projectIds.map((id) => {
									const project = projectStore.getProjectById(id);
									if (!project) return null;
									return (
										<PortalForwardLink
											key={id}
											href={`/dashboard/operations/${id}`}
											className="xl:col-span-4"
										>
											<Card className="transition-colors hover:border-primary">
												<CardHeader>
													<CardTitle className="flex items-center justify-between text-base">
														<span>{project.name}</span>
														<span className="font-mono text-xs text-muted-foreground">
															{project.identifier}
														</span>
													</CardTitle>
												</CardHeader>
												<CardContent className="text-sm text-muted-foreground">
													{project.description || "No description."}
												</CardContent>
											</Card>
										</PortalForwardLink>
									);
								})}
							</div>
						)}
					</>
				)}

				{view === "schedule" && <MyScheduleScreen />}
				{view === "queue" && <OperationsWorkQueuePage />}
				{view === "audit" && <OperationsAuditLog />}
			</div>
		);
	},
);
