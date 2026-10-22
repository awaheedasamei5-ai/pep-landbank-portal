"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useQuery } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Download, FileText, RotateCcw } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
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

import { PortalBackLink, PortalForwardLink } from "../../../_components/portal-navigation";
import {
	buildTrend,
	type ComparisonMode,
	comparePeriods,
	displayDate,
	formatDelta,
	isCurrentOpen,
	parseReportFilters,
	type OperationsReportFilters,
	writeReportFilters,
} from "./operations-report-model";

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
type ReportExportSection = "all" | "summary" | "comparison" | "trend" | "workload" | "register";
const exportSectionLabels: Record<ReportExportSection, string> = {
	all: "Full report",
	summary: "Summary",
	comparison: "Period comparison",
	trend: "Activity trend",
	workload: "Staff workload",
	register: "Issue register",
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

const isOpen = (issue: Issue) => isCurrentOpen(issue.stateGroup);
const dateInRange = (date: string | null, start: string, end: string) =>
	!!date && displayDate(date) >= start && displayDate(date) <= end;
const issueCode = (issue: Issue) => `${issue.identifier}-${issue.sequence_id}`;
const cleanCsv = (value: unknown) =>
	`"${String(value ?? "").replaceAll('"', '""')}"`;
const todayIso = () => isoDateOnly(new Date());
const trendConfig = {
	created: { label: "Created", color: "var(--chart-1)" },
	completed: { label: "Completed", color: "var(--chart-2)" },
} satisfies ChartConfig;

function startMonth(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}
function endMonth(date: Date) {
	return isoDateOnly(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

type ReportDatePreset = "today" | "last-7-days" | "last-30-days" | "this-month" | "last-month" | "quarter-to-date" | "year-to-date";
const reportDatePresets: { value: ReportDatePreset; label: string }[] = [
	{ value: "today", label: "Today" },
	{ value: "last-7-days", label: "Last 7 days" },
	{ value: "last-30-days", label: "Last 30 days" },
	{ value: "this-month", label: "This month" },
	{ value: "last-month", label: "Last month" },
	{ value: "quarter-to-date", label: "Quarter to date" },
	{ value: "year-to-date", label: "Year to date" },
];
function datePresetRange(preset: ReportDatePreset, currentDate: Date) {
	const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
	const offset = (days: number) => isoDateOnly(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days));
	switch (preset) {
		case "today": return { from: isoDateOnly(today), to: isoDateOnly(today) };
		case "last-7-days": return { from: offset(-6), to: isoDateOnly(today) };
		case "last-30-days": return { from: offset(-29), to: isoDateOnly(today) };
		case "this-month": return { from: startMonth(today), to: isoDateOnly(today) };
		case "last-month": {
			const previous = new Date(today.getFullYear(), today.getMonth() - 1, 1);
			return { from: startMonth(previous), to: endMonth(previous) };
		}
		case "quarter-to-date": {
			const quarterStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
			return { from: startMonth(quarterStart), to: isoDateOnly(today) };
		}
		case "year-to-date": return { from: `${today.getFullYear()}-01-01`, to: isoDateOnly(today) };
	}
}
function activeDatePreset(from: string, to: string, currentDate: Date): ReportDatePreset | null {
	return reportDatePresets.find(({ value }) => {
		const range = datePresetRange(value, currentDate);
		return range.from === from && range.to === to;
	})?.value ?? null;
}

export function OperationsReportsScreen({ initialSearchParams }: { initialSearchParams: string }) {
	const profile = useAuthStore((state) => state.profile);
	const manager = profile?.role === "manager";
	const [initialFilters] = useState(() => {
		const now = new Date();
		const defaults = { from: startMonth(now), to: endMonth(now) };
		const params = new URLSearchParams(initialSearchParams);
		return parseReportFilters(params, defaults, true);
	});
	const [reportType, setReportType] = useState(initialFilters.report);
	const [projectId, setProjectId] = useState(initialFilters.project);
	const [personKey, setPersonKey] = useState(initialFilters.person);
	const [statusGroup, setStatusGroup] = useState(initialFilters.status);
	const [priority, setPriority] = useState(initialFilters.priority);
	const [start, setStart] = useState(initialFilters.from);
	const [end, setEnd] = useState(initialFilters.to);
	const [comparisonMode, setComparisonMode] = useState<ComparisonMode>(initialFilters.compare);
	const [exportSection, setExportSection] = useState<ReportExportSection>("all");
	const [exporting, setExporting] = useState(false);
	useEffect(() => {
		const now = new Date();
		const filters = parseReportFilters(new URLSearchParams(initialSearchParams), { from: startMonth(now), to: endMonth(now) }, true);
		setReportType(filters.report);
		setProjectId(filters.project);
		setPersonKey(filters.person);
		setStatusGroup(filters.status);
		setPriority(filters.priority);
		setStart(filters.from);
		setEnd(filters.to);
		setComparisonMode(filters.compare);
	}, [initialSearchParams]);
	useEffect(() => {
		if (!manager || (exportSection === "workload" && personKey !== "all")) setExportSection("all");
	}, [manager, personKey, exportSection]);
	useEffect(() => {
		if (!profile || start > end) return;
		const filters: OperationsReportFilters = {
			report: reportType as OperationsReportFilters["report"],
			project: projectId,
			person: personKey,
			status: statusGroup,
			priority,
			from: start,
			to: end,
			compare: comparisonMode,
		};
		const params = writeReportFilters(new URLSearchParams(window.location.search), filters, manager);
		const queryString = params.toString();
		const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;
		const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
		if (nextUrl !== currentUrl) window.history.replaceState(window.history.state, "", nextUrl);
	}, [profile, manager, reportType, projectId, personKey, statusGroup, priority, start, end, comparisonMode]);
	useEffect(() => {
		const restoreFilters = () => {
			const now = new Date();
			const filters = parseReportFilters(new URLSearchParams(window.location.search), { from: startMonth(now), to: endMonth(now) }, manager);
			setReportType(filters.report);
			setProjectId(filters.project);
			setPersonKey(filters.person);
			setStatusGroup(filters.status);
			setPriority(filters.priority);
			setStart(filters.from);
			setEnd(filters.to);
			setComparisonMode(filters.compare);
		};
		window.addEventListener("popstate", restoreFilters);
		return () => window.removeEventListener("popstate", restoreFilters);
	}, [manager]);
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
	let scopeLabel = "My assigned work";
	if (manager && personKey === "all") scopeLabel = "Company-wide";
	else if (manager) {
		scopeLabel = data?.staff.find((person) => person.key === personKey)?.name ?? "Selected staff";
	}
	let staffFilterLabel = "Self only";
	if (manager && personKey === "all") staffFilterLabel = "All staff";
	else if (manager) staffFilterLabel = scopeLabel;
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
	const facetFiltered = useMemo(
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
				return true;
			}),
		[
			data?.issues,
			projectId,
			statusGroup,
			priority,
			manager,
			personKey,
		],
	);
	const filtered = useMemo(
		() =>
			facetFiltered.filter((issue) => {
				if (reportType === "open-overdue" && !isOpen(issue)) return false;
				if (reportType === "completed" && !dateInRange(issue.completed_at, start, end)) return false;
				if (reportType === "created" && !dateInRange(issue.created_at, start, end)) return false;
				if (reportType === "due" && !dateInRange(issue.target_date, start, end)) return false;
				return true;
			}),
		[facetFiltered, reportType, start, end],
	);
	const comparison = useMemo(
		() => comparePeriods(facetFiltered, { start, end }, comparisonMode),
		[facetFiltered, start, end, comparisonMode],
	);
	const trend = useMemo(
		() => buildTrend(facetFiltered, { start, end }),
		[facetFiltered, start, end],
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
	let summaryCards: { label: string; value: number }[];
	if (reportType === "open-overdue" && manager) {
		summaryCards = [
			{ label: "Open issues", value: summary.total },
			{ label: "Overdue now", value: summary.overdue },
			{ label: "Unassigned open", value: summary.unassigned },
		];
	} else if (reportType === "open-overdue") {
		summaryCards = [
			{ label: "My open issues", value: summary.total },
			{ label: "Overdue now", value: summary.overdue },
		];
	} else if (manager) {
		summaryCards = [
			{ label: "Issues in view", value: summary.total },
			{ label: "Currently open", value: summary.open },
			{ label: "Overdue now", value: summary.overdue },
			{ label: "Completed in period", value: summary.completedInRange },
			{ label: "Unassigned open", value: summary.unassigned },
		];
	} else {
		summaryCards = [
			{ label: "My issues", value: summary.total },
			{ label: "Currently open", value: summary.open },
			{ label: "Overdue now", value: summary.overdue },
			{ label: "Completed in period", value: summary.completedInRange },
		];
	}
	const displayIssues: FilteredIssue[] = filtered
		.filter((issue) => {
			if (reportType === "open-overdue") return isOpen(issue);
			return true;
		})
		.sort((a, b) =>
			(a.target_date ?? "9999").localeCompare(b.target_date ?? "9999"),
		);
	let error: string | null = null;
	if (start > end) error = "Choose a start date that is on or before the end date.";
	else if (query.error instanceof Error) error = query.error.message;

	function resetFilters() {
		setProjectId("all");
		setPersonKey("all");
		setStatusGroup("all");
		setPriority("all");
		setReportType("work-summary");
		setStart(startMonth(new Date()));
		setEnd(endMonth(new Date()));
		setComparisonMode("previous-period");
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
		anchor.download = reportType === "open-overdue"
			? `operations-open-work-as-of-${todayIso()}.csv`
			: `operations-${reportType}-${start}-${end}.csv`;
		anchor.click();
		URL.revokeObjectURL(url);
	}
	function downloadSummaryCsv() {
		const headings = [
			"Record Type", "Name", "Current Period Start", "Current Period End",
			"Comparison Period Start", "Comparison Period End", "Current Value", "Previous Value", "Change", "Change %",
		];
		const metadata = [
			["Scope", scopeLabel],
			["Report", reportType],
			["Project", projectId === "all" ? "All projects" : projects.find((project) => project.id === projectId)?.name ?? "Selected"],
			["Status", statusGroup],
			["Priority", priority],
			["Staff filter", staffFilterLabel],
		].map(([name, value]) => ["Filter", name, start, end, comparison.previousRange.start, comparison.previousRange.end, value, "", "", ""]);
		const metrics = [
			["Created", comparison.current.created, comparison.previous.created, comparison.delta.created, comparison.percent.created],
			["Completed", comparison.current.completed, comparison.previous.completed, comparison.delta.completed, comparison.percent.completed],
		].map(([name, current, previous, delta, percent]) => ["Metric", name, start, end, comparison.previousRange.start, comparison.previousRange.end, current, previous, delta, percent === null ? "No prior baseline" : `${percent}%`]);
		const csv = [headings, ...metadata, ...metrics]
			.map((row) => row.map(cleanCsv).join(","))
			.join("\r\n");
		const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `operations-summary-${start}-${end}.csv`;
		anchor.click();
		URL.revokeObjectURL(url);
	}
	async function downloadPdf() {
		setExporting(true);
		try {
			const doc = new jsPDF({ unit: "mm", format: "a4" });
			const filters = [
				`Project: ${projectId === "all" ? "All" : (projects.find((project) => project.id === projectId)?.name ?? "Selected")}`,
				`Status: ${statusGroup}`,
				`Priority: ${priority}`,
				manager ? `Staff: ${staffFilterLabel}` : "Staff: self only",
			].join(" · ");
			let y = pdfBrandedHeader(
				doc,
				"Operations report",
				reportType === "open-overdue"
					? `Current open work snapshot · ${todayIso()}`
					: `${reportType.replaceAll("-", " ")} · ${start} to ${end}`,
				[`${scopeLabel}`, exportSectionLabels[exportSection], `Generated ${today()}`],
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
			const includeSection = (section: ReportExportSection) => exportSection === "all" || exportSection === section;
			const preparePdfSection = () => {
				const contentBottom = doc.internal.pageSize.getHeight() - 20;
				if (y + 38 > contentBottom) {
					doc.addPage();
					y = 18;
				}
			};
			if (includeSection("summary")) {
				preparePdfSection();
				y = pdfSectionTitle(doc, y, doc.internal.pageSize.getWidth(), "Report summary");
				const summaryHeaders = manager
					? ["Issues in view", "Currently open", "Overdue now", "Completed in range", "Unassigned"]
					: ["My issues", "Currently open", "Overdue now", "Completed in range"];
				const summaryValues = manager
					? [summary.total, summary.open, summary.overdue, summary.completedInRange, summary.unassigned]
					: [summary.total, summary.open, summary.overdue, summary.completedInRange];
				autoTable(doc, { startY: y, head: [summaryHeaders], body: [summaryValues], styles: { fontSize: 8 }, didDrawPage: () => pdfReportFooter(doc, "Palmstead") });
				y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 11;
			}
			if (includeSection("comparison")) {
				preparePdfSection();
				y = pdfSectionTitle(
					doc,
					y,
					doc.internal.pageSize.getWidth(),
					"Period comparison",
					`Current ${start} to ${end} · Previous ${comparison.previousRange.start} to ${comparison.previousRange.end}`,
				);
				autoTable(doc, {
					startY: y,
					head: [["Activity date", "Current period", "Previous period", "Change", "Change %"]],
					body: [
						["Created", comparison.current.created, comparison.previous.created, comparison.delta.created, comparison.percent.created === null ? "No prior baseline" : `${comparison.percent.created}%`],
						["Completed", comparison.current.completed, comparison.previous.completed, comparison.delta.completed, comparison.percent.completed === null ? "No prior baseline" : `${comparison.percent.completed}%`],
					],
					styles: { fontSize: 8 },
					didDrawPage: () => pdfReportFooter(doc, "Palmstead"),
				});
				y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 11;
			}
			if (includeSection("trend")) {
				preparePdfSection();
				y = pdfSectionTitle(
					doc,
					y,
					doc.internal.pageSize.getWidth(),
					"Created and completed trend",
					`${trend.bucket[0].toUpperCase() + trend.bucket.slice(1)} buckets · selected filters · no historical state is inferred`,
				);
				autoTable(doc, {
					startY: y,
					head: [["Period", "Created", "Completed"]],
					body: trend.points.length
						? trend.points.map((point) => [point.label, point.created, point.completed])
						: [["No activity in this date range", 0, 0]],
					styles: { fontSize: 8 },
					didDrawPage: () => pdfReportFooter(doc, "Palmstead"),
				});
				y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 11;
			}
			if (manager && personKey === "all" && includeSection("workload")) {
				preparePdfSection();
				y = pdfSectionTitle(
					doc,
					y,
					doc.internal.pageSize.getWidth(),
					"Workload by staff",
					"Assignment volume only; this is not a measure of effort or performance",
				);
				autoTable(doc, {
					startY: y,
					head: [["Staff member", "Open now", "Overdue now", "Completed in period"]],
					body: staffMetrics.map((row) => [row.name, row.open, row.overdue, row.completed]),
					styles: { fontSize: 8 },
					didDrawPage: () => pdfReportFooter(doc, "Palmstead"),
				});
				y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 11;
			}
			if (includeSection("register")) {
				preparePdfSection();
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
					body: displayIssues.length
						? displayIssues.map((issue) => [
								issueCode(issue), issue.name, issue.project, issue.state, issue.priority ?? "None", issue.target_date ?? "—",
							])
						: [["—", "No issues match these filters", "—", "—", "—", "—"]],
					styles: { fontSize: 7, cellPadding: 2 },
					columnStyles: { 1: { cellWidth: 65 }, 2: { cellWidth: 30 } },
					didDrawPage: () => pdfReportFooter(doc, "Palmstead"),
				});
			}

			pdfReportFooter(doc, "Palmstead");
			doc.save(`operations-${exportSection}-${reportType}-${start}-${end}.pdf`);
		} finally {
			setExporting(false);
		}
	}
	let trendLabel = "Monthly";
	if (trend.bucket === "day") trendLabel = "Daily";
	else if (trend.bucket === "week") trendLabel = "Weekly";
	let trendContent: ReactNode;
	if (query.isLoading) trendContent = <Skeleton className="h-64 w-full" />;
	else if (trend.points.length === 0) {
		trendContent = (
			<p className="py-12 text-center text-muted-foreground">
				Choose a valid date range to view activity.
			</p>
		);
	} else {
		trendContent = (
			<ChartContainer
				config={trendConfig}
				className="aspect-auto h-64 w-full"
				aria-label="Created and completed issue counts by time bucket"
			>
				<LineChart
					accessibilityLayer
					data={trend.points}
					margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
				>
					<CartesianGrid vertical={false} strokeOpacity={0.45} />
					<XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={22} />
					<YAxis allowDecimals={false} width={30} tickLine={false} axisLine={false} />
					<ChartTooltip content={<ChartTooltipContent />} />
					<Line dataKey="created" type="monotone" stroke="var(--color-created)" strokeWidth={2} dot={false} />
					<Line dataKey="completed" type="monotone" stroke="var(--color-completed)" strokeWidth={2} dot={false} />
				</LineChart>
			</ChartContainer>
		);
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
							onClick={downloadSummaryCsv}
							disabled={!data || !!error}
						>
							<Download data-icon="inline-start" />
							Summary CSV
						</Button>
						<Button
							variant="outline"
							onClick={downloadCsv}
							disabled={!data || !!error}
						>
							<Download data-icon="inline-start" />
							Register CSV
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
						<Select value={reportType} onValueChange={(value) => setReportType(value as OperationsReportFilters["report"])}>
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
						<Label>PDF section</Label>
						<Select value={exportSection} onValueChange={(value) => setExportSection(value as ReportExportSection)}>
							<SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
							<SelectContent>
								{(Object.keys(exportSectionLabels) as ReportExportSection[])
									.filter((section) => section !== "workload" || (manager && personKey === "all"))
									.map((section) => <SelectItem key={section} value={section}>{exportSectionLabels[section]}</SelectItem>)}
							</SelectContent>
						</Select>
					</div>
					<div className="basis-full space-y-2">
						<Label>Quick date range</Label>
						<div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick date ranges">
							{reportDatePresets.map((preset) => {
								const selected = activeDatePreset(start, end, new Date()) === preset.value;
								return (
									<Button
										key={preset.value}
										type="button"
										size="sm"
										variant={selected ? "secondary" : "ghost"}
										className="h-8 px-2.5 text-xs"
										aria-pressed={selected}
										onClick={() => {
											const range = datePresetRange(preset.value, new Date());
											setStart(range.from);
											setEnd(range.to);
										}}
									>
										{preset.label}
									</Button>
								);
							})}
						</div>
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
						<Label>Compare with</Label>
						<Select value={comparisonMode} onValueChange={(value) => setComparisonMode(value as ComparisonMode)}>
							<SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
							<SelectContent>
								<SelectItem value="previous-period">Previous equal period</SelectItem>
								<SelectItem value="previous-year">Same period last year</SelectItem>
							</SelectContent>
						</Select>
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
			<p className="text-muted-foreground text-xs">
				Open work and overdue are current snapshots. Date ranges apply to created,
				completed and due reports, and to the created/completed trend and comparison.
				Company totals count each issue once; staff workload counts it for each assignee.
			</p>
			{!error && (
				<nav aria-label="Report sections" className="flex gap-1 overflow-x-auto border-b pb-2">
					<a className="shrink-0 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" href="#overview">Overview</a>
					<a className="shrink-0 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" href="#trends">Trends</a>
					<a className="shrink-0 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" href="#comparison">Comparison</a>
					{manager && personKey === "all" && <a className="shrink-0 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" href="#workload">Workload</a>}
					<a className="shrink-0 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" href="#register">Issue register</a>
				</nav>
			)}
			{!error && (
				<div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
					<Card id="trends" className="scroll-mt-6">
						<CardHeader>
							<CardTitle className="text-base">Created and completed trend</CardTitle>
							<CardDescription>
								{trendLabel} activity for the selected dates and current filters.
								Status and overdue counts are current snapshots.
							</CardDescription>
						</CardHeader>
						<CardContent>
							{trendContent}
						</CardContent>
					</Card>
					<Card id="comparison" className="scroll-mt-6">
						<CardHeader>
							<CardTitle className="text-base">Period comparison</CardTitle>
							<CardDescription>
								{start} – {end} compared with {comparison.previousRange.start} – {comparison.previousRange.end}
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-5">
							{([
								["Created", comparison.current.created, comparison.previous.created, comparison.delta.created, comparison.percent.created],
								["Completed", comparison.current.completed, comparison.previous.completed, comparison.delta.completed, comparison.percent.completed],
							] as const).map(([label, current, previous, delta, percent]) => (
								<div key={label} className="flex items-start justify-between gap-3 border-b pb-4 last:border-b-0 last:pb-0">
									<div>
										<p className="font-medium">{label}</p>
										<p className="text-muted-foreground text-sm">Current {current} · Previous {previous}</p>
									</div>
									<p className="text-right font-semibold text-sm tabular-nums">{formatDelta(delta, percent)}</p>
								</div>
							))}
							<p className="text-muted-foreground text-xs">
								The comparison counts items by their created or completed date. It does not reconstruct historical status or workload.
							</p>
						</CardContent>
					</Card>
				</div>
			)}
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			{query.isLoading ? (
				<div className="grid gap-3 md:grid-cols-5">
					{["one", "two", "three", "four", "five"].map((key) => (
						<Skeleton key={key} className="h-24" />
					))}
				</div>
			) : (
				!error && (
					<>
						<div id="overview" className="grid scroll-mt-6 gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
							<Card id="workload" className="scroll-mt-6">
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
						<Card id="register" className="scroll-mt-6">
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
													<div className="text-muted-foreground text-xs">
					<PortalForwardLink href={`/dashboard/operations/${issue.project_id}/issues/${issue.id}`} className="rounded-sm underline-offset-4 hover:underline focus-visible:underline">{issueCode(issue)}</PortalForwardLink>
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
							<p className="text-muted-foreground text-xs">
								This view contains only work assigned to your account.
							</p>
						)}
					</>
				)
			)}
		</div>
	);
}

