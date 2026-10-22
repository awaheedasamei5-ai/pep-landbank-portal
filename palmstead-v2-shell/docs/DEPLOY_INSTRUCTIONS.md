# Deploy Instructions — V2 Only, Never V1

Read this before running any deploy command, every time. Getting this wrong doesn't just break something in a test environment — it's an immediate, live change to what real staff use every day.

## Current Git deployment configuration — verified 2026-10-22

The user authorized connecting Vercel to GitHub. The Vercel project API now confirms `awaheedasamei5-ai/pep-landbank-portal`, production branch `rebuild`, root directory `palmstead-v2-shell`, project `prj_gY7vGFLflbYScHn6Z6eirvVVJ1wQ`, owner `dnm-garments`.

**Pushing `rebuild` now triggers a V2 production deployment.** The older statements below that a rebuild push is source-only and that manual CLI deployment is the only V2 release path are historical and superseded by this verified configuration. Finish slice verification before pushing. After the push, inspect the exact commit's deployment, wait for READY, and verify the production alias with a fresh browser context. Use the manual command only when a separate deliberate release is necessary; avoid duplicate deployments of the same commit. Never push or merge to `main`.

The Vercel connector's team-scope authorization is separate from CLI login and Git deployment. If the connector returns 403, use the explicitly scoped authorized CLI. Do not change the project or Git connection to repair an expired CLI login.

## The two deploy targets, and why they must never cross

| | V1 (real production) | V2 (`palmstead-v2-shell`) |
|---|---|---|
| **Where it lives** | `main` branch, repo root (`index.html`) | `rebuild` branch, `palmstead-v2-shell/` folder |
| **How it deploys** | **Automatically, on every single push to `main`** — GitHub Pages rebuilds and goes live with no confirmation step, no delay | Manually, only when the command below is run |
| **Live URL** | `https://awaheedasamei5-ai.github.io/pep-landbank-portal/` | `https://palmstead-v2-shell.vercel.app` |
| **Real users** | Yes — staff use this one daily | No — this is the project being built |

**The single most dangerous mistake possible in this repo: pushing anything to the `main` branch.** There is no "are you sure?" step on GitHub's side — a push to `main` is a live production deploy of V1, instantly. This applies even to something that looks harmless, like a merge, a rebase, or `git push origin HEAD:main`.

## Absolute rules

1. **Never run any git command that writes to `main`.** No `git checkout main` followed by edits, no `git merge rebuild` while on `main`, no `git push origin <anything>:main`. If a task ever seems to require touching `main`, stop and ask the user first — it almost certainly doesn't.
2. **Stay on the `rebuild` branch for all V2 work**, and push there: `git push origin rebuild`. This is safe and routine — it does not deploy anything live, it only updates the branch.
3. **The only command that actually deploys V2 live** is run from inside `palmstead-v2-shell/`:
   ```bash
   cd palmstead-v2-shell
   npx vercel deploy --prod --yes --scope dnm-garments
   ```
   This deploys to `https://palmstead-v2-shell.vercel.app` — the Vercel project already linked to this folder. It does not touch GitHub Pages, `main`, or V1 in any way.
4. **Only deploy after a slice is actually verified working** (typecheck clean, tested live in the browser against real test data) — per the standing rule in `CONTINUE_HERE.md`. Routine `git push origin rebuild` commits do not require a deploy every time; deploy when a meaningful, tested piece of work is ready to be seen.
5. **After deploying, hard-reload before declaring it verified**: open `https://palmstead-v2-shell.vercel.app` and run `location.reload(true)` (or a hard refresh) — a stale CDN/browser cache can show the old version and give a false "it's not there" result.
6. **If anything goes wrong or looks uncertain, stop and ask the user before running any deploy or any git command touching `main`.** This is not a case where "try it and see" is acceptable — a wrong guess here is a live change to a system real people depend on.

## Quick self-check before deploying

- [ ] Am I inside `palmstead-v2-shell/`, not the repo root?
- [ ] Is my current branch `rebuild`, not `main`? (`git branch --show-current`)
- [ ] Did I run `npx vercel deploy --prod --yes --scope dnm-garments` — not any GitHub Pages–related command, not a push to `main`?
- [ ] After deploying, did I hard-reload the live Vercel URL to actually confirm it, rather than assume it worked?

If any answer is "no" or "not sure," stop before running the deploy.
