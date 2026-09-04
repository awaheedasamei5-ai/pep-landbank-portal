// Registers sw.js (public/sw.js) -- see that file's own header for what
// it actually does (push receipt + minimal app-shell cache). Silent no-op
// in any environment without real support (SSR doesn't apply here, but a
// bare fetch-preview iframe or an old browser shouldn't throw and break
// the rest of app boot over a progressive-enhancement feature).
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failure (e.g. served over plain http in a dev
      // preview) must never block the app itself from loading.
    });
  });
}
