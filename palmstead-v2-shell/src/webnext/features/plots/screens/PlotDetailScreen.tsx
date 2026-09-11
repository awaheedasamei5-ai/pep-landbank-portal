"use client";

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { friendlyError } from '../../../shared/lib/friendlyError';
import type { PlotStatus } from '../../../types/domain';
import { usePlots, useDeletePlot, useSplitPlot, useUpdatePlot } from '../hooks/usePlots';
import styles from './PlotDetailScreen.module.css';

// Subdivided is excluded -- that's the split RPC's own real-only output
// (see the plot.status === 'Subdivided' branch below), never a value
// staff sets by hand through this dropdown.
const PLOT_STATUSES: PlotStatus[] = ['Available', 'Running Search', 'Allocated', 'Reserved', 'Held for Approval', 'Blocked', 'Disputed', 'Archived'];

// Master Rebuild Spec, Allocation UI: "Click plot -> detail drawer with
// physical size, area, status, client, allocation history, parent/child
// units and actions." Premium UI spec Section E: "Plot detail should open
// as a side drawer on desktop and bottom sheet/full page on mobile." Real
// gap this closes -- the previous version expanded this inline under the
// row instead, the same pattern already corrected for Pipeline and Client
// Database. Same non-modal split-view drawer language as those two (nested
// :id route so the list stays mounted behind it, no dimming backdrop,
// closes via its own button).
export function PlotDetailScreen() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: plots } = usePlots();
  const update = useUpdatePlot();
  const del = useDeletePlot();
  const split = useSplitPlot();

  const plot = (plots ?? []).find((p) => p.id === id) ?? null;
  const parent = plot?.parentPlotId ? (plots ?? []).find((p) => p.id === plot.parentPlotId) ?? null : null;
  const siblings = plot ? (plots ?? []).filter((p) => p.parentPlotId === plot.id || (plot.parentPlotId && p.parentPlotId === plot.parentPlotId && p.id !== plot.id)) : [];

  const [status, setStatus] = useState<PlotStatus>(plot && plot.status !== 'Subdivided' ? plot.status : 'Available');
  const [price, setPrice] = useState(plot?.price != null ? String(plot.price) : '');
  const [clientName, setClientName] = useState(plot?.clientName ?? '');
  const [clientContact, setClientContact] = useState(plot?.clientContact ?? '');
  const [notes, setNotes] = useState(plot?.notes ?? '');
  const [section, setSection] = useState(plot?.section ?? '');
  const [widthFt, setWidthFt] = useState(plot?.widthFt != null ? String(plot.widthFt) : '');
  const [lengthFt, setLengthFt] = useState(plot?.lengthFt != null ? String(plot.lengthFt) : '');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'split' | 'delete' | null>(null);
  const [editing, setEditing] = useState(false);

  const canSplit = !!plot && plot.status === 'Available' && plot.plotType === 'Full Plot' && plot.unitKind !== 'half' && !plot.parentPlotId;

  async function save() {
    if (!plot) return;
    setError(null);
    try {
      await update.mutateAsync({
        id: plot.id,
        patch: {
          status,
          price: price ? Number(price) : null,
          clientName: clientName || null,
          clientContact: clientContact || null,
          notes: notes || null,
          section: section.trim() || null,
          widthFt: widthFt ? Number(widthFt) : null,
          lengthFt: lengthFt ? Number(lengthFt) : null,
        },
      });
      setEditing(false);
    } catch (e) {
      setError(friendlyError(e, 'Failed to save'));
    }
  }

  return (
    <div className={styles.drawerBackdrop}>
      <div className={styles.drawerPanel}>
        <button type="button" className={styles.closeDrawerBtn} onClick={() => navigate('/dashboard/plots')} aria-label="Close" title="Close">
          ✕
        </button>

        {!plot ? (
          <div className={styles.wrap}>
            <p className={styles.emptyMsg}>Plot not found.</p>
          </div>
        ) : (
          <div className={styles.wrap}>
            <div className={styles.head}>
              <span className={`${styles.avatar} ${styles[`avatar_${plot.status.replace(/\s/g, '')}`]}`}>{plot.plotNumber.slice(0, 3)}</span>
              <div>
                <div className={styles.eyebrow}>{plot.site}</div>
                <div className={styles.name}>{plot.plotNumber}</div>
                <div className={styles.meta}>
                  {plot.plotType}
                  {plot.widthFt != null && plot.lengthFt != null ? ` · ${plot.widthFt}×${plot.lengthFt}ft` : ''}
                  {plot.areaSqft != null ? ` · ${plot.areaSqft.toLocaleString()} sqft` : ''}
                </div>
              </div>
            </div>

            <div className={styles.statsRow}>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Status</div>
                <div className={styles.statValue}>{plot.status}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Price</div>
                <div className={styles.statValue}>{plot.price != null ? ghs(plot.price) : '—'}</div>
              </div>
            </div>

            {plot.status === 'Subdivided' && (
              <div className={styles.section}>
                <p className={styles.helpText}>
                  This plot has been split into {siblings.map((s) => s.plotNumber).join(' and ')} — manage each half separately.
                </p>
                <div className={styles.childList}>
                  {siblings.map((s) => (
                    <button key={s.id} type="button" className={styles.childRow} onClick={() => navigate(`/dashboard/plots/${s.id}`)}>
                      <span>{s.plotNumber}</span>
                      <span className={`${styles.badge} ${styles[`badge_${s.status.replace(/\s/g, '')}`]}`}>{s.status}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {parent && (
              <p className={styles.helpText}>
                Half of {parent.plotNumber} — the other half is{' '}
                <button type="button" className={styles.linkBtn} onClick={() => navigate(`/dashboard/plots/${parent.id}`)}>
                  {siblings[0]?.plotNumber ?? 'nearby'}
                </button>
                .
              </p>
            )}

            {plot.status !== 'Subdivided' && (
              <>
                <div className={styles.section}>
                  <div className={styles.sectionHead}>
                    <span className={styles.sectionTitle}>Allocation</span>
                  </div>
                  <div className={styles.card}>
                    <div className={styles.field}>
                      <div className={styles.label}>Client</div>
                      <div>{plot.clientName || '—'}</div>
                      {plot.clientContact && <div className={styles.meta}>{plot.clientContact}</div>}
                    </div>
                  </div>
                </div>

                {!editing ? (
                  <button type="button" className={styles.editBtn} onClick={() => setEditing(true)}>
                    Edit plot details
                  </button>
                ) : (
                  <div className={styles.card}>
                    <div className={styles.grid2}>
                      <select className={styles.input} value={status} onChange={(e) => setStatus(e.target.value as PlotStatus)}>
                        {PLOT_STATUSES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                      <input className={styles.input} type="number" placeholder="Price (GHS)" value={price} onChange={(e) => setPrice(e.target.value)} />
                    </div>
                    <div className={styles.grid2} style={{ marginTop: 8 }}>
                      <input className={styles.input} placeholder="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
                      <input className={styles.input} placeholder="Client contact" value={clientContact} onChange={(e) => setClientContact(e.target.value)} />
                    </div>
                    <div className={styles.grid2} style={{ marginTop: 8 }}>
                      <input className={styles.input} placeholder="Section/block" value={section} onChange={(e) => setSection(e.target.value)} />
                      <div className={styles.grid2} style={{ gap: 8 }}>
                        <input className={styles.input} type="number" placeholder="Width (ft)" value={widthFt} onChange={(e) => setWidthFt(e.target.value)} />
                        <input className={styles.input} type="number" placeholder="Length (ft)" value={lengthFt} onChange={(e) => setLengthFt(e.target.value)} />
                      </div>
                    </div>
                    <textarea className={styles.input} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ marginTop: 8, minHeight: 60 }} />
                    {error && <p className={styles.errorMsg}>{error}</p>}
                    <div className={styles.actionsRow}>
                      <button type="button" className={styles.cancelBtn} onClick={() => setEditing(false)}>
                        Cancel
                      </button>
                      <button type="button" className={styles.submitBtn} disabled={update.isPending} onClick={save}>
                        {update.isPending ? 'Saving…' : 'Save changes'}
                      </button>
                    </div>
                  </div>
                )}

                {plot.notes && !editing && (
                  <div className={styles.section}>
                    <div className={styles.sectionTitle}>Notes</div>
                    <p className={styles.helpText}>{plot.notes}</p>
                  </div>
                )}

                {canSplit && !editing && (
                  <div className={styles.splitBox}>
                    <div className={styles.splitTitle}>Need to sell this as two Half Plots instead?</div>
                    <p className={styles.helpText}>
                      Splits {plot.plotNumber} into {plot.plotNumber}a and {plot.plotNumber}b — two separate Half Plot units, both Available.
                    </p>
                    {confirming === 'split' ? (
                      <div className={styles.actionsRow}>
                        <button type="button" className={styles.cancelBtn} onClick={() => setConfirming(null)}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          className={styles.submitBtn}
                          disabled={split.isPending}
                          onClick={() => split.mutateAsync(plot.id).then(() => setConfirming(null))}
                        >
                          {split.isPending ? 'Splitting…' : 'Yes, split it'}
                        </button>
                      </div>
                    ) : (
                      <button type="button" className={styles.cancelBtn} onClick={() => setConfirming('split')}>
                        Split into {plot.plotNumber}a / {plot.plotNumber}b
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            <div className={styles.dangerRow}>
              {confirming === 'delete' ? (
                <>
                  <p className={styles.helpText}>Remove plot {plot.plotNumber} from inventory entirely? This cannot be undone.</p>
                  <div className={styles.actionsRow}>
                    <button type="button" className={styles.cancelBtn} onClick={() => setConfirming(null)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={styles.dangerBtn}
                      style={{ flex: 1 }}
                      disabled={del.isPending}
                      onClick={() => del.mutateAsync(plot.id).then(() => navigate('/dashboard/plots'))}
                    >
                      {del.isPending ? 'Deleting…' : 'Yes, delete it'}
                    </button>
                  </div>
                </>
              ) : (
                <button type="button" className={styles.dangerBtn} onClick={() => setConfirming('delete')}>
                  Delete plot
                </button>
              )}
            </div>

            <button type="button" className={styles.backBtn} onClick={() => navigate('/dashboard/plots')}>
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}