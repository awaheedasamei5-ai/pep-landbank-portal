# Operations schedule reporting expansion

## Ground truth (25 October 2026)

The V2 Operations report currently reads Plane project issues only. The active personal planner writes to `op_todos`; meeting invitations and RSVP live in `schedule_items` and `schedule_item_invitees`. These records are absent from the report, even when a manager or staff member uses the same date range. The V2 database policies allow managers to read company records and limit staff to their own task/meeting participation. Report queries must still apply explicit account filters so a staff export cannot accidentally include a record they own but that is assigned to somebody else.

The existing issue report uses current state plus created/completed/due dates. A planner report should describe scheduled dates and current status clearly; it must not pretend to reconstruct a historical status snapshot. This follows the filter and drill-through pattern in [Linear Insights](https://linear.app/docs/insights), while meeting attendance remains distinct from per-user event reminders in the [Google Calendar reminder model](https://developers.google.com/workspace/calendar/api/concepts/reminders).

## Delivery phases

1. **Schedule register and exports.** Add a separate schedule section alongside the existing issue report. Show task and meeting totals, current task statuses, overdue open tasks, upcoming meetings and invite responses. Apply the selected date window and management staff scope. Include a responsive register and matching CSV/PDF exports. Keep issue-specific project/status/priority filters separate and label that distinction visibly. Read only the necessary columns, paginate, and respect RLS. Staff sees assigned tasks and meetings they own or are invited to; management sees all or a selected person's assigned tasks and meeting participation.
2. **Cross-app work analytics.** Add combined issue/task/project measures, historical task events, scheduling conflict and reminder-delivery measures, and per-staff drill-through. Historical charts require event timestamps or audit records; current-state-only columns must not be presented as past states. Review RLS and performance before expanding queries.
3. **Report-wide quality pass.** Cover project cycles/modules, archived/completed work and reset effects; provide coherent section selection across all report sources. Review branding, accessibility, mobile layout, CSV/PDF pagination, and Management/Staff output against representative records.

## Acceptance for phase 1

- Management can inspect company and a selected staff member's schedule for a chosen date range; Staff sees only their own assigned tasks and meeting participation.
- A cancelled or rescheduled task is identified by its actual current status; open overdue means scheduled before today and still open.
- Meeting invitation status is visible only for the selected viewer when scoped to one person. Company counts represent meetings once and RSVP counts represent invitees.
- CSV and PDF exports contain the same scoped rows shown on screen, include a clear date/scope legend, and paginate without clipped columns.
- Empty, loading, and database-error states are explicit. Existing issue report filters and exports remain functional.
- Verify typecheck/build, database scoping, Management/Staff browser views, PDF appearance and deployment before production release.

## Later app phases

After this report slice: Accounting monthly schedule/receipt and cross-app allocation verification; Client 360 timeline/pipeline sync; Leave plan/reminder/letter audit; app-wide reset, staff actions, navigation and mobile/theme pass. Each phase starts with current-code and schema reconciliation, then targeted research, implementation, account-level verification and deployment.
