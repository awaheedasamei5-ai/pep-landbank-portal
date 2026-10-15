# Memorandum — Implementation Plan

## Purpose and real V1 logic (verified directly, `main` branch `index.html`)

Memorandum is V1's internal formal-letter/memo system — not a wiki, not chat, not email in the literal sense. A memo has a single `to` recipient (addressed like a letter), optional `cc` recipients, a `subject`, and a rich-text `body`. Every memo has a `status` of `draft` or `sent`. Reading is tracked per-recipient (`memos.read` for the primary recipient, `memo_recipients.read` for each Cc). Memos can be threaded via `parent_id` (reply chains). The defining feature that separates this from a generic message system: **PDF export with a real company letterhead** (`buildMemoPDF` in V1) — this is a formal internal document, meant to be printed/downloaded and read as a letter, not just displayed as a chat bubble.

V1's real UI: three tabs (Inbox / Sent / Drafts), a compose view with To (single recipient, searched by name), Cc (multi-select chip input with live search), Subject, and a rich-text editor with a formatting toolbar (font, size, bold/italic/underline, alignment, lists, clear formatting). Send validates recipient + subject + non-empty body. Save-as-draft skips the "send" validation. Realtime: memos and memo_recipients both have live Supabase subscriptions so a new memo/Cc appears without a refresh, and a badge count on the nav item shows unread (`to_key` unread + any Cc row unread).

**One real V1 weakness being fixed, not just copied**: V1's editor is bare `contentEditable` + `document.execCommand` — a deprecated, inconsistent-across-browsers browser API. This gets replaced with a real modern editor library (TipTap, the same one `docmost/docmost` — 21.9k stars, the repo researched for this app in `00-unbuilt-apps-repo-research.md` — uses), not hand-rolled.

## Database and security — already done, verified live, no changes needed

**Real discovery**: `memos` and `memo_recipients` already exist in the live `sbydzrlzqxcdbudjaube` project, RLS enabled, 0 rows, with a schema that is an exact match to V1's real columns (`from_key`/`from_name`/`to_key`/`to_name`/`subject`/`body_html`/`parent_id`/`kind`/`status`/`read`/`created_at` on `memos`; `memo_id`/`staff_key`/`staff_name`/`read`/`created_at` on `memo_recipients`).

RLS policies, verified via `pg_policies`, are already correct and match V1's real access model:
- A sender sees their own memos (any status); a recipient sees memos addressed to them only once `status <> 'draft'`; a Cc'd staff member sees it via `is_memo_cc_recipient(id)`; a manager sees everything.
- Insert requires `from_key = my_key()` (can't forge a sender).
- Update: recipient can mark their own copy read (`to_key = my_key()`), sender can edit their own drafts, manager can touch anything.
- Delete: sender or manager only.
- `memo_recipients` insert requires `is_memo_sender(memo_id)` — only the memo's own sender can add Cc rows.

This is a solid, already-proven security model. **No migration, no RLS change, no new table.** This app is UI-layer work on top of a real, already-correct backend.

## Editor — real library, not hand-rolled

Install `@tiptap/react`, `@tiptap/starter-kit` (bold/italic/lists/headings), `@tiptap/extension-underline`, `@tiptap/extension-text-align`, `@tiptap/extension-placeholder`. This is the same real, modern, open-source editor engine `docmost` is built on — a legitimate "use a real library" choice per the standing build rule, not a from-scratch WYSIWYG implementation. The toolbar UI (font/size/bold/italic/underline/align/lists/clear) mirrors V1's real toolbar feature-for-feature, built with this project's own `Button`/`Separator`/`DropdownMenu` components, driven by TipTap's `editor.chain().focus()...run()` API instead of `document.execCommand`.

## UI architecture — a real three-pane mail-client layout

This project already has every primitive this needs installed locally (`src/components/ui/resizable.tsx`, `scroll-area.tsx`, `dialog.tsx`, `avatar.tsx`, `dropdown-menu.tsx`, `separator.tsx`) — the same component shape as shadcn's own well-known Mail example pattern, already native to this codebase's design system. No external UI repo needs cloning for layout; the real external resource (TipTap) is for the editor specifically, where V1's own approach was genuinely deficient.

**Route**: `/dashboard/memorandum`, replacing the `NOT_BUILT_YET` sidebar entry.

**Layout** (`ResizablePanelGroup`, matches the pattern already proven usable in this codebase):
- Left panel (narrow, ~20%): folder list — Inbox (unread count badge), Sent, Drafts — plus a prominent "Compose" button at the top, not a floating action button (standing rule: no floating controls over content).
- Middle panel (~30%): the message list for the selected folder — sender/recipient name, subject, a plain-text snippet of the body, relative timestamp, unread state (bold + accent dot), Cc indicator icon when relevant.
- Right panel (~50%): reading pane — full letterhead-style header (From/To/Cc/Subject/Date), rendered HTML body, action bar (Reply, Forward-as-new via pre-filled compose, Download PDF, Delete, and for a draft: Edit/Send/Discard).

Compose is a `Dialog` (not a separate route) so replying/forwarding from the reading pane and starting fresh from the folder list both open the same component, matching V1's real seeded-compose pattern (`memoComposeSeed`). Dialog contents: To (single-select combobox over `profiles`, same pattern as other apps' staff pickers), Cc (multi-select chip input, live-filtered), Subject, TipTap editor + toolbar, Save Draft / Send actions with the same validation V1 has (recipient + subject + non-empty body required to send; draft skips validation).

