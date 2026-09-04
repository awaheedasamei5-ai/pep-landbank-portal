// Client-side Web Push subscribe flow -- ported faithfully from index.html's
// working implementation (5785-5839), not redesigned. The send side already
// works in production (send-push/send-todo-alarms Edge Functions already
// read push_subscriptions and call the browser's push service via the
// `web-push` npm package) -- this is purely the missing receive-side half:
// ask permission, create a PushManager subscription, save it so the server
// side has somewhere real to send to.
//
// VAPID public key is safe to ship client-side by design (that's the whole
// point of the VAPID key *pair* -- only the private half, held server-side
// as an Edge Function secret, can actually sign a push). Real key, matches
// index.html and the send-push Edge Function's configured key exactly.
const VAPID_PUBLIC_KEY = 'BIq6wxllWznavANX6oLlTib1wsP4hwrc5WT0YSjJqtkNjPnspz-t4O5DphHO-pEXNxgnfSenw54HP5kl3eToEQI';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export type PushSupportState = 'unsupported' | 'denied' | 'default' | 'granted';

export function getPushSupportState(): PushSupportState {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

// Returns the raw subscription fields ready to hand to
// DataSource.pushSubscriptions.save() -- throws on denial/failure so the
// calling hook's mutation can surface a real error rather than silently
// doing nothing (this is a user-initiated "Enable" tap, not a background
// best-effort call, so silent failure would be confusing here).
export async function subscribeWebPush(): Promise<{ endpoint: string; p256dh: string; auth: string }> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported on this device/browser.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  }
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) throw new Error('Push subscription was created without the expected keys.');
  return { endpoint: json.endpoint, p256dh, auth };
}
