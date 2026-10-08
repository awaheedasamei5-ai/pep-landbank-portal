"use client";

import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient } from './api.client';
import { attendanceService } from './attendance.service';
import { leaveService } from './leave.service';

// A remote change must also invalidate the in-memory caches these services
// keep (attendanceService's 2-min window cache, leaveService's 2-min
// cache) -- otherwise a local write's own clearCache() call would never
// race with it, but a REMOTE write never clears it, and the UI would sit
// on stale data for up to 2 minutes even after apiClient.notify() fires.
function invalidateAndNotify() {
  attendanceService.clearCache();
  leaveService.clearCache();
  apiClient.notify();
}

// Cross-device live sync for Attendance + Leave, matching the user's own
// "like we did for V1" ask: a change on one computer must show on another
// without a manual refresh. Two things have to both be true for that --
// confirmed only the first one was (publication membership for
// attendance_log/leave_requests/etc. was already correct, item 1's own
// work); this file is the second, previously-missing half: nothing
// anywhere in src/openhr/ opened a realtime channel or even called
// apiClient.subscribe(), so apiClient.notify() (already called after every
// local write) had no listeners and no remote-change bridge at all.
//
// Retry/reconnect behavior mirrors the proven pattern already used
// elsewhere in this project (subscribeRealtimeTable in V1's index.html,
// per the "realtime channels silently fail to join with no error
// surfaced" lesson) -- recreate the channel with capped backoff on
// CHANNEL_ERROR/TIMED_OUT/CLOSED, rather than a naive one-shot subscribe()
// that can silently never actually join.
const WATCHED_TABLES = [
  'attendance_log',
  'attendance_policy',
  'leave_requests',
  'leave_type_quotas',
  'leave_staff_quota_overrides',
] as const;

const BACKOFF_CAP_MS = 15000;
let started = false;
let attempt = 0;
let channel: ReturnType<typeof supabase.channel> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function connect() {
  if (!isSupabaseConfigured()) return;
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }
  attempt += 1;
  const ch = supabase.channel(`openhr-realtime-retry${attempt}`);
  for (const table of WATCHED_TABLES) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table }, invalidateAndNotify);
  }
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      attempt = 0; // reset backoff once a join genuinely succeeds
      return;
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      const delay = Math.min(2000 * attempt, BACKOFF_CAP_MS);
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, delay);
    }
  });
  channel = ch;
}

/** Idempotent -- safe to call from every mount of OpenHrProviders. */
export function ensureOpenHrRealtimeStarted() {
  if (started) return;
  started = true;
  connect();
}

export function stopOpenHrRealtime() {
  started = false;
  if (retryTimer) clearTimeout(retryTimer);
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }
}
