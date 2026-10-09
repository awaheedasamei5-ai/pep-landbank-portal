"use client";

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { useAttendanceManagement } from '../hooks/useAttendanceManagement';
import { AttendanceExceptionsQueue } from '../components/AttendanceExceptionsQueue';

export function AttendanceExceptionsManagementScreen() {
  const mgmt = useAttendanceManagement();

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/attendance/management">
          <ArrowLeft />
          Management
        </Link>
      </Button>
      <PageHeader title="Exception requests" description="Pre-authorized off-site errands, site visits, and field assignments awaiting a decision." />
      <Card>
        <CardContent>
          <AttendanceExceptionsQueue pending={mgmt.pendingExceptions} onDecide={mgmt.decideException} />
        </CardContent>
      </Card>
    </div>
  );
}
