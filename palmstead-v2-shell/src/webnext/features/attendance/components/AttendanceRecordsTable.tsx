"use client";

import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormItem } from '@/components/form-item';
import { SubmitButton } from '@/components/submit-button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { TableEmpty } from '@/components/table-empty';
import type { AttendanceRecord } from '../../../types/domain';
import { resolveAttendancePhotoUrl } from '../lib/attendancePhotoQueue';

function timeToInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function combineDateTime(workDate: string, hhmm: string): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(`${workDate}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// Real correction tool -- ATTENDANCE_BLUEPRINT.md §8. Rebuilt on the
// shell's real Table/Dialog after the 2026-10-08/09 correction. Every
// save writes only signInAt/signOutAt (the real al_upd_own_or_mgr RLS
// shape); every correction and delete is Management-only, matching the
// real al_del_mgr policy.
export function AttendanceRecordsTable({
  records,
  onCorrect,
  onRemove,
  onResetAll,
}: {
  records: AttendanceRecord[];
  onCorrect: (id: string, patch: { signInAt?: string | null; signOutAt?: string | null }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onResetAll: () => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [staffFilter, setStaffFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LATE' | 'ON_TIME' | 'OFF_SITE'>('ALL');
  const [selected, setSelected] = useState<AttendanceRecord | null>(null);
  const [editIn, setEditIn] = useState('');
  const [editOut, setEditOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPhotoUrl(null);
    if (selected?.signInPhoto) {
      resolveAttendancePhotoUrl(selected.signInPhoto).then((url) => {
        if (!cancelled) setPhotoUrl(url);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const staffOptions = useMemo(() => {
    const map = new Map<string, string>();
    records.forEach((r) => map.set(r.staffKey, r.staffName ?? r.staffKey));
    return Array.from(map.entries());
  }, [records]);

  const filtered = useMemo(() => {
    let list = [...records];
    if (staffFilter !== 'ALL') list = list.filter((r) => r.staffKey === staffFilter);
    if (statusFilter === 'LATE') list = list.filter((r) => !!r.lateReason);
    else if (statusFilter === 'ON_TIME') list = list.filter((r) => !!r.signInAt && !r.lateReason);
    else if (statusFilter === 'OFF_SITE') list = list.filter((r) => r.isOffSiteIn || r.isOffSiteOut);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => (r.staffName ?? r.staffKey).toLowerCase().includes(q) || r.workDate.includes(q));
    }
    return list.sort((a, b) => b.workDate.localeCompare(a.workDate));
  }, [records, staffFilter, statusFilter, search]);

  function openDetail(rec: AttendanceRecord) {
    setSelected(rec);
    setEditIn(timeToInput(rec.signInAt));
    setEditOut(timeToInput(rec.signOutAt));
  }

  async function handleSave() {
    if (!selected) return;
    setBusy(true);
    try {
      await onCorrect(selected.id, {
        signInAt: combineDateTime(selected.workDate, editIn),
        signOutAt: combineDateTime(selected.workDate, editOut),
      });
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    setBusy(true);
    try {
      await onRemove(selected.id);
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-heading text-lg font-semibold">Attendance records</h3>
        <ConfirmDialog
          trigger={
            <Button variant="destructive" size="sm">
              Reset all records
            </Button>
          }
          title="Delete EVERY attendance record for EVERY staff member?"
          description="This cannot be undone. Present/absent counters restart at zero."
          confirmLabel="Reset all"
          onConfirm={onResetAll}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Search by name or date…" className="max-w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={staffFilter} onValueChange={setStaffFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All staff</SelectItem>
            {staffOptions.map(([key, name]) => (
              <SelectItem key={key} value={key}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="LATE">Late</SelectItem>
            <SelectItem value="ON_TIME">On time</SelectItem>
            <SelectItem value="OFF_SITE">Off-site</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="mb-2 text-xs text-muted-foreground">
        {filtered.length} record{filtered.length === 1 ? '' : 's'}
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>In — Out</TableHead>
            <TableHead>Flags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableEmpty colSpan={4} message="No matching records." />
          ) : (
            filtered.map((rec) => (
              <TableRow key={rec.id} className="cursor-pointer" onClick={() => openDetail(rec)}>
                <TableCell className="font-medium">{rec.staffName ?? rec.staffKey}</TableCell>
                <TableCell>{rec.workDate}</TableCell>
                <TableCell>
                  {timeToInput(rec.signInAt) || '--:--'} — {timeToInput(rec.signOutAt) || 'Active'}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {rec.lateReason && <Badge variant="destructive">Late</Badge>}
                    {(rec.isOffSiteIn || rec.isOffSiteOut) && <Badge variant="secondary">Off-site</Badge>}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog open={!!selected} onOpenChange={(open) => !open && !busy && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {selected.staffName ?? selected.staffKey} · {selected.workDate}
                </DialogTitle>
              </DialogHeader>

              <div className="grid gap-4">
                {selected.signInPhoto && (photoUrl ? <img src={photoUrl} alt="Sign-in" className="max-h-48 w-full rounded-lg border object-cover" /> : <p className="text-xs text-muted-foreground">Loading photo…</p>)}

                <div className="grid grid-cols-2 gap-3">
                  <FormItem label="Sign-in time" htmlFor="editIn">
                    <Input id="editIn" type="time" value={editIn} onChange={(e) => setEditIn(e.target.value)} />
                  </FormItem>
                  <FormItem label="Sign-out time" htmlFor="editOut">
                    <Input id="editOut" type="time" value={editOut} onChange={(e) => setEditOut(e.target.value)} />
                  </FormItem>
                </div>

                {selected.signInLat != null && selected.signInLng != null && (
                  <a className="text-sm font-medium text-primary hover:underline" href={`https://www.google.com/maps?q=${selected.signInLat},${selected.signInLng}`} target="_blank" rel="noreferrer">
                    View sign-in location on map →
                  </a>
                )}

                {selected.signInReason && <p className="text-xs text-muted-foreground">Off-site reason: {selected.signInReason}</p>}
                {selected.lateReason && <p className="text-xs text-muted-foreground">Late reason: {selected.lateReason}</p>}
              </div>

              <DialogFooter className="justify-between sm:justify-between">
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy}>
                      <Trash2 />
                      Delete record
                    </Button>
                  }
                  title="Permanently delete this attendance record?"
                  description="This cannot be undone."
                  confirmLabel="Delete"
                  onConfirm={handleDelete}
                />
                <SubmitButton type="button" loading={busy} onClick={handleSave}>
                  Save correction
                </SubmitButton>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
