"use client";

import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { ghs, normContact } from '../../../shared/lib/format';
import { PipePill, PipePillStrip } from '../../../shared/ui/PipePill';
import { Icon } from '../../../shared/ui/Icon';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useClients } from '../hooks/useClients';
import { clientKey } from '../lib/groupClients';
import type { Client } from '../../../types/domain';
import styles from './ClientDatabaseScreen.module.css';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

// A directory view over the same `leads` data "My pipeline" shows, grouped
// by client instead of by deal -- there is no separate clients table in
// production to query (confirmed live), see the Client type's comment in
// types/domain.ts for why this is a client-side aggregation, not a fetch.
export function ClientDatabaseScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useSessionStore((s) => s.profile);
  const isMgr = profile?.role === 'manager';
  const { data: clients, isLoading } = useClients();
  const [query, setQuery] = useState('');
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);

  // Same nested-route trick as Pipeline: the drawer's own child route lives
  // under this screen so the list stays mounted (and, on desktop, visible)
  // behind it instead of being unmounted by a sibling route.
  const hasDetailOpen = /^\/app\/sales\/clients\/[^/]+$/.test(location.pathname);

  const q = query.trim().toLowerCase();
  const qDigits = normContact(query).slice(-9);
  // Master Rebuild Spec 17.2: "Search by name, normalized phone and client
  // ID." Real gap this closes -- search used to do a raw substring match on
  // the contact field as typed, so "059 987 6543" or "+233 59 987 6543"
  // wouldn't find a client filed as "0559876543". Digit-only comparison
  // (same normalization clientKey's own grouping already uses) makes any
  // formatting of the same number match. "Client ID" -- there's no separate
  // customer_id table (see this screen's own module comment) -- resolves to
  // any of the client's real Lead IDs, the closest stable identity that
  // actually exists today.
  const filtered = (clients ?? []).filter((c) => {
    if (!q) return true;
    if (c.name.toLowerCase().includes(q)) return true;
    if (qDigits && normContact(c.contact).includes(qDigits)) return true;
    if (c.leadIds.some((id) => id.toLowerCase() === q)) return true;
    return false;
  });

  function openClient(c: Client) {
    setMenuOpenFor(null);
    navigate(`/dashboard/clients/${encodeURIComponent(clientKey(c.name, c.contact))}`);
  }

  function newDealFor(c: Client) {
    setMenuOpenFor(null);
    navigate('/dashboard/pipeline/new', { state: { name: c.name, contact: c.contact } });
  }

  // Same flex-row split-view fix as PipelineListScreen's own -- see that
  // file's comment for the full reasoning (a real gap, caught live at a
  // wider viewport, from mixing a percentage-of-.content list width with
  // a position:fixed drawer anchored to the viewport's own edge). One
  // split-view pattern for the app; fixed once, applied everywhere it's
  // used.
  return (
    <div className={`${styles.pageRow} ${hasDetailOpen ? styles.pageRowSplit : ''}`}>
      <div className={`${styles.wrap} ${hasDetailOpen ? `${styles.wrapHiddenMobile} ${styles.wrapWithDrawer}` : ''}`}>
        <h1 className={styles.title}>Client Database</h1>
        <p className={styles.sub}>{isMgr ? 'Every client, company-wide, grouped from the master pipeline' : 'Every client you own, grouped from your pipeline'}</p>

        <PipePillStrip>
          <PipePill tone="blue" value={clients?.length ?? 0} label="Clients" />
          <PipePill tone="green" value={ghs((clients ?? []).reduce((s, c) => s + c.totalValue, 0))} label="Total value" isMoney />
        </PipePillStrip>

        {/* Premium UI spec 6.H: "Search/filter controls should remain
            pinned at the top of the content area." Sticky at desktop,
            where the list panel scrolls independently and can run long. */}
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>
            <Icon name="search" size={16} />
          </span>
          <input
            className={styles.search}
            type="text"
            placeholder="Search by name, phone or lead ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {isLoading && <p className={styles.emptyMsg}>Loading…</p>}

        {/* Mobile: rich client cards (Premium UI spec 6.H). Tapping a card
            opens the Customer 360 detail as a full-screen route. */}
        <div className={styles.cardList}>
          {filtered.map((c) => {
            const key = clientKey(c.name, c.contact);
            return (
              <div className={styles.card} key={key}>
                <button type="button" className={styles.row} onClick={() => openClient(c)}>
                  <span className={styles.avatar}>{initials(c.name)}</span>
                  <div className={styles.rowMain}>
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
                <RowMenu client={c} isOpen={menuOpenFor === `m-${key}`} onToggle={() => setMenuOpenFor((v) => (v === `m-${key}` ? null : `m-${key}`))} onView={() => openClient(c)} onNewDeal={() => newDealFor(c)} />
              </div>
            );
          })}
        </div>

        {/* Desktop: real dense CRM table (Premium UI spec 6.H), same table
            language Pipeline's own desktop view already established.
            Clicking a row opens the Customer 360 drawer. */}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Client</th>
                <th className={styles.th}>Contact</th>
                <th className={`${styles.th} ${styles.thRight}`}>Deals</th>
                <th className={`${styles.th} ${styles.thRight}`}>Total value</th>
                <th className={styles.th} aria-hidden="true"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const key = clientKey(c.name, c.contact);
                return (
                  <Fragment key={key}>
                    <tr className={styles.tr} onClick={() => openClient(c)}>
                      <td className={styles.td}>
                        <div className={styles.tdNameCell}>
                          <span className={styles.avatar}>{initials(c.name)}</span>
                          <span>{c.name}</span>
                        </div>
                      </td>
                      <td className={`${styles.td} ${styles.tdMono}`}>{c.contact}</td>
                      <td className={`${styles.td} ${styles.tdRight}`}>{c.leadCount}</td>
                      <td className={`${styles.td} ${styles.tdMono} ${styles.tdRight}`}>{ghs(c.totalValue)}</td>
                      <td className={`${styles.td} ${styles.tdRight}`}>
                        <RowMenu client={c} isOpen={menuOpenFor === key} onToggle={() => setMenuOpenFor((v) => (v === key ? null : key))} onView={() => openClient(c)} onNewDeal={() => newDealFor(c)} />
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {clients && clients.length === 0 && !isLoading && <p className={styles.emptyMsg}>No clients yet — add a lead to your pipeline first.</p>}
        {clients && clients.length > 0 && filtered.length === 0 && <p className={styles.emptyMsg}>No clients match &quot;{query}&quot;.</p>}
      </div>
      <Outlet />
    </div>
  );
}

