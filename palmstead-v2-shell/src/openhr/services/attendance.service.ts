
import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient, dedupe } from './api.client';
import { Attendance } from '../types';
import { calculatePunctuality } from '../utils/attendanceUtils';
import { workdaySessionManager } from './workday/workdaySessionManager';
import { ReconcileResult } from './workday/workdaySessionManager.types';
import { checkInSyncQueue, classifySyncError } from './attendance/syncQueue';
import { CheckInSyncEntry } from './attendance/syncQueue.types';

// Cache keyed by query window: "sinceDate|untilDate|employeeId"
const attCache = new Map<string, { data: Attendance[]; ts: number }>();
const ATT_CACHE_TTL = 2 * 60 * 1000;

const DEFAULT_DAYS = 30;
const daysAgoISO = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
};

export interface GetAttendanceOptions {
  since?: string;
  until?: string;
  employeeId?: string;
  maxRows?: number;
  skipSelfieUrls?: boolean;
}

let policyCache: { work_start_time: string; grace_minutes: number } | null | undefined;
async function getActivePolicy() {
  if (policyCache !== undefined) return policyCache;
  try {
    const { data } = await supabase
      .from('attendance_policy')
      .select('work_start_time, grace_minutes')
      .eq('is_active', true)
      .order('effective_from', { ascending: false })
      .limit(1)
      .single();
    policyCache = data ?? null;
  } catch {
    policyCache = null;
  }
  return policyCache;
}

// Combine YYYY-MM-DD date + HH:mm[:ss] time into an ISO timestamp for the
// real timestamptz columns (sign_in_at/sign_out_at). If value already looks
// like an ISO timestamp, pass through.
function hhmmToISO(hhmm: string | undefined, dateYMD?: string): string | null {
  if (!hhmm || hhmm === '-' || String(hhmm).trim() === '') return null;
  if (/T\d{2}:\d{2}/.test(hhmm)) return hhmm; // already ISO
  const date = dateYMD || new Date().toISOString().split('T')[0];
  const parts = String(hhmm).split(':');
  if (parts.length < 2) return null;
  const h = parts[0].padStart(2, '0');
  const m = parts[1].padStart(2, '0');
  const s = (parts[2] || '00').padStart(2, '0');
  const iso = new Date(`${date}T${h}:${m}:${s}`);
  return isNaN(iso.getTime()) ? null : iso.toISOString();
}

