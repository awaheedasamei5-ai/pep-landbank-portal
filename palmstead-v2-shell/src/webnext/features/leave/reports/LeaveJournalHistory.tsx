"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LeaveReport } from "./leaveReport";
import { changedFieldLabels, journalElapsed, journalKindLabels, journalStateText } from "./leaveJournal";

const time = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Africa/Accra", hour12: false });
export function LeaveJournalHistory({ report }: { report: LeaveReport }) {
  const [page, setPage] = useState(0);
  const journal = report.journal;
  const pages = Math.max(1, Math.ceil(journal.events.length / 25));
  const current = Math.min(page, pages - 1);
  if (!journal.available)
    return (
      <Alert>
        <AlertTitle>Prospective change capture is unavailable</AlertTitle>
        <AlertDescription>
          Only the legacy status records below are available. No complete change history or decision-cycle timing can be
          established.
        </AlertDescription>
      </Alert>
    );
  return (
    <section aria-label="Captured request changes" className="mb-7 grid min-w-0 gap-4">
      <div>
        <h3 className="font-semibold text-base">Captured request changes</h3>
        <p className="mt-1 text-muted-foreground text-sm">
          Capture began {time(journal.startedAt as string)} Ghana time. Baseline rows observe the state at installation;
          they do not reconstruct earlier changes. History includes deletions and changes affecting the selected request
          year.
        </p>
      </div>
      {!journal.complete && (
        <Alert variant="destructive">
          <AlertTitle>Change history response is incomplete</AlertTitle>
          <AlertDescription>
            History and full-pack exports are disabled. A narrower server history scope is required; timing summaries
            are unavailable.
          </AlertDescription>
        </Alert>
      )}
      <dl className="flex flex-wrap gap-x-9 gap-y-4 border-y py-4">
        <div>
          <dt className="text-muted-foreground text-xs">Captured records in this cohort</dt>
          <dd className="font-semibold text-xl tabular-nums">{journal.events.length}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Decisions with a captured cycle</dt>
          <dd className="font-semibold text-xl tabular-nums">
            {journal.complete ? journal.timed.length : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Median captured decision time</dt>
          <dd className="font-semibold text-sm">{journalElapsed(journal.medianSeconds)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Captured decisions without timing</dt>
          <dd className="font-semibold text-xl tabular-nums">
            {journal.complete ? journal.untimedDecisions : "Unavailable"}
          </dd>
        </div>
      </dl>
      <p className="text-muted-foreground text-sm">{journal.definition}</p>
      {journal.events.length ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  "Request / stored owner",
                  "Recorded Ghana UTC / actor",
                  "Change",
                  "Before",
                  "After",
                  "Captured cycle",
                ].map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {journal.events.slice(current * 25, (current + 1) * 25).map((event) => (
                <TableRow key={event.eventId}>
                  <TableCell className="min-w-40 max-w-64 whitespace-normal break-words">
                    {event.requestExists ? (
                      <Link
                        className="block break-all font-medium underline underline-offset-4"
                        href={`/dashboard/leave/requests/${event.requestId}`}
                      >
                        {event.reference}
                      </Link>
                    ) : (
                      <span>
                        {event.reference}
                        <span className="block text-muted-foreground text-xs">Source deleted or unavailable</span>
                      </span>
                    )}
                    <span className="mt-1 block text-muted-foreground">{event.ownerName}</span>
                    <span className="block text-muted-foreground text-xs">Event {event.eventId}</span>
                  </TableCell>
                  <TableCell className="min-w-40 whitespace-normal">
                    {time(event.capturedAt)}
                    <span className="mt-1 block text-muted-foreground">{event.actorName}</span>
                  </TableCell>
                  <TableCell className="min-w-48 max-w-72 whitespace-normal">
                    <span className="font-medium">{journalKindLabels[event.kind] ?? event.kind}</span>
                    <span className="mt-1 block text-muted-foreground text-xs">{changedFieldLabels(event)}</span>
                  </TableCell>
                  <TableCell className="min-w-56 max-w-80 whitespace-pre-line break-words">
                    {journalStateText(event.beforeState)}
                  </TableCell>
                  <TableCell className="min-w-56 max-w-80 whitespace-pre-line break-words">
                    {journalStateText(event.afterState)}
                  </TableCell>
                  <TableCell className="min-w-48 whitespace-normal">
                    {journal.timedIds.has(event.eventId) ? (
                      <>
                        {journalElapsed(event.cycleSeconds)}
                        <span className="mt-1 block text-muted-foreground text-xs">
                          Submitted {time(event.cycleSubmittedAt as string)} · event {event.submissionEventId}
                        </span>
                      </>
                    ) : (
                      <span>
                        {event.kind === "decision"
                          ? "Submission timing not established"
                          : "Not a completed decision cycle"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline" disabled={!current} onClick={() => setPage(current - 1)}>
              Previous changes
            </Button>
            <span className="text-muted-foreground text-xs">
              Page {current + 1} of {pages} · downloads include all matching changes
            </span>
            <Button size="sm" variant="outline" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>
              Next changes
            </Button>
          </div>
        </>
      ) : (
        <p className="py-5 text-muted-foreground text-sm">
          No captured changes affect this request year and employee cohort.
        </p>
      )}
    </section>
  );
}
