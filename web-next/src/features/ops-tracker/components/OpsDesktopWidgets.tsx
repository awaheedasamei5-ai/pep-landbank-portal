import { AvatarStack } from '../../../shared/ui/Avatar';
import { fmtLongDate } from '../../../shared/lib/format';
import type { ScheduleItem } from '../../../types/domain';
import styles from './OpsDesktopWidgets.module.css';

// Desktop widget row modeled on the reference "TaskLab" dashboard's card
// grid (team card, productivity chart, history heatmap, schedule
// timeline, process bars). Two of the reference's cards are deliberately
// NOT reproduced: a mini "Chat" panel (this app already has a real Chat
// feature -- faking a second, disconnected one would be a hollow
// duplicate) and a stopwatch-style "Time Tracker" (nothing in this app
// tracks elapsed time per task, so a ticking 00:00:00 would be pure
// theater). The countdown-to-next-meeting card below fills that same
// visual slot honestly, with a real number.

export function TeamOverviewCard({ teamRows, onClick }: { teamRows: { key: string; name: string; open: number; overdue: number }[]; onClick: () => void }) {
  const totalOpen = teamRows.reduce((sum, r) => sum + r.open, 0);
  const totalOverdue = teamRows.reduce((sum, r) => sum + r.overdue, 0);
  return (
    <button type="button" className={styles.darkCard} onClick={onClick}>
      <div className={styles.darkCardHead}>
        <span className={styles.darkCardLabel}>Core Team</span>
        <span className={styles.darkCardCount}>{teamRows.length} Members</span>
      </div>
      <div className={styles.teamStackRow}>
        <AvatarStack names={teamRows.map((r) => r.name)} max={5} />
      </div>
      <div className={styles.darkCardFoot}>
        <div className={styles.darkCardStat}>
          <span className={styles.darkCardStatValue}>{totalOpen}</span>
          <span className={styles.darkCardStatLabel}>Open tasks</span>
        </div>
        <div className={styles.darkCardStat}>
          <span className={`${styles.darkCardStatValue} ${totalOverdue > 0 ? styles.darkCardStatDanger : ''}`}>{totalOverdue}</span>
          <span className={styles.darkCardStatLabel}>Overdue</span>
        </div>
      </div>
    </button>
  );
}

export function ProductivityChartCard({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const thisWeekTotal = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className={styles.chartCard}>
      <div className={styles.sectionHead}>Productivity this week</div>
      <div className={styles.chartValue}>{thisWeekTotal} tasks closed</div>
      <div className={styles.bars}>
        {data.map((d) => (
          <div key={d.label} className={styles.barCol}>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ height: `${(d.count / max) * 100}%` }} />
            </div>
            <span className={styles.barLabel}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HistoryHeatmapCard({ days, monthLabel, monthIso, onSelectDay }: { days: { day: number; count: number }[]; monthLabel: string; monthIso: string; onSelectDay: (dayIso: string) => void }) {
  function tone(count: number): string {
    if (count === 0) return styles.heatCell0;
    if (count === 1) return styles.heatCell1;
    if (count <= 3) return styles.heatCell2;
    return styles.heatCell3;
  }
  return (
    <div className={styles.heatCard}>
      <div className={styles.sectionHead}>History — click a day for its real detail</div>
      <div className={styles.heatGrid}>
        {days.map((d) => (
          <button
            key={d.day}
            type="button"
            className={`${styles.heatCell} ${tone(d.count)}`}
            title={`${d.count} closed`}
            onClick={() => onSelectDay(`${monthIso}${String(d.day).padStart(2, '0')}`)}
          >
            {d.day}
          </button>
        ))}
      </div>
      <div className={styles.heatMonthLabel}>{monthLabel}</div>
    </div>
  );
}

export function ProcessBarsCard({ open, inProgress, blocked, closed, onSelect }: { open: number; inProgress: number; blocked: number; closed: number; onSelect: (status: string) => void }) {
  const total = Math.max(1, open + inProgress + blocked + closed);
  const rows: { label: string; status: string; value: number; tone: string }[] = [
    { label: 'To Do', status: 'open', value: open, tone: styles.processInfo },
    { label: 'In Progress', status: 'in_progress', value: inProgress, tone: styles.processWarn },
    { label: 'Blocked', status: 'blocked', value: blocked, tone: styles.processDanger },
    { label: 'Complete', status: 'closed', value: closed, tone: styles.processSuccess },
  ];
  return (
    <div className={styles.processCard}>
      <div className={styles.sectionHeadLight}>Process — click a stage for its real task list</div>
      {rows.map((r) => (
        <button key={r.label} type="button" className={styles.processRow} onClick={() => onSelect(r.status)}>
          <div className={styles.processRowHead}>
            <span>{r.label}</span>
            <span>{r.value}</span>
          </div>
          <div className={styles.processTrack}>
            <div className={`${styles.processFill} ${r.tone}`} style={{ width: `${(r.value / total) * 100}%` }} />
          </div>
        </button>
      ))}
    </div>
  );
}

function kindDot(kind: ScheduleItem['kind']): string {
  if (kind === 'meeting') return '📅';
  if (kind === 'task') return '✓';
  return '•';
}

export function ScheduleTimelineCard({ items, onSelect }: { items: ScheduleItem[]; onSelect: (item: ScheduleItem) => void }) {
  return (
    <div className={styles.timelineCard}>
      <div className={styles.sectionHead}>{items.length} Upcoming</div>
      <div className={styles.timelineTrack}>
        {items.map((it) => (
          <button key={it.id} type="button" className={styles.timelineNode} onClick={() => onSelect(it)}>
            <span className={styles.timelineDate}>{fmtLongDate(it.date).replace(/,.*/, '')}</span>
            <span className={styles.timelineDot}>{kindDot(it.kind)}</span>
            <span className={styles.timelineTitle}>{it.title}</span>
          </button>
        ))}
        {items.length === 0 && <p className={styles.timelineEmpty}>Nothing upcoming.</p>}
      </div>
    </div>
  );
}

export function NextMeetingCountdownCard({ nextMeeting, onOpenMeetings, onSelect }: { nextMeeting: ScheduleItem | null; onOpenMeetings: () => void; onSelect: (item: ScheduleItem) => void }) {
  if (!nextMeeting || !nextMeeting.startTime) {
    return (
      <button type="button" className={styles.darkCard} onClick={onOpenMeetings}>
        <div className={styles.darkCardLabel}>Next meeting</div>
        <div className={styles.countdownEmpty}>Nothing on the calendar right now.</div>
      </button>
    );
  }
  const target = new Date(`${nextMeeting.date}T${nextMeeting.startTime}`);
  const diffMs = Math.max(0, target.getTime() - Date.now());
  const hours = Math.floor(diffMs / 3_600_000);
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  return (
    <button type="button" className={styles.darkCard} onClick={() => onSelect(nextMeeting)}>
      <div className={styles.darkCardLabel}>Next meeting</div>
      <div className={styles.countdownValue}>
        {String(hours).padStart(2, '0')}:{String(mins).padStart(2, '0')}
      </div>
      <div className={styles.countdownTitle}>{nextMeeting.title}</div>
    </button>
  );
}
