# Notes — Implementation Plan

## Real V1 logic (verified directly, `main` branch `index.html`)

V1's Notes app is private personal notes: `owner_key`, `title`, `body`, `created_at`, `updated_at` — no sharing, no team notes. Actions per note: Open (edit), Send (opens WhatsApp/Email pre-filled with the note text), Download (.txt file), Delete. List is a simple card list, newest-updated first, with a snippet preview and "+ New note" as the primary action.

**Real correction for V2, per the user's explicit instruction**: replace V1's WhatsApp/Email "Send" with **Send as Memo** — convert a note directly into a real internal memo via the Memorandum app just shipped, plus a **Save as Draft** path. Both reuse `useSaveMemo` from `memorandum/_components/use-memoranda.ts` unchanged; Notes' compose flow seeds `ComposeMemoDialog` with the note's own title/body instead of starting blank.

## Database and security — already exists, verified live, no changes needed

`notes` already exists in the live `sbydzrlzqxcdbudjaube` project with the exact V1 schema (`owner_key`, `title`, `body` as plain `text`, `created_at`, `updated_at`), RLS already correct: owner has full CRUD on their own rows, manager can `SELECT` every row (oversight), nobody else can see another staff member's private notes. No migration needed — this is UI-layer work on an already-correct backend, same shape as Memorandum.

`body` stays a plain `text` column but its *content* changes meaning going forward: V1 stored plain text, V2 stores the TipTap editor's HTML output (no schema change required — it's already an unconstrained text column; 0 existing rows means no backfill concern).

## Editor — real clone from docmost, proportionate to what Notes actually needs

`docmost/docmost` (cloned to inspect, not vendored wholesale) runs a full Notion-class collaborative editor — comments, live multi-cursor collaboration via a Hocuspocus websocket server, math blocks, Drawio/Excalidraw embeds, file attachments tied to its own storage backend. None of that infrastructure exists here and Notes doesn't need it (private single-owner notes, no collaboration). Cloning the *entire* extension set would be dishonest — it would silently fail without a collab server this project was never asked to stand up.

The **real, proportionate clone**: `@tiptap/extension-list` (`TaskList`/`TaskItem` — real checklists, genuinely useful in notes, zero backend dependency), `@tiptap/extension-highlight`, `@tiptap/extension-typography` (smart quotes/dashes), layered on top of the same TipTap core (`StarterKit`, `Underline`, `TextAlign`, `Placeholder`) already proven working in Memorandum's `memo-editor.tsx`. A new `note-editor.tsx` reuses that same real pattern (`useEditor` config, toolbar button shape) with these three additions plus a checklist toggle button — not a second, divergent editor implementation.

## UI architecture

**Route**: `/dashboard/notes`, replacing the `NOT_BUILT_YET` sidebar entry.

**List view**: a real card grid (this project's own `Card` primitive, same component already used across every other app here — not hand-drawn) — title, updated-relative-time, plain-text snippet (HTML stripped), and a hover action row (Open / Send as Memo / Download / Delete), matching V1's real action set with Send upgraded per the correction above. "+ New note" as the primary header action, not a floating button (standing rule).

**Editor view**: opens as a dialog (same pattern as Memorandum's compose, not a separate route — notes are quick, frictionless) with Title input + the TipTap editor/toolbar. Autosave-on-close rather than a manual Save button for the base note (matches V1's real low-friction intent — "jot something down"), with an explicit **Save as Draft** and **Send as Memo** action pair in the footer that hands off to `ComposeMemoDialog`.

**Send as Memo / Save as Draft flow**: clicking either seeds `ComposeMemoDialog` with `{ subject: note.title, bodyHtml: note.body }` and opens it in the appropriate mode — Save as Draft pre-selects no recipient and calls the existing draft-save path; Send as Memo requires picking a recipient same as any other memo. This is a real, working cross-app integration, not two separate reimplementations.

**Download**: keeps V1's real behavior — a plain `.txt` export (title + stripped body text), using the browser's own Blob/download-link mechanism, no new dependency.

**Mobile**: single-column card list, dialog becomes full-screen, same responsive pattern already proven across this shell's other dialogs.

## Delivery sequence

1. Install TipTap extensions (`@tiptap/extension-list`, `-highlight`, `-typography`); typecheck clean.
2. Build `use-notes.ts`: list (owner-scoped via existing RLS), save (insert/update), delete.
3. Build `note-editor.tsx`: shared TipTap config + toolbar with the added checklist/highlight buttons.
4. Build the note dialog (title + editor + Save as Draft/Send as Memo footer), wiring into `ComposeMemoDialog`'s existing seed mechanism (extend `ComposeSeed` with a `fromNote` variant if the existing `editingMemo`/`replyTo` shapes don't already cover it cleanly).
5. Build the card-grid list screen + route + sidebar wiring.
6. Verify live: create a real note, confirm it autosaves/persists, confirm Send as Memo correctly opens Memorandum's compose dialog pre-filled and actually sends, confirm Save as Draft lands in Memorandum's Drafts folder, confirm Download produces a real `.txt`, confirm a second staff account cannot see the first's notes (RLS), confirm manager can. Clean up all test data after.
7. Commit, push to `rebuild`. Deploy only after live verification, per `DEPLOY_INSTRUCTIONS.md`.

## Acceptance criteria

- Notes list shows only the signed-in user's own notes (manager sees all, via the already-correct RLS, not client-side filtering pretending to be security).
- Checklist and highlight formatting both work and persist correctly through save/reload.
- Send as Memo produces a real row in `memos` with `status='sent'`, correct `to_key`, and the note's content as the body.
- Save as Draft produces a real row in `memos` with `status='draft'`, visible in Memorandum's own Drafts folder, editable from there.
- Download produces a real downloadable `.txt` file with the note's title and plain-text body.
- No console errors across list/create/edit/send-as-memo/save-as-draft/download/delete, light and dark mode, desktop and mobile widths.
