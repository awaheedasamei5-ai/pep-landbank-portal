"use client";

import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { computeLateness } from '../lib/attendanceGeo';
import { drainPendingAttendancePhotos, uploadAttendancePhotoOrQueue } from '../lib/attendancePhotoQueue';
import type { AttendanceRecord } from '../../../types/domain';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Adapted from the approved OSS foundation (mimnets/OpenHRApp's real
// src/hooks/attendance/useAttendance.ts) -- two genuinely valuable real
// behaviors this app never had: (1) on load, reconcile any PAST date
// left checked-in with no checkout and auto-close it with a plain
// explanation, instead of leaving a broken-looking open session sitting
// there forever; (2) drain any sign-in photo that failed to upload on a
// previous visit (attendancePhotoQueue.ts) in the background, every
// time this screen opens. Lateness/off-site logic is V1's own real
// rule (attendanceGeo.ts), not this repo's.
export function useAttendance() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  const staffKey = profile?.key ?? '';
  const staffName = profile?.name ?? '';

  const [currentTime, setCurrentTime] = useState(new Date());
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [reconcileMessage, setReconcileMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: policy } = useQuery({
    queryKey: ['attendancePolicy'],
    queryFn: () => getDataSource(demoMode).attendancePolicy.current(),
  });

  const { data: today, isLoading: isLoadingToday } = useQuery({
    queryKey: ['attendanceToday', staffKey],
    enabled: !!staffKey,
    queryFn: () => getDataSource(demoMode).attendance.today(staffKey),
  });

  const { data: history } = useQuery({
    queryKey: ['attendanceHistory', staffKey],
    enabled: !!staffKey,
    queryFn: () => getDataSource(demoMode).attendance.history(staffKey, 14),
  });

  // Reconciliation: any PAST (not today) record with a sign-in and no
  // sign-out is a forgotten checkout. Auto-close it against the policy's
  // own work-end time for that day rather than guessing, and tell the
  // staff member plainly so it never looks like silent data tampering.
  useEffect(() => {
    if (!history || !policy || !staffKey) return;
    const forgotten = history.filter((r) => r.workDate !== todayIso() && r.signInAt && !r.signOutAt);
    if (!forgotten.length) return;
    (async () => {
      const ds = getDataSource(demoMode);
      for (const rec of forgotten) {
        const [eh, em] = policy.workEndTime.split(':').map(Number);
        const closeAt = new Date(`${rec.workDate}T00:00:00`);
        closeAt.setHours(eh, em, 0, 0);
        try {
          await ds.attendance.update(rec.id, { signOutAt: closeAt.toISOString() });
        } catch {
          // Best-effort -- if this fails, the record just stays open and
          // Management's own correction tool can fix it manually.
        }
      }
      const dates = forgotten.map((r) => r.workDate).join(', ');
      setReconcileMessage(`We auto-closed your forgotten check-out from ${dates}. Please remember to check out at the end of your day.`);
      queryClient.invalidateQueries({ queryKey: ['attendanceHistory', staffKey] });
      queryClient.invalidateQueries({ queryKey: ['attendanceToday', staffKey] });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per fresh history/policy pair, not on every render
  }, [history, policy, staffKey]);

  useEffect(() => {
    drainPendingAttendancePhotos();
  }, []);

  const signIn = useCallback(
    async (opts: { lat?: number; lng?: number; accuracy?: number; isOffSite: boolean; offSiteReason: string; photoDataUri: string | null }) => {
      setStatus('loading');
      try {
        const now = new Date();
        const isLate = computeLateness(now, policy ?? null);
        let photoPath: string | null = null;
        if (opts.photoDataUri) {
          photoPath = await uploadAttendancePhotoOrQueue(staffKey, todayIso(), opts.photoDataUri);
        }
        const rec = await getDataSource(demoMode).attendance.signIn(staffKey, staffName, {
          lat: opts.lat,
          lng: opts.lng,
          accuracy: opts.accuracy,
          deviceInfo: navigator.userAgent,
          offSite: opts.isOffSite,
          reason: opts.isOffSite ? opts.offSiteReason : undefined,
          late: isLate,
          lateReason: isLate ? opts.offSiteReason : undefined,
          photo: photoPath ?? undefined,
        });
        setStatus('success');
        queryClient.invalidateQueries({ queryKey: ['attendanceToday', staffKey] });
        queryClient.invalidateQueries({ queryKey: ['attendanceHistory', staffKey] });
        return rec;
      } catch (e) {
        setStatus('idle');
        throw e;
      }
    },
    [staffKey, staffName, policy, demoMode, queryClient],
  );

  const signOut = useCallback(
    async (record: AttendanceRecord, opts: { lat?: number; lng?: number; accuracy?: number; isOffSite: boolean; offSiteReason: string }) => {
      setStatus('loading');
      try {
        const rec = await getDataSource(demoMode).attendance.signOut(staffKey, record.id, {
          lat: opts.lat,
          lng: opts.lng,
          accuracy: opts.accuracy,
          offSite: opts.isOffSite,
          reason: opts.isOffSite ? opts.offSiteReason : undefined,
        });
        setStatus('success');
        queryClient.invalidateQueries({ queryKey: ['attendanceToday', staffKey] });
        queryClient.invalidateQueries({ queryKey: ['attendanceHistory', staffKey] });
        return rec;
      } catch (e) {
        setStatus('idle');
        throw e;
      }
    },
    [staffKey, demoMode, queryClient],
  );

  return { currentTime, today, isLoadingToday, policy, status, setStatus, signIn, signOut, reconcileMessage, dismissReconcileMessage: () => setReconcileMessage(null) };
}
