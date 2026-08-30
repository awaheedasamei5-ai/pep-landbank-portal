import ExcelJS from 'exceljs';

// Shared styling helpers for .xlsx report workbooks -- port of index.html's
// xlStyleHeader()/xlZebra()/xlAddDataSheet() (index.html:20057-20083). Same
// navy header band + lime accent rule the app's other exports use, so a
// downloaded workbook reads as the same product family as the branded PDF
// reports (see shared/lib/pdfReport.ts).
export function xlStyleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1E3D' } };
    cell.alignment = { vertical: 'middle' };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF84CC16' } } };
  });
  row.height = 20;
}

export function xlZebra(ws: ExcelJS.Worksheet, startRow = 2) {
  for (let i = startRow; i <= ws.rowCount; i++) {
    if ((i - startRow) % 2 === 1) {
      ws.getRow(i).eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F5' } };
      });
    }
  }
}

export function xlAddDataSheet<T extends object>(wb: ExcelJS.Workbook, name: string, columns: Partial<ExcelJS.Column>[], rows: T[], moneyKeys: string[] = []): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns;
  rows.forEach((r) => ws.addRow(r));
  xlStyleHeader(ws);
  moneyKeys.forEach((k) => {
    const col = ws.getColumn(k);
    col.numFmt = '"GHS" #,##0';
  });
  xlZebra(ws);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}
