import type { AllocationRequest, AttendanceRecord, Banner, ChatMessage, Complaint, Config, Contract, ContractRequest, Enquiry, FundRequest, Lead, LeaveRequest, Memo, MemoRecipient, Note, Payment, Plot, Referral, ScheduleItem, SiteVisit, SveInviteRecord, SveSubmissionRecord, StreakRow, WeeklyVisitForm } from '../../types/domain';
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
  // Keyed by staff key -- a self-service signature upload (Settings), same
  // sparse-override treatment as staffActiveOverrides above. Most staff
  // never upload one, so this only carries entries for those who have.
  staffSignatures: Record<string, string | null>;
  sveInvites: SveInviteRecord[];
  sveSubmissions: SveSubmissionRecord[];
  // kind is always null here -- this demo store never simulates the
  // notification-bus side of the real `messages` table, only plain chat.
  chatMessages: ChatMessage[];
  // Real-shaped local tokens for the receipt-share-link flow, but these
  // can never actually resolve on the public /receipt/:token page (that
  // page only ever talks to the real staging project via the get-receipt
  // edge function, no demoMode concept at all) -- same documented
  // demo/live boundary already established for sveInvites above.
  receiptShareLinks: { id: string; paymentId: string; token: string; createdAt: string }[];
  banners: Banner[];
  fundRequests: FundRequest[];
  weeklyVisitForms: WeeklyVisitForm[];
}

const DEMO_VERSION = 38;
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
