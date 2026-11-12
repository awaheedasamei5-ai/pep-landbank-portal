import { getSupabaseClient } from '../../../data/client';
import { resizeImageToDataUri, resizeImageToWebpBlob } from '../../../shared/lib/image';
import type { BannerStatus } from '../../../types/domain';

export interface BannerInspection {
  id: string;
  banner_id: string;
  inspector_id: string;
  observed_condition: BannerStatus;
  finding: string;
  photo_path: string;
  observed_lat: number | null;
  observed_lng: number | null;
  gps_accuracy_m: number | null;
  recorded_at: string;
  inspector?: { name: string } | { name: string }[] | null;
}

export function bannerInspectorName(row: BannerInspection): string {
  const person = Array.isArray(row.inspector) ? row.inspector[0] : row.inspector;
  return person?.name ?? 'Staff';
}

function client() {
  const db = getSupabaseClient();
  if (!db) throw new Error('Sign in to record a field inspection.');
  return db;
}

export async function listBannerInspections(bannerId: string): Promise<BannerInspection[]> {
  const { data, error } = await client().from('banner_inspections')
    .select('id,banner_id,inspector_id,observed_condition,finding,photo_path,observed_lat,observed_lng,gps_accuracy_m,recorded_at,inspector:profiles!inspector_id(name)')
    .eq('banner_id', bannerId).order('recorded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as BannerInspection[];
}

export async function viewInspectionPhoto(path: string): Promise<string> {
  const { data, error } = await client().storage.from('banner-inspections').createSignedUrl(path, 120);
  if (error || !data?.signedUrl) throw error ?? new Error('The inspection photo is unavailable.');
  return data.signedUrl;
}

export interface InspectionDraft {
  id: string;
  bannerId: string;
  condition: BannerStatus;
  finding: string;
  file: File;
  position: { lat: number; lng: number; accuracy: number } | null;
}

export async function submitBannerInspection(draft: InspectionDraft): Promise<void> {
  const db = client();
  const { data: userResult, error: authError } = await db.auth.getUser();
  if (authError || !userResult.user) throw new Error('Sign in again to record an inspection.');
  const inspectorId = userResult.user.id;
  const path = `${inspectorId}/${draft.id}.webp`;
  const { data: existing, error: existingError } = await db.from('banner_inspections')
    .select('id').eq('id', draft.id).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return;

  const dataUri = await resizeImageToDataUri(draft.file, 1400, 1400, 0.82);
  const blob = await resizeImageToWebpBlob(dataUri, 1400, 0.75);
  if (blob.size > 5 * 1024 * 1024) throw new Error('Photo is too large after resizing. Choose another image.');
  const { error: uploadError } = await db.storage.from('banner-inspections')
    .upload(path, blob, { contentType: 'image/webp', upsert: false });
  // A previous attempt can have uploaded the photo before losing its database response.
  if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw uploadError;

  const { error: insertError } = await db.from('banner_inspections').insert({
    id: draft.id, banner_id: draft.bannerId, inspector_id: inspectorId,
    observed_condition: draft.condition, finding: draft.finding.trim(), photo_path: path,
    observed_lat: draft.position?.lat ?? null, observed_lng: draft.position?.lng ?? null,
    gps_accuracy_m: draft.position?.accuracy ?? null,
  });
  if (insertError) {
    const { data: afterError } = await db.from('banner_inspections').select('id').eq('id', draft.id).maybeSingle();
    if (!afterError) throw insertError;
  }
}

