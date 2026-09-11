"use client";

import { useState } from 'react';
import { useUpdateConfig } from '../../manager/hooks/useConfigSettings';
import { friendlyError } from '../../../shared/lib/friendlyError';
import type { Config } from '../../../types/domain';
import styles from './PricingQuotationSettingsTab.module.css';

const DEFAULT_ACCENT = '#0D4D2D'; // matches quotationPdf.ts's own QGREEN_DARK
const MAX_LOGO_BYTES = 500 * 1024;

// Real user ask (2026-09-11): "add a settings tab where when we click,
// we can edit company name, address of company, the note section, even
// the logo we can upload any new logo, and it would replace the current
// logo u never know, we should always be ready because the company may
// rebrand ... this settings section will be called template settings,
// where we can even change the colours of the template ... make the
// template setting every detailed that, we can edit every single thing
// on the template." Every field here writes to a real app_config column
// already read by quotationPdf.ts/technicalQuotationPdf.ts -- the real
// bug this closes (found while building this tab) was that config.
// update() never whitelisted ANY of them for writing at all (see
// data/source.ts's own comment), so no settings UI could ever have
// saved these before, regardless of what it looked like.
export function TemplateSettingsTab({ config }: { config: Config }) {
  const update = useUpdateConfig();
  const [companyName, setCompanyName] = useState(config.quoteCompanyName);
  const [siteName, setSiteName] = useState(config.quoteSiteName);
  const [footerAddress, setFooterAddress] = useState(config.quoteFooterAddress);
  const [docTypeText, setDocTypeText] = useState(config.quoteDocTypeText);
  const [notesText, setNotesText] = useState(config.quoteNotesText);
  const [landNoteText, setLandNoteText] = useState(config.quoteLandNoteText);
  const [logoPreview, setLogoPreview] = useState<string | null>(config.quoteLogoImage);
  const [accentColor, setAccentColor] = useState(config.quoteAccentColor ?? DEFAULT_ACCENT);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const dirty =
    companyName !== config.quoteCompanyName ||
    siteName !== config.quoteSiteName ||
    footerAddress !== config.quoteFooterAddress ||
    docTypeText !== config.quoteDocTypeText ||
    notesText !== config.quoteNotesText ||
    landNoteText !== config.quoteLandNoteText ||
    logoPreview !== config.quoteLogoImage ||
    accentColor !== (config.quoteAccentColor ?? DEFAULT_ACCENT);

  function onLogoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    setLogoError(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setLogoError('Please choose an image file (PNG or JPEG).');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError('That image is too large -- please use one under 500KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(String(reader.result));
    reader.onerror = () => setLogoError('Could not read that file -- please try another.');
    reader.readAsDataURL(file);
  }

  async function save() {
    setError(null);
    try {
      await update.mutateAsync({
        quoteCompanyName: companyName.trim(),
        quoteSiteName: siteName.trim(),
        quoteFooterAddress: footerAddress.trim(),
        quoteDocTypeText: docTypeText.trim(),
        quoteNotesText: notesText,
        quoteLandNoteText: landNoteText.trim(),
        quoteLogoImage: logoPreview,
        quoteAccentColor: accentColor,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(friendlyError(e, 'Failed to save template settings'));
    }
  }

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionTitle}>Company identity</div>
      <p className={styles.sectionHint}>Shown on every Quotation and Technical Quotation PDF -- the header, footer address, and the branded logo in the top-left corner.</p>
      <div className={styles.field}>
        <label className={styles.label}>Company name</label>
        <input className={styles.input} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
      </div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Site / address (under the company name)</label>
          <input className={styles.input} value={siteName} onChange={(e) => setSiteName(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Footer address</label>
          <input className={styles.input} value={footerAddress} onChange={(e) => setFooterAddress(e.target.value)} />
        </div>
      </div>

      <div className={styles.sectionSubtitle}>Logo</div>
      <p className={styles.sectionHint}>Upload a replacement any time the company rebrands -- it takes over from the current default logo on every quotation immediately.</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            border: '1px solid var(--c-line)',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {logoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoPreview} alt="Logo preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: 10, color: 'var(--c-muted)' }}>Default</span>
          )}
        </div>
        <div>
          <label className={styles.saveBtn} style={{ display: 'inline-block', width: 'auto', padding: '8px 16px', cursor: 'pointer' }}>
            Upload new logo
            <input type="file" accept="image/*" onChange={onLogoChosen} style={{ display: 'none' }} />
          </label>
          {logoPreview && (
            <button
              type="button"
              className={styles.cancelLink}
              style={{ marginLeft: 8 }}
              onClick={() => setLogoPreview(null)}
            >
              Reset to default
            </button>
          )}
        </div>
      </div>
      {logoError && <p className={styles.errorMsg}>{logoError}</p>}

      <div className={styles.sectionSubtitle}>Template color</div>
      <p className={styles.sectionHint}>The header band, section bars, and stat highlights all derive from this one brand color -- change it and every shade updates together.</p>
      <div className={styles.field} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="color"
          value={accentColor}
          onChange={(e) => setAccentColor(e.target.value)}
          style={{ width: 44, height: 36, padding: 2, border: '1px solid var(--c-line)', borderRadius: 8, background: 'var(--c-paper)', cursor: 'pointer' }}
        />
        <input className={styles.input} style={{ flex: 1 }} value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
        {accentColor.toLowerCase() !== DEFAULT_ACCENT.toLowerCase() && (
          <button type="button" className={styles.cancelLink} onClick={() => setAccentColor(DEFAULT_ACCENT)}>
            Reset
          </button>
        )}
      </div>

      <div className={styles.sectionSubtitle}>Document title (installment quotations)</div>
      <p className={styles.sectionHint}>Shown top-right on a quotation with a payment plan. Outright/full-payment quotations always just say "Quotation" -- that part isn&apos;t editable, since it&apos;s a factual statement about the deal.</p>
      <div className={styles.field}>
        <input className={styles.input} value={docTypeText} onChange={(e) => setDocTypeText(e.target.value)} />
      </div>

      <div className={styles.sectionSubtitle}>Numbered notes</div>
      <p className={styles.sectionHint}>One per line -- each is automatically numbered on the PDF (1. 2. 3. ...).</p>
      <div className={styles.field}>
        <textarea className={styles.input} style={{ minHeight: 100, fontFamily: 'inherit' }} value={notesText} onChange={(e) => setNotesText(e.target.value)} />
      </div>

      <div className={styles.sectionSubtitle}>Land delivery note</div>
      <p className={styles.sectionHint}>The bold note above "Thank you for your business" near the bottom of the page.</p>
      <div className={styles.field}>
        <textarea className={styles.input} style={{ minHeight: 70, fontFamily: 'inherit' }} value={landNoteText} onChange={(e) => setLandNoteText(e.target.value)} />
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}
      <button type="button" className={styles.saveBtn} disabled={!dirty || update.isPending} onClick={save}>
        {update.isPending ? 'Saving…' : saved ? 'Saved ✓' : 'Save template settings'}
      </button>
    </div>
  );
}
