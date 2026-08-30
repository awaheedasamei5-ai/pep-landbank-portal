import type { AllocationRequest, AttendanceRecord, ChatMessage, Complaint, Config, Contract, ContractRequest, Enquiry, Lead, LeaveRequest, Memo, MemoRecipient, Note, Payment, Plot, Referral, ScheduleItem, SiteVisit, SveInviteRecord, SveSubmissionRecord, StreakRow } from '../../types/domain';
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
  complaints: Complaint[];
  contractRequests: ContractRequest[];
  contracts: Contract[];
  leaveRequests: LeaveRequest[];
  allocationRequests: AllocationRequest[];
  notes: Note[];
  // Keyed by staff key -- only staff whose active status has been toggled
  // away from DEMO_STAFF's own default show up here. Kept separate from
  // DEMO_STAFF (a static, code-defined roster) since DEMO_STAFF isn't
  // itself persisted/reseedable data.
  staffActiveOverrides: Record<string, boolean>;
  sveInvites: SveInviteRecord[];
  sveSubmissions: SveSubmissionRecord[];
  // kind is always null here -- this demo store never simulates the
  // notification-bus side of the real `messages` table, only plain chat.
  chatMessages: ChatMessage[];
}

const DEMO_VERSION = 24;
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
