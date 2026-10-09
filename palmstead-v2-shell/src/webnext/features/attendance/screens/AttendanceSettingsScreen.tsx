"use client";

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { useAttendanceManagement } from '../hooks/useAttendanceManagement';
import { AttendancePolicyCard } from '../components/AttendancePolicyCard';
import { OfficeLocationsCard } from '../components/OfficeLocationsCard';

export function AttendanceSettingsScreen() {
  const mgmt = useAttendanceManagement();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/attendance/management">
          <ArrowLeft />
          Management
        </Link>
      </Button>
      <PageHeader title="Policy & locations" description="What counts as late, which days count as workdays, and every real office geofence — in-app, for Attendance only." />
      <div className="grid gap-6">
        <AttendancePolicyCard policy={mgmt.policy} onUpdate={mgmt.updatePolicy} />
        <OfficeLocationsCard locations={mgmt.officeLocations} onCreate={mgmt.createOfficeLocation} onUpdate={mgmt.updateOfficeLocation} onRemove={mgmt.removeOfficeLocation} />
      </div>
    </div>
  );
}
