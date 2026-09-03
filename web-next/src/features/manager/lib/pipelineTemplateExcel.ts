import ExcelJS from 'exceljs';
import type { Lead } from '../../../types/domain';

// Faithful port of index.html's "YOUR ACTUAL TEMPLATE, not a rebuild"
// pipeline Excel export (index.html:20085-20184) -- the template loaded
// from public/pipeline-template.xlsx is the real uploaded workbook,
// cleared of example rows, with every formula/formula-column/colour/sheet
// (Pipeline, Dashboard, Monthly Close, Activity Log, Trend, Config) left
// exactly as built. This only ever writes into the INPUT columns; the
// formula columns (#, Unit Price, Gross, Net, Interest, Grand, Balance)
// are already live formulas in the template and recalculate themselves
// in Excel. Import (round-tripping an edited workbook back into the app,
// reconciling against existing leads instead of duplicating them) is
// built in pipelineImportLogic.ts / usePipelineImport.ts, reusing the
// exact column layout exported below so the two stay in lockstep.
//
// priority/nextAction/siteVisit all exist on the Lead type but no Sales
// Desk/Pipeline Detail screen surfaces them as editable fields yet, so
// export falls back exactly the way index.html's own writeLeadsIntoTemplate
// does when a lead has none set ('Low' priority, 'No' site visit, blank
// next action) -- honest given no UI captures them yet, not a shortcut
// around real data that exists but isn't being read. All three now
// round-trip correctly (read here, written by a reconciling import in
// pipelineImportLogic.ts) even though editing them still needs a screen.
export const PL_INPUT_COLS: Record<string, number> = {
  name: 2,
  contact: 3,
  date: 4,
  stage: 5,
  plotType: 6,
  noPlots: 7,
  discount: 10,
  paymentPlan: 12,
  siteVisit: 15,
  priority: 16,
  amtPaid: 17,
  nextAction: 19,
  notes: 20,
  leadId: 21,
};
export const PL_DATA_START = 8;
export const PL_DATA_END = 91; // real file's live formula range is B8:B91 -- row 92 is the "how to add a client" note row
export const PL_HEADER_ROW = 7;

function xlFormulaOf(cell: ExcelJS.Cell): string | null {
  return cell.formula || null;
}

// Copies row 91's live formulas/style down to accommodate more leads than
// the original template planned for (e.g. Master Pipeline combining everyone).
function extendPipelineRows(ws: ExcelJS.Worksheet, newLastRow: number) {
  const tRow = 91;
  for (let r = PL_DATA_END + 1; r <= newLastRow; r++) {
    for (let c = 1; c <= 21; c++) {
      const src = ws.getRow(tRow).getCell(c);
      const dst = ws.getRow(r).getCell(c);
      try {
        dst.style = JSON.parse(JSON.stringify(src.style || {}));
      } catch {
        // A malformed style clone shouldn't block extending the rest of the sheet.
      }
      const f = xlFormulaOf(src);
      if (f != null) {
        dst.value = { formula: f.replace(new RegExp('\\$([A-Z]{1,2})' + tRow + '(?!\\d)', 'g'), '$$$1' + r) };
      }
    }
  }
}

async function loadPipelineTemplate(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const buf = await (await fetch('/pipeline-template.xlsx')).arrayBuffer();
  await wb.xlsx.load(buf);
  wb.created = new Date();
  const ws = wb.getWorksheet('💼 Pipeline');
  if (!ws) throw new Error('Pipeline template is missing its "💼 Pipeline" sheet');
  ws.getColumn(21).width = 24;
  ws.getColumn(21).hidden = true;
  ws.getCell('U7').value = 'Lead ID (do not edit)';
  ws.getCell('U7').font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getCell('U7').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1E3D' } };
  return wb;
}

