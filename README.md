# PEP Landbank Sales Portal

Live at: https://awaheedasamei5-ai.github.io/pep-landbank-portal/

## How deployment works

This site is served by **GitHub Pages**, configured to deploy from the `main` branch (Settings → Pages in the GitHub repo). Any push to `main` redeploys the live site automatically within about a minute — no separate build step, no third-party host involved.

Day-to-day work happens on the `redesign` branch, then merges into `main` when ready to ship:
```
git checkout redesign
git add .
git commit -m "..."
git push origin redesign
git checkout main
git merge redesign --no-edit
git push origin main
git checkout redesign
```

## Supabase

Connected and live — database changes are applied directly to the project (`lrahgcnftetnyxunaljs`). The `supabase_migrations/` folder in this repo is a version-controlled record of schema changes.

## Native app (Android)

`capacitor.config.json` points the installed Android app at the same GitHub Pages URL above, so the native shell and the website always run identical code with no separate mobile build to maintain.
