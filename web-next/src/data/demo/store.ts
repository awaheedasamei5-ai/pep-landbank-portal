import type { AttendanceRecord, Config, Enquiry, Lead, Memo, MemoRecipient, Payment, Plot, Referral, ScheduleItem, SiteVisit, StreakRow } from '../../types/domain';
import { seedDemo } from './seed';

// localStorage-backed port of index.html's demoLoad()/demoSave() (uses a
// native window.storage bridge there for the Capacitor app; a browser-only
// web-next doesn't need that layer, localStorage is the direct equivalent).
// Same version-guarded shape: bump DEMO_VERSION whenever the seed shape
// changes so a stale saved blob from an earlier version doesn't crash a
// newer screen.

export interface DemoDb {
  version: number;
  leads: Lead[];
  payments: Payment[];
  scheduleItems: ScheduleItem[];
  streaks: StreakRow[];
  config: Config;
  plots: Plot[];
  siteVisits: SiteVisit[];
  referrals: Referral[];
  enquiries: Enquiry[];
  attendance: AttendanceRecord[];
  memos: Memo[];
  memoRecipients: MemoRecipient[];
  // Minimal shape (status only) -- no full Complaints feature/screen
  // exists yet, this exists purely so Manager Home's "open complaints"
  // KPI has real demo data to aggregate, matching production's real
  // complaints.status column (confirmed live: default 'Open').
  complaints: { status: string }[];
}

const DEMO_VERSION = 8;
const DEMO_KEY = 'pep_webnext_demo';

let demoMem: DemoDb | null = null;

export function demoLoad(): DemoDb {
  if (demoMem) return demoMem;
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as DemoDb;
      if (saved.version === DEMO_VERSION) {
        demoMem = saved;
        return demoMem;
      }
    }
  } catch {
    // fall through to reseed
  }
  demoMem = seedDemo();
  demoSave();
  return demoMem;
}

export function demoSave(): void {
  if (!demoMem) return;
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(demoMem));
  } catch {
    // storage full/unavailable -- demo mode degrades to in-memory only
  }
}

export function demoReset(): DemoDb {
  demoMem = seedDemo();
  demoSave();
  return demoMem;
}
