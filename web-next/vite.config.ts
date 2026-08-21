import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths -- final mount path under GitHub Pages isn't decided
  // yet, and this matches the ./-relative convention already used by the
  // existing sw.js/manifest.webmanifest/index.html in this repo.
  base: './',
})
