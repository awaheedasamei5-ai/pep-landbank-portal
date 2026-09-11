// Real user ask (2026-09-06): "help u schedule a task" -- a natural-
// language quick-add. The AI (kind='ops_task_parse') only ever extracts
// which words in the sentence look like a date/time/priority/category;
// it never does date arithmetic itself (a model computing "next monday"
// from its own idea of "today" is exactly the kind of thing worth NOT
// trusting -- Master Spec Section 22's own "never delegate to AI" list is
// about financial/approval decisions, but the same caution applies here:
// real date math stays deterministic, client-side, against the browser's
// actual clock).
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export interface ParsedQuickAddFields {
  title: string;
  dateHint: string | null;
  timeHint: string | null;
  priorityHint: 'Low' | 'Medium' | 'High' | null;
  categoryHint: string | null;
}

// Parses the AI's own required 5-line reply format (see the
// ops_task_parse system prompt) -- tolerant of a missing line or extra
// whitespace rather than throwing, since a slightly malformed model reply
// should degrade to "just use the raw text as the title", not crash the
// quick-add box.
export function parseOpsTaskFields(raw: string, fallbackTitle: string): ParsedQuickAddFields {
  const lines = raw.split('\n').map((l) => l.trim());
  const get = (prefix: string) => {
    const line = lines.find((l) => l.toUpperCase().startsWith(prefix));
    if (!line) return null;
    const value = line.slice(line.indexOf(':') + 1).trim();
    return value && value.toUpperCase() !== 'NONE' ? value : null;
  };
  const priority = get('PRIORITY_HINT');
  const category = get('CATEGORY_HINT');
  return {
    title: get('TITLE') || fallbackTitle,
    dateHint: get('DATE_HINT'),
    timeHint: get('TIME_HINT'),
    priorityHint: priority === 'Low' || priority === 'Medium' || priority === 'High' ? priority : null,
    categoryHint: category,
  };
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Resolves a real ISO date from the AI's own plain-English date hint --
// deterministic, against the actual browser clock, never the model's own
// notion of "today". Returns null (not a guess) for anything it doesn't
// confidently recognize, so the UI can fall back to leaving the date
// field for the user to fill in themselves.
export function resolveDateHint(hint: string | null, today: Date): string | null {
  if (!hint) return null;
  const h = hint.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(h)) return h;
  if (h === 'today') return isoOf(today);
  if (h === 'tomorrow') return isoOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  const nextMatch = h.match(/^(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (nextMatch) {
    const targetDow = WEEKDAYS.indexOf(nextMatch[2]);
    const isExplicitlyNext = !!nextMatch[1];
    const d = new Date(today);
    let delta = (targetDow - d.getDay() + 7) % 7;
    if (delta === 0 || isExplicitlyNext) delta += delta === 0 ? 7 : 0;
    d.setDate(d.getDate() + delta);
    return isoOf(d);
  }
  return null;
}

// Resolves a real HH:MM (24h) from the AI's own clock-time hint (e.g.
// "3pm", "09:30", "noon") -- again deterministic parsing, not trusting
// the model to already know this app's own time format.
export function resolveTimeHint(hint: string | null): string | null {
  if (!hint) return null;
  const h = hint.trim().toLowerCase();
  if (h === 'noon') return '12:00';
  const match = h.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
