import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Absolute base path -- a relative ('./') base breaks on any hard
  // refresh/direct navigation to a nested client-side route (e.g.
  // /app/sales): the built index.html's relative asset URLs resolve
  // against the CURRENT path depth, not the site root, so a deep route's
  // index.html requests assets from the wrong directory and 404s, leaving
  // React never mounted (caught by the Playwright navigation smoke test).
  // '/' is correct for a root-mounted deployment; if the eventual GitHub
  // Pages mount path turns out to be a subpath (e.g. project pages without
  // a custom domain), change this to that subpath ('/repo-name/') --
  // still absolute, never relative, for the same reason.
  base: '/',
})
