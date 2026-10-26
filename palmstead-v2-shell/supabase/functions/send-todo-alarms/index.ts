import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import webpush from "npm:web-push@3.6.7";

type PushEvent = {
  id: string;
  todo_id: string;
  event_kind: "due" | "missed";
  task_signature: string;
  recipient_key: string;
  task_title: string;
  scheduled_for: string;
  advance_minutes: number;
  attempt_count: number;
};

type MeetingPushEvent = {
  id: string;
  meeting_id: string;
  event_kind: "meeting_reminder";
  meeting_signature: string;
  recipient_key: string;
  meeting_title: string;
  meeting_date: string;
  meeting_start_time: string;
  meeting_end_time: string | null;
  meeting_location: string | null;
  scheduled_for: string;
  attempt_count: number;
};

type Todo = {
  id: string;
  title: string;
  status: string;
  assigned_to: string;
  item_date: string;
  start_time: string | null;
  end_time: string | null;
};

function localDateParts(date: Date) {
  const values = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Accra",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => values.find((item) => item.type === type)?.value ?? "00";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}:00`,
  };
}

function addLocalMinutes(date: string, time: string, minutes: number) {
  // Ghana does not observe daylight saving time. The explicit Africa/Accra
  // source fields therefore map to UTC while still documenting their meaning.
  return Date.parse(`${date}T${time.slice(0, 8)}Z`) + minutes * 60_000;
}

function exactSchedule(todo: Todo, event: PushEvent, graceMinutes: number) {
  if (
    todo.status !== "open" ||
    todo.assigned_to !== event.recipient_key ||
    todo.title.slice(0, 160) !== event.task_title
  ) {
    return false;
  }
  if (!todo.start_time) return false;
  const due = addLocalMinutes(todo.item_date, todo.start_time, 0);
  const deadline = addLocalMinutes(todo.item_date, todo.end_time ?? todo.start_time, 0);
  const scheduled = Date.parse(event.scheduled_for);
  if (event.event_kind === "due") {
    const advance = Number(event.advance_minutes);
    const earliest = due - advance * 60_000;
    return (
      [0, 15, 60, 1440].includes(advance) &&
      Number.isFinite(earliest) &&
      Number.isFinite(scheduled) &&
      scheduled >= earliest &&
      scheduled <= due
    );
  }
  const expected = deadline + graceMinutes * 60_000;
  return Number.isFinite(expected) && expected === scheduled;
}

async function deliverOutbox(
  sb: ReturnType<typeof createClient>,
  vapidPublic: string | undefined,
  vapidPrivate: string | undefined,
) {
  const { data, error } = await sb.rpc("claim_op_todo_push_outbox", { p_limit: 30 });
  if (error) throw error;

  const events = (data ?? []) as PushEvent[];
  if (!events.length) return { claimed: 0, accepted: 0, retried: 0, blocked: 0 };

  const { data: settings, error: settingsError } = await sb
    .from("op_todo_reminder_settings")
    .select("missed_grace_minutes")
    .eq("singleton", true)
    .maybeSingle();
  if (settingsError || !settings) throw new Error("Operations reminder policy could not be loaded.");
  const graceMinutes = Math.max(0, Math.min(1440, Number(settings.missed_grace_minutes) || 30));

  let accepted = 0;
  let retried = 0;
  let blocked = 0;
  if (vapidPublic && vapidPrivate) webpush.setVapidDetails("mailto:support@palmstead.app", vapidPublic, vapidPrivate);

  for (const event of events) {
    const finish = async (outcome: string, acceptedDevices = 0, errorCode: string | null = null) => {
      const { error: persistError } = await sb.rpc("finish_op_todo_push_delivery", {
        p_id: event.id,
        p_attempt_count: event.attempt_count,
        p_outcome: outcome,
        p_accepted_devices: acceptedDevices,
        p_error_code: errorCode,
      });
      return !persistError;
    };

    if (!vapidPublic || !vapidPrivate) {
      if (await finish("blocked", 0, "vapid_not_configured")) blocked += 1;
      continue;
    }

    const { data: todo, error: todoError } = await sb
      .from("op_todos")
      .select("id,title,status,assigned_to,item_date,start_time,end_time")
      .eq("id", event.todo_id)
      .maybeSingle();
    if (todoError) {
      if (await finish("retry", 0, "task_recheck_failed")) retried += 1;
      continue;
    }
    if (!todo || !exactSchedule(todo as Todo, event, graceMinutes)) {
      await finish("cancelled", 0, "task_changed_or_closed");
      continue;
    }

    const { data: subscriptions, error: subscriptionsError } = await sb
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("owner_kind", "staff")
      .eq("owner_id", event.recipient_key);
    if (subscriptionsError) {
      if (await finish("retry", 0, "device_lookup_failed")) retried += 1;
      continue;
    }
    if (!subscriptions?.length) {
      if (await finish("unsubscribed", 0, "no_opted_in_device")) blocked += 1;
      continue;
    }

    let notificationTitle = "Task still open";
    if (event.event_kind === "due") {
      notificationTitle = Date.now() < addLocalMinutes(todo.item_date, todo.start_time as string, 0)
        ? "Task coming up"
        : "Task due now";
    }
    const notification = JSON.stringify({
      title: notificationTitle,
      body: event.event_kind === "due" ? todo.title : `“${todo.title}” is still open after its scheduled finish.`,
      icon: "/icon-512.png",
      badge: "/favicon-32.png",
      tag: `operations-task-${event.id}`,
      url: "/dashboard/operations",
    });
    const staleIds: string[] = [];
    let acceptedDevices = 0;
    let transientFailure = false;

    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          notification,
          { TTL: 3600 },
        );
        acceptedDevices += 1;
      } catch (error) {
        const status = Number((error as { statusCode?: number })?.statusCode ?? 0);
        if (status === 404 || status === 410) staleIds.push(subscription.id);
        else transientFailure = true;
      }
    }

    if (staleIds.length) await sb.from("push_subscriptions").delete().in("id", staleIds);
    if (acceptedDevices > 0) {
      if (await finish("sent", acceptedDevices)) accepted += 1;
    } else if (transientFailure) {
      if (await finish("retry", 0, "push_provider_unavailable")) retried += 1;
    } else if (await finish("unsubscribed", 0, "no_active_device")) {
      blocked += 1;
    }
  }

  return { claimed: events.length, accepted, retried, blocked };
}

