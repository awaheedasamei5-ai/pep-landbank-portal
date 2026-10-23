# Smart Insights — build plan (palmstead-v2-shell)

First of 7 apps in the new "Insights" build order (`Smart Insights → Data Check → Document Vault → My Portfolio → Commission → Analytics → Leaderboard`; `Operations reports` is excluded, it already has a real page). Full research pass (production parity, prior memory, `web-next/` reference, external design/engineering research) completed before writing this.

## 0. This is a real v1 port, not a new invention

Real v1 feature, confirmed live at `index.html:9484-9954` (`getInsightLists()`/`computeSmartInsights()`), sidebar label `'Smart Insights':'Personalized nudges and performance insights'`. `web-next/src/features/smart-insights/` already has a **correct** logic layer (`lib/smartInsightsLogic.ts`, `hooks/useSmartInsights.ts`) — every rule in it is traced to the real v1 line numbers in its own comments, and one real v1 bug (`followDate` checked against a column that doesn't exist on `leads` — confirmed via `information_schema.columns`) was already correctly dropped rather than carried forward. Its **UI** (`screens/*.module.css`) is the generic flat-card-grid pattern this project's own standing rules reject, and conspicuously does *not* implement the "very animated futuristic way" styling the user explicitly asked for when this exact feature (nudge panel linked to Smart Insights) was scoped on 2026-08-21 (`feedback-companion-scoping` memory) — so the UI gets rebuilt natively here; the logic gets ported close to verbatim, same precedent as Attendance/Leave.

**Confirmed already live in this shell, zero new backend work needed**: `leads`/`payments` tables and their full RLS scoping, `ds.leads.listAll()/listForAgent()`, `ds.payments.listAll()/listForAgent()`, `linearForecastNextMonth()` (`shared/lib/forecast.ts`), `daysSince()/shiftMonth()/monthKey()` (`shared/lib/format.ts`), and the real `Lead` fields the rules read (`nextAction`, `priority`, `lastModifiedAt`, `amtPaid`, `grandTotal`, `stage`). This app is a pure UI build on top of already-correct, already-live logic and data.

## 1. Database

None. No new table, no new column. `leads.last_modified_at` (trigger-maintained, bumped on stage/payment/doc-stage/tag/next-action edits) already exists and is what "going cold" keys off.

## 2. Security

Reuses `leads`/`payments`' existing real RLS exactly as-is: a manager/elizabeth-class role sees company-wide, every other staff role sees only their own (`agent_key = my_key()`), already enforced at the Postgres level — this screen adds no new access surface, just reads through the same `ds.leads`/`ds.payments` methods every other screen already uses.

## 3. AI touchpoints

**Explicitly none** — standing decision (`feedback-companion-scoping`, re-confirmed 2026-08-21, never rescinded): this feature was deliberately scoped as rule-based specifically to avoid an LLM API cost/key dependency for what is fundamentally a deterministic data query. Reusing an existing `ai-insights` Edge Function kind for narration here (the way `manager_daily_briefing` phrases the dashboard's numbers) was considered and rejected for this app, since the whole point of Smart Insights is instant, config-free, always-on nudges — not a 1-2s network round trip for a sentence a plain, well-written string already covers.

## 4. UI — full page architecture

Two real routes (overview + drill-down), not a single scrolling page, matching this project's own page-count convention for a feature this size (compare Attendance's own multi-page split):

```
/dashboard/smart-insights           The real destination (reachable from the sidebar "Insights" group
                                     and, later, from a Home/Manager-Home preview card once that's
                                     touched) -- every insight computed fresh on open, grouped by tone
                                     (danger first, then warn, then ok/momentum/forecast), each a real
                                     animated card, not a flat tile.
/dashboard/smart-insights/[kind]    Drill-down for the 4 lead-list kinds (cold / nearTrigger /
                                     readyForAllocation / stalledHigh) -- the real affected leads, each
                                     row linking out to its real Pipeline Detail page. Momentum/forecast
                                     insights have no drill-down (nothing to list), their cards aren't
                                     clickable, matching web-next's own `disabled={!i.kind}` precedent.
```

**Design direction** (per `feedback-companion-scoping`'s explicit "very animated futuristic way," and `feedback-go-beyond-brief`'s standing rule that this extends to visual ambition even on admittedly small features): staggered entrance (each card fades/slides in with an incremental delay, not all at once), a tone-colored glow/pulse on `danger` cards specifically (these are the ones that most need to grab attention — `warn`/`ok` stay calmer), and a subtle animated border treatment on the headline "needs attention now" card if one exists. No animation library dependency added (AGENTS.md's "avoid unnecessary dependencies," and nothing here needs spring physics) — built with Tailwind's `animate-*` utilities plus a small set of scoped `@keyframes` for the glow-pulse/conic-border effects, the same way this shell already handles motion elsewhere (page-transition module). The `animate` skill gets invoked when actually building this, not guessed from first principles.

Zero-insight state is real and handled (`'clean'` key in the ported logic) — "pipeline looks healthy" with a calm, confident design, not an apologetic empty state.

## 5. Porting approach

1. Port `smartInsightsLogic.ts` and `useSmartInsights.ts` into `palmstead-v2-shell/src/webnext/features/smart-insights/{lib,hooks}/` near-verbatim — the logic is already correct and already traced to real v1 behavior; only change is import-path adjustment to this shell's real module layout (confirmed identical: `shared/lib/format`, `shared/lib/forecast`, `types/domain`, `data/source`, `auth/useSessionStore` all already exist here in the same shape).
2. Build both screens fresh as native shadcn components (`Card`, `Badge`, lucide icons replacing web-next's own `Icon` component, `PageHeader`) — no CSS modules, no copied JSX.
3. Add the route to `sidebar-items.ts` (swap `NOT_BUILT_YET` for the real `/dashboard/smart-insights` URL) only once the page is built and verified, not before — an app should never appear in navigation before it actually works.

## 6. QA — do not mark done without exercising it live

Log in as a real staff test account with real cold/near-trigger/ready-for-allocation/stalled leads already in the pipeline (confirmed several exist from this session's own earlier work and prior sessions' real data) and confirm: every card's count matches a direct SQL count against the same real rule; the momentum/forecast cards' math matches a hand-computed check against real approved payments for the last 3 months; a manager sees company-wide counts, a non-manager staff member sees only their own; drill-down lists the real affected leads and "Update this lead" lands on the real Pipeline Detail page; the zero-insight state renders correctly for an account with nothing flagged. Verify on both a manager and a non-manager real login — the scope split is the one thing most likely to silently break.
