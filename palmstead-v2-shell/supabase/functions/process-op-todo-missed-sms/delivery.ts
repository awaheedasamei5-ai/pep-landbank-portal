export type DeliveryOutcome = {
  status: "accepted" | "failed" | "queued" | "needs_review" | "blocked";
  providerReference: string | null;
  error: string | null;
};

export function taskDeadlineUtc(date: string, startTime: string | null, endTime: string | null): number | null {
  const time = endTime ?? startTime;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !time) return null;
  const normalizedTime = time.slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(normalizedTime)) return null;
  const value = Date.parse(`${date}T${normalizedTime}:00Z`);
  return Number.isFinite(value) ? value : null;
}

export function taskScheduledUtc(date: string, startTime: string | null): number | null {
  return taskDeadlineUtc(date, startTime, null);
}

export function missedTaskMessage(title: string, deadline: number): string {
  const label = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Accra",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(deadline));
  return `Missed Operations task: "${title.slice(0, 90)}" was due ${label} and is still open. Please update it in Palmstead.`;
}

export function dueTaskMessage(title: string, scheduledAt: number): string {
  const label = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Accra",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(scheduledAt));
  return `Reminder: "${title.slice(0, 90)}" is due now (${label}).`;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeGhanaPhone(value: string | null): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits)) return `233${digits.slice(1)}`;
  if (/^233\d{9}$/.test(digits)) return digits;
  return null;
}

export function classifyProviderResponse(httpStatus: number, body: unknown, recipient: string): DeliveryOutcome {
  const response = object(body);
  const payload = response?.data;
  const item = Array.isArray(payload)
    ? payload.map(object).find((row) => String(row?.recipient ?? "").replace(/\D/g, "") === recipient)
    : object(payload);
  const reference = item?.id ?? item?.message_id;
  const providerReference = typeof reference === "string" && reference.trim() ? reference.trim() : null;

  if (httpStatus >= 200 && httpStatus < 300 && response?.status === "success" && providerReference) {
    return { status: "accepted", providerReference, error: null };
  }
  if (httpStatus === 429 && response?.status !== "success" && !providerReference) {
    return { status: "queued", providerReference: null, error: "SMS provider rate limit reached. A retry is queued." };
  }
  if ([400, 401, 402, 403, 404, 413, 422].includes(httpStatus) && !providerReference) {
    return {
      status: "failed",
      providerReference: null,
      error: `SMS provider rejected the request (HTTP ${httpStatus}).`,
    };
  }
  return {
    status: "needs_review",
    providerReference,
    error: `SMS outcome is uncertain (HTTP ${httpStatus}). Check the provider history before retrying.`,
  };
}
