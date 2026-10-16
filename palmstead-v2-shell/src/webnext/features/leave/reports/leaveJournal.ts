export interface JournalState {
  year: number;
  dates: unknown;
  days: number;
  status: string;
  isEmergency: boolean;
  deductQuota: boolean;
  decidedAt: string | null;
  autoSubmittedAt: string | null;
  usedConfirmedAt: string | null;
}
export interface JournalEvent {
  eventId: string;
  requestId: string;
  reference: string;
  ownerKey: string;
  ownerName: string;
  actorName: string;
  actorKind: string;
  kind: string;
  capturedAt: string;
  beforeState: JournalState | null;
  afterState: JournalState | null;
  changedFields: string[];
  submissionEventId: string | null;
  cycleSubmittedAt: string | null;
  cycleSeconds: number | null;
  requestExists: boolean;
}
export interface JournalDataset {
  journalStartedAt?: string;
  journalEvents?: JournalEvent[];
  journalTotal?: number;
  journalComplete?: boolean;
}
export const journalKindLabels: Record<string, string> = {
  baseline: "Baseline observed — earlier history unknown",
  created: "Plan or request created",
  submitted: "Submitted for decision",
  amended_submission: "Pending submission amended",
  decision: "Management decision",
  deleted: "Request deleted",
  schedule_changed: "Selected schedule changed",
  quota_changed: "Quota treatment changed",
  status_changed: "Status changed",
  usage_confirmation_changed: "Usage confirmation changed",
  ownership_changed: "Request owner changed",
  details_changed: "Request details changed",
};
const fieldLabels: Record<string, string> = {
  dates: "Selected dates",
  days: "Declared days",
  year: "Request year",
  status: "Status",
  isEmergency: "Emergency",
  deductQuota: "Quota treatment",
  decidedAt: "Decision timestamp",
  autoSubmittedAt: "Automatic submission",
  usedConfirmedAt: "Usage confirmation",
  letterContent: "Applicant wording (content private)",
  privateNote: "Private note (content private)",
  decisionSignature: "Decision signature (content private)",
  referenceOrOwnerLabel: "Reference or stored owner label",
  owner: "Owner",
  baseline: "Existing state observed",
};
export const changedFieldLabels = (event: JournalEvent) =>
  event.changedFields.map((field) => fieldLabels[field] ?? field).join("; ");
export function journalDates(state: JournalState | null) {
  if (!state) return "Not applicable";
  if (!Array.isArray(state.dates)) return "Date array unavailable";
  return (
    state.dates.map((date) => (typeof date === "string" ? date : "Invalid date value")).join(", ") ||
    "No selected dates"
  );
}
export function journalStateText(state: JournalState | null): string {
  if (!state) return "Not applicable";
  return `${state.year} · ${state.status} · ${state.days} declared days · ${state.deductQuota ? "Deducting" : "Exempt"}${state.isEmergency ? " · Emergency" : ""}\n${journalDates(state)}`;
}
export function journalElapsed(seconds: number | null) {
  if (seconds === null) return "Timing unavailable";
  return seconds < 60 ? `${seconds.toFixed(3)} seconds` : `${(seconds / 3600).toFixed(2)} calendar hours`;
}
export function buildJournalEvidence(snapshot: JournalDataset, owners: Set<string>) {
  const loaded = snapshot.journalEvents ?? [];
  const available = !!snapshot.journalStartedAt && Array.isArray(snapshot.journalEvents);
  const hasJournal =
    snapshot.journalStartedAt !== undefined ||
    snapshot.journalEvents !== undefined ||
    snapshot.journalComplete !== undefined;
  const complete =
    !hasJournal || (available && snapshot.journalComplete === true && snapshot.journalTotal === loaded.length);
  const events = loaded.filter((event) => owners.has(event.ownerKey));
  const timed = complete
    ? events.filter(
        (event) =>
          event.kind === "decision" &&
          event.submissionEventId &&
          event.cycleSubmittedAt &&
          typeof event.cycleSeconds === "number" &&
          Number.isFinite(event.cycleSeconds) &&
          event.cycleSeconds >= 0 &&
          Number.isFinite(Date.parse(event.cycleSubmittedAt)) &&
          Date.parse(event.capturedAt) >= Date.parse(event.cycleSubmittedAt),
      )
    : [];
  const seconds = timed.map((event) => event.cycleSeconds as number).sort((a, b) => a - b);
  const timedIds = new Set(timed.map((event) => event.eventId));
  let medianSeconds: number | null = null;
  if (seconds.length)
    medianSeconds =
      seconds.length % 2
        ? seconds[Math.floor(seconds.length / 2)]
        : (seconds[seconds.length / 2 - 1] + seconds[seconds.length / 2]) / 2;
  return {
    available,
    complete,
    startedAt: snapshot.journalStartedAt ?? null,
    events,
    timed,
    timedIds,
    medianSeconds,
    untimedDecisions: events.filter((event) => event.kind === "decision" && !timedIds.has(event.eventId)).length,
    definition:
      "Request-year history uses the full employee cohort, independent of activity month/status filters. Baselines only observe existing state. Server-captured submission-to-decision timing covers recorded cycles only, in calendar time; legacy decisions and missing cycles remain unavailable. Private wording, notes and signatures are excluded. Company policy history is not yet recorded.",
  };
}
