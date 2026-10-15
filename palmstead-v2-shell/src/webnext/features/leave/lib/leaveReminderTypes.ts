export type LeaveSmsStatus = 'queued' | 'sending' | 'accepted' | 'failed' | 'needs_review';

export interface LeaveReminderMessage {
  id: string;
  request_id: string;
  request_no: string;
  recipient_name: string;
  masked_phone: string;
  status: LeaveSmsStatus;
  attempt_count: number;
  created_at: string;
  provider_accepted_at: string | null;
  last_error: string | null;
  last_retry_at: string | null;
}

export interface LeaveReminderHealth {
  counts: Partial<Record<LeaveSmsStatus, number>>;
  scheduler: { active: boolean; schedule: string; last_run_at: string | null; last_run_status: string | null } | null;
  messages: LeaveReminderMessage[];
}
