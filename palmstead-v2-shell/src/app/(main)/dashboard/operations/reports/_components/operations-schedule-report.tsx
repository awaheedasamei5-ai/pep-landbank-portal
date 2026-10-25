"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Download, FileText } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSupabase } from "@/lib/supabase.client";
import { useLogDownload } from "@/webnext/shared/hooks/useLogDownload";
import { pdfBrandedHeader, pdfReportFooter, pdfSectionTitle } from "@/webnext/shared/lib/pdfReport";
import { PortalForwardLink } from "../../../_components/portal-navigation";

type TodoRow = {
  id: string;
  title: string;
  item_date: string;
  start_time: string | null;
  status: string;
  assigned_to: string;
  assigned_to_name: string | null;
  completed_at: string | null;
};
type MeetingRow = {
  id: string;
  title: string;
  item_date: string;
  start_time: string | null;
  status: string;
  owner_key: string;
  owner_name: string | null;
  meeting_location: string | null;
};
type InviteRow = {
  schedule_item_id: string;
  staff_key: string;
  status: string;
};
type ScheduleData = { todos: TodoRow[]; meetings: MeetingRow[]; invites: InviteRow[] };

async function allPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await fetchPage(from, from + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) return rows;
  }
}

async function loadSchedule(start: string, end: string, key: string, manager: boolean): Promise<ScheduleData> {
  const sb = requireSupabase();
  const [todos, meetings] = await Promise.all([
    allPages<TodoRow>((from, to) => {
      const query = sb
        .from("op_todos")
        .select("id,title,item_date,start_time,status,assigned_to,assigned_to_name,completed_at")
        .gte("item_date", start)
        .lte("item_date", end)
        .order("item_date")
        .order("id");
      return (manager ? query : query.eq("assigned_to", key)).range(from, to);
    }),
    allPages<MeetingRow>((from, to) =>
      sb
        .from("schedule_items")
        .select("id,title,item_date,start_time,status,owner_key,owner_name,meeting_location")
        .eq("kind", "meeting")
        .gte("item_date", start)
        .lte("item_date", end)
        .order("item_date")
        .order("id")
        .range(from, to),
    ),
  ]);
  const invites: InviteRow[] = [];
  // Bound each IN list; RLS still decides which invite rows the caller can read.
  for (let offset = 0; offset < meetings.length; offset += 100) {
    const ids = meetings.slice(offset, offset + 100).map((meeting) => meeting.id);
    invites.push(
      ...(await allPages<InviteRow>((from, to) => {
        const query = sb
          .from("schedule_item_invitees")
          .select("schedule_item_id,staff_key,status")
          .in("schedule_item_id", ids)
          .order("schedule_item_id")
          .order("staff_key");
        return (manager ? query : query.eq("staff_key", key)).range(from, to);
      })),
    );
  }
  return { todos, meetings, invites };
}

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const download = (name: string, content: string) => {
  const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function OperationsScheduleReport({
  start,
  end,
  profileKey,
  manager,
  personKey,
  personName,
}: {
  start: string;
  end: string;
  profileKey: string;
  manager: boolean;
  personKey: string;
  personName: string;
}) {
  const [exporting, setExporting] = useState(false);
  const logDownload = useLogDownload();
  const query = useQuery({
    queryKey: ["operationsScheduleReport", start, end, profileKey, manager],
    queryFn: () => loadSchedule(start, end, profileKey, manager),
    enabled: Boolean(profileKey) && Boolean(start) && Boolean(end) && start <= end,
  });
  const selected = manager && personKey !== "all" ? personKey : null;
  const todos = useMemo(
    () => (query.data?.todos ?? []).filter((todo) => !selected || todo.assigned_to === selected),
    [query.data, selected],
  );
  const meetings = useMemo(() => {
    const inviteByMeeting = new Map<string, InviteRow[]>();
    for (const invite of query.data?.invites ?? [])
      inviteByMeeting.set(invite.schedule_item_id, [...(inviteByMeeting.get(invite.schedule_item_id) ?? []), invite]);
    return (query.data?.meetings ?? [])
      .filter((meeting) => {
        const person = selected ?? (manager ? null : profileKey);
        return (
          !person ||
          meeting.owner_key === person ||
          (inviteByMeeting.get(meeting.id) ?? []).some((invite) => invite.staff_key === person)
        );
      })
      .map((meeting) => ({
        ...meeting,
        invitees: (inviteByMeeting.get(meeting.id) ?? []).filter(
          (invite) => !selected || invite.staff_key === selected,
        ),
      }));
  }, [query.data, selected, manager, profileKey]);
  const today = new Date().toISOString().slice(0, 10);
  const open = todos.filter((todo) => todo.status === "open").length;
  const done = todos.filter((todo) => todo.status === "done").length;
  const overdue = todos.filter((todo) => todo.status === "open" && todo.item_date < today).length;
  const upcoming = meetings.filter((meeting) => meeting.item_date >= today && meeting.status !== "cancelled").length;
  const inviteStatuses = (query.data?.invites ?? []).filter((invite) => {
    const meeting = meetings.find((item) => item.id === invite.schedule_item_id);
    return meeting && (!selected || invite.staff_key === selected);
  });
  let scope = "My schedule";
  if (manager) scope = selected ? personName : "Company schedule";
  const rows = [
    ...todos.map((todo) => [
      "Task",
      todo.title,
      todo.item_date,
      todo.start_time?.slice(0, 5) ?? "",
      todo.status,
      todo.assigned_to_name ?? todo.assigned_to,
      todo.completed_at?.slice(0, 10) ?? "",
    ]),
    ...meetings.map((meeting) => [
      "Meeting",
      meeting.title,
      meeting.item_date,
      meeting.start_time?.slice(0, 5) ?? "",
      meeting.status,
      meeting.owner_name ?? meeting.owner_key,
      meeting.invitees.length ? meeting.invitees.map((invite) => invite.status).join("; ") : "—",
    ]),
  ].sort((a, b) => a[2].localeCompare(b[2]) || a[3].localeCompare(b[3]));
  const headings = ["Type", "Title", "Scheduled date", "Start", "Status", "Assigned to / Host", "Completed / RSVP"];
  const filename = `operations-schedule-${start}-${end}`;

  function downloadCsv() {
    const content = [["Scope", scope], ["Period", `${start} to ${end}`], ["As of", today], [], headings, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    download(`${filename}.csv`, content);
    logDownload(`${filename}.csv`, "csv", content);
  }

  async function downloadPdf() {
    setExporting(true);
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      let y = pdfBrandedHeader(doc, "Schedule report", `${start} to ${end}`, [scope, `As of ${today}`], null);
      y = pdfSectionTitle(doc, y, doc.internal.pageSize.getWidth(), "Schedule at a glance");
      autoTable(doc, {
        startY: y,
        head: [["Tasks", "Open", "Done", "Overdue", "Meetings", "Upcoming"]],
        body: [[todos.length, open, done, overdue, meetings.length, upcoming]],
        styles: { fontSize: 8 },
        margin: { bottom: 20 },
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 11;
      y = pdfSectionTitle(
        doc,
        y,
        doc.internal.pageSize.getWidth(),
        "Schedule register",
        "Current status; scheduled dates in selected range",
      );
      autoTable(doc, {
        startY: y,
        head: [headings],
        body: rows.length ? rows : [["—", "No records in this period", "—", "—", "—", "—", "—"]],
        styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
        headStyles: { fillColor: [11, 30, 61] },
        columnStyles: { 1: { cellWidth: 48 }, 2: { cellWidth: 24 }, 5: { cellWidth: 30 } },
        margin: { left: 12, right: 12, bottom: 20 },
      });
      pdfReportFooter(doc, "Palmstead");
      doc.save(`${filename}.pdf`);
      logDownload(`${filename}.pdf`, "pdf", doc.output("datauristring"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <section id="schedule-report" className="scroll-mt-6 space-y-4" aria-labelledby="schedule-report-heading">
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle id="schedule-report-heading">Schedule: tasks and meetings</CardTitle>
            <CardDescription>
              {scope} · {start} to {end}. Project, issue status and priority filters above apply only to the issue
              sections.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadCsv} disabled={!query.data || start > end}>
              <Download data-icon="inline-start" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadPdf}
              disabled={!query.data || exporting || start > end}
            >
              <FileText data-icon="inline-start" />
              {exporting ? "Preparing…" : "PDF"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {query.isLoading && <Skeleton className="h-28 w-full" />}
          {query.error && (
            <Alert variant="destructive">
              <AlertDescription>{query.error.message}</AlertDescription>
            </Alert>
          )}
          {start > end && (
            <Alert variant="destructive">
              <AlertDescription>Choose a valid date range.</AlertDescription>
            </Alert>
          )}
          {query.data && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Tasks", todos.length],
                  ["Open tasks", open],
                  ["Done tasks", done],
                  ["Overdue open", overdue],
                  ["Meetings", meetings.length],
                  ["Upcoming meetings", upcoming],
                  ["Accepted invites", inviteStatuses.filter((invite) => invite.status === "accepted").length],
                  ["Awaiting response", inviteStatuses.filter((invite) => invite.status === "invited").length],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-lg border bg-card p-3">
                    <p className="text-muted-foreground text-xs">{label}</p>
                    <p className="font-semibold text-xl tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                Tasks count by scheduled date and current status. Overdue means an open task scheduled before today.
                Meeting totals count each meeting once; invitation totals count people.
              </p>
            </>
          )}
        </CardContent>
      </Card>
      {query.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Schedule register</CardTitle>
            <CardDescription>{rows.length} scheduled record(s) in this scope and period.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-w-full overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    {headings.map((heading) => (
                      <TableHead key={heading}>{heading}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todos.map((todo) => (
                    <TableRow key={`task-${todo.id}`}>
                      <TableCell>Task</TableCell>
                      <TableCell className="max-w-56 whitespace-normal font-medium">
                        <PortalForwardLink href="/dashboard/operations?view=schedule" className="hover:underline">
                          {todo.title}
                        </PortalForwardLink>
                      </TableCell>
                      <TableCell>{todo.item_date}</TableCell>
                      <TableCell>{todo.start_time?.slice(0, 5) ?? "—"}</TableCell>
                      <TableCell className="capitalize">{todo.status}</TableCell>
                      <TableCell>{todo.assigned_to_name ?? todo.assigned_to}</TableCell>
                      <TableCell>{todo.completed_at?.slice(0, 10) ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                  {meetings.map((meeting) => (
                    <TableRow key={`meeting-${meeting.id}`}>
                      <TableCell>Meeting</TableCell>
                      <TableCell className="max-w-56 whitespace-normal font-medium">
                        <PortalForwardLink href="/dashboard/operations?view=schedule" className="hover:underline">
                          {meeting.title}
                        </PortalForwardLink>
                      </TableCell>
                      <TableCell>{meeting.item_date}</TableCell>
                      <TableCell>{meeting.start_time?.slice(0, 5) ?? "—"}</TableCell>
                      <TableCell className="capitalize">{meeting.status}</TableCell>
                      <TableCell>{meeting.owner_name ?? meeting.owner_key}</TableCell>
                      <TableCell className="capitalize">
                        {meeting.invitees.map((invite) => invite.status).join(", ") || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!rows.length && (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        No tasks or meetings are scheduled in this period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
