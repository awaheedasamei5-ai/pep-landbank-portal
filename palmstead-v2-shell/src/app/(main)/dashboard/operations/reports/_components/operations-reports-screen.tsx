"use client";

import { useQuery } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Download, FileText, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { PortalBackLink } from "../../../_components/portal-navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { isoDateOnly, today } from "@/lib/palmstead/format";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";
import {
	pdfBrandedHeader,
	pdfReportFooter,
	pdfSectionTitle,
} from "@/webnext/shared/lib/pdfReport";

type RawIssue = {
	id: string;
	name: string;
	sequence_id: number;
	priority: string | null;
	target_date: string | null;
	created_at: string;
	completed_at: string | null;
	project_id: string;
	state_id: string | null;
};
type Issue = RawIssue & {
	project: string;
	identifier: string;
	state: string;
	stateGroup: string;
	assignees: string[];
};
type FilteredIssue = Issue;
type StaffMetric = {
	key: string;
	name: string;
	open: number;
	overdue: number;
	completed: number;
};
type ReportData = { issues: Issue[]; staff: { key: string; name: string }[] };

async function fetchPages<T>(
	fetchPage: (
		from: number,
		to: number,
	) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
	const rows: T[] = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await fetchPage(from, from + 999);
		if (error) throw new Error(error.message);
		const page = data ?? [];
		rows.push(...page);
		if (page.length < 1000) return rows;
	}
}

async function loadReportData(
	agentKey: string,
	manager: boolean,
): Promise<ReportData> {
	const sb = requireSupabase();
	const assignments = await fetchPages<{
		issue_id: string;
		assignee_key: string;
	}>((from, to) => {
		const query = sb.from("op_issue_assignees").select("issue_id,assignee_key");
		return (manager ? query : query.eq("assignee_key", agentKey)).range(
			from,
			to,
		);
	});
	const assignedIssueIds = [...new Set(assignments.map((row) => row.issue_id))];
	const [issues, states, projects, profiles] = await Promise.all([
		!manager && assignedIssueIds.length === 0
			? Promise.resolve([] as RawIssue[])
			: fetchPages<RawIssue>((from, to) => {
					const query = sb
						.from("op_issues")
						.select(
							"id,name,sequence_id,priority,target_date,created_at,completed_at,project_id,state_id",
						)
						.is("archived_at", null);
					return (manager ? query : query.in("id", assignedIssueIds)).range(
						from,
						to,
					);
				}),
		fetchPages<{ id: string; name: string; group: string }>((from, to) =>
			sb.from("op_states").select("id,name,group").range(from, to),
		),
		fetchPages<{ id: string; name: string; identifier: string }>((from, to) =>
			sb.from("op_projects").select("id,name,identifier").range(from, to),
		),
		manager
			? fetchPages<{ agent_key: string; name: string }>((from, to) =>
					sb
						.from("profiles")
						.select("agent_key,name")
						.eq("active", true)
						.range(from, to),
				)
			: Promise.resolve([] as { agent_key: string; name: string }[]),
	]);
	const assigneeMap = new Map<string, string[]>();
	for (const row of assignments)
		assigneeMap.set(row.issue_id, [
			...(assigneeMap.get(row.issue_id) ?? []),
			row.assignee_key,
		]);
	const stateMap = new Map(states.map((row) => [row.id, row]));
	const projectMap = new Map(projects.map((row) => [row.id, row]));
	const scoped = issues;
	const rows = scoped.map((issue): Issue => {
		const state = issue.state_id ? stateMap.get(issue.state_id) : undefined;
		const project = projectMap.get(issue.project_id);
		return {
			...issue,
			project: project?.name ?? "Unknown project",
			identifier: project?.identifier ?? "?",
			state: state?.name ?? "Unknown",
			stateGroup: state?.group ?? "unstarted",
			assignees: manager ? (assigneeMap.get(issue.id) ?? []) : [agentKey],
		};
	});
	return {
		issues: rows,
		staff: profiles.map((profile) => ({
			key: profile.agent_key,
			name: profile.name,
		})),
	};
}

