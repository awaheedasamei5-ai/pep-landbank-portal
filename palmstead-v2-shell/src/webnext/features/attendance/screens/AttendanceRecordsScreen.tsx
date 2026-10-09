"use client";

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { useAttendanceManagement } from '../hooks/useAttendanceManagement';
import { AttendanceRecordsTable } from '../components/AttendanceRecordsTable';

export function AttendanceRecordsScreen() {
  const mgmt = useAttendanceManagement();

  return (
    <div className="p-4 pb-24 md:p-8">
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/attendance/management">
          <ArrowLeft />
          Management
        </Link>
      </Button>
      <PageHeader title="Attendance records" description="Search, filter, correct, or delete any record from the last 30 days." />
      <Card>
        <CardContent>
          <AttendanceRecordsTable records={mgmt.recent30} onCorrect={mgmt.correctRecord} onRemove={mgmt.removeRecord} onResetAll={mgmt.resetAll} />
        </CardContent>
      </Card>
    </div>
  );
}