// Premium UI spec 6.H: "Group actions into one overflow menu instead of
// multiple tiny edit/delete/download icons." One consistent overflow
// pattern for both the mobile card and the desktop table row.
//
// Real bug caught live: the menu used to be a plain CSS absolute-position
// child of the button. The desktop table's own .tableWrap needs
// overflow-x:auto for its horizontal scroll (many columns), and per the
// CSS spec, setting only overflow-x forces overflow-y to auto too --
// which silently clipped the dropdown for any row near the table's
// bottom edge instead of letting it float above the table. Portaling the
// menu to document.body and positioning it with the trigger button's own
// getBoundingClientRect() (position:fixed, recomputed on open) sidesteps
// every ancestor's overflow/clipping entirely -- the correct general fix
// for "dropdown inside a scrolling container," not a one-off patch.
function RowMenu({ client, isOpen, onToggle, onView, onNewDeal }: { client: Client; isOpen: boolean; onToggle: () => void; onView: () => void; onNewDeal: () => void }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (isOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - 200) });
    } else {
      setPos(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onToggle();
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [isOpen, onToggle]);

  return (
    <div className={styles.menuWrap} onClick={(e) => e.stopPropagation()}>
      <button ref={btnRef} type="button" className={styles.menuBtn} onClick={onToggle} aria-label={`Actions for ${client.name}`} aria-expanded={isOpen}>
        <Icon name="more" size={16} />
      </button>
      {isOpen &&
        pos &&
        createPortal(
          <div ref={menuRef} className={styles.menu} style={{ position: 'fixed', top: pos.top, left: pos.left }}>
            <button type="button" className={styles.menuItem} onClick={onView}>
              View full profile
            </button>
            <button type="button" className={styles.menuItem} onClick={onNewDeal}>
              + New deal for this client
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}