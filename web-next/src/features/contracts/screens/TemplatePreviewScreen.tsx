import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useContractTemplates, useContractTemplateVersions } from '../hooks/useContractTemplates';
import { useCanFulfilContracts } from '../hooks/useContractRequests';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { resolveContractFields, resolveSections } from '../lib/contractFieldResolver';
import { buildContractFromSections, contractFilename } from '../lib/contractSectionsPdf';
import type { ContractSection, Lead } from '../../../types/domain';
import styles from './TemplatePreviewScreen.module.css';

// CONTRACT_OF_SALE_BLUEPRINT.md §6.3 -- a small hardcoded SAMPLE lead,
// clearly labeled as such, per the standing "never pass off examples as
// real data" rule. Real company config (vendor name etc.) is NOT faked --
// only the client-specific data is sample.
const SAMPLE_LEAD: Lead = {
  id: 'sample',
  agent: 'sample',
  name: 'Kwabena Sample',
  contact: '0240000000',
  date: new Date().toISOString().slice(0, 10),
  plotType: 'Full Plot',
  noPlots: 1,
  unitPrice: 48000,
  paymentPlan: '6 Months',
  amtPaid: 14400,
  grandTotal: 48000,
  stage: '2A',
  address: 'East Legon, Accra',
  kyc: {
    nationality: 'Ghanaian',
    occupation: 'Sample Occupation',
    idType: 'Ghana Card',
    idNumber: 'GHA-000000000-0',
    contactName: 'Sample Contact Person',
    contactPhone: '0240000001',
    landUsage: 'Residential',
  },
};

// Renders {{token}} substrings that survived resolution (an unrecognized
// or genuinely-unfillable-for-a-sample-lead key) as highlighted chips
// rather than silently showing broken literal text.
function renderWithTokens(text: string) {
  const parts = text.split(/(\{\{[A-Za-z][A-Za-z0-9]*\}\})/g);
  return parts.map((part, i) => (part.startsWith('{{') ? <span className={styles.token} key={i}>{part}</span> : <span key={i}>{part}</span>));
}

export function TemplatePreviewScreen() {
  const { id: templateId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const requestedVersionId = searchParams.get('version');
  const navigate = useNavigate();
  const canManage = useCanFulfilContracts();
  const { data: templates } = useContractTemplates();
  const { data: versions } = useContractTemplateVersions(templateId ?? '');
  const { data: config } = useConfig();

  if (!canManage) {
    return <p className={styles.empty}>You don&apos;t have access to this. Ask a manager if you need it.</p>;
  }

  const template = templates?.find((t) => t.id === templateId);
  // Previews the specific version the caller was viewing (?version=) --
  // falls back to the published version, then the latest, only when no
  // specific version was requested (e.g. a direct/bookmarked URL).
  const version = (requestedVersionId && versions?.find((v) => v.id === requestedVersionId)) || versions?.find((v) => v.status === 'published') || versions?.[0] || null;

  if (!templateId || (templates && !template)) {
    return <p className={styles.empty}>Template not found.</p>;
  }
  if (!template || !versions || !config) {
    return <p className={styles.empty}>Loading…</p>;
  }
  if (!version || version.content.length === 0) {
    return (
      <div className={styles.wrap}>
        <button type="button" className={styles.back} onClick={() => navigate(`/app/office/contracts/templates/${templateId}`)}>
          ← {template.name}
        </button>
        <p className={styles.empty}>This version has no sections yet — nothing to preview.</p>
      </div>
    );
  }

  const fieldValues = resolveContractFields(SAMPLE_LEAD, config);
  const resolved: ContractSection[] = resolveSections(version.content, fieldValues);

  function download() {
    const doc = buildContractFromSections(template!.name, resolved);
    doc.save(contractFilename(SAMPLE_LEAD.name));
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.back} onClick={() => navigate(`/app/office/contracts/templates/${templateId}`)}>
        ← {template.name}
      </button>

      <div className={styles.topBar}>
        <span className={styles.name}>Preview — v{version.versionNumber}</span>
        <button type="button" className={styles.downloadBtn} onClick={download}>
          Download preview PDF
        </button>
      </div>

      <p className={styles.sampleBanner}>Preview — sample data, not a real client.</p>

      <div className={styles.page}>
        {resolved.map((section) =>
          section.kind === 'heading' ? (
            <div className={styles.heading} key={section.id}>
              {renderWithTokens(section.text ?? '')}
            </div>
          ) : section.kind === 'signature_block' ? (
            <div className={styles.signature} key={section.id}>
              Signed and delivered — Sign / Name / Designation (Vendor and Purchaser)
            </div>
          ) : section.kind === 'image' ? (
            <div className={styles.image} key={section.id}>
              [Image: {section.imageRef || 'not set'}]
            </div>
          ) : (
            <div className={styles.section} key={section.id}>
              {renderWithTokens(section.text ?? '')}
            </div>
          )
        )}
      </div>
    </div>
  );
}
