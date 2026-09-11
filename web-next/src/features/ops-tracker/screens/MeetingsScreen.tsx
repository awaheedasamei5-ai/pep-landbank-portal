import { useState } from 'react';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import { useCheckScheduleConflicts, useCreateMeeting, useMeetingInvitees, useMyMeetings, useRespondToMeeting } from '../hooks/useCalendar';
import { friendlyError } from '../../../shared/lib/friendlyError';
import { isoDateOnly, isoPlusDays, fmtLongDate } from '../../../shared/lib/format';
import type { ScheduleItem } from '../../../types/domain';
import styles from './MeetingsScreen.module.css';

// Master Spec 10.3 Meetings -- invite staff (with a real conflict check
// before save, via the check_schedule_conflicts() SECURITY DEFINER
// function so an organizer never sees a colleague's actual schedule,
// just a busy/free signal), attendees accept/decline, reminder is the
// invite notification itself (in-app + SMS, sent by useCreateMeeting).
export function MeetingsScreen() {
  const profile = useSessionStore((s) => s.profile);
  const { data: staff } = useStaffDirectory();
  const fromDate = isoDateOnly(new Date());
  const toDate = isoPlusDays(fromDate, 60);
  const { data: meetings, isLoading } = useMyMeetings(fromDate, toDate);
  const createMeeting = useCreateMeeting();
  const checkConflicts = useCheckScheduleConflicts();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(fromDate);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('10:30');
  const [location, setLocation] = useState('');
  const [inviteeKeys, setInviteeKeys] = useState<string[]>([]);
  const [conflicts, setConflicts] = useState<{ staffKey: string; hasConflict: boolean }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleInvitee(key: string) {
    setConflicts(null);
    setInviteeKeys((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }

  async function runConflictCheck() {
    const keys = [...inviteeKeys, profile?.key ?? ''].filter(Boolean);
    const result = await checkConflicts.mutateAsync({ staffKeys: keys, date, startTime, endTime });
    setConflicts(result);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || inviteeKeys.length === 0) return;
    try {
      await createMeeting.mutateAsync({ title: title.trim(), description: description.trim() || undefined, date, startTime, endTime, meetingLocation: location.trim() || undefined, inviteeKeys });
      setTitle('');
      setDescription('');
      setLocation('');
      setInviteeKeys([]);
      setConflicts(null);
      setShowForm(false);
    } catch (e) {
      setError(friendlyError(e, 'Could not create the meeting'));
    }
  }

  const conflictedNames = (conflicts ?? [])
    .filter((c) => c.hasConflict)
    .map((c) => (c.staffKey === profile?.key ? 'You' : (staff ?? []).find((s) => s.key === c.staffKey)?.name || c.staffKey));

  return (
    <div className={styles.wrap}>
      <p className={styles.sub}>Next 60 days — organized by you or invited to</p>

      <button type="button" className={styles.newBtn} onClick={() => setShowForm((v) => !v)}>
        {showForm ? 'Cancel' : '+ New meeting'}
      </button>

      {showForm && (
        <form className={styles.form} onSubmit={submit}>
          <input className={styles.input} placeholder="Meeting title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <textarea className={styles.textarea} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          <div className={styles.formRow}>
            <input className={styles.select} type="date" value={date} onChange={(e) => { setDate(e.target.value); setConflicts(null); }} />
            <input className={styles.select} type="time" value={startTime} onChange={(e) => { setStartTime(e.target.value); setConflicts(null); }} />
            <input className={styles.select} type="time" value={endTime} onChange={(e) => { setEndTime(e.target.value); setConflicts(null); }} />
          </div>
          <input className={styles.input} placeholder="Location / meeting link (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />

          <div className={styles.inviteeLabel}>Invite staff</div>
          <div className={styles.inviteeList}>
            {(staff ?? [])
              .filter((s) => s.key !== profile?.key)
              .map((s) => (
                <label key={s.key} className={styles.inviteeChip}>
                  <input type="checkbox" checked={inviteeKeys.includes(s.key)} onChange={() => toggleInvitee(s.key)} />
                  {s.name}
                </label>
              ))}
          </div>

          <button type="button" className={styles.checkBtn} disabled={checkConflicts.isPending || inviteeKeys.length === 0} onClick={runConflictCheck}>
            {checkConflicts.isPending ? 'Checking…' : 'Check for conflicts'}
          </button>
          {conflicts && conflictedNames.length > 0 && (
            <p className={styles.conflictWarning}>⚠ Possible conflict at this time for: {conflictedNames.join(', ')}.</p>
          )}
          {conflicts && conflictedNames.length === 0 && <p className={styles.conflictOk}>No conflicts found for this time.</p>}

          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.addBtn} disabled={createMeeting.isPending || !title.trim() || inviteeKeys.length === 0}>
            {createMeeting.isPending ? 'Sending invites…' : 'Create meeting & invite'}
          </button>
        </form>
      )}

      {isLoading && <p className={styles.empty}>Loading…</p>}
      {!isLoading && (meetings ?? []).length === 0 && <p className={styles.empty}>No upcoming meetings.</p>}

      <div className={styles.list}>
        {(meetings ?? [])
          .sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')))
          .map((m) => (
            <MeetingCard key={m.id} meeting={m} isOrganizer={m.ownerKey === profile?.key} myKey={profile?.key ?? ''} staff={staff ?? []} />
          ))}
      </div>
    </div>
  );
}

function MeetingCard({ meeting, isOrganizer, myKey, staff }: { meeting: ScheduleItem; isOrganizer: boolean; myKey: string; staff: { key: string; name: string }[] }) {
  const { data: invitees } = useMeetingInvitees(meeting.id);
  const respond = useRespondToMeeting();
  const myInvite = (invitees ?? []).find((i) => i.staffKey === myKey);

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>{meeting.title}</div>
      <div className={styles.cardMeta}>
        {fmtLongDate(meeting.date)} · {meeting.startTime?.slice(0, 5)}–{meeting.endTime?.slice(0, 5)}
        {meeting.meetingLocation ? ` · ${meeting.meetingLocation}` : ''}
      </div>
      {meeting.description && <div className={styles.cardDesc}>{meeting.description}</div>}

      {!isOrganizer && myInvite && myInvite.status === 'invited' && (
        <div className={styles.rsvpRow}>
          <button type="button" className={styles.acceptBtn} disabled={respond.isPending} onClick={() => respond.mutate({ inviteeId: myInvite.id, status: 'accepted' })}>
            Accept
          </button>
          <button type="button" className={styles.declineBtn} disabled={respond.isPending} onClick={() => respond.mutate({ inviteeId: myInvite.id, status: 'declined' })}>
            Decline
          </button>
        </div>
      )}
      {!isOrganizer && myInvite && myInvite.status !== 'invited' && (
        <div className={`${styles.rsvpStatus} ${myInvite.status === 'accepted' ? styles.rsvpAccepted : styles.rsvpDeclined}`}>
          You {myInvite.status}
        </div>
      )}

      {isOrganizer && (
        <div className={styles.attendeeList}>
          {(invitees ?? []).map((i) => (
            <span key={i.id} className={`${styles.attendeePill} ${i.status === 'accepted' ? styles.attendeeAccepted : i.status === 'declined' ? styles.attendeeDeclined : styles.attendeePending}`}>
              {i.staffName ?? staff.find((s) => s.key === i.staffKey)?.name ?? i.staffKey} {i.status === 'accepted' ? '✓' : i.status === 'declined' ? '✕' : '…'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