// Your Dashboard tab's Stage Breakdown was built around the old English
// stage names (Prospecting, Qualified...). Since stages are now bare
// codes (1/2A/2B/3/4/Lost), repoint those labels/formulas so the counts
// actually match real data.
function fixDashboardStageBreakdown(wb: ExcelJS.Workbook, lastRow: number) {
  const dash = wb.getWorksheet('📊 Dashboard');
  if (!dash) return;
  const codes = ['1', '2A', '2B', '3', '4', 'Lost'];
  const rangeEnd = Math.max(lastRow || PL_DATA_END, 100);
  codes.forEach((code, i) => {
    const r = 14 + i;
    dash.getCell('B' + r).value = code;
    dash.getCell('D' + r).value = { formula: "COUNTIF('💼 Pipeline'!E8:E" + rangeEnd + ',"' + code + '")' };
  });
  dash.getCell('B20').value = null;
  dash.getCell('D20').value = null; // old 7th row (Closed-Lost), now unused

  // Pipeline sheet's own KPI banner (row 5) sums B8:B100-style ranges -- if
  // this export has more leads than that, widen those ranges too so totals stay correct.
  if (lastRow > 100) {
    const ws = wb.getWorksheet('💼 Pipeline');
    if (ws) {
      [1, 3, 5, 7, 9, 11, 13, 15, 17].forEach((col) => {
        const cell = ws.getRow(5).getCell(col);
        const f = xlFormulaOf(cell);
        if (f) cell.value = { formula: f.replace(/8:([A-Z]{1,2})100/g, '8:$1' + lastRow) };
      });
    }
  }
}

function writeLeadsIntoTemplate(wb: ExcelJS.Workbook, leads: (Lead & { agentTag?: string })[], tagAgentInNotes: boolean) {
  const ws = wb.getWorksheet('💼 Pipeline');
  if (!ws) throw new Error('Pipeline template is missing its "💼 Pipeline" sheet');
  const baseCapacity = PL_DATA_END - PL_DATA_START + 1;
  let lastRow = PL_DATA_END;
  if (leads.length > baseCapacity) {
    // capture the "how to add a client" note (row 92) BEFORE extending formulas overwrite it
    const noteRow = ws.getRow(92);
    const noteVals: ExcelJS.CellValue[] = [];
    for (let c = 1; c <= 21; c++) noteVals.push(noteRow.getCell(c).value);
    lastRow = PL_DATA_START + leads.length - 1;
    extendPipelineRows(ws, lastRow);
    const newNoteRow = ws.getRow(lastRow + 1);
    for (let c = 1; c <= 21; c++) if (noteVals[c - 1] != null) newNoteRow.getCell(c).value = noteVals[c - 1];
  }
  leads.forEach((l, i) => {
    const r = PL_DATA_START + i;
    const notes = tagAgentInNotes && l.agentTag ? '[' + l.agentTag + '] ' + (l.notes || '') : l.notes || '';
    const vals: Record<string, ExcelJS.CellValue> = {
      name: l.name,
      contact: l.contact,
      date: l.date ? new Date(l.date) : null,
      stage: l.stage,
      plotType: l.plotType,
      noPlots: l.noPlots,
      discount: l.discount ?? 0,
      paymentPlan: l.paymentPlan,
      siteVisit: l.siteVisit || 'No',
      priority: l.priority || 'Low',
      amtPaid: l.amtPaid,
      nextAction: '',
      notes,
      leadId: l.id,
    };
    Object.keys(PL_INPUT_COLS).forEach((k) => {
      ws.getRow(r).getCell(PL_INPUT_COLS[k]).value = vals[k] !== undefined ? vals[k] : null;
    });
  });
  // clear any leftover rows beyond this dataset (e.g. re-downloading after deleting a lead)
  for (let r = PL_DATA_START + leads.length; r <= lastRow; r++) {
    Object.keys(PL_INPUT_COLS).forEach((k) => {
      ws.getRow(r).getCell(PL_INPUT_COLS[k]).value = null;
    });
  }
  fixDashboardStageBreakdown(wb, lastRow);
}

function sortByName<T extends { name: string }>(rows: T[]): T[] {
  return rows.slice().sort((x, y) => (x.name || '').localeCompare(y.name || '', undefined, { sensitivity: 'base' }));
}

export async function buildMasterPipelineExcel(leads: (Lead & { agentTag: string })[]): Promise<ExcelJS.Buffer> {
  const wb = await loadPipelineTemplate();
  writeLeadsIntoTemplate(wb, sortByName(leads), true);
  return wb.xlsx.writeBuffer();
}

export async function buildAgentPipelineExcel(leads: Lead[]): Promise<ExcelJS.Buffer> {
  const wb = await loadPipelineTemplate();
  writeLeadsIntoTemplate(wb, sortByName(leads), false);
  return wb.xlsx.writeBuffer();
}

export function masterPipelineFilename(today: string): string {
  return `PEP_Landbank_Master_Pipeline_${today}.xlsx`;
}

export function agentPipelineFilename(agentName: string, today: string): string {
  return `Pipeline_${agentName.replace(/\s+/g, '_')}_${today}.xlsx`;
}