function exactMeetingSchedule(
  meeting: {
    title: string;
    status: string;
    item_date: string | null;
    start_time: string | null;
    end_time: string | null;
    meeting_location: string | null;
  },
  event: MeetingPushEvent,
  now: number,
) {
  if (
    meeting.status !== "open" ||
    meeting.title.slice(0, 160) !== event.meeting_title ||
    meeting.item_date !== event.meeting_date ||
    meeting.start_time !== event.meeting_start_time ||
    (meeting.end_time ?? null) !== (event.meeting_end_time ?? null) ||
    (meeting.meeting_location ?? null) !== (event.meeting_location ?? null)
  ) {
    return false;
  }
  const start = addLocalMinutes(event.meeting_date, event.meeting_start_time, 0);
  const reminder = Date.parse(event.scheduled_for);
  return (
    Number.isFinite(start) &&
    Number.isFinite(reminder) &&
    now < start &&
    reminder >= start - 15 * 60_000 &&
    reminder <= start
  );
}

async function deliverMeetingOutbox(
  sb: ReturnType<typeof createClient>,
  vapidPublic: string | undefined,
  vapidPrivate: string | undefined,
) {
  const { data, error } = await sb.rpc("claim_op_meeting_push_outbox", { p_limit: 30 });
  if (error) throw error;

  const events = (data ?? []) as MeetingPushEvent[];
  if (!events.length) return { claimed: 0, accepted: 0, retried: 0, blocked: 0 };
  if (vapidPublic && vapidPrivate) webpush.setVapidDetails("mailto:support@palmstead.app", vapidPublic, vapidPrivate);

  let accepted = 0;
  let retried = 0;
  let blocked = 0;
  for (const event of events) {
    const finish = async (outcome: string, acceptedDevices = 0, errorCode: string | null = null) => {
      const { error: persistError } = await sb.rpc("finish_op_meeting_push_delivery", {
        p_id: event.id,
        p_attempt_count: event.attempt_count,
        p_outcome: outcome,
        p_accepted_devices: acceptedDevices,
        p_error_code: errorCode,
      });
      return !persistError;
    };

    if (!vapidPublic || !vapidPrivate) {
      if (await finish("blocked", 0, "vapid_not_configured")) blocked += 1;
      continue;
    }

    const { data: meeting, error: meetingError } = await sb
      .from("schedule_items")
      .select("id,title,status,item_date,start_time,end_time,meeting_location")
      .eq("id", event.meeting_id)
      .eq("kind", "meeting")
      .maybeSingle();
    if (meetingError) {
      if (await finish("retry", 0, "meeting_recheck_failed")) retried += 1;
      continue;
    }
    if (!meeting || !exactMeetingSchedule(meeting, event, Date.now())) {
      await finish("cancelled", 0, "meeting_changed_or_started");
      continue;
    }

    const { data: invitee, error: inviteeError } = await sb
      .from("schedule_item_invitees")
      .select("status")
      .eq("schedule_item_id", event.meeting_id)
      .eq("staff_key", event.recipient_key)
      .maybeSingle();
    if (inviteeError) {
      if (await finish("retry", 0, "invitee_recheck_failed")) retried += 1;
      continue;
    }
    if (!invitee || !["invited", "accepted"].includes(invitee.status)) {
      await finish("cancelled", 0, "invitation_withdrawn");
      continue;
    }

    const { data: subscriptions, error: subscriptionsError } = await sb
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("owner_kind", "staff")
      .eq("owner_id", event.recipient_key);
    if (subscriptionsError) {
      if (await finish("retry", 0, "device_lookup_failed")) retried += 1;
      continue;
    }
    if (!subscriptions?.length) {
      if (await finish("unsubscribed", 0, "no_opted_in_device")) blocked += 1;
      continue;
    }

    const time = event.meeting_start_time.slice(0, 5);
    const place = event.meeting_location ? ` · ${event.meeting_location}` : "";
    const notification = JSON.stringify({
      title: "Meeting starts soon",
      body: `${event.meeting_title} · ${time}${place}`,
      icon: "/icon-512.png",
      badge: "/favicon-32.png",
      tag: `operations-meeting-${event.meeting_id}-${event.recipient_key}`,
      url: "/dashboard/operations?view=schedule",
    });
    const staleIds: string[] = [];
    let acceptedDevices = 0;
    let transientFailure = false;
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          notification,
          { TTL: 3600 },
        );
        acceptedDevices += 1;
      } catch (error) {
        const status = Number((error as { statusCode?: number })?.statusCode ?? 0);
        if (status === 404 || status === 410) staleIds.push(subscription.id);
        else transientFailure = true;
      }
    }
    if (staleIds.length) await sb.from("push_subscriptions").delete().in("id", staleIds);
    if (acceptedDevices > 0) {
      if (await finish("sent", acceptedDevices)) accepted += 1;
    } else if (transientFailure) {
      if (await finish("retry", 0, "push_provider_unavailable")) retried += 1;
    } else if (await finish("unsubscribed", 0, "no_active_device")) {
      blocked += 1;
    }
  }

  return { claimed: events.length, accepted, retried, blocked };
}