function isoToHHMM(val: string | null | undefined): string {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Real attendance_log has no duty_type column -- OpenHRApp's own
// useAttendance.ts already encodes it into the remarks string itself
// (`[FACTORY] ${remarks}` on submit), so it round-trips through `notes`
// without needing a schema column.
const PAYLOAD = {
  toRow(data: Attendance) {
    return {
      staff_key: data.employeeId.trim(),
      staff_name: data.employeeName,
      work_date: data.date,
      sign_in_at: hhmmToISO(data.checkIn, data.date),
      sign_in_lat: data.location?.lat ?? null,
      sign_in_lng: data.location?.lng ?? null,
      sign_in_photo: data.selfie || null,
      is_off_site_in: false,
      notes: data.remarks || '',
    };
  },
};

const mapAttendance = (r: any, policy: { work_start_time: string; grace_minutes: number } | null): Attendance => {
  const checkIn = isoToHHMM(r.sign_in_at);
  const checkOut = isoToHHMM(r.sign_out_at);
  let status: Attendance['status'] = 'PRESENT';
  if (!r.sign_in_at) status = 'ABSENT';
  else if (policy) status = calculatePunctuality(checkIn, policy.work_start_time, policy.grace_minutes);
  return {
    id: r.id,
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
    selfie: r.sign_in_photo || undefined,
    remarks: r.notes || '',
    dutyType: 'OFFICE',
    organizationId: undefined,
  };
};

export const attendanceService = {
  clearCache() {
    attCache.clear();
  },

  async getAttendance(options: GetAttendanceOptions = {}): Promise<Attendance[]> {
    const since = options.since !== undefined ? options.since : daysAgoISO(DEFAULT_DAYS);
    const until = options.until || '';
    const employeeId = options.employeeId || '';
    const maxRows = options.maxRows || 2000;
    const cacheKey = `${since}|${until}|${employeeId}`;

    const cached = attCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < ATT_CACHE_TTL) return cached.data;

    return dedupe(`attendance:${cacheKey}`, async () => {
      if (!isSupabaseConfigured()) {
        console.warn('[AttendanceService] Supabase not configured');
        return [];
      }
      try {
        const policy = await getActivePolicy();

        // Paginate through Supabase (capped at 1000 rows per request).
        // RLS (al_sel_own_or_mgr) already scopes rows to own-or-managed --
        // no client-side org/role filtering needed, unlike OpenHRApp's own
        // multi-tenant model.
        const PAGE_SIZE = 1000;
        const allData: any[] = [];
        let offset = 0;
        while (offset < maxRows) {
          let query = supabase
            .from('attendance_log')
            .select('*')
            .order('work_date', { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);

          if (since)      query = query.gte('work_date', since);
          if (until)      query = query.lte('work_date', until);
          if (employeeId) query = query.eq('staff_key', employeeId);

          const { data, error } = await query;
          if (error) throw error;
          if (!data || data.length === 0) break;
          allData.push(...data);
          offset += PAGE_SIZE;
          if (data.length < PAGE_SIZE) break; // last page
        }

        const result = allData.map((r) => mapAttendance(r, policy));
        attCache.set(cacheKey, { data: result, ts: Date.now() });
        return result;
      } catch (e: any) {
        console.error('[AttendanceService] Failed to fetch attendance:', e?.message || e);
        return [];
      }
    });
  },

  // FROZEN: delegates to workdaySessionManager.
  // Do not change this delegation without the plan-approval gate in CLAUDE.md.
  async getActiveAttendance(employeeId: string): Promise<Attendance | undefined> {
    const { active } = await workdaySessionManager.reconcileOpenSessions(employeeId);
    return active;
  },

  async getActiveAttendanceWithReconciliation(employeeId: string): Promise<ReconcileResult> {
    return workdaySessionManager.reconcileOpenSessions(employeeId);
  },

  async saveAttendance(data: Attendance) {
    if (!isSupabaseConfigured()) return;

    // Manual admin "mark absent" entry (AttendanceLogs.tsx) submits
    // checkIn/checkOut:'-' with no selfie/location -- a row with no
    // sign_in_at reads back as ABSENT (see mapAttendance).
    const isManualAbsent = data.status === 'ABSENT' && (!data.checkIn || data.checkIn === '-');
    const payload = isManualAbsent
      ? {
          staff_key: data.employeeId.trim(),
          staff_name: data.employeeName,
          work_date: data.date,
          sign_in_at: null,
          sign_in_lat: null,
          sign_in_lng: null,
          sign_in_photo: null,
          is_off_site_in: false,
          notes: data.remarks || '',
        }
      : PAYLOAD.toRow(data);

    try {
      const { error } = await supabase.from('attendance_log').insert(payload);
      if (error) throw error;
    } catch (err: any) {
      const syncErr = classifySyncError(err);
      try {
        checkInSyncQueue.enqueue({
          kind: 'CHECK_IN',
          payload: data,
          occurredAt: Date.now(),
        });
        console.warn('[AttendanceService] Check-in enqueued for later sync:', syncErr.code);
      } catch (enqueueErr) {
        console.error('[AttendanceService] Could not enqueue check-in:', enqueueErr);
      }
      throw err;
    }
    attendanceService.clearCache();
    apiClient.notify();
  },

  async drainCheckInQueue(): Promise<void> {
    if (!isSupabaseConfigured()) return;
    const MAX_DRAIN_PER_TICK = 10;
    let drained = 0;

    while (drained < MAX_DRAIN_PER_TICK) {
      const entry: CheckInSyncEntry | null = checkInSyncQueue.pickNext();
      if (!entry) break;

      try {
        const row = PAYLOAD.toRow(entry.payload as Attendance);
        const { error } = await supabase.from('attendance_log').insert(row);
        if (error) throw error;
        checkInSyncQueue.markSuccess(entry.id);
        drained += 1;
      } catch (err: any) {
        const syncErr = classifySyncError(err);
        checkInSyncQueue.markFailure(entry.id, syncErr);
        break;
      }
    }

    if (drained > 0) {
      attendanceService.clearCache();
      apiClient.notify();
    }
  },

  // No-op: selfies are written inline as a base64 column (sign_in_photo),
  // not uploaded to a separate storage bucket, so there is nothing to
  // retry. Kept as a real export since hrService/useAttendance.ts call it.
  async retryPendingSelfies(): Promise<void> {},

  async updateAttendance(id: string, data: Partial<Attendance>) {
    if (!isSupabaseConfigured()) return;
    // Resolve target date for time→timestamp conversion: explicit data.date, then existing row.
    let targetDate = data.date;
    if (!targetDate && (data.checkIn || data.checkOut)) {
      const { data: existing } = await supabase
        .from('attendance_log')
        .select('work_date')
        .eq('id', id.trim())
        .single();
      targetDate = existing?.work_date;
    }
    const updates: any = {};
    if (data.date)     updates.work_date = data.date;
    if (data.checkIn)  updates.sign_in_at = hhmmToISO(data.checkIn, targetDate);
    if (data.checkOut) updates.sign_out_at = hhmmToISO(data.checkOut, targetDate);
    if (data.remarks !== undefined) updates.notes = data.remarks;
    const { error } = await supabase.from('attendance_log').update(updates).eq('id', id.trim());
    if (error) throw error;
    attendanceService.clearCache();
    apiClient.notify();
  },

  async deleteAttendance(id: string) {
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase.from('attendance_log').delete().eq('id', id.trim());
    if (error) throw error;
    attendanceService.clearCache();
    apiClient.notify();
  },
};