const isOpen = (issue: Issue) =>
	issue.stateGroup !== "completed" && issue.stateGroup !== "cancelled";
const dateInRange = (date: string | null, start: string, end: string) =>
	!!date && displayDate(date) >= start && displayDate(date) <= end;
const issueCode = (issue: Issue) => `${issue.identifier}-${issue.sequence_id}`;
const displayDate = (date: string | null) =>
	date
		? date.includes("T")
			? isoDateOnly(new Date(date))
			: date.slice(0, 10)
		: "";
const cleanCsv = (value: unknown) =>
	`"${String(value ?? "").replaceAll('"', '""')}"`;
const todayIso = () => isoDateOnly(new Date());

function startMonth(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}
function endMonth(date: Date) {
	return isoDateOnly(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

export function OperationsReportsScreen() {
	const profile = useAuthStore((state) => state.profile);
	const manager = profile?.role === "manager";
	const [reportType, setReportType] = useState("work-summary");
	const [projectId, setProjectId] = useState("all");
	const [personKey, setPersonKey] = useState("all");
	const [statusGroup, setStatusGroup] = useState("all");
	const [priority, setPriority] = useState("all");
	const [start, setStart] = useState(() => startMonth(new Date()));
	const [end, setEnd] = useState(() => endMonth(new Date()));
	const [exporting, setExporting] = useState(false);
	const profileKey = profile?.key;
	const query = useQuery({
		queryKey: ["operationsReports", profileKey, manager],
		queryFn: () => {
			if (!profileKey) throw new Error("Your profile has not loaded yet.");
			return loadReportData(profileKey, manager);
		},
		enabled: Boolean(profileKey),
	});
	const data = query.data;
	const projects = useMemo(
		() =>
			[
				...new Map(
					(data?.issues ?? []).map((issue) => [
						issue.project_id,
						{ id: issue.project_id, name: issue.project },
					]),
				).values(),
			].sort((a, b) => a.name.localeCompare(b.name)),
		[data?.issues],
	);
	const filtered = useMemo(
		() =>
			(data?.issues ?? []).filter((issue) => {
				if (projectId !== "all" && issue.project_id !== projectId) return false;
				if (statusGroup !== "all" && issue.stateGroup !== statusGroup)
					return false;
				if (priority !== "all" && (issue.priority ?? "none") !== priority)
					return false;
				if (
					manager &&
					personKey !== "all" &&
					!issue.assignees.includes(personKey)
				)
					return false;
				if (
					reportType === "completed" &&
					!dateInRange(issue.completed_at, start, end)
				)
					return false;
				if (
					reportType === "created" &&
					!dateInRange(issue.created_at, start, end)
				)
					return false;
				if (reportType === "due" && !dateInRange(issue.target_date, start, end))
					return false;
				return true;
			}),
		[
			data?.issues,
			projectId,
			statusGroup,
			priority,
			manager,
			personKey,
			reportType,
			start,
			end,
		],
	);
	const summary = useMemo(
		() => ({
			total: filtered.length,
			open: filtered.filter(isOpen).length,
			overdue: filtered.filter(
				(issue) =>
					isOpen(issue) && issue.target_date && issue.target_date < todayIso(),
			).length,
			completedInRange: filtered.filter((issue) =>
				dateInRange(issue.completed_at, start, end),
			).length,
			unassigned: filtered.filter(
				(issue) => isOpen(issue) && issue.assignees.length === 0,
			).length,
		}),
		[filtered, start, end],
	);
	const staffMetrics = useMemo(
		() =>
			(data?.staff ?? [])
				.map((staff): StaffMetric => {
					const mine = filtered.filter((issue) =>
						issue.assignees.includes(staff.key),
					);
					return {
						key: staff.key,
						name: staff.name,
						open: mine.filter(isOpen).length,
						overdue: mine.filter(
							(issue) =>
								isOpen(issue) &&
								issue.target_date &&
								issue.target_date < todayIso(),
						).length,
						completed: mine.filter((issue) =>
							dateInRange(issue.completed_at, start, end),
						).length,
					};
				})
				.sort((a, b) => b.open - a.open || a.name.localeCompare(b.name)),
		[data?.staff, filtered, start, end],
	);
	const summaryCards = manager
		? [
				{ label: "Issues in view", value: summary.total },
				{ label: "Currently open", value: summary.open },
				{ label: "Overdue now", value: summary.overdue },
				{ label: "Completed in period", value: summary.completedInRange },
				{ label: "Unassigned open", value: summary.unassigned },
			]
		: [
				{ label: "My issues", value: summary.total },
				{ label: "Currently open", value: summary.open },
				{ label: "Overdue now", value: summary.overdue },
				{ label: "Completed in period", value: summary.completedInRange },
			];
	const displayIssues: FilteredIssue[] = filtered
		.filter((issue) => {
			if (reportType === "open-overdue") return isOpen(issue);
			return true;
		})
		.sort((a, b) =>
			(a.target_date ?? "9999").localeCompare(b.target_date ?? "9999"),
		);
	const error =
		start > end
			? "Choose a start date that is on or before the end date."
			: query.error instanceof Error
				? query.error.message
				: null;

	function resetFilters() {
		setProjectId("all");
		setPersonKey("all");
		setStatusGroup("all");
		setPriority("all");
		setReportType("work-summary");
		setStart(startMonth(new Date()));
		setEnd(endMonth(new Date()));
	}
	function downloadCsv() {
		const headings = [
			"Issue",
			"Title",
			"Project",
			"Status",
			"Priority",
			"Assignees",
			"Created",
			"Due",
			"Completed",
		];
		const records = displayIssues.map((issue) => [
			issueCode(issue),
			issue.name,
			issue.project,
			issue.state,
			issue.priority ?? "None",
			manager
				? issue.assignees
						.map(
							(key) =>
								data?.staff.find((person) => person.key === key)?.name ?? key,
						)
						.join("; ")
				: "You",
			issue.created_at.slice(0, 10),
			issue.target_date ?? "",
			issue.completed_at?.slice(0, 10) ?? "",
		]);
		const csv = [headings, ...records]
			.map((row) => row.map(cleanCsv).join(","))
			.join("\r\n");
		const url = URL.createObjectURL(
			new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
		);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `operations-${reportType}-${start}-${end}.csv`;
		anchor.click();
		URL.revokeObjectURL(url);
	}
	async function downloadPdf() {
		setExporting(true);
		try {
			const doc = new jsPDF({ unit: "mm", format: "a4" });
			const scope = manager
				? personKey === "all"
					? "Company-wide"
					: (data?.staff.find((person) => person.key === personKey)?.name ??
						"Selected staff")
				: "My assigned work";
			const filters = [
				`Project: ${projectId === "all" ? "All" : (projects.find((project) => project.id === projectId)?.name ?? "Selected")}`,
				`Status: ${statusGroup}`,
				`Priority: ${priority}`,
				manager ? `Staff: ${scope}` : "Staff: self only",
			].join(" · ");
			let y = pdfBrandedHeader(
				doc,
				"Operations report",
				`${reportType.replaceAll("-", " ")} · ${start} to ${end}`,
				[`${scope}`, `Generated ${today()}`],
				null,
			);
			const filterLines = doc.splitTextToSize(
				filters,
				doc.internal.pageSize.getWidth() - 24,
			);
			doc.setFontSize(8);
			doc.setTextColor(92, 114, 128);
			doc.text(filterLines, 12, y);
			y += filterLines.length * 4 + 4;
			y = pdfSectionTitle(
				doc,
				y,
				doc.internal.pageSize.getWidth(),
				"Report summary",
			);
			const summaryHeaders = manager
				? [
						"Issues in view",
						"Currently open",
						"Overdue now",
						"Completed in range",
						"Unassigned",
					]
				: ["My issues", "Currently open", "Overdue now", "Completed in range"];
			const summaryValues = manager
				? [
						summary.total,
						summary.open,
						summary.overdue,
						summary.completedInRange,
						summary.unassigned,
					]
				: [
						summary.total,
						summary.open,
						summary.overdue,
						summary.completedInRange,
					];
			autoTable(doc, {
				startY: y,
				head: [summaryHeaders],
				body: [summaryValues],
				styles: { fontSize: 8 },
			});
			y =
				(doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
					.finalY + 11;
			if (manager && personKey === "all") {
				y = pdfSectionTitle(
					doc,
					y,
					doc.internal.pageSize.getWidth(),
					"Workload by staff",
				);
				autoTable(doc, {
					startY: y,
					head: [["Staff member", "Open", "Overdue now", "Completed in range"]],
					body: staffMetrics.map((row) => [
						row.name,
						row.open,
						row.overdue,
						row.completed,
					]),
					styles: { fontSize: 8 },
					didDrawPage: () => pdfReportFooter(doc, "Palmstead"),
				});
				y =
					(doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
						.finalY + 11;
			}
			y = pdfSectionTitle(
				doc,
				y,
				doc.internal.pageSize.getWidth(),
				"Issue register",
				"Current status; archived issues excluded",
			);
			autoTable(doc, {
				startY: y,
				head: [["ID", "Issue", "Project", "Status", "Priority", "Due"]],
				body: displayIssues.map((issue) => [
					issueCode(issue),
					issue.name,
					issue.project,
					issue.state,
					issue.priority ?? "None",
					issue.target_date ?? "—",
				]),
				styles: { fontSize: 7, cellPadding: 2 },
				columnStyles: { 1: { cellWidth: 65 }, 2: { cellWidth: 30 } },
				didDrawPage: () => pdfReportFooter(doc, "Palmstead"),
			});
			pdfReportFooter(doc, "Palmstead");
			doc.save(`operations-${reportType}-${start}-${end}.pdf`);
		} finally {
			setExporting(false);
		}
	}

	if (!profile) return <Skeleton className="h-48 w-full" />;
	return (
		<div className="space-y-5">
			<PortalBackLink fallback="/dashboard/operations" />
			<PageHeader
				title="Operations reports"
				description={
					manager
						? "Review delivery, overdue work, and assignment across Palmstead."
						: "Track your assigned work and completed tasks."
				}
				action={
					<div className="flex gap-2">
						<Button
							variant="outline"
							onClick={downloadCsv}
							disabled={!data || !!error}
						>
							<Download data-icon="inline-start" />
							CSV
						</Button>
						<Button
							onClick={downloadPdf}
							disabled={!data || !!error || exporting}
						>
							<FileText data-icon="inline-start" />
							{exporting ? "Preparing…" : "Download PDF"}
						</Button>
					</div>
				}
			/>
			<Card>
				<CardContent className="flex flex-wrap items-end gap-3 py-4">
					<div className="space-y-1.5">
						<Label>Report</Label>
						<Select value={reportType} onValueChange={setReportType}>
							<SelectTrigger className="w-48">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="work-summary">Work summary</SelectItem>
								<SelectItem value="completed">Completed in period</SelectItem>
								<SelectItem value="created">Created in period</SelectItem>
								<SelectItem value="due">Due in period</SelectItem>
								<SelectItem value="open-overdue">Open work</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label>From</Label>
						<Input
							type="date"
							value={start}
							onChange={(event) => setStart(event.target.value)}
							className="w-40"
						/>
					</div>
					<div className="space-y-1.5">
						<Label>To</Label>
						<Input
							type="date"
							value={end}
							onChange={(event) => setEnd(event.target.value)}
							className="w-40"
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Project</Label>
						<Select value={projectId} onValueChange={setProjectId}>
							<SelectTrigger className="w-48">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All projects</SelectItem>
								{projects.map((project) => (
									<SelectItem key={project.id} value={project.id}>
										{project.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label>Status</Label>
						<Select value={statusGroup} onValueChange={setStatusGroup}>
							<SelectTrigger className="w-40">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All statuses</SelectItem>
								{[
									"backlog",
									"unstarted",
									"started",
									"completed",
									"cancelled",
								].map((group) => (
									<SelectItem key={group} value={group}>
										{group === "started"
											? "In progress"
											: group[0].toUpperCase() + group.slice(1)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label>Priority</Label>
						<Select value={priority} onValueChange={setPriority}>
							<SelectTrigger className="w-36">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All priorities</SelectItem>
								{["urgent", "high", "medium", "low", "none"].map((value) => (
									<SelectItem key={value} value={value}>
										{value === "none"
											? "None"
											: value[0].toUpperCase() + value.slice(1)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{manager && (
						<div className="space-y-1.5">
							<Label>Assigned to</Label>
							<Select value={personKey} onValueChange={setPersonKey}>
								<SelectTrigger className="w-48">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All staff</SelectItem>
									{(data?.staff ?? []).map((person) => (
										<SelectItem key={person.key} value={person.key}>
											{person.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
					<Button variant="ghost" onClick={resetFilters}>
						<RotateCcw data-icon="inline-start" />
						Reset
					</Button>
				</CardContent>
			</Card>
			<p className="text-xs text-muted-foreground">
				Date range applies to the selected report type. Overdue means open work
				past its due date today. Company totals count each issue once; staff
				workload counts it for each assignee.
			</p>
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			{query.isLoading ? (
				<div className="grid gap-3 md:grid-cols-5">
					{Array.from({ length: 5 }, (_, i) => (
						<Skeleton key={i} className="h-24" />
					))}
				</div>
			) : (
				!error && (
					<>
						<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
							{summaryCards.map((item) => (
								<Card key={item.label}>
									<CardHeader className="pb-2">
										<CardDescription>{item.label}</CardDescription>
										<CardTitle className="text-2xl tabular-nums">
											{item.value}
										</CardTitle>
									</CardHeader>
								</Card>
							))}
						</div>
						{manager && personKey === "all" && (
							<Card>
								<CardHeader>
									<CardTitle className="text-base">Workload by staff</CardTitle>
									<CardDescription>
										Counts describe assigned work volume; they are not a measure
										of effort or performance. Multi-assignee issues appear for
										each assigned person.
									</CardDescription>
								</CardHeader>
								<CardContent className="p-0">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Staff member</TableHead>
												<TableHead className="text-right">Open</TableHead>
												<TableHead className="text-right">
													Overdue now
												</TableHead>
												<TableHead className="text-right">
													Completed in period
												</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{staffMetrics.map((row) => (
												<TableRow key={row.key}>
													<TableCell className="font-medium">
														{row.name}
													</TableCell>
													<TableCell className="text-right tabular-nums">
														{row.open}
													</TableCell>
													<TableCell className="text-right tabular-nums">
														{row.overdue}
													</TableCell>
													<TableCell className="text-right tabular-nums">
														{row.completed}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</CardContent>
							</Card>
						)}
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Issue register</CardTitle>
								<CardDescription>
									{displayIssues.length} issue(s) · filtered data also powers
									the exports
								</CardDescription>
							</CardHeader>
							<CardContent className="p-0">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Issue</TableHead>
											<TableHead>Project</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Priority</TableHead>
											<TableHead>Due date</TableHead>
											<TableHead>Completed</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{displayIssues.map((issue) => (
											<TableRow key={issue.id}>
												<TableCell>
													<div className="font-medium">{issue.name}</div>
													<div className="text-xs text-muted-foreground">
														{issueCode(issue)}
													</div>
												</TableCell>
												<TableCell>{issue.project}</TableCell>
												<TableCell>{issue.state}</TableCell>
												<TableCell className="capitalize">
													{issue.priority ?? "None"}
												</TableCell>
												<TableCell>{issue.target_date ?? "—"}</TableCell>
												<TableCell>
													{issue.completed_at?.slice(0, 10) ?? "—"}
												</TableCell>
											</TableRow>
										))}
										{displayIssues.length === 0 && (
											<TableRow>
												<TableCell
													colSpan={6}
													className="h-24 text-center text-muted-foreground"
												>
													No issues match these filters.
												</TableCell>
											</TableRow>
										)}
									</TableBody>
								</Table>
							</CardContent>
						</Card>
						{!manager && (
							<p className="text-xs text-muted-foreground">
								This view contains only work assigned to your account.
							</p>
						)}
					</>
				)
			)}
		</div>
	);
}
