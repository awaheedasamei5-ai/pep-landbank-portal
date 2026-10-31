import {
  classifyProviderResponse,
  type DeliveryOutcome,
  dueTaskMessage,
  missedTaskMessage,
  normalizeGhanaPhone,
  taskDeadlineUtc,
  taskScheduledUtc,
} from "./delivery.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

type OutboxRow = {
  id: string;
  todo_id: string;
  recipient_key: string;
  message_body: string;
  attempt_count: number;
  scheduled_for: string;
  event_kind: "due" | "missed";
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  const workerToken = request.headers.get("x-internal-secret");
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!workerToken || !projectUrl || !serviceRoleKey) {
    return Response.json({ error: "Worker authorization is unavailable" }, { status: 401 });
  }

  const supabase = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: validToken, error: tokenError } = await supabase.rpc("verify_op_todo_sms_worker_token", {
    p_token: workerToken,
  });
  if (tokenError || validToken !== true) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: settings, error: settingsError } = await supabase
    .from("op_todo_reminder_settings")
    .select("missed_grace_minutes")
    .eq("singleton", true)
    .maybeSingle();
  if (settingsError || !settings)
    return Response.json({ error: "Reminder policy could not be loaded" }, { status: 503 });
  const missedGraceMinutes = settings.missed_grace_minutes;

  const apiKey = Deno.env.get("ARKESEL_API_KEY");
  const { data, error } = await supabase.rpc("claim_op_todo_sms_outbox", { p_limit: 10 });
  if (error) return Response.json({ error: "Could not claim queued messages" }, { status: 500 });

  const rows = (data ?? []) as OutboxRow[];
  let accepted = 0;
  let failed = 0;
  let needsReview = 0;
  let retryQueued = 0;
  let deferredUntilTaskEnd = 0;
  let persistenceErrors = 0;

  for (const row of rows) {
    // Recheck the task and the current profile number immediately before
    // delivery so a completion, reassignment, or phone change cancels stale SMS.
    const [{ data: todo, error: todoError }, { data: profile, error: profileError }] = await Promise.all([
      supabase
        .from("op_todos")
        .select("id,title,status,assigned_to,sms_notified_at,sms_missed_notified_at,item_date,start_time,end_time")
        .eq("id", row.todo_id)
        .maybeSingle(),
      supabase.from("profiles").select("phone,active").eq("agent_key", row.recipient_key).maybeSingle(),
    ]);

    let outcome: DeliveryOutcome;
    let phone: string | null = null;
    let renderedMessage = row.message_body;
    let providerStatus: Record<string, unknown> | null = null;
    if (todoError || profileError) {
      outcome = {
        status: "needs_review",
        providerReference: null,
        error: "Task or staff delivery details could not be rechecked.",
      };
    } else if (
      todo?.status !== "open" ||
      todo.assigned_to !== row.recipient_key ||
      (row.event_kind === "missed" ? todo.sms_missed_notified_at : todo.sms_notified_at) ||
      taskScheduledUtc(todo.item_date, todo.start_time) !== Date.parse(row.scheduled_for)
    ) {
      const { error: cancelError } = await supabase
        .from("op_todo_sms_outbox")
        .update({
          status: "cancelled",
          lease_until: null,
          last_error: "Task was completed, reassigned, or no longer needs a reminder.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("status", "sending")
        .eq("attempt_count", row.attempt_count);
      if (cancelError) persistenceErrors += 1;
      continue;
    } else {
      const deadline = taskDeadlineUtc(todo.item_date, todo.start_time, todo.end_time);
      const scheduledAt = taskScheduledUtc(todo.item_date, todo.start_time);
      if (deadline === null || scheduledAt === null) {
        const { error: cancelError } = await supabase
          .from("op_todo_sms_outbox")
          .update({ status: "cancelled", lease_until: null, last_error: "Task no longer has a timed deadline." })
          .eq("id", row.id)
          .eq("status", "sending")
          .eq("attempt_count", row.attempt_count);
        if (cancelError) persistenceErrors += 1;
        continue;
      }
      const messageBody =
        row.event_kind === "due" ? dueTaskMessage(todo.title, scheduledAt) : missedTaskMessage(todo.title, deadline);
      renderedMessage = messageBody;
      const deliverAfter = row.event_kind === "due" ? scheduledAt : deadline + missedGraceMinutes * 60_000;
      if (Date.now() < deliverAfter) {
        const { error: deferError } = await supabase
          .from("op_todo_sms_outbox")
          .update({
            status: "queued",
            attempt_count: Math.max(0, row.attempt_count - 1),
            next_attempt_at: new Date(deliverAfter).toISOString(),
            lease_until: null,
            message_body: messageBody,
            last_error: null,
          })
          .eq("id", row.id)
          .eq("status", "sending")
          .eq("attempt_count", row.attempt_count);
        if (deferError) persistenceErrors += 1;
        else deferredUntilTaskEnd += 1;
        continue;
      }
      phone = profile?.active === true ? normalizeGhanaPhone(profile.phone) : null;
      if (!apiKey) {
        outcome = { status: "failed", providerReference: null, error: "SMS provider is not configured on the server." };
      } else if (!profile?.active) {
        outcome = {
          status: "blocked",
          providerReference: null,
          error: "The assigned staff account is inactive or unavailable.",
        };
      } else if (!phone) {
        outcome = {
          status: "blocked",
          providerReference: null,
          error: "The assigned staff member has no valid Ghana mobile number on file.",
        };
      } else {
        try {
          const response = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
            method: "POST",
            headers: { "api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({ sender: "Palmstead", message: messageBody, recipients: [phone] }),
            signal: AbortSignal.timeout(12_000),
          });
          const body: unknown = await response.json().catch(() => null);
          providerStatus = { httpStatus: response.status };
          outcome = classifyProviderResponse(response.status, body, phone);
        } catch {
          // A timeout may occur after provider acceptance; do not retry and risk
          // sending a duplicate real SMS without provider confirmation.
          outcome = {
            status: "needs_review",
            providerReference: null,
            error: "SMS outcome is uncertain. Check the provider history before retrying.",
          };
        }
      }
    }

    if (outcome.status === "queued" && row.attempt_count >= 5) {
      outcome = {
        status: "failed",
        providerReference: null,
        error: "SMS provider rate limit persisted after five attempts.",
      };
    }
    const backoffSeconds = Math.min(2 ** row.attempt_count * 60, 21_600);
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("op_todo_sms_outbox")
      .update({
        status: outcome.status,
        next_attempt_at: new Date(Date.now() + backoffSeconds * 1000).toISOString(),
        provider_accepted_at: outcome.status === "accepted" ? now : null,
        lease_until: null,
        provider_reference: outcome.providerReference,
        last_error: outcome.error,
        provider_status: providerStatus,
        message_body: renderedMessage,
        updated_at: now,
      })
      .eq("id", row.id)
      .eq("status", "sending")
      .eq("attempt_count", row.attempt_count);
    if (updateError) {
      persistenceErrors += 1;
      continue;
    }

    if (outcome.status === "accepted") {
      const { error: todoUpdateError } = await supabase
        .from("op_todos")
        .update(row.event_kind === "due" ? { sms_notified_at: now } : { sms_missed_notified_at: now })
        .eq("id", row.todo_id)
        .eq("status", "open")
        .eq("assigned_to", row.recipient_key)
        .is(row.event_kind === "due" ? "sms_notified_at" : "sms_missed_notified_at", null);
      if (todoUpdateError) persistenceErrors += 1;
      accepted += 1;
    } else if (outcome.status === "needs_review") needsReview += 1;
    else if (outcome.status === "queued") retryQueued += 1;
    else failed += 1;
  }

  return Response.json(
    {
      claimed: rows.length,
      providerAccepted: accepted,
      failed,
      needsReview,
      retryQueued,
      deferredUntilTaskEnd,
      persistenceErrors,
    },
    { status: persistenceErrors ? 503 : 200 },
  );
});
