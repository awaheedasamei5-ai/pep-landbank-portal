// Best-effort browser geolocation -- never blocks a sign-in/out action.
// Resolves to undefined (not a rejection) on missing API, denied
// permission, or timeout, so callers never need a try/catch just to
// proceed without coordinates.
export function getCurrentPosition(timeoutMs = 5000): Promise<{ lat: number; lng: number } | undefined> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(undefined);
      return;
    }
    const timer = setTimeout(() => resolve(undefined), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
      { timeout: timeoutMs },
    );
  });
}
