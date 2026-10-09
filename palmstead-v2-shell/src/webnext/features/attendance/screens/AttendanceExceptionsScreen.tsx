"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { FormItem } from '@/components/form-item';
import { SubmitButton } from '@/components/submit-button';
import { TableEmpty } from '@/components/table-empty';
import { useMyAttendanceExceptions, useRequestAttendanceException } from '../hooks/useAttendanceExceptions';
import type { AttendanceExceptionType } from '../../../types/domain';

const TYPE_LABELS: Record<AttendanceExceptionType, string> = {
  errand: 'Errand',
  site_visit: 'Site visit',
  field_assignment: 'Field assignment',
  other: 'Other',
};

const STATUS_VARIANT: Record<string, 'outline' | 'default' | 'destructive'> = { pending: 'outline', approved: 'default', declined: 'destructive' };

// Real gap closed 2026-10-09: the staff-facing half of the
// attendance_exceptions workflow never existed -- only Management's
// decide queue did, even though create() was fully wired in the data
// source and RLS. Lets a staff member pre-authorize an off-site errand/
// site-visit/field-assignment ahead of time, same table Management's
// queue (/attendance/management/exceptions) reviews.
export function AttendanceExceptionsScreen() {
  const { data: exceptions, isLoading } = useMyAttendanceExceptions();
  const request = useRequestAttendanceException();

  const [exceptionDate, setExceptionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [exceptionType, setExceptionType] = useState<AttendanceExceptionType>('errand');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sorted = (exceptions ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function submit() {
    setError(null);
    if (!reason.trim()) {
      setError('Please give a reason.');
      return;
    }
    await request.mutateAsync({ exceptionDate, exceptionType, reason: reason.trim() });
    setReason('');
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/attendance">
          <ArrowLeft />
          Attendance
        </Link>
      </Button>
      <PageHeader title="Exception requests" description="Pre-authorize an off-site errand, site visit, or field assignment ahead of time — Management decides, and an approved one skips the reactive off-site prompt at sign-in." />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Request an exception</CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-md gap-4">
          <div className="grid grid-cols-2 gap-4">
            <FormItem label="Date" htmlFor="exceptionDate">
              <Input id="exceptionDate" type="date" value={exceptionDate} onChange={(e) => setExceptionDate(e.target.value)} />
            </FormItem>
            <FormItem label="Type" htmlFor="exceptionType">
              <Select value={exceptionType} onValueChange={(v) => setExceptionType(v as AttendanceExceptionType)}>
                <SelectTrigger id="exceptionType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as AttendanceExceptionType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          </div>
          <FormItem label="Reason (required)" htmlFor="reason">
            <Textarea id="reason" placeholder="What's the errand / visit / assignment?" value={reason} onChange={(e) => setReason(e.target.value)} />
          </FormItem>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <SubmitButton type="button" loading={request.isPending} onClick={submit}>
            Send request
          </SubmitButton>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My requests</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length === 0 ? (
                  <TableEmpty colSpan={4} message="No exception requests yet." />
                ) : (
                  sorted.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.exceptionDate}</TableCell>
                      <TableCell>{TYPE_LABELS[e.exceptionType]}</TableCell>
                      <TableCell className="max-w-64">
                        <span className="line-clamp-1" title={e.reason}>
                          {e.reason}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[e.status] ?? 'outline'} className="capitalize">
                          {e.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
