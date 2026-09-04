// Best-effort browser geolocation -- never blocks a sign-in/out action.
// Resolves to undefined (not a rejection) on missing API, denied
// permission, or timeout, so callers never need a try/catch just to
// proceed without coordinates. accuracy (meters) is included per Master
// Spec 11.1's "capture coordinates + accuracy" -- stored but not yet
// used to gate anything (a low-accuracy fix still gets a real reading,
// not a blocked sign-in).
export function getCurrentPosition(timeoutMs = 5000): Promise<{ lat: number; lng: number; accuracy: number } | undefined> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(undefined);
      return;
    }
    const timer = setTimeout(() => resolve(undefined), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
      { timeout: timeoutMs },
    );
  });
}

// Port of index.html's haversineMeters (index.html:4743) -- great-circle
// distance in meters, used to compare a sign-in/out location against the
// configured office coordinates + radius.
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
