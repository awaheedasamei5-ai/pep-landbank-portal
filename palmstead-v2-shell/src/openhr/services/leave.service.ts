
import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient, dedupe } from './api.client';
import { LeaveRequest, LeaveBalance } from '../types';

let cachedLeaves: LeaveRequest[] | null = null;
let leaveCacheTimestamp = 0;
const LEAVE_CACHE_TTL = 2 * 60 * 1000;

// V1's own real default (config.leaveTotalDays || 20, see the deleted
// webnext leaveLogic.ts) -- used only when app_config.leave_total_days
// isn't set.
const DEFAULT_LEAVE_TOTAL_DAYS = 20;

// OpenHRApp's own UI only collects a start/end range; the real schema
// stores individual dates (dates jsonb), so every (re)write expands the
// range into an explicit day list, inclusive of both ends.
function datesBetween(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return out;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// Palmstead's real leave_requests (item 1's own build) is structurally
// different from OpenHRApp's own `leaves` table, not just renamed columns:
// - single-stage approval (status: planned/pending/approved/declined/
//   rescheduled), not OpenHRApp's two-stage Manager->HR workflow -- mapped
//   onto OpenHRApp's PENDING_MANAGER/PENDING_HR/APPROVED/REJECTED vocabulary
//   by collapsing both pending states into PENDING_MANAGER (no HR hand-off
//   exists to represent).
// - no leave-TYPE column at all (no ANNUAL/CASUAL/SICK split) -- real data
//   is one pooled balance. Mapped to a single synthetic type 'LEAVE' rather
//   than inventing per-type quotas the real schema doesn't track. Whether
//   Palmstead wants typed leave balances is a real policy question for the
//   "twist to fit" pass, not something to guess via an ALTER TABLE here.
// - `dates` is a jsonb array of individual (possibly non-contiguous) dates,
//   not a start/end range -- startDate/endDate below are just the array's
//   bounds for OpenHRApp's UI, which only renders a range.
// - no reason/remarks columns -- `letter_text` (the real leave-letter body)
//   is the closest real field and is used for `reason`; manager/approver
//   remarks have no real column to write back to, a known gap.
const REAL_TO_OPENHR_STATUS: Record<string, LeaveRequest['status']> = {
  planned: 'PENDING_MANAGER',
  pending: 'PENDING_MANAGER',
  rescheduled: 'PENDING_MANAGER',
  approved: 'APPROVED',
  declined: 'REJECTED',
};

function datesRange(dates: unknown): { start: string; end: string; count: number } {
  const arr = Array.isArray(dates) ? (dates as string[]).filter(Boolean).sort() : [];
  return { start: arr[0] || '', end: arr[arr.length - 1] || '', count: arr.length };
}

const mapLeave = (r: any): LeaveRequest => {
  const { start, end } = datesRange(r.dates);
  return {
    id: r.id,
    employeeId: r.agent_key ? r.agent_key.toString().trim() : '',
    employeeName: r.agent_name,
    lineManagerId: undefined,
    appliedDate: r.created_at,
    startDate: start,
    endDate: end,
    totalDays: r.days_count || 0,
    type: 'LEAVE',
    reason: r.letter_text || r.reschedule_note || '',
    status: REAL_TO_OPENHR_STATUS[String(r.status || '').toLowerCase()] || 'PENDING_MANAGER',
    managerRemarks: '',
    approverRemarks: '',
    organizationId: undefined,
  };
};

export const leaveService = {
  clearCache() {
    cachedLeaves = null;
    leaveCacheTimestamp = 0;
  },

  async getLeaves(): Promise<LeaveRequest[]> {
    if (cachedLeaves && Date.now() - leaveCacheTimestamp < LEAVE_CACHE_TTL) return cachedLeaves;
    return dedupe('leaves', async () => {
      if (!isSupabaseConfigured()) {
        console.warn('[LeaveService] Supabase not configured');
        return [];
      }
      try {
        const yearAgo = new Date();
        yearAgo.setDate(yearAgo.getDate() - 365);
        const since = yearAgo.toISOString();

        // RLS (leave_requests_sel) already scopes rows to own-or-managed --
        // no org filter needed, single-tenant.
        const { data, error } = await supabase
          .from('leave_requests')
          .select('*')
          .gte('created_at', since)
          .order('created_at', { ascending: false });
        if (error) throw error;

        const result = (data ?? []).map(mapLeave);
        cachedLeaves = result;
        leaveCacheTimestamp = Date.now();
        return result;
      } catch (e: any) {
        console.error('[LeaveService] Failed to fetch leaves:', e?.message || e);
        return [];
      }
    });
  },

  async saveLeaveRequest(data: Partial<LeaveRequest>) {
    if (!isSupabaseConfigured()) return;
    const dates = data.startDate && data.endDate ? datesBetween(data.startDate, data.endDate) : [];
    const payload: any = {
      agent_key: data.employeeId?.trim(),
      agent_name: data.employeeName,
      year: new Date(data.startDate || Date.now()).getFullYear(),
      dates,
      days_count: Number(data.totalDays) || dates.length,
      letter_text: data.reason || '',
      // No two-stage Manager->HR workflow in the real schema -- every
      // request lands directly in 'pending', same single queue Management
      // reviews regardless of OpenHRApp's own role split.
      status: 'pending',
    };

    const { error } = await supabase.from('leave_requests').insert(payload);
    if (error) throw new Error(`Failed to create record: ${error.message}`);
    leaveService.clearCache();
    apiClient.notify();
  },

  // 4th param (role) kept in the signature, unused -- every caller
  // (Admin/HR/Manager leave-review components) still passes it; dropping
  // the param would mean touching every one of those files just to delete
  // an argument, contrary to leaving the raw-duplicated UI layer alone.
  async updateLeaveStatus(id: string, status: string, remarks: string, _role?: string) {
    if (!isSupabaseConfigured()) return;
    const realStatus = status === 'APPROVED' ? 'approved' : status === 'REJECTED' ? 'declined' : 'pending';
    const update: any = {
      status: realStatus,
      decided_at: new Date().toISOString(),
    };
    if (remarks) update.reschedule_note = remarks;
    // .select() matters here. A write refused by a row-level policy is not an
    // error — PostgREST reports success having changed zero rows. Without
    // asking for the affected rows back, a reviewer acting on a record they
    // cannot touch sees a success toast and no change.
    const { data: updated, error } = await supabase
      .from('leave_requests').update(update).eq('id', id.trim()).select('id');
    if (error) throw new Error('Access Denied');
    if (!updated || updated.length === 0) {
      throw new Error('This request could not be updated. It may have already been actioned.');
    }
    leaveService.clearCache();
    apiClient.notify();
  },

  // `type`/`remarks` accepted for call-site compatibility (AdminLeaveFormModal
  // passes the full original OpenHRApp shape) but unused -- no leave-type or
  // approver-remarks column exists in the real schema.
  async adminCreateLeave(data: {
    employeeId: string;
    employeeName: string;
    type?: string;
    startDate: string;
    endDate: string;
    totalDays: number;
    reason: string;
    status: string;
    remarks?: string;
  }) {
    if (!isSupabaseConfigured()) return;
    const dates = data.startDate && data.endDate ? datesBetween(data.startDate, data.endDate) : [];
    const realStatus = data.status === 'APPROVED' ? 'approved' : data.status === 'REJECTED' ? 'declined' : 'pending';
    const payload: any = {
      agent_key: data.employeeId.trim(),
      agent_name: data.employeeName,
      year: new Date(data.startDate || Date.now()).getFullYear(),
      dates,
      days_count: Number(data.totalDays) || dates.length,
      letter_text: data.reason || '',
      status: realStatus,
      decided_at: realStatus !== 'pending' ? new Date().toISOString() : null,
    };

    const { error } = await supabase.from('leave_requests').insert(payload);
    if (error) throw new Error('Failed to create leave record');
    leaveService.clearCache();
    apiClient.notify();
  },

  async adminUpdateLeave(id: string, data: {
    type?: string;
    startDate?: string;
    endDate?: string;
    totalDays?: number;
    reason?: string;
    status?: string;
    approverRemarks?: string;
  }) {
    if (!isSupabaseConfigured()) return;
    const update: any = {};
    if (data.startDate !== undefined && data.endDate !== undefined) {
      update.dates = datesBetween(data.startDate, data.endDate);
    }
    if (data.totalDays !== undefined) update.days_count = Number(data.totalDays);
    if (data.reason !== undefined)    update.letter_text = data.reason;
    if (data.status !== undefined) {
      update.status = data.status === 'APPROVED' ? 'approved' : data.status === 'REJECTED' ? 'declined' : 'pending';
    }

    const { data: updated, error } = await supabase
      .from('leave_requests').update(update).eq('id', id.trim()).select('id');
    if (error) throw new Error('Failed to update leave record');
    if (!updated || updated.length === 0) {
      throw new Error('This record could not be updated.');
    }
    leaveService.clearCache();
    apiClient.notify();
  },

  async adminDeleteLeave(id: string) {
    if (!isSupabaseConfigured()) return;
    const { data: deleted, error } = await supabase
      .from('leave_requests').delete().eq('id', id.trim()).select('id');
    if (error) throw new Error('Failed to delete leave record');
    if (!deleted || deleted.length === 0) {
      throw new Error('This record could not be deleted.');
    }
    leaveService.clearCache();
    apiClient.notify();
  },

  // Single pooled balance (real leave_requests has no type column -- see
  // the module comment above). Reserved = any request not yet
  // declined/rescheduled (planned/pending/approved all hold the days
  // against the quota), matching V1's own leaveDaysReserved rule exactly
  // (leaveIsBlocking: planned | pending | approved).
  async getLeaveBalance(employeeId: string): Promise<LeaveBalance> {
    const balance: LeaveBalance = { employeeId, LEAVE: DEFAULT_LEAVE_TOTAL_DAYS };
    if (!isSupabaseConfigured()) return balance;
    try {
      const { data: config } = await supabase
        .from('app_config')
        .select('leave_total_days')
        .maybeSingle();
      const total = config?.leave_total_days ?? DEFAULT_LEAVE_TOTAL_DAYS;

      const { data, error } = await supabase
        .from('leave_requests')
        .select('status, days_count')
        .eq('agent_key', employeeId.trim())
        .eq('year', new Date().getFullYear());
      if (error) throw error;

      const reserved = (data ?? [])
        .filter((r) => ['planned', 'pending', 'approved'].includes(String(r.status)))
        .reduce((sum, r) => sum + (r.days_count || 0), 0);

      balance.LEAVE = Math.max(0, total - reserved);
      return balance;
    } catch {
      return balance;
    }
  },
};
