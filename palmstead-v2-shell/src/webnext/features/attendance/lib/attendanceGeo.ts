// V1's real logic (pep-landbank-portal, main branch), preserved exactly
// as business rules -- no UI/architecture borrowed from V1, per the
// governing plan. haversineMeters is V1's own great-circle distance
// function; matchOfficeLocation and computeLateness are the same real
// geofence/lateness decisions V1 makes, just written as pure, testable
// functions instead of inline script logic.
import type { OfficeLocation, AttendancePolicy } from '../../../types/domain';

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface OfficeMatch {
  isAtOffice: boolean;
  matchedOffice: OfficeLocation | null;
  nearestDistanceMeters: number | null;
}

// Checks every active real office location's own real radius -- not one
// hardcoded point, and not an approximate lat/lng degree threshold
// (which distorts badly away from the equator) -- a real haversine
// distance against each office's own configured radius_meters.
export function matchOfficeLocation(lat: number, lng: number, offices: OfficeLocation[]): OfficeMatch {
  const active = offices.filter((o) => o.isActive);
  if (!active.length) return { isAtOffice: false, matchedOffice: null, nearestDistanceMeters: null };
  let nearest: OfficeLocation | null = null;
  let nearestDist = Infinity;
  for (const office of active) {
    const dist = haversineMeters(lat, lng, office.lat, office.lng);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = office;
    }
  }
  const isAtOffice = !!nearest && nearestDist <= nearest.radiusMeters;
  return { isAtOffice, matchedOffice: isAtOffice ? nearest : null, nearestDistanceMeters: Number.isFinite(nearestDist) ? nearestDist : null };
}

// V1's real cutoff rule: sign-in after work_start_time + grace_minutes
// is late. Compares by minutes-since-midnight so it's timezone-neutral
// as long as both the punch time and the policy are read in the same
// local time, matching V1's own plain string-compare approach's intent
// without its DST/format fragility.
export function computeLateness(signInAt: Date, policy: AttendancePolicy | null): boolean {
  if (!policy) return false;
  const [sh, sm] = policy.workStartTime.split(':').map(Number);
  const startMinutes = sh * 60 + sm + policy.graceMinutes;
  const punchMinutes = signInAt.getHours() * 60 + signInAt.getMinutes();
  return punchMinutes > startMinutes;
}

export function isConfiguredWorkday(date: Date, policy: AttendancePolicy | null): boolean {
  if (!policy) return date.getDay() >= 1 && date.getDay() <= 5;
  return policy.workDays.includes(date.getDay());
}
