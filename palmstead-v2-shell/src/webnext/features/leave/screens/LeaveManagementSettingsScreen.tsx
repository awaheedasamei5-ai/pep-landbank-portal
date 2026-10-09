"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { FormItem } from '@/components/form-item';
import { SubmitButton } from '@/components/submit-button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useConfig, useUpdateConfig } from '../../manager/hooks/useConfigSettings';
import { useCreateLeaveHoliday, useLeaveHolidays, useRemoveLeaveHoliday } from '../hooks/useLeaveHolidays';
import type { EidWindow } from '../../../types/domain';

// Real in-app settings for Leave, rebuilt on the shell's real shadcn
// Card/Input/FormItem after the 2026-10-08 correction. leaveTotalDays and
// eidWindows are both already-wired config.update() fields read by
// leaveLogic.ts everywhere; this is the first UI that can actually edit
// them. leave_holidays (Phase 1) is merged into the same holiday map
// everywhere via companyClosuresForYear().
export function LeaveManagementSettingsScreen() {
  const { data: config } = useConfig();
  const updateConfig = useUpdateConfig();
  const { data: closures } = useLeaveHolidays();
  const createClosure = useCreateLeaveHoliday();
  const removeClosure = useRemoveLeaveHoliday();

  const [quotaDraft, setQuotaDraft] = useState<number | null>(null);
  const [windowForm, setWindowForm] = useState({ name: '', centerDate: '', daysBefore: 1, daysAfter: 1 });
  const [closureForm, setClosureForm] = useState({ date: '', name: '' });

  const quota = quotaDraft ?? config?.leaveTotalDays ?? 20;

  function saveQuota() {
    if (quotaDraft === null || quotaDraft === config?.leaveTotalDays) return;
    updateConfig.mutate({ leaveTotalDays: quotaDraft });
  }

  function addWindow() {
    if (!config || !windowForm.name.trim() || !windowForm.centerDate) return;
    const next: EidWindow[] = [...config.eidWindows, { id: crypto.randomUUID(), name: windowForm.name.trim(), centerDate: windowForm.centerDate, daysBefore: windowForm.daysBefore, daysAfter: windowForm.daysAfter }];
    updateConfig.mutate({ eidWindows: next });
    setWindowForm({ name: '', centerDate: '', daysBefore: 1, daysAfter: 1 });
  }

  function removeWindow(id: string) {
    if (!config) return;
    updateConfig.mutate({ eidWindows: config.eidWindows.filter((w) => w.id !== id) });
  }

  function addClosure() {
    if (!closureForm.date || !closureForm.name.trim()) return;
    createClosure.mutate({ holidayDate: closureForm.date, name: closureForm.name.trim(), isRecurringEid: false });
    setClosureForm({ date: '', name: '' });
  }

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/leave/management">
          <ArrowLeft />
          Management
        </Link>
      </Button>
      <PageHeader title="Leave settings" description="Quota, Eid windows, and company closures — in-app, for Leave only" />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Annual leave quota</CardTitle>
          <CardDescription>Every staff member&apos;s pooled annual entitlement. One number, company-wide — Palmstead has no separate leave types.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Input type="number" min={0} className="w-24 text-center font-heading text-lg font-semibold" value={quota} onChange={(e) => setQuotaDraft(Number(e.target.value))} />
          <span className="text-sm text-muted-foreground">days / year</span>
          <SubmitButton type="button" className="ml-auto" size="sm" disabled={quotaDraft === null} loading={updateConfig.isPending} onClick={saveQuota}>
            Save
          </SubmitButton>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Eid windows</CardTitle>
            <CardDescription>
              Eid al-Fitr/al-Adha can&apos;t be predicted by calendar math — moon sightings shift the date. Management maintains the window each year; staff who observe Eid (set per-person
              elsewhere) are exempt from the weekday block on these dates.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {(config?.eidWindows ?? []).length === 0 && <p className="text-sm text-muted-foreground">No Eid windows configured yet.</p>}
            {(config?.eidWindows ?? []).map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">{w.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Centered {w.centerDate} · {w.daysBefore} day(s) before, {w.daysAfter} day(s) after
                  </div>
                </div>
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" size="sm">
                      Remove
                    </Button>
                  }
                  title="Remove this Eid window?"
                  description="Staff who observe Eid will no longer be exempt on these dates."
                  confirmLabel="Remove"
                  onConfirm={() => Promise.resolve(removeWindow(w.id))}
                />
              </div>
            ))}
            <div className="grid gap-2 border-t pt-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <FormItem label="Window name" htmlFor="windowName">
                  <Input id="windowName" placeholder="e.g. Eid al-Fitr 2027" value={windowForm.name} onChange={(e) => setWindowForm((f) => ({ ...f, name: e.target.value }))} />
                </FormItem>
                <FormItem label="Centered on" htmlFor="windowDate">
                  <Input id="windowDate" type="date" value={windowForm.centerDate} onChange={(e) => setWindowForm((f) => ({ ...f, centerDate: e.target.value }))} />
                </FormItem>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormItem label="Days before" htmlFor="daysBefore">
                  <Input id="daysBefore" type="number" min={0} value={windowForm.daysBefore} onChange={(e) => setWindowForm((f) => ({ ...f, daysBefore: Number(e.target.value) }))} />
                </FormItem>
                <FormItem label="Days after" htmlFor="daysAfter">
                  <Input id="daysAfter" type="number" min={0} value={windowForm.daysAfter} onChange={(e) => setWindowForm((f) => ({ ...f, daysAfter: Number(e.target.value) }))} />
                </FormItem>
              </div>
              <Button variant="outline" disabled={!windowForm.name.trim() || !windowForm.centerDate || updateConfig.isPending} onClick={addWindow}>
                <Plus />
                Add window
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Company closures</CardTitle>
            <CardDescription>One-off days off that aren&apos;t on the fixed Ghana public-holiday list (a company anniversary, a declared closure). Shown on every leave calendar once added.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {(closures ?? []).length === 0 && <p className="text-sm text-muted-foreground">No ad-hoc closures added yet.</p>}
            {(closures ?? []).map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">{h.name}</div>
                  <div className="text-xs text-muted-foreground">{h.holidayDate}</div>
                </div>
                <Button variant="outline" size="sm" disabled={removeClosure.isPending} onClick={() => removeClosure.mutate(h.id)}>
                  Remove
                </Button>
              </div>
            ))}
            <div className="grid gap-2 border-t pt-4 sm:grid-cols-2">
              <FormItem label="Date" htmlFor="closureDate">
                <Input id="closureDate" type="date" value={closureForm.date} onChange={(e) => setClosureForm((f) => ({ ...f, date: e.target.value }))} />
              </FormItem>
              <FormItem label="Closure name" htmlFor="closureName">
                <Input id="closureName" placeholder="Closure name" value={closureForm.name} onChange={(e) => setClosureForm((f) => ({ ...f, name: e.target.value }))} />
              </FormItem>
              <SubmitButton type="button" variant="outline" className="sm:col-span-2" loading={createClosure.isPending} disabled={!closureForm.date || !closureForm.name.trim()} onClick={addClosure}>
                <Plus />
                Add closure
              </SubmitButton>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
