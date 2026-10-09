"use client";

import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NoticeBoardScreen } from "@/app/(main)/dashboard/notice-board/_components/notice-board-screen";
import { PollsScreen } from "@/app/(main)/dashboard/polls/_components/polls-screen";
import { StaffComplaintsScreen } from "@/app/(main)/dashboard/staff-complaints/_components/staff-complaints-screen";
import { TeamFeedbackScreen } from "@/app/(main)/dashboard/team-feedback/_components/team-feedback-screen";

// Staff Hub -- consolidates 4 real OSS item-2 modules (Notice Board,
// Polls, Staff Complaints, Team Feedback) that each got their own
// standalone sidebar item in the previous pass. Real user correction
// 2026-10-09: when something new relates to an existing concept, it
// goes inside that app's own navigation, not a personal sidebar slot --
// these 4 are all "staff culture/voice" features with no single
// existing Palmstead app to nest under individually (unlike Attendance
// Corrections, which has an obvious home inside Attendance), so they're
// grouped under one real app instead, same shape the real source repo
// itself uses (a staff portal with internal sections, not top-level
// items in the host app's own nav). Each screen's own component and
// data layer is untouched -- only the routing/entry point changed.
const TABS = [
  { key: "notice-board", label: "Notice Board" },
  { key: "polls", label: "Polls" },
  { key: "complaints", label: "Complaints" },
  { key: "feedback", label: "Feedback" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function StaffHubScreen() {
  const [tab, setTab] = useState<TabKey>("notice-board");

  return (
    <div>
      <PageHeader
        title="Staff Hub"
        description="Notice board, polls, workplace concerns, and feedback to Management -- all in one place."
        action={
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />
      {tab === "notice-board" && <NoticeBoardScreen />}
      {tab === "polls" && <PollsScreen />}
      {tab === "complaints" && <StaffComplaintsScreen />}
      {tab === "feedback" && <TeamFeedbackScreen />}
    </div>
  );
}
