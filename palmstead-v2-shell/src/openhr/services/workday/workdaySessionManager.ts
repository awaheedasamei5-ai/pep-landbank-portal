/**
 * Workday Session Manager — client-side attendance session lifecycle.
 *
 * FROZEN MODULE — see Others/CLAUDE.md "Frozen Modules — Change-Control".
 *
 * Responsibilities:
 *   - Given an employee id, fetch their open sessions.
 *   - For any session BEFORE today with no check_out, close it as a
 *     client-side fallback with a clear "Auto-closed by system" remark.
 *     Uses the employee's shift autoSessionCloseTime, falling back to the
 *     org app-config, then to "23:59".
 *   - Return the current day's active session only (same behavior as before).
 *
 * Why client-side fallback:
 *   The server cron (cron.pb.js#auto_close_sessions) is authoritative. If it
 *   runs, this module finds nothing to close and is a no-op. If the cron is
 *   not deployed or has been disabled (which has happened historically), the
 *   client-side fallback ensures a forgotten check-out is still closed the
 *   next time the employee opens the app — instead of showing as "active"
 *   for days.
 *
 * Design invariants (do not break):
 *   - NEVER mutate today's session from here. Same-day max-time close is
 *     owned by the server cron, and client-side closure would race it.
 *   - Only close sessions older than the current local date (YYYY-MM-DD).
 *   - Always append a distinct remark so audit trails can distinguish a
 *     client fallback from a server cron close or a manual user close.
 */

import { Attendance } from '../../types';
import { supabase, isSupabaseConfigured } from '../supabase';
import { apiClient } from '../api.client';
import { calculatePunctuality } from '../../utils/attendanceUtils';
import { ReconcileResult } from './workdaySessionManager.types';

const CLIENT_CLOSE_REMARK = ' [System: Auto-closed — no check-out recorded]';
// Palmstead's real attendance_policy (see getActivePolicy below) has no
// per-shift/auto-close-time concept -- item 1's own build is single-policy,
// not per-shift (confirmed live) -- so this is the one real fallback, not a
// layered shift > org-config > hardcoded chain OpenHRApp's own multi-tenant
// model supports and Palmstead's schema doesn't.
const FALLBACK_CLOSE_TIME = '23:59';

function isoToHHMM(val: string | null | undefined): string {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Internal mapper against Palmstead's real attendance_log table (not
 * OpenHRApp's own `attendance` table, which doesn't exist here) -- kept
 * local on purpose so this module owns its contract. status is DERIVED
 * (attendance_log stores no status column), via the real attendance_policy
 * row, same calculatePunctuality logic item 1's own web-next build used.
 */
function mapAttendance(r: any, policy: { work_start_time: string; grace_minutes: number } | null): Attendance {
  const checkIn = isoToHHMM(r.sign_in_at);
  const checkOut = isoToHHMM(r.sign_out_at);
  let status: Attendance['status'] = 'PRESENT';
  if (!r.sign_in_at) status = 'ABSENT';
  else if (policy) status = calculatePunctuality(checkIn, policy.work_start_time, policy.grace_minutes);
  return {
    id: r.id.toString().trim(),
    employeeId: r.staff_key ? r.staff_key.toString().trim() : '',
    employeeName: r.staff_name,
    date: r.work_date,
    checkIn,
    checkOut,
    status,
    location: {
      lat: Number(r.sign_in_lat) || 0,
      lng: Number(r.sign_in_lng) || 0,
      address: r.is_off_site_in ? 'Off-site' : 'On-site',
    },
    // attendance_log.sign_in_photo stores a base64 data URL directly
    // (confirmed live) -- no separate private storage bucket/signed-URL
    // step needed, unlike OpenHRApp's own `selfies` bucket convention.
    selfie: r.sign_in_photo || undefined,
    remarks: r.notes || '',
    dutyType: 'OFFICE',
    organizationId: undefined,
  };
}

