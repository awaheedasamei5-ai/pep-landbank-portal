"use client";

import { getSupabaseClient } from '../../../data/client';
import { resizeImageToWebpBlob } from '../../../shared/lib/image';

// Real production pattern (mimnets/OpenHRApp's attendance.service.ts,
// the approved OSS foundation for this app) -- a sign-in/out photo is
// compressed to WebP client-side, uploaded to real Supabase Storage
// (bucket `attendance-photos`, already live with real RLS: a staff
// member can only write/read their own folder, a manager can read
// everyone's -- confirmed via pg_policies, no new policy needed), and
// if the upload fails (bad connection, exactly the real-world case
// this exists for), the raw photo is queued in localStorage instead of
// silently lost, and retried on the next load. This directly replaces
// the plan's named gap: V1 stores a full-resolution photo inline in a
// text column with zero resilience if the upload/save fails.

const QUEUE_KEY = 'palmstead_attendance_photo_queue';
const MAX_RETRIES = 3;

interface QueuedPhoto {
  staffKey: string;
  workDate: string;
  field: 'sign_in_photo';
  dataUri: string;
  queuedAt: number;
  attempts: number;
}

function readQueue(): QueuedPhoto[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedPhoto[]) {
  try {
    if (queue.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Best-effort persistence -- a full/blocked localStorage shouldn't crash sign-in.
  }
}

async function uploadOnce(staffKey: string, dataUri: string): Promise<string> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Not connected');
  const blob = await resizeImageToWebpBlob(dataUri, 720, 0.65);
  const path = `${staffKey}/${Date.now()}.webp`;
  const { error } = await client.storage.from('attendance-photos').upload(path, blob, { contentType: 'image/webp', upsert: false });
  if (error) throw error;
  return path;
}

// Tries the upload up to MAX_RETRIES times with exponential backoff. On
// total failure, queues the raw photo for a later drain instead of
// throwing -- callers should let sign-in/out proceed with no photo
// rather than block someone from clocking in over a flaky connection.
export async function uploadAttendancePhotoOrQueue(staffKey: string, workDate: string, dataUri: string): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await uploadOnce(staffKey, dataUri);
    } catch {
      if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 3 ** (attempt - 1) * 1000));
    }
  }
  const queue = readQueue();
  queue.push({ staffKey, workDate, field: 'sign_in_photo', dataUri, queuedAt: Date.now(), attempts: 0 });
  writeQueue(queue);
  return null;
}

// Called once when the Attendance screen mounts -- drains any photo
// that failed to upload on a previous visit, uploads it now, and
// patches it onto that day's real attendance_log row. Silently gives
// up on an entry after 5 total attempts (across sessions) rather than
// retrying forever for a photo that will never succeed (e.g. the
// underlying attendance_log row was later deleted by Management).
export async function drainPendingAttendancePhotos(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const queue = readQueue();
  if (!queue.length) return;
  const remaining: QueuedPhoto[] = [];
  for (const item of queue) {
    if (item.attempts >= 5) continue;
    try {
      const path = await uploadOnce(item.staffKey, item.dataUri);
      const { error } = await client.from('attendance_log').update({ [item.field]: path }).eq('staff_key', item.staffKey).eq('work_date', item.workDate);
      if (error) throw error;
    } catch {
      remaining.push({ ...item, attempts: item.attempts + 1 });
    }
  }
  writeQueue(remaining);
}

// The bucket is private (RLS-gated, not a public bucket) -- reading a
// stored photo back needs a short-lived signed URL, same pattern
// already used for payment-proofs elsewhere in this codebase.
export async function resolveAttendancePhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith('data:')) return path; // legacy inline rows from before this pipeline existed
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.storage.from('attendance-photos').createSignedUrl(path, 300);
  if (error) return null;
  return data.signedUrl;
}
