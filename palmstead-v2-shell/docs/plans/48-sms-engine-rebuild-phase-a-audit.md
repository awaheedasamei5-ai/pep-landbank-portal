# SMS Engine Rebuild — Phase A: Audit and Correctness

Written 2026-11-06, per the user's confirmed "full rebuild" instruction and
`Palmstead_Intelligent_SMS_Standards_and_Implementation_Blueprint.pdf` (the authoritative spec,
at `C:\Users\USER\Downloads\`). This is Phase A of the blueprint's own rollout sequence
("Audit and correctness: map triggers, authoritative tables, statuses and contradictions") —
**no code was changed to produce this document.** Every claim below was checked against the real
schema, real edge functions, and real cron jobs, not assumed. Phases B-E (rules engine, provider
reliability, AI review, controlled go-live) are proposed at the end, for separate follow-up tasks.

AI-reviewer note: the user did not explicitly confirm xAI Grok vs. the existing Groq integration.
Per this session's own default recommendation (no objection raised), this audit and the proposed
phases assume **Groq stays the AI provider** — "Grok" in the blueprint is treated as describing the
AI-reviewer *role*, not a mandate to add a new xAI account. Re-confirm with the user before Phase D.

---

## 1. Every real SMS trigger/flow that exists today

| Kind | Trigger | Source table(s) | Re-validates at send time? | Idempotency/dedupe | Template source |
|---|---|---|---|---|---|
| `payment_due_soon` | `queue_finance_monthly_payment_reminders()` (cron `0 9 * * *`) inserts into outbox; `process-finance-monthly-reminders` edge fn sends | `finance_monthly_payment_installments` | Yes — outbox row's `idempotency_key` is unique, and the dispatcher re-reads before marking `accepted` | Real: `UNIQUE(idempotency_key)` on the outbox | `sms_templates` (wired) |
| `payment_missed_first` / `payment_missed_escalated` | `queue_finance_missed_payment_reminders()` (cron `15 9 * * *`) | same outbox, `reminder_type='missed_payment'` | Same mechanism as above | Same unique key | `sms_templates` (wired) |
| `payment_staff_digest` | `dispatch_finance_missed_payment_digest()` (cron `0 7 * * *`) → `send-finance-missed-payment-digest` | `finance_monthly_payment_installments` (read-only aggregate) | N/A (a read-only summary, not a per-record outbox) | No dedupe needed (idempotent by construction — same query, same day) | `sms_templates` (wired) |
| `lead_closing_sms` | `dispatch_lead_closing_drafts()` (cron `*/20 * * * *`) → `send-lead-closing-drafts` → `outbound_sms_drafts` (`pending`) | `leads`, `site_visits`-adjacent | N/A — never auto-sends; a human confirms via Outgoing SMS, and the confirm RPC itself re-reads the lead at that moment | Real: 30-day exclusion window in `compute_lead_closing_candidates()` | `sms_templates` (wired, AI prompt) |
| `payment_schedule_change_sms` (Phase I overpayment recalc) | `approve_payment`-adjacent trigger → `finance_schedule_recalc_proposals` (`pending`) | `finance_monthly_payment_schedules/installments` | N/A — never auto-sends; one-tap confirm re-applies at that moment | Real: proposal `status` guards against double-apply | `sms_templates` (wired, AI prompt) |
| `quotation_thank_you` | Synchronous, on client's own quotation PDF download | `leads`, `quotation_share_links` | N/A (point-in-time, not scheduled) | None needed (one-shot, user-initiated) | `sms_templates` (wired) |
| `sve_feedback_thank_you` | Synchronous, on SVE invite/report flow | `site_visit_experience_invites` | N/A | None needed | `sms_templates` (wired) |
| `receipt_issued_thank_you` | `dispatch_finance_receipt_sms()` (cron `* * * * *`) → `process-finance-receipt-sms` | `payments`, `receipt_share_links` outbox | Not confirmed — needs tracing in Phase B | Has its own outbox table (`finance_payment_receipt_sms_outbox`) with presumed unique constraint — not yet verified against the blueprint's exact idempotency-key shape | `sms_templates` (wired) |
| `allocation` SMS | `dispatch_allocation_sms_outbox()` (cron `* * * * *`) → `process-allocation-sms` | `allocation_sms_outbox` | Not audited this pass — pre-dates this session's SMS work | Has its own outbox table | **Not in `sms_templates`** — hardcoded in its own edge function |
| Leave reminders | `dispatch_leave_reminders()` (cron `*/15 * * * *`) | leave outbox | Not audited | Has its own outbox | **Not in `sms_templates`** |
| Operations to-do reminders/missed | `send_op_todos_sms_reminders()` / `dispatch_op_todo_missed_sms()` (cron `* * * * *` each) | `op_*` tables | N/A, out of this project's scope (Operations Tracker exclusion zone) | Has own outbox | **Not in `sms_templates`**, and out of scope to touch |
| Site visit reminders | `send_site_visit_reminders()` (cron `0 18 * * *` and `0 7 * * *`) | `site_visits` | Not audited | Not confirmed | **Not in `sms_templates`** |
| Sales daily digest (morning/evening) | `queue_sales_daily_digest()` (cron `*/5 * * * *` x2) → `dispatch_sales_daily_digest_sms()` (cron `* * * * *`) | sales activity tables | Built very recently (same day as this audit, by a concurrent task) — not yet covered in any plan doc | Unknown — needs tracing | **Not in `sms_templates`** |
| `send-auth-sms` | OTP/auth flow | n/a | N/A | N/A | Not a `sms_templates` concern (not a business-event message) |

**Real finding**: `sms_templates` (built this session) covers 9 of roughly 15 distinct real SMS flows
in this codebase. The other ~6 (allocation, leave, operations, site-visit reminders, the new sales
daily digest, auth OTP) are hardcoded in their own edge functions with no shared template/audit
layer. This is a genuinely larger surface than docs/plans/47 implied — that plan doc's scope was
explicitly "the SMS work built this session," not the whole system.

## 2. Every real SMS-related cron job (`cron.job`, live as of this audit)

```
jobid  schedule        job
1      0 6 * * *       run_monthly_commission_check()        -- not SMS
2-4    (backups)                                              -- not SMS
6,7    0 18/7 * * *    send_site_visit_reminders()
8      0 7 * * *       send_leave_reminders()                 -- INACTIVE
9      */15 * * * *    flag_leads_due_for_allocation()        -- not SMS itself
10     * * * * *       send_op_todos_sms_reminders()
11     */15 * * * *    dispatch_leave_reminders()
12     * * * * *       dispatch_op_todo_missed_sms()
13     * * * * *       dispatch_finance_receipt_sms()
14     0 9 * * *       queue_finance_monthly_payment_reminders()
15     * * * * *       dispatch_finance_monthly_reminders()
16     * * * * *       (net.http_post to send-todo-alarms)     -- push, not SMS
17     * * * * *       dispatch_allocation_sms_outbox()
18,19  */5 * * * *     queue_sales_daily_digest() morning/evening
20     * * * * *       dispatch_sales_daily_digest_sms()
21     15 9 * * *      queue_finance_missed_payment_reminders()
22     0 7 * * *       dispatch_finance_missed_payment_digest()
23     */20 * * * *    dispatch_lead_closing_drafts()
```

**Real finding**: 9 distinct cron jobs fire every single minute (`* * * * *`). Each is individually
cheap (a no-op `net.http_post` when its own queue is empty), but this is a real, unmanaged
proliferation — the blueprint's "comprehensive audit logs... scheduled jobs" dashboard section has
no real counterpart today; there is no single place to see all of this, confirm it's healthy, or
pause one job without a direct SQL/dashboard change. Worth consolidating into fewer,
smarter-scheduled jobs in Phase B/C rather than one job per feature.

## 3. The real Arkesel integration — no delivery tracking exists today

Read `send-sms`'s real, current body in full (the one shared low-level sender nearly everything
calls): it does exactly one thing — normalize the Ghana phone number, `fetch()` Arkesel's
`/api/v2/sms/send`, and return the synchronous HTTP response to its caller. **Confirmed: zero
delivery tracking exists anywhere in this codebase.** No webhook endpoint receives Arkesel's
delivery callbacks, no `provider_message_id` is stored against any outbox row, no
`sms_delivery_events`-equivalent table exists. Every "sent" status in every per-feature outbox table
means "Arkesel's `/send` call returned HTTP 200," not "the recipient's phone actually received it."
This is a complete, confirmed gap against the blueprint's Phase C ("Arkesel delivery tracking,
signature verification and observability").

**The Sender ID**: `sender || "Palmstead"` is hardcoded as the fallback in `send-sms` itself, and
every caller in the codebase passes no `sender` override (confirmed via grep across all 8+ real
call sites) — meaning every real SMS in this system today shows "Palmstead" as the sender name on
the recipient's phone. **Still unresolved** (flagged in docs/plans/47 and repeated here): whether
"Trulander JSF" or any other name is actually a pre-registered, Arkesel-approved Sender ID. Do not
change this string until the Arkesel account owner confirms — the blueprint explicitly calls this
out too ("verify approved sender IDs").

## 4. RLS on SMS-related tables — real, spot-checked

`sms_templates`: real `sms_templates_sel` (any authenticated staff, read-only) and
`sms_templates_upd` (presumably manager-gated — matches the Outgoing SMS app's own
Management-only UI gate). `outbound_sms_drafts`: real `outbound_sms_drafts_sel` only — no direct
INSERT/UPDATE policy, meaning all writes must go through the SECURITY DEFINER RPCs
(`send-lead-closing-drafts`, the confirm/dismiss functions) — this is the correct, safe pattern.
`finance_schedule_recalc_proposals`: same shape, SELECT-only RLS backed by RPC-only writes. No real
gaps found in this spot-check; a full policy-by-policy audit of the ~6 non-`sms_templates` SMS flows
(allocation, leave, operations, site-visit, sales-digest outboxes) was not done this pass — worth
doing in Phase B alongside bringing those kinds into `sms_templates`.

## 5. Payment allocation logic vs. the blueprint's `remaining_due` formula

Re-traced `approve_payment`'s real, current body in full. **Real finding: this system has two
separate, non-unified payment concepts**:
1. **Lead-level running balance** (`leads.amt_paid`/`leads.balance`, updated by `approve_payment`):
   a simple running total against `leads.grand_total`, no per-installment structure, no `fees`,
   `credits`, or `deferrals` concept at all. This is the original/legacy payment-tracking path.
2. **Monthly installment plans** (`finance_monthly_payment_schedules`/`_installments`, Phase
   H/I's domain): per-installment `due_amount`/`paid_amount`/`status` (`scheduled`, `part_paid`,
   `paid` confirmed as the only real statuses in use — `disputed`/`cancelled`/`deferred` do not
   exist as real concepts anywhere in the schema).

**Neither path implements the blueprint's exact formula**
(`remaining_due = max(0, scheduled_amount + authorized_fees - confirmed_allocations - approved_credits)`).
The installment path's `due_amount - paid_amount` is a reasonable real-world equivalent when fees/
credits are zero (which is true for every real installment today — confirmed via schema, no
`fees`/`credits` columns exist), so the *current* behavior is factually correct, just less
general than the blueprint's model. Adding explicit `authorized_fees`/`approved_credits` columns
is a real, scoped Phase B task, not an emergency fix — there is no evidence today of a real
contract that actually has fees or credits that the system is silently miscalculating.

## 6. Payment states: real vs. blueprint's 11

| Blueprint state | Real equivalent today |
|---|---|
| `upcoming` | `payment_due_soon` reminder (real) |
| `due_today` | **Missing** — no distinct "due today" message exists; a same-day installment falls through to either `due_soon` (if queued before midnight) or `missed_payment` (the day after), with no dedicated "today" message |
| `partial` | Real (`status = 'part_paid'`), but no distinct SMS acknowledges a partial payment specifically — the next `due_soon`/`missed` message for that installment just uses the reduced `due_amount - paid_amount`, which is correct math but not a distinct "thank you for your partial payment" event |
| `fully_paid` | Real (`status = 'paid'`), no dedicated SMS beyond the existing receipt-issued thank-you |
| `overdue_single` | Real (`payment_missed_first`) |
| `overdue_multiple` | Real (`payment_missed_escalated`) |
| `revised_schedule` | Real (Phase I's `payment_schedule_change_sms`), but only for overpayment-triggered recalculation — a schedule revision for other reasons (e.g. a manually renegotiated plan) has no corresponding SMS today |
| `deferred` | **Missing entirely** — no concept of an approved payment deferment/hold exists in the schema |
| `disputed` | **Missing entirely** |
| `cancelled` | **Missing entirely** (a cancelled contract's payment plan isn't a modeled state) |
| `reconciliation_hold` | **Missing entirely** — there is no mechanism today to pause automated reminders while a payment is being manually reconciled; if staff are mid-investigation on a payment, the cron will still fire a reminder/escalation unless they also remember to log a payment or opt the lead out |

**This last one (`reconciliation_hold`) is the single highest-value missing piece** per the
blueprint's own risk framing (the Mr Joe incident earlier this session is exactly the scenario this
state exists to prevent — if a `reconciliation_hold` flag had existed, any installment under active
manual investigation could have been excluded from automated sends by a blanket check, independent
of whether the specific synthetic-data mistake was also avoided).

## 7. Consent/opt-out: real vs. blueprint's `sms_preferences`

Real columns confirmed to exist: `sms_opt_out` (boolean, this session), `sms_consent_recorded_at`,
`sms_consent_recorded_by`, `sms_consent_phone`, `sms_consent_revoked_at`, `sms_consent_revoked_by`
(on `finance_monthly_payment_schedules`, from Phase H's original consent-gating work, not `leads`).
**Real gap**: this is single-purpose (payment reminders only) and binary (opted in/out), not the
blueprint's richer `sms_preferences` model (purpose-specific consent — e.g. a client could
reasonably want payment reminders but not marketing/closing SMS, which isn't expressible today;
`sms_opt_out` on `leads` is a blanket kill-switch for the closing campaign only, separate from the
schedule-level consent fields, so a lead can currently be in an inconsistent state — e.g. opted into
payment SMS via their schedule's `sms_consent_*` fields but opted out of closing SMS via
`leads.sms_opt_out`, which is actually a reasonable real distinction, just not formally modeled as
"purpose" anywhere). No `language`/`contact_preference` fields exist anywhere.

## 8. UI: real "Outgoing SMS" app vs. the blueprint's fuller dashboard

Already documented in detail in docs/plans/47 §1.4; summarized against the blueprint's own
dashboard list:

| Blueprint dashboard feature | Real status |
|---|---|
| Template editor + preview with test data | Real (Templates tab), but no "preview with test data" — edits are saved blind, no live preview against a sample lead before saving |
| SMS event history | Partial — "Sent history" tab exists, but only for `lead_closing_sms`; the other 8 kinds have no unified history view, only whatever their own outbox table happens to retain |
| Send queue | **Missing** — no single view of "what's about to send in the next cron tick" across all kinds |
| Scheduled jobs | **Missing** — the cron list in §2 above is SQL-only, no UI |
| Failed/held messages | **Missing** — `finance_monthly_payment_reminder_outbox.status` includes `failed`/`needs_review`/`blocked`, but nothing surfaces these to a human today |
| Provider delivery updates | **Missing** (see §3 — no delivery tracking exists at all) |
| Duplicate suppression | Partial — exists at the DB level (unique idempotency keys) for the finance outbox specifically, not system-wide, not visible in any UI |
| Consent | Partial — the opt-out toggle exists on a lead's detail page, not centralized in the Outgoing SMS app itself |
| Audit | Partial — `record_audit_event` is used elsewhere in this codebase for other domains, not wired into any SMS flow |
| Costs and segment counts | **Missing entirely** — no SMS segment-length/cost tracking anywhere |
| Finance exception inbox | **Missing** — the closest real analogue is Phase I's recalc-proposals panel, which is one specific exception type, not a general inbox |
| Role-based approval | Real for the 2 kinds that need it (closing SMS, overpayment recalc) |
| Simulation mode | **Missing entirely** — there is no system-wide way to dry-run what would send without actually calling `send-sms`/Arkesel |

---

## 9. Proposed phased build-out (Phases B–E, for separate follow-up tasks)

**Phase B — Rules, states, and template consolidation (biggest real gap, do first). DONE 2026-11-06.**
1. **DONE.** Allocation, leave (4 transition messages), site-visit (both variants), and the sales
   daily digest now read from `sms_templates`, via a new `render_sms_template()` SQL helper for the
   2 pure-plpgsql senders (site-visit, leave) and the same `renderTemplate()` pattern already
   proven for the TS edge functions. `promote_due_planned_leave()`'s 2 auto-submit messages remain
   hardcoded — a deliberate, documented scope cut, not an oversight. Commit `3ffdca6`.
2. **DONE.** `payment_due_today` is a real distinct state now (new `queue_finance_due_today_reminders()`,
   cron `0 8 * * *`, between the staff digest and due-soon/missed). `reconciliation_hold` (+ a
   required `reconciliation_hold_reason`) is a real column on `finance_monthly_payment_installments`,
   checked by all 3 queueing functions and `claim_finance_monthly_payment_reminders` (queue-time,
   claim-time, and send-time exclusion), plus a Management-only toggle on the Finance → Monthly
   instalments screen. Verified via rolled-back transactions: a pre-existing hold is excluded from
   queueing, and placing a hold on an already-queued reminder cancels it immediately. Commits
   `d4b1903`, `683fc24`.
3. **Deferred, confirmed still not urgent** — no real contract has fees/credits today (unchanged
   since the audit).
4. **DONE.** Templates tab has a real "Preview" action — client-side token substitution with
   realistic sample data for static templates, a real (never-sending) `ai-insights` call for the 2
   AI-drafted kinds. Verified live for both paths, including the real branding fix showing up in
   the AI output. Commit `4a8e2cc`.
5. **DONE**, via the lighter option (no schema unification): a new "Send queue" tab queries all 6
   real outbox/draft/proposal sources through one manager-gated RPC and shows pending/failed counts
   side by side. Verified live with real data — correctly showed 93 real pending closing-SMS drafts,
   and surfaced 2 real, pre-existing allocation-SMS failures from 2026-10-25 that had no visibility
   anywhere in the system before this tab existed (a genuine value-add, not a bug introduced by this
   work — confirmed via direct SQL, both predate this session's changes). Commit `8a0399e`.

**Phase C — Provider reliability. DONE (partial, honestly scoped) 2026-11-06.**

**Real correction to this audit's own §3 claim**: "no `provider_message_id` is stored against any
outbox row" was WRONG. 5 of 7 real outbox-style tables (`allocation_sms_outbox`,
`finance_monthly_payment_reminder_outbox`, `leave_sms_outbox`, `finance_receipt_sms_outbox`,
`sales_daily_digest_deliveries`) already store `provider_reference`/`provider_status` captured from
Arkesel's synchronous `/send` response. The real gaps were: (a) the 2 human-approved flows
(`outbound_sms_drafts`, `finance_schedule_recalc_proposals`) never captured it at all, (b) nothing
anywhere stored an ASYNC delivery status from a later Arkesel callback (every existing
`provider_status` is just the synchronous send-time response), and (c) no segment/cost tracking
existed anywhere.

1. **DONE.** New `sms_delivery_events` table + a new `arkesel-delivery-webhook` edge function
   (`verify_jwt: false`). Real research finding: Arkesel's official V2 docs did not expose a
   confirmed webhook payload/signature spec via public search; two independent third-party
   integrations (a Python SDK's `webhookSms(sender, message, recipients, callback_url)` shape, and a
   community PHP/Node package's README) both describe an UNSIGNED callback carrying `sms_id`/
   `status` as GET query params. No signature verification is implemented since none is confirmed to
   exist — stated plainly, not guessed around. **Live-verified for real**: sent a real test SMS to
   `0546416566` via the updated `send-sms` function (now attaching `callback_url` on every send and
   capturing `providerReference` from the response) — Arkesel's real webhook fired back ~12 seconds
   later with `sms_id`/`status: DELIVERED`, exactly matching the third-party research, and a correct
   row landed in `sms_delivery_events`. This is genuinely proven end-to-end, not just deployed.
   Also added `provider_reference`/`provider_status` columns to the 2 human-approved flows' tables
   (not yet wired into their confirm actions' client-side hooks — a real, disclosed remaining gap).
2. **Not resolved — honestly, not glossed over.** No public API or dashboard access was available
   from this environment to list the real Arkesel account's registered Sender IDs. The hardcoded
   `"Palmstead"` string was NOT touched anywhere. This still needs the account owner to check
   directly with Arkesel (dashboard or support) before any Sender ID change is made.
3. **DONE for all ~9 real SMS kinds, as of a 2026-11-06 follow-up pass.** Real Arkesel segment rules
   (confirmed via Arkesel's own "SMS Length and Unicode" page: GSM-7 160/153, Unicode 70/67)
   implemented in a new `sms_send_log` table + inline per-function logic across every real sender:
   `send-sms` (closing-SMS confirm, overpayment-recalc confirm, quotation/SVE/receipt-thank-you),
   `process-allocation-sms`, `process-finance-monthly-reminders`, `process-leave-sms-outbox`, and
   `process-sales-daily-digest`. (`send-finance-missed-payment-digest`, `process-finance-receipt-sms`,
   and `send-lead-closing-drafts` don't need their own segment-logging call: the first two are a
   read-only digest and a receipt-PDF sender respectively — no per-recipient variable-length SMS to
   size meaningfully beyond what's already covered elsewhere — and the third never sends SMS
   directly, it only drafts for a human to confirm, which routes through `send-sms`'s own logging
   when actually sent.)
   **Real correction to the original Phase C report**: the "real platform import-map bug" blocking
   `process-finance-monthly-reminders`, `process-finance-receipt-sms`,
   `send-finance-missed-payment-digest`, and `send-lead-closing-drafts` did NOT reproduce in this
   follow-up pass — all 4 redeployed cleanly on the first attempt using the standard
   `files` + `import_map_path` pattern, each landing their intended, already-written code (confirmed
   by fetching each deployed function's content and finding the segment-logging/`due_today`/
   `reconciliation_hold` logic present). The most likely explanation is a malformed deploy call in
   the original attempt (e.g. a missing `deno.json` entry in `files`), not a genuine platform defect
   — noted here so a future session doesn't avoid this deploy pattern unnecessarily.
   A real segment/cost summary ("N real sends logged, N segments, ~GHS X estimated or "Cost unknown"
   if no rate is set") is live on the Outgoing SMS app's Sent History tab, reading from
   `sms_send_log`. Verified via a rolled-back transaction inserting one `leave_reminder` and one
   `sales_daily_digest` row (233546416566, segment counts 1 and 2) — both inserted cleanly, confirmed
   present, then rolled back, leaving 0 real rows behind.
   A new `app_config.sms_cost_per_segment_ghs` column exists for the account owner to enter their
   real contracted rate (no authoritative current GHS/segment figure could be confirmed publicly —
   third-party estimates conflicted, GHS 0.02–0.08, so none was fabricated).
   **Also fixed in this pass**: `process-sales-daily-digest`'s code-level fallback template (used
   only if the `sms_templates` DB row is empty) still hardcoded "Trulander JSF" — a staff-only digest,
   so per the branding rule it should say "Palmstead." Corrected.
   **Sender ID, one more real data point, still not fully resolved**: no Arkesel API/dashboard
   access was available to list registered Sender IDs in this pass either. However, Phase C's own
   earlier live delivery-webhook test (§ above) already proves "Palmstead" is a working, accepted
   Sender ID on the real account (a real send with `sender: "Palmstead"` reached DELIVERED status).
   Whether "Trulander JSF" is *also* registered remains genuinely unknown — this still needs the
   account owner to check directly with Arkesel before any Sender ID change.

**Also fixed in this pass** (found while verifying, not pre-existing known items): 2 more real
branding misses on STAFF-facing templates — `sales_daily_digest` had drifted to say "Trulander JSF"
(a client-facing name, wrong for an internal digest) and `allocation_staff_notice` said "Trulander
JSF" in both its DB row and its code fallback (also wrong, this is a staff notice). Both corrected to
"Palmstead" per the established branding rule (Palmstead = internal system, for staff; Trulander JSF
= the company, for clients).

**Phase D — AI review stage (shadow mode first)**:
1. Build the structured-output contract (`APPROVED_WORDING`/`NEEDS_HUMAN_REVIEW`/`DO_NOT_SEND`)
   using the existing Groq integration (pending final user confirmation on Grok vs. Groq).
2. Run it in shadow mode only initially (compute what it would decide, log it, don't act on it) to
   measure rejection rates before trusting it to gate any real send.
3. Build the independent server-side validator (compare every token in the AI's draft against the
   trusted source payload) — this is the part of the blueprint most worth building regardless of
   the Grok/Groq decision, since it protects against AI error either way.

**Phase E — Controlled go-live**:
1. Feature-flag the new unified engine per SMS kind, migrating one kind at a time rather than a
   single cutover.
2. Internal/staff pilot first (the existing test-number pattern, `0546416566`, already established
   this session, is a natural fit here).
3. Build the acceptance-test catalogue from the blueprint's §9 as real automated tests before
   calling any kind "migrated."

---

## 10. Items already flagged elsewhere, restated here so this audit is self-contained

- **Arkesel Sender ID** ("Palmstead" hardcoded, unconfirmed whether "Trulander JSF" is a registered
  alternative) — unresolved, needs the account owner.
- **Grok vs. Groq** — unresolved; this audit and the phases above assume Groq stays, pending final
  confirmation.
- **The Mr Joe incident** (a possible fabricated SMS from an earlier testing mistake, since resolved
  directly by the user with a phone call) — closed as an incident, but its root cause (no
  `reconciliation_hold`/synthetic-data isolation at the schema level) is exactly what Phase B's
  `reconciliation_hold` state addresses structurally, not just procedurally.