async function getActivePolicy(): Promise<{ work_start_time: string; grace_minutes: number } | null> {
  try {
    const { data } = await supabase
      .from('attendance_policy')
      .select('work_start_time, grace_minutes')
      .eq('is_active', true)
      .order('effective_from', { ascending: false })
      .limit(1)
      .single();
    return data ?? null;
  } catch {
    return null;
  }
}

function todayYMD(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Resolve the auto-close time this session should be stamped with. Palmstead's
 * real attendance_policy has one active row, no per-employee/per-shift
 * variation, so there is nothing to resolve beyond that single fallback.
 */
async function resolveCloseTime(): Promise<string> {
  return FALLBACK_CLOSE_TIME;
}

export const workdaySessionManager = {
  /**
   * Return today's active session and close any past-date open sessions.
   * This is the public API the attendance service delegates to.
   */
  async reconcileOpenSessions(employeeId: string): Promise<ReconcileResult> {
    const empty: ReconcileResult = { active: undefined, closedPast: [] };
    if (!isSupabaseConfigured()) return empty;

    const today = todayYMD();
    const policy = await getActivePolicy();

    let openRecords: any[];
    try {
      const { data, error } = await supabase
        .from('attendance_log')
        .select('*')
        .eq('staff_key', employeeId.trim())
        .is('sign_out_at', null)
        .not('sign_in_at', 'is', null)
        .limit(50);
      if (error) throw error;
      openRecords = data ?? [];
    } catch (e: any) {
      console.error('[WorkdaySessionManager] Failed to fetch open sessions:', e?.message || e);
      return empty;
    }

    let active: Attendance | undefined;
    const closedPast: Attendance[] = [];

    for (const rec of openRecords) {
      const date = rec.work_date as string;
      if (date === today) {
        // Today's open session → return as active, never close here.
        active = mapAttendance(rec, policy);
        continue;
      }
      if (date > today) {
        // Future-dated open record (unexpected). Leave it alone and log.
        console.warn('[WorkdaySessionManager] Future-dated open session ignored:', rec.id);
        continue;
      }

      // Past-date open session → close it as a client-side fallback.
      try {
        const closeTime = await resolveCloseTime();
        // sign_out_at is timestamptz — combine the row's date with
        // HH:mm[:ss] to a full ISO timestamp or Postgres rejects the update.
        const parts = String(closeTime).split(':');
        const h = (parts[0] || '0').padStart(2, '0');
        const m = (parts[1] || '0').padStart(2, '0');
        const s = (parts[2] || '00').padStart(2, '0');
        const local = new Date(`${date}T${h}:${m}:${s}`);
        if (isNaN(local.getTime())) {
          throw new Error(`Invalid close time computed: date=${date} closeTime=${closeTime}`);
        }
        const closeIso = local.toISOString();
        const existingNotes = (rec.notes as string) || '';
        const { data: updated, error: closeErr } = await supabase
          .from('attendance_log')
          .update({ sign_out_at: closeIso, notes: existingNotes + CLIENT_CLOSE_REMARK })
          .eq('id', rec.id)
          .select()
          .single();
        if (closeErr) throw closeErr;
        closedPast.push(mapAttendance(updated, policy));
        console.log(
          `[WorkdaySessionManager] Client-closed past session ${rec.id} (date: ${date}, close: ${closeTime})`
        );
      } catch (e: any) {
        // Do not abort on one failure — continue reconciling the rest.
        console.error(
          `[WorkdaySessionManager] Failed to close past session ${rec.id}:`,
          e?.message || e
        );
      }
    }

    if (closedPast.length > 0) {
      // Invalidate any consumer caches and notify subscribers so the UI
      // refreshes lists/dashboards.
      apiClient.notify();
    }

    // No signed-URL step needed: attendance_log.sign_in_photo already holds
    // a direct base64 data URL (confirmed live), not a private-bucket path.
    return { active, closedPast };
  },
};
