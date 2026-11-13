"use client";

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase } from '@/lib/supabase.client';

type Conversation = {
  id: string;
  lead_id: string;
  author_key: string;
  channel: 'call' | 'meeting' | 'site_visit' | 'message' | 'other';
  body: string;
  next_action: string | null;
  next_action_date: string | null;
  created_at: string;
};
type LeadOption = { id: string; label: string };
const channels = [
  ['call', 'Call'], ['meeting', 'Meeting'], ['site_visit', 'Site visit'],
  ['message', 'Message'], ['other', 'Other'],
] as const;

function ghanaTime(value: string) {
  return new Date(value).toLocaleString('en-GB', {
    timeZone: 'Africa/Accra', dateStyle: 'medium', timeStyle: 'short',
  });
}

export function LeadConversationTimeline({ leads }: { leads: LeadOption[] }) {
  const queryClient = useQueryClient();
  const idsKey = [...new Set(leads.map((lead) => lead.id))].sort().join(',');
  const ids = useMemo(() => idsKey ? idsKey.split(',') : [], [idsKey]);
  const [selectedLead, setSelectedLead] = useState('');
  const [channel, setChannel] = useState<Conversation['channel']>('call');
  const [body, setBody] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [composing, setComposing] = useState(false);
  const activeLead = ids.includes(selectedLead) ? selectedLead : ids[0];
  const labels = useMemo(() => new Map(leads.map((lead) => [lead.id, lead.label])), [leads]);

  const history = useQuery({
    queryKey: ['lead-conversations', idsKey], enabled: ids.length > 0, staleTime: 15000,
    queryFn: async () => {
      const db = requireSupabase();
      const [entries, people] = await Promise.all([
        db.from('lead_conversations').select('id,lead_id,author_key,channel,body,next_action,next_action_date,created_at')
          .in('lead_id', ids).order('created_at', { ascending: false }).limit(1000),
        db.from('profiles').select('agent_key,name'),
      ]);
      if (entries.error) throw entries.error;
      if (people.error) throw people.error;
      return {
        entries: (entries.data ?? []) as Conversation[],
        names: new Map((people.data ?? []).map((person) => [person.agent_key as string, person.name as string])),
      };
    },
  });

  useEffect(() => {
    if (!ids.length) return;
    const db = requireSupabase();
    const subscription = db.channel(`lead-conversations-${idsKey}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_conversations' }, (event) => {
        if (ids.includes((event.new as { lead_id?: string }).lead_id ?? '')) {
          void queryClient.invalidateQueries({ queryKey: ['lead-conversations', idsKey] });
        }
      }).subscribe();
    return () => { void db.removeChannel(subscription); };
  }, [ids, idsKey, queryClient]);

  const add = useMutation({
    mutationFn: async () => {
      const db = requireSupabase();
      const { error } = await db.from('lead_conversations').insert({
        lead_id: activeLead, channel, body: body.trim(),
        next_action: nextAction.trim() || null, next_action_date: nextDate || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setBody(''); setNextAction(''); setNextDate(''); setComposing(false);
      await queryClient.invalidateQueries({ queryKey: ['lead-conversations', idsKey] });
    },
  });

  if (!ids.length) return null;
  return <section className="min-w-0 rounded-2xl border border-border bg-card p-4 text-card-foreground sm:p-5" aria-label="Client conversations">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-base font-semibold">Client conversations</h2><p className="mt-1 text-sm text-muted-foreground">Calls, meetings and agreed next steps, shared with staff who can access this lead. Entries keep their original timestamp.</p></div>
      {!composing && <button type="button" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent" onClick={() => setComposing(true)}>Add conversation</button>}
    </div>
    {composing && <form className="mt-4 grid gap-3 rounded-xl border bg-background p-3" onSubmit={(event) => { event.preventDefault(); if (body.trim() && activeLead) add.mutate(); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        {leads.length > 1 && <label className="grid gap-1 text-sm">Lead<select className="min-w-0 rounded-md border bg-background p-2" value={activeLead} onChange={(event) => setSelectedLead(event.target.value)}>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.label}</option>)}</select></label>}
        <label className="grid gap-1 text-sm">Conversation type<select className="rounded-md border bg-background p-2" value={channel} onChange={(event) => setChannel(event.target.value as Conversation['channel'])}>{channels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <label className="grid gap-1 text-sm">What was discussed?<textarea className="min-h-28 w-full rounded-md border bg-background p-2" maxLength={5000} required value={body} onChange={(event) => setBody(event.target.value)} placeholder="Record the conversation and the client's response" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Agreed next step (optional)<input className="min-w-0 rounded-md border bg-background p-2" maxLength={500} value={nextAction} onChange={(event) => setNextAction(event.target.value)} /></label>
        <label className="grid gap-1 text-sm">Next step due (optional)<input className="min-w-0 rounded-md border bg-background p-2" type="date" value={nextDate} onChange={(event) => setNextDate(event.target.value)} /></label>
      </div>
      {add.error && <p role="alert" className="text-sm text-destructive">Could not save this conversation. Check your lead access and try again.</p>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => setComposing(false)}>Cancel</button><button type="submit" disabled={!body.trim() || add.isPending} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{add.isPending ? 'Saving…' : 'Save conversation'}</button></div>
    </form>}
    {history.isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading conversations…</p>}
    {history.error && <p role="alert" className="mt-4 text-sm text-destructive">Conversation history could not be loaded.</p>}
    {history.data?.entries.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No conversations recorded yet. Existing personal notes are kept separately.</p>}
    <ol className="mt-4 space-y-3">{history.data?.entries.map((entry) => <li key={entry.id} className="min-w-0 rounded-xl border bg-background p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">{history.data.names.get(entry.author_key) ?? entry.author_key}</span><span>·</span><time dateTime={entry.created_at}>{ghanaTime(entry.created_at)} GMT</time><span>·</span><span>{channels.find(([value]) => value === entry.channel)?.[1] ?? entry.channel}</span>{leads.length > 1 && <><span>·</span><span>{labels.get(entry.lead_id) ?? 'Lead'}</span></>}</div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{entry.body}</p>
      {entry.next_action && <p className="mt-2 text-sm"><span className="font-medium">Next step:</span> {entry.next_action}{entry.next_action_date ? ` · due ${entry.next_action_date}` : ''}</p>}
    </li>)}</ol>
  </section>;
}
