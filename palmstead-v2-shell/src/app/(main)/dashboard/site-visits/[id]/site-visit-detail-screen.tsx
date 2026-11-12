"use client";

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, ExternalLink } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireSupabase } from '@/lib/supabase.client';
import { useSessionStore } from '@/webnext/auth/useSessionStore';
import { useDownloadSiteVisitFormPdf } from '@/webnext/features/site-visits/hooks/useSiteVisitFormPdf';
import { getDataSource } from '@/webnext/data/source';
import { mapSiteVisitRow } from '@/webnext/data/mappers';
import type { SiteVisit } from '@/webnext/types/domain';

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div className="min-w-0 border-b border-border/60 py-3 last:border-0">
    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{value === null || value === undefined || value === '' ? 'Not recorded' : value}</dd>
  </div>;
}

function outcome(visit: SiteVisit) {
  if (visit.deletedAt) return 'Cancelled';
  if (visit.attended === true) return 'Attended';
  if (visit.attended === false) return 'Did not attend';
  return 'Attendance unconfirmed';
}

export function SiteVisitDetailScreen() {
  const id = String(useParams<{ id: string }>().id ?? '');
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const query = useQuery({
    queryKey: ['site-visit-detail', id, profile?.key, demoMode],
    enabled: !!id && !!profile?.key,
    queryFn: async () => {
      if (demoMode) return (await getDataSource(true).siteVisits.listAll()).find((item) => item.id === id) ?? null;
      const { data, error } = await requireSupabase().from('site_visits').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
      if (error) throw error;
      return data ? mapSiteVisitRow(data) : null;
    },
  });
  const visit = query.data;
  const formPdf = useDownloadSiteVisitFormPdf();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profile?.key) return;
    const db = requireSupabase();
    const channel = db.channel(`site-visit-detail-${profile.key}-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_visits', filter: `id=eq.${id}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ['site-visit-detail', id] });
      }).subscribe();
    return () => { void db.removeChannel(channel); };
  }, [id, profile?.key, queryClient]);

  return <main className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-5 p-4 pb-12 md:p-8">
    <Button asChild variant="ghost" className="self-start"><Link href="/dashboard/site-visits"><ArrowLeft className="size-4" /> Back to site visits</Link></Button>
    {query.isLoading && <p className="text-sm text-muted-foreground">Loading visit record…</p>}
    {query.error && <p role="alert" className="text-sm text-destructive">Could not load this visit. Try again.</p>}
    {!query.isLoading && !query.error && !visit && <Card><CardContent className="pt-6"><h1 className="text-xl font-semibold">Visit unavailable</h1><p className="mt-2 text-sm text-muted-foreground">This visit does not exist or your account cannot access it.</p></CardContent></Card>}
    {visit && <>
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><p className="text-sm font-medium text-primary">Site visit record</p><h1 className="break-words text-2xl font-semibold tracking-tight md:text-3xl">{visit.name}</h1><p className="mt-1 text-sm text-muted-foreground">{visit.visitDate}{visit.visitTime ? ` at ${visit.visitTime}` : ''} · {visit.site}</p></div>
        <div className="flex flex-wrap gap-2"><Badge variant="outline">{outcome(visit)}</Badge><Badge variant="secondary">{visit.leadId ? 'Linked to pipeline' : 'No linked lead'}</Badge></div>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="pt-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Scheduled</p><p className="mt-1 text-lg font-semibold">{visit.visitDate}</p><p className="text-sm text-muted-foreground">{visit.visitTime || 'Time not recorded'}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Visit outcome</p><p className="mt-1 text-lg font-semibold">{outcome(visit)}</p><p className="text-sm text-muted-foreground">Recorded attendance only</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Party size</p><p className="mt-1 text-lg font-semibold">{visit.people ?? 'Unknown'}</p><p className="text-sm text-muted-foreground">People expected at site</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Recorded by</p><p className="mt-1 break-words text-lg font-semibold">{visit.agentName}</p><p className="text-sm text-muted-foreground">{visit.createdAt ? `Created ${new Date(visit.createdAt).toLocaleString('en-GB', { timeZone: 'Africa/Accra' })}` : 'Creation time unavailable'}</p></CardContent></Card>
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Client and visit request</CardTitle></CardHeader><CardContent><dl>
          <Field label="Client contact" value={visit.contact} /><Field label="Site" value={visit.site} /><Field label="Plot of interest" value={visit.plot} /><Field label="Visit purpose" value={visit.purpose} /><Field label="Lead source" value={visit.source} /><Field label="Accompanying people" value={visit.accompanied} />
        </dl><Button className="mt-4" variant="outline" disabled={formPdf.isPending} onClick={() => formPdf.mutate(visit)}><Download className="size-4" />{formPdf.isPending ? 'Preparing form…' : 'Download request form'}</Button>{formPdf.error && <p role="alert" className="mt-2 text-sm text-destructive">Could not create the request form.</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Travel and preparation</CardTitle></CardHeader><CardContent><dl>
          <Field label="Transport" value={visit.transport} /><Field label="Pickup point" value={visit.pickup} /><Field label="Place of work" value={visit.placeOfWork} /><Field label="Position" value={visit.position} /><Field label="Nationality" value={visit.nationality} /><Field label="Discussion so far" value={visit.discussionSoFar} /><Field label="Key understanding" value={visit.keyUnderstanding} />
        </dl></CardContent></Card>
        <Card><CardHeader><CardTitle>Outcome and follow-up</CardTitle></CardHeader><CardContent><dl>
          <Field label="Attendance" value={outcome(visit)} /><Field label="Staff follow-up text" value={visit.feedbackAfter} /><Field label="Next steps" value={visit.keyNextSteps} /><Field label="Internal notes" value={visit.notes} />{visit.deletedAt && <Field label="Cancellation reason" value={visit.cancellationReason} />}
        </dl><p className="mt-3 text-xs text-muted-foreground">Staff follow-up text is separate from the client feedback survey. An unconfirmed visit is not counted as a no-show.</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Connected records</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
          <div><p className="font-medium">Pipeline lead</p>{visit.leadId ? <Button asChild variant="outline" className="mt-2"><Link href={`/dashboard/pipeline/${visit.leadId}`}><ExternalLink className="size-4" /> Open linked lead</Link></Button> : <p className="mt-1 text-muted-foreground">No exact lead link has been recorded for this visit. Payments or sales cannot be attributed to it yet.</p>}</div>
          <div><p className="font-medium">Client feedback and site manager review</p><Button asChild variant="outline" className="mt-2"><Link href="/dashboard/site-visits/experience"><ExternalLink className="size-4" /> Open Experience</Link></Button><p className="mt-2 text-muted-foreground">Review the separate client response and the site manager day report there.</p></div>
          <div><p className="font-medium">Visit authorization and cost</p><Button asChild variant="outline" className="mt-2"><Link href="/dashboard/site-visit-authorization"><ExternalLink className="size-4" /> Open authorization</Link></Button><p className="mt-2 text-muted-foreground">Cost is recorded by the authorization workflow; this view does not infer an amount from the visit request.</p></div>
        </CardContent></Card>
      </div>
    </>}
  </main>;
}

