"use client";

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/components/submit-button';
import { FormItem } from '@/components/form-item';
import type { AttendancePolicy } from '../../../types/domain';

const WEEKDAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

// Attendance plan Part 4: "the work hours, the grace period, which days
// count as workdays ... all editable from inside Attendance's own
// management view." Rebuilt on the shell's real Card/Input after the
// 2026-10-08/09 correction. Writes go through set_attendance_policy()
// (via useAttendanceManagement's updatePolicy), which versions the row
// server-side rather than overwriting it.
export function AttendancePolicyCard({ policy, onUpdate }: { policy: AttendancePolicy | null; onUpdate: (input: { workStartTime: string; workEndTime: string; graceMinutes: number; workDays: number[] }) => Promise<void> }) {
  const [workStartTime, setWorkStartTime] = useState(policy?.workStartTime ?? '08:00');
  const [workEndTime, setWorkEndTime] = useState(policy?.workEndTime ?? '17:00');
  const [graceMinutes, setGraceMinutes] = useState(policy?.graceMinutes ?? 15);
  const [workDays, setWorkDays] = useState<number[]>(policy?.workDays ?? [1, 2, 3, 4, 5]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!policy) return;
    setWorkStartTime(policy.workStartTime);
    setWorkEndTime(policy.workEndTime);
    setGraceMinutes(policy.graceMinutes);
    setWorkDays(policy.workDays);
  }, [policy]);

  function toggleDay(d: number) {
    setWorkDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await onUpdate({ workStartTime, workEndTime, graceMinutes, workDays });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attendance policy</CardTitle>
        <CardDescription>What counts as &quot;late&quot; and which days count as workdays. Changing this creates a new version — past sign-ins stay judged against the policy that was in force then.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-3 gap-3">
          <FormItem label="Work start" htmlFor="workStart">
            <Input id="workStart" type="time" value={workStartTime} onChange={(e) => setWorkStartTime(e.target.value)} />
          </FormItem>
          <FormItem label="Work end" htmlFor="workEnd">
            <Input id="workEnd" type="time" value={workEndTime} onChange={(e) => setWorkEndTime(e.target.value)} />
          </FormItem>
          <FormItem label="Grace (min)" htmlFor="grace">
            <Input id="grace" type="number" min={0} max={120} value={graceMinutes} onChange={(e) => setGraceMinutes(Number(e.target.value))} />
          </FormItem>
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium">Workdays</span>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <Badge key={d.value} variant={workDays.includes(d.value) ? 'default' : 'outline'} className="cursor-pointer px-3 py-1.5" onClick={() => toggleDay(d.value)}>
                {d.label}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          {policy && <span className="text-xs text-muted-foreground">Currently in force since {policy.effectiveFrom}</span>}
          <SubmitButton type="button" className="ml-auto" loading={saving} onClick={handleSave}>
            {saved ? 'Saved' : 'Save policy'}
          </SubmitButton>
        </div>
      </CardContent>
    </Card>
  );
}
