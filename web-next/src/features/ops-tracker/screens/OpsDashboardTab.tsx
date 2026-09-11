import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useTodayTodos, useCreateTodo } from '../hooks/useTodayTodos';
import { useTasks, useCreateTask } from '../hooks/useTasks';
import { useMyMeetings, useTeamScheduleRange } from '../hooks/useCalendar';
import { useOpsDailyBriefing } from '../hooks/useOpsCompanion';
import { useParseQuickAddTask, type QuickAddResult } from '../hooks/useOpsQuickAdd';
import { OpsCompanionPanel } from '../components/OpsCompanionPanel';
import { ItemDetailModal } from '../components/ItemDetailModal';
import { Icon, type IconName } from '../../../shared/ui/Icon';
import { avatarTone, initials } from '../../../shared/lib/avatar';
import { Avatar } from '../../../shared/ui/Avatar';
import { ProgressRing } from '../components/ProgressRing';
import { TeamOverviewCard, ProductivityChartCard, HistoryHeatmapCard, ProcessBarsCard, ScheduleTimelineCard, NextMeetingCountdownCard } from '../components/OpsDesktopWidgets';
import { today, isoPlusDays, fmtLongDate } from '../../../shared/lib/format';
import type { ScheduleItem } from '../../../types/domain';
import styles from './OpsDashboardTab.module.css';