**Staff vs Management**: identical screen for both — RLS already scopes what each role can see (a manager sees every memo company-wide; staff see only their own sent/received). No separate management surface needed for this app, unlike Attendance/Leave — Memorandum is inherently peer-to-peer, not a thing Management administers.

**Mobile**: the three-pane layout collapses to a single-pane navigation stack (folder list → message list → reading pane), each a full-screen view with a back action, following `mobile-native` skill guidance already available in this repo's skill set.

**Realtime**: subscribe to `memos` and `memo_recipients` inserts/updates scoped to the signed-in user, matching V1's real `ensureMemosLiveSubscribed` behavior — new mail and read-state changes appear live, no manual refresh.

## PDF export — reuse the existing toolkit, match V1's real letterhead

Use the shared `pdfReport.ts` primitives (`pdfBrandedHeader`, company logo/address from `app_config` — same pattern Accounting's PDFs already use) to build a letter-formatted document: company letterhead, date, "To: / Cc: / Subject:" block, the memo body (HTML parsed into real text/formatting runs, same real approach V1's own `memoHtmlToRuns`/`pdfRenderMemoBlocks` took — convert the TipTap HTML output to styled text runs, not an image screenshot of the editor), and a thin signature line for formal memos if `kind` calls for it.

## Delivery sequence

1. Install TipTap packages; typecheck clean after.
2. Build `use-memoranda.ts` hook layer: list by folder (inbox/sent/drafts) scoped by the already-correct RLS, send/save-draft/update/delete mutations, mark-read, realtime subscription hook.
3. Build the compose dialog (recipient/cc pickers + TipTap editor + toolbar + validation).
4. Build the three-pane layout + mobile collapse behavior.
5. Build the PDF export function.
6. Wire the sidebar entry and unread badge.
7. Verify live: send a real test memo between two real test accounts (with cleanup after), confirm realtime delivery, confirm a manager sees it, confirm a non-recipient staff member does not, confirm draft invisibility to the recipient, confirm PDF downloads correctly.
8. Commit and push to `rebuild`. Do not deploy until explicitly verified per `DEPLOY_INSTRUCTIONS.md`.

## Acceptance criteria

- Inbox/Sent/Drafts all show the real, correctly-scoped set of memos for the signed-in user (verified against RLS, not just the UI hiding things).
- A draft is invisible to its intended recipient until sent.
- Cc recipients see the memo and can mark it read independently of the primary recipient.
- Compose validates recipient + subject + non-empty body before allowing Send; Save Draft has no such requirement.
- The TipTap toolbar supports the same real formatting set V1's toolbar offered.
- PDF export renders a real letterhead document with correct To/Cc/Subject/body, not a raw HTML dump.
- Realtime: a second signed-in session sees a new memo/read-state change without reloading.
- No console errors across Inbox/Sent/Drafts/Compose/Reading-pane in both light and dark mode, desktop and mobile widths.
