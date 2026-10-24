'use client';

import Link from 'next/link';
import { Lightbulb } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/page-header';
import { useSessionStore } from '../../../auth/useSessionStore';
import { OverviewTab } from './OverviewTab';
import { SalesActivityTab } from './SalesActivityTab';
import { TeamTab } from './TeamTab';
import { OperationsTab } from './OperationsTab';

// docs/plans/23-analytics-plan.md / docs/plans/27-analytics-v2-cross-
// app-plan.md -- real tab-per-domain rebuild (the original shadcn-
// admin-dashboard template's own analytics-kpi-strip/Tabs pattern,
// applied to real business domains instead of generic web-traffic
// categories), covering Sales/Finance (Overview, unchanged), Quotation/
// Contract of Sale/Referrals/Complaints/Site Visits (Sales Activity),
// Attendance/Leave (Team), and Operations Tracker (Operations) -- 4
// real domains instead of the original 1. Manager-only: v1's own
// source (index.html:9225-9227) confirms Analytics has zero
// staff-facing meaning -- agents' real Insights destination is Smart
// Insights.
export function AnalyticsScreen() {
  const profile = useSessionStore((s) => s.profile);

  if (profile?.role !== 'manager') {
    return (
      <div>
        <PageHeader title="Analytics" description="Deeper performance analytics across the team." />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Lightbulb className="size-8 text-muted-foreground" />
            <p className="font-medium">See Smart Insights instead</p>
            <p className="max-w-sm text-sm text-muted-foreground">Analytics is a Management view of company-wide numbers. Your own personalized nudges and performance insights live in Smart Insights.</p>
            <Link href="/dashboard/smart-insights" className="mt-2 text-sm font-medium text-primary hover:underline">
              Go to Smart Insights
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Analytics" description="Company performance across every real app, not just Sales." />
      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sales-activity">Sales Activity</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="sales-activity">
          <SalesActivityTab />
        </TabsContent>
        <TabsContent value="team">
          <TeamTab />
        </TabsContent>
        <TabsContent value="operations">
          <OperationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
