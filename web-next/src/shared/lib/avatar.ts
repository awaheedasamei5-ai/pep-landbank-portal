export const AVATAR_TONES = ['accent', 'info', 'success', 'warn', 'danger'] as const;
export type AvatarTone = (typeof AVATAR_TONES)[number];

// Deterministic per-person color so the same colleague always gets the
// same avatar tone everywhere they appear, cycling through the app's
// existing 5 semantic tones rather than inventing a new palette.
export function avatarTone(name: string): AvatarTone {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 997;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}
