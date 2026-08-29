import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { PipePill, PipePillStrip } from '../../../shared/ui/PipePill';
import { StageBadge } from '../../pipeline/components/StageBadge';
import { useLeads } from '../../pipeline/hooks/useLeads';
import { useClients } from '../hooks/useClients';
import { clientKey } from '../lib/groupClients';
import styles from './ClientDatabaseScreen.module.css';

// A directory view over the same `leads` data "My pipeline" shows, grouped
// by client instead of by deal -- there is no separate clients table in
// production to query (confirmed live), see the Client type's comment in
// types/domain.ts for why this is a client-side aggregation, not a fetch.
export function ClientDatabaseScreen() {
  const navigate = useNavigate();
  const { data: clients, isLoading } = useClients();
  const { data: leads } = useLeads();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const leadsByClient = useMemo(() => {
    const m = new Map<string, typeof leads>();
    for (const l of leads ?? []) {
      const key = clientKey(l.name, l.contact);
      const arr = m.get(key) ?? [];
      arr.push(l);
      m.set(key, arr);
    }
    return m;
  }, [leads]);

  const q = query.trim().toLowerCase();
  const filtered = (clients ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.contact.includes(q));

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Client Database</h1>
      <p className={styles.sub}>Every client you own, grouped from your pipeline</p>

      <PipePillStrip>
        <PipePill tone="blue" value={clients?.length ?? 0} label="Clients" />
        <PipePill tone="green" value={ghs((clients ?? []).reduce((s, c) => s + c.totalValue, 0))} label="Total value" isMoney />
      </PipePillStrip>

      <div className={styles.searchWrap} style={{ marginTop: 16 }}>
        <input
          className={styles.search}
          type="text"
          placeholder="Search by name or contact…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {isLoading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {filtered.map((c) => {
        const key = clientKey(c.name, c.contact);
        const isOpen = expanded.has(key);
        const clientLeads = leadsByClient.get(key) ?? [];
        return (
          <div className={styles.card} key={key}>
            <button type="button" className={styles.row} onClick={() => toggle(key)} aria-expanded={isOpen}>
              <div>
                <div className={styles.name}>{c.name}</div>
                <div className={styles.meta}>{c.contact}</div>
              </div>
              <div className={styles.right}>
                <div className={styles.value}>{ghs(c.totalValue)}</div>
                <div className={styles.count}>
                  {c.leadCount} {c.leadCount === 1 ? 'deal' : 'deals'}
                </div>
              </div>
            </button>
            {isOpen && (
              <div className={styles.leads}>
                {clientLeads.map((l) => (
                  <div key={l.id} className={styles.leadRow} onClick={() => navigate(`/app/sales/pipeline/${l.id}`)} role="button" tabIndex={0}>
                    <div>
                      <div>
                        {l.plotType}
                        {l.noPlots > 1 ? ` ×${l.noPlots}` : ''}
                      </div>
                      <div className={styles.leadMeta}>{l.date}</div>
                    </div>
                    <div className={styles.right}>
                      <div className={styles.leadValue}>{ghs(l.grandTotal)}</div>
                      <div style={{ marginTop: 4 }}>
                        <StageBadge stage={l.stage} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {clients && clients.length === 0 && !isLoading && <p style={{ color: 'var(--muted)' }}>No clients yet — add a lead to your pipeline first.</p>}
      {clients && clients.length > 0 && filtered.length === 0 && <p style={{ color: 'var(--muted)' }}>No clients match "{query}".</p>}
    </div>
  );
}