const PRIORITIES = ['Low', 'Medium', 'High'] as const;
const CATEGORIES = ['Follow-up', 'Admin', 'Site Visit', 'Documentation', 'Other'] as const;

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// The dashboard the user's live feedback said didn't exist at all:
// "currently i cant even see a single dashboard." Real, currently-live
// numbers (today's load, this week's remaining work, the next meeting),
// an AI daily briefing grounded in those same numbers (kind=
// 'ops_daily_briefing'), the ops companion (3 fixed questions, see
// useOpsCompanion.ts), and a natural-language quick-add that genuinely
// helps schedule work (kind='ops_task_parse') rather than just listing
// existing views again.
export function OpsDashboardTab() {
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const isManager = profile?.role === 'manager';
  const todayIso = today();
  const { data: todos } = useTodayTodos();
  const { data: tasks } = useTasks();
  const { data: meetings } = useMyMeetings(todayIso, isoPlusDays(todayIso, 14));
  const { data: teamToday } = useTeamScheduleRange(todayIso, todayIso);
  const [openItem, setOpenItem] = useState<ScheduleItem | null>(null);

  const allTodos = todos ?? [];
  const allTasks = tasks ?? [];
  const todayTotal = allTodos.length;
  const todayCompleted = allTodos.filter((t) => t.status === 'closed').length;
  const overdueCount = allTasks.filter((t) => t.dueDate && t.dueDate < todayIso && t.status !== 'closed' && t.status !== 'cancelled').length;
  const openCount = allTasks.filter((t) => t.status === 'open').length;
  const inProgressCount = allTasks.filter((t) => t.status === 'in_progress').length;
  const blockedCount = allTasks.filter((t) => t.status === 'blocked').length;
  const closedCount = allTasks.filter((t) => t.status === 'closed').length;
  const weekRemainingCount = openCount + inProgressCount + blockedCount;
  const dow = new Date().getDay();
  const daysRemainingInWeek = dow === 0 ? 0 : 6 - dow;

  // Real, current task titles -- not just counts -- so the AI can name
  // what's actually urgent instead of only citing a number (real user
  // complaint, 2026-09-05: "the ai just lazy and boring"). Overdue first
  // (earliest due date), then everything else still open, capped at 3.
  const topTasks = [...allTasks]
    .filter((t) => t.status !== 'closed' && t.status !== 'cancelled')
    .sort((a, b) => {
      const aOverdue = a.dueDate && a.dueDate < todayIso ? 0 : 1;
      const bOverdue = b.dueDate && b.dueDate < todayIso ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      return (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99');
    })
    .slice(0, 3)
    .map((t) => t.title);

  const upcomingMeetings = (meetings ?? [])
    .filter((m) => m.date > todayIso || (m.date === todayIso && (m.startTime ?? '') >= new Date().toTimeString().slice(0, 5)))
    .sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')));
  const nextMeeting = upcomingMeetings[0] ?? null;

  const companionCtx = {
    openCount,
    inProgressCount,
    blockedCount,
    overdueCount,
    weekRemainingCount,
    daysRemainingInWeek,
    nextMeetingTitle: nextMeeting?.title ?? null,
    nextMeetingTime: nextMeeting ? `${fmtLongDate(nextMeeting.date)} ${nextMeeting.startTime?.slice(0, 5) ?? ''}`.trim() : null,
    topTasks,
  };
  const briefing = useOpsDailyBriefing({ ...companionCtx, todayTotal, todayCompleted });

  const teamRows = isManager ? buildTeamRows(teamToday ?? []) : [];
  const todayPending = Math.max(0, todayTotal - todayCompleted);
  const todayPercent = todayTotal > 0 ? (todayCompleted / todayTotal) * 100 : 0;

  // Desktop "TaskLab"-style widget row -- every number here is derived
  // straight from allTasks' real completedAt/status columns, nothing
  // invented. 7-day bars, current-month heatmap, a horizontal timeline of
  // real upcoming work, and process bars for the same open/in-progress/
  // blocked/closed split already shown in the stat tiles above.
  const productivityData = Array.from({ length: 7 }, (_, i) => {
    const d = isoPlusDays(todayIso, i - 6);
    return {
      label: new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2),
      count: allTasks.filter((t) => t.completedAt && t.completedAt.slice(0, 10) === d).length,
    };
  });
  const daysInMonth = new Date(Number(todayIso.slice(0, 4)), Number(todayIso.slice(5, 7)), 0).getDate();
  const heatmapDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = `${todayIso.slice(0, 8)}${String(i + 1).padStart(2, '0')}`;
    return { day: i + 1, count: allTasks.filter((t) => t.completedAt && t.completedAt.slice(0, 10) === d).length };
  });
  const timelineItems = [...allTasks.filter((t) => t.status !== 'closed' && t.status !== 'cancelled'), ...upcomingMeetings]
    .sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')))
    .slice(0, 8);

  return (
    <div className={styles.wrap}>
      <div className={styles.heroRow}>
        <Avatar name={profile?.name ?? ''} size={42} />
        <div>
          <div className={styles.heroGreet}>{timeGreeting()}</div>
          <div className={styles.heroName}>{profile?.name ?? ''}</div>
        </div>
      </div>

      <div className={styles.progressCard}>
        <ProgressRing percent={todayPercent} />
        <div className={styles.progressStats}>
          <div className={styles.progressStatRow}>
            <span className={styles.progressStatIcon}>
              <Icon name="checklist" size={14} />
            </span>
            <span className={styles.progressStatValue}>{todayTotal}</span>
            <span className={styles.progressStatLabel}>Total task</span>
          </div>
          <div className={styles.progressStatRow}>
            <span className={styles.progressStatIcon}>
              <Icon name="check" size={14} />
            </span>
            <span className={styles.progressStatValue}>{todayCompleted}</span>
            <span className={styles.progressStatLabel}>Completed</span>
          </div>
          <div className={styles.progressStatRow}>
            <span className={styles.progressStatIcon}>
              <Icon name="warning" size={14} />
            </span>
            <span className={styles.progressStatValue}>{todayPending}</span>
            <span className={styles.progressStatLabel}>Pending</span>
          </div>
        </div>
      </div>

      <div className={styles.briefingCard}>
        <span className={styles.briefingIconBadge}>
          <Icon name="bulb" size={17} />
        </span>
        <span className={styles.briefingBody}>
          <span className={styles.briefingHead}>
            <span className={styles.aiBadge}>AI</span>
            <span className={styles.liveDot} aria-hidden="true" />
            <span className={styles.liveLabel}>Live</span>
          </span>
          {briefing.isLoading && <span className={styles.briefingText}>Reading your day…</span>}
          {briefing.data && <span className={styles.briefingText}>{briefing.data}</span>}
          {!briefing.isLoading && !briefing.data && <span className={styles.briefingText}>Here&apos;s your operations dashboard — everything below is real, live data.</span>}
        </span>
      </div>

      <div className={styles.statGrid}>
        <StatTile label="Today" value={`${todayCompleted}/${todayTotal}`} sub="to-dos done" tone="accent" icon="checklist" onClick={() => navigate('/app/office/operations/myday')} />
        <StatTile label="Overdue" value={String(overdueCount)} sub="tasks past due" tone={overdueCount > 0 ? 'danger' : 'success'} icon="warning" onClick={() => navigate('/app/office/operations/tasks')} />
        <StatTile label="This week" value={String(weekRemainingCount)} sub="tasks remaining" tone="warn" icon="barChart" onClick={() => navigate('/app/office/operations/tasks')} />
        <StatTile label="Meetings" value={String(upcomingMeetings.length)} sub="next 14 days" tone="info" icon="bell" onClick={() => navigate('/app/office/operations/meetings')} />
      </div>

      <div className={styles.desktopWidgetGrid}>
        {isManager && (
          <div className={styles.widgetCell}>
            <TeamOverviewCard teamRows={teamRows} onClick={() => navigate('/app/office/operations/team')} />
          </div>
        )}
        {/* A non-manager never renders the Team card above, so on a fixed
            4-column grid this cell must claim the second column itself
            (span 2 instead of 1) -- otherwise column 4 sits genuinely
            empty for the rest of this row, the exact "auto-fill leaves a
            phantom empty track" class of bug just found and fixed on
            Meetings, just from a different cause (a conditionally-omitted
            cell instead of too few grid items). */}
        <div className={isManager ? styles.widgetCell : styles.widgetCellWide}>
          <NextMeetingCountdownCard nextMeeting={nextMeeting} onOpenMeetings={() => navigate('/app/office/operations/meetings')} onSelect={setOpenItem} />
        </div>
        <div className={styles.widgetCellWide}>
          <ProductivityChartCard data={productivityData} />
        </div>
        <div className={styles.widgetCellWide}>
          <HistoryHeatmapCard
            days={heatmapDays}
            monthLabel={new Date(`${todayIso}T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            monthIso={todayIso.slice(0, 8)}
            onSelectDay={(dayIso) => navigate(`/app/office/operations/month?day=${dayIso}`)}
          />
        </div>
        <div className={styles.widgetCellWide}>
          <ProcessBarsCard open={openCount} inProgress={inProgressCount} blocked={blockedCount} closed={closedCount} onSelect={() => navigate('/app/office/operations/tasks')} />
        </div>
        <ScheduleTimelineCard items={timelineItems} onSelect={setOpenItem} />
      </div>

      <div className={styles.mainGrid}>
        <div className={styles.col}>
          <QuickAdd />
          <div className={styles.sectionCard}>
            <div className={styles.sectionTitle}>
              <Icon name="bell" size={15} /> Upcoming meetings
            </div>
            {upcomingMeetings.slice(0, 3).map((m) => {
              const d = new Date(`${m.date}T00:00:00`);
              return (
                <button key={m.id} type="button" className={styles.meetingRow} onClick={() => setOpenItem(m)}>
                  <span className={styles.meetingDateBadge}>
                    <span className={styles.meetingDateMonth}>{d.toLocaleDateString('en-GB', { month: 'short' })}</span>
                    <span className={styles.meetingDateDay}>{d.getDate()}</span>
                  </span>
                  <span className={styles.meetingInfo}>
                    <span className={styles.meetingTitle}>{m.title}</span>
                    <span className={styles.meetingTime}>{m.startTime?.slice(0, 5)}</span>
                  </span>
                </button>
              );
            })}
            {upcomingMeetings.length === 0 && <p className={styles.empty}>Nothing on the calendar yet.</p>}
          </div>
          {isManager && (
            <div className={styles.sectionCard}>
              <div className={styles.sectionTitle}>
                <Icon name="team" size={15} /> Team today
              </div>
              {teamRows.map((row) => (
                <div key={row.key} className={styles.teamRow}>
                  <span className={styles.teamPerson}>
                    <span className={`${styles.avatar} ${styles[`avatar_${avatarTone(row.name)}`]}`}>{initials(row.name)}</span>
                    <span className={styles.teamName}>{row.name}</span>
                  </span>
                  <span className={styles.teamStat}>
                    {row.open} open · {row.overdue > 0 ? <span className={styles.teamOverdue}>{row.overdue} overdue</span> : 'on track'}
                  </span>
                </div>
              ))}
              {teamRows.length === 0 && <p className={styles.empty}>No team activity today yet.</p>}
            </div>
          )}
        </div>
        <div className={styles.col}>
          <OpsCompanionPanel ctx={companionCtx} />
        </div>
      </div>

      {openItem && <ItemDetailModal item={openItem} onClose={() => setOpenItem(null)} />}
    </div>
  );
}

function StatTile({ label, value, sub, tone, icon, onClick }: { label: string; value: string; sub: string; tone: 'accent' | 'danger' | 'warn' | 'success' | 'info'; icon: IconName; onClick: () => void }) {
  return (
    <button type="button" className={`${styles.statTile} ${styles[`tone_${tone}`]}`} onClick={onClick}>
      <div className={styles.statIconBadge}>
        <Icon name={icon} size={16} />
      </div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statSub}>{sub}</div>
    </button>
  );
}

function buildTeamRows(items: ScheduleItem[]): { key: string; name: string; open: number; overdue: number }[] {
  const byStaff = new Map<string, { name: string; open: number; overdue: number }>();
  const todayIso = today();
  items
    .filter((i) => i.kind === 'task')
    .forEach((t) => {
      const row = byStaff.get(t.assignedTo) ?? { name: t.assignedToName ?? t.assignedTo, open: 0, overdue: 0 };
      if (t.status === 'open' || t.status === 'in_progress' || t.status === 'blocked') row.open += 1;
      if (t.dueDate && t.dueDate < todayIso && t.status !== 'closed' && t.status !== 'cancelled') row.overdue += 1;
      byStaff.set(t.assignedTo, row);
    });
  return [...byStaff.entries()].map(([key, row]) => ({ key, ...row }));
}

// Real user ask: "help u schedule task etc." Types a plain sentence, AI
// extracts date/time/priority/category hints (never invents one that
// isn't actually implied), user reviews/edits the resolved fields, then
// explicitly confirms -- never an auto-create.
function QuickAdd() {
  const profile = useSessionStore((s) => s.profile);
  const [text, setText] = useState('');
  const [result, setResult] = useState<QuickAddResult | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [priority, setPriority] = useState('');
  const [category, setCategory] = useState('');
  const parse = useParseQuickAddTask();
  const createTodo = useCreateTodo();
  const createTask = useCreateTask();

  async function handleParse() {
    if (!text.trim()) return;
    const r = await parse.mutateAsync(text.trim());
    setResult(r);
    setTitle(r.title);
    setDate(r.resolvedDate ?? '');
    setTime(r.resolvedTime ?? '');
    setPriority(r.priorityHint ?? '');
    setCategory(r.categoryHint ?? '');
  }

  async function confirmCreate() {
    if (!title.trim()) return;
    if (date || priority || category) {
      await createTask.mutateAsync({
        title: title.trim(),
        assignedTo: profile?.key ?? '',
        assignedToName: profile?.name ?? '',
        dueDate: date || undefined,
        startTime: time || undefined,
        priority: priority || undefined,
        category: category || undefined,
      });
    } else {
      await createTodo.mutateAsync({ title: title.trim() });
    }
    setText('');
    setResult(null);
  }

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionTitle}>
        <Icon name="checklist" size={15} /> Quick add — type it naturally
      </div>
      <div className={styles.quickAddRow}>
        <input
          className={styles.input}
          placeholder="e.g. Call Abena tomorrow at 3pm, high priority"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleParse()}
        />
        <button type="button" className={styles.parseBtn} disabled={parse.isPending || !text.trim()} onClick={handleParse}>
          {parse.isPending ? 'Reading…' : '✨ Add'}
        </button>
      </div>
      {result && (
        <div className={styles.confirmBox}>
          <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <div className={styles.confirmRow}>
            <input className={styles.select} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input className={styles.select} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className={styles.confirmRow}>
            <select className={styles.select} value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">Priority…</option>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <select className={styles.select} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Category…</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className={styles.confirmActions}>
            <button type="button" className={styles.confirmCancel} onClick={() => setResult(null)}>
              Discard
            </button>
            <button type="button" className={styles.confirmCreate} disabled={createTask.isPending || createTodo.isPending || !title.trim()} onClick={confirmCreate}>
              Create
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