async function deliverLegacyScheduleItems(
  sb: ReturnType<typeof createClient>,
  vapidPublic?: string,
  vapidPrivate?: string,
) {
  if (!vapidPublic || !vapidPrivate) return { checked: 0, accepted: 0 };
  webpush.setVapidDetails("mailto:support@palmstead.app", vapidPublic, vapidPrivate);
  const now = new Date();
  const localNow = localDateParts(now);
  const localEarliest = localDateParts(new Date(now.getTime() - 3 * 60 * 60 * 1000));
  const { data: dueToday, error: todayError } = await sb
    .from("schedule_items")
    .select("id,title,assigned_to,owner_key,start_time")
    .eq("kind", "todo")
    .eq("status", "open")
    .is("push_notified_at", null)
    .eq("item_date", localNow.date)
    .lte("start_time", localNow.time)
    .gte("start_time", localEarliest.date === localNow.date ? localEarliest.time : "00:00:00");
  if (todayError) throw todayError;

  let due = dueToday ?? [];
  if (localEarliest.date !== localNow.date) {
    const { data: dueYesterday, error: yesterdayError } = await sb
      .from("schedule_items")
      .select("id,title,assigned_to,owner_key,start_time")
      .eq("kind", "todo")
      .eq("status", "open")
      .is("push_notified_at", null)
      .eq("item_date", localEarliest.date)
      .gte("start_time", localEarliest.time);
    if (yesterdayError) throw yesterdayError;
    due = [...due, ...(dueYesterday ?? [])];
  }

  let accepted = 0;
  for (const task of due) {
    const ownerId = task.assigned_to || task.owner_key;
    if (!ownerId) continue;
    const { data: subscriptions } = await sb
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("owner_kind", "staff")
      .eq("owner_id", ownerId);
    let taskAccepted = false;
    const staleIds: string[] = [];
    for (const sub of subscriptions ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: `⏰ ${task.title}`,
            body: "Your scheduled task is starting now.",
            url: "/dashboard/operations",
          }),
          { TTL: 3600 },
        );
        taskAccepted = true;
        accepted += 1;
      } catch (error) {
        const status = Number((error as { statusCode?: number })?.statusCode ?? 0);
        if (status === 404 || status === 410) staleIds.push(sub.id);
      }
    }
    if (staleIds.length) await sb.from("push_subscriptions").delete().in("id", staleIds);
    if (taskAccepted) await sb.from("schedule_items").update({ push_notified_at: now.toISOString() }).eq("id", task.id);
  }
  return { checked: due.length, accepted };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceRoleKey)
    return Response.json({ error: "Worker configuration is unavailable" }, { status: 503 });

  try {
    const sb = createClient(projectUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const workerToken = request.headers.get("x-operations-push-token");
    const { data: authorized, error: authorizationError } = await sb.rpc("verify_op_todo_push_worker_token", {
      p_token: workerToken,
    });
    if (authorizationError || authorized !== true) {
      return Response.json({ error: "Not authorized" }, { status: 401 });
    }

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const [outbox, meetings, legacy] = await Promise.all([
      deliverOutbox(sb, vapidPublic, vapidPrivate),
      deliverMeetingOutbox(sb, vapidPublic, vapidPrivate),
      deliverLegacyScheduleItems(sb, vapidPublic, vapidPrivate),
    ]);
    return Response.json({ ok: true, outbox, meetings, legacy });
  } catch {
    return Response.json({ error: "Push reminder worker could not complete its scheduled run." }, { status: 500 });
  }
});

