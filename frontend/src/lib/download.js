/* Browser downloads.

   Every report and every export document offers the same two formats:

     Excel — a real .xlsx (lib/xlsx.js) with the arithmetic still live, so
             changing a quantity in the sheet re-totals the row.
     PDF   — the same layout, rendered through the browser's own print
             engine, which is what turns it into a PDF the client can send on.

   `downloadCSV` stays for the plain machine-readable dump. */
import { buildXLSX } from "./xlsx.js";
import { gridToSheet, gridToHtml, htmlToSheet } from "./sheet.js";

function saveBlob(blob, filename) {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch (e) {
    alert("Download blocked by the browser — the table on screen holds the same data.");
    return false;
  }
}

export function downloadCSV(filename, headers, rows) {
  const esc = (c) => `"${String(c ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  saveBlob(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), filename);
}

const xlsxName = (name) => (/\.xlsx$/i.test(name) ? name : `${name.replace(/\.(xls|csv)$/i, "")}.xlsx`);

/** Save a workbook — `sheets` is what lib/sheet.js produces. */
export function downloadWorkbook(filename, sheets) {
  const list = Array.isArray(sheets) ? sheets : [sheets];
  if (!list.length) return;
  saveBlob(buildXLSX({ sheets: list }), xlsxName(filename));
}

/** Save one of the app's own tables as Excel, formulas included. */
export function downloadGridExcel(filename, sheetName, columns, rows, opts) {
  downloadWorkbook(filename, [gridToSheet(sheetName, columns, rows, opts)]);
}

/** Save one or more export documents (HTML) as Excel, formulas included. */
export function downloadDocsExcel(filename, docs) {
  const list = (Array.isArray(docs) ? docs : [docs]).filter((d) => d && d.html);
  if (!list.length) return;
  downloadWorkbook(filename, list.map((d, i) => htmlToSheet(d.html, d.name || `Sheet${i + 1}`)));
}

/** Print one of the app's own tables, for the client to save as PDF. */
export function downloadGridPDF(title, columns, rows, opts) {
  downloadPDF(title, [{ html: gridToHtml(columns, rows, { title, ...opts }) }]);
}

/* ---- PDF ------------------------------------------------------------------
   Rendered by the browser: the document goes into an off-screen frame with
   print styling and `print()` is called on it, so the client picks "Save as
   PDF" (or a printer) from the dialog they already know. No PDF library ships
   with the app, and nothing leaves the machine.                            */
const PRINT_CSS = `
  @page { size: A4 landscape; margin: 10mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #243b53; margin: 0; padding: 4mm; }
  table { border-collapse: collapse; margin-bottom: 6px; width: 100%; page-break-inside: auto; }
  tr { page-break-inside: avoid; page-break-after: auto; }
  thead { display: table-header-group; }
  td, th { border: 1px solid #aebccb; padding: 3px 6px; vertical-align: top; font-size: 8.5pt; word-break: break-word; }
  th { background: #0b2c4d !important; color: #fff !important; font-weight: 700; text-align: center; }
  .title { font-size: 15pt; font-weight: 800; color: #0b2c4d; display: block; margin-bottom: 3px; }
  .sub { font-size: 8.5pt; color: #516170; display: block; margin-bottom: 6px; }
  .lg { font-size: 12pt; font-weight: 800; color: #0b2c4d; }
  .r { text-align: right; } .c { text-align: center; } .b { font-weight: 700; }
  .sec { background: #e6edf4 !important; font-weight: 700; color: #0b2c4d; }
  .tot { background: #fbe6c2 !important; font-weight: 800; color: #0b2c4d; }
  .k { background: #f2f5f8 !important; font-weight: 700; white-space: nowrap; color: #0b2c4d; }
  .plain td { border: none; padding: 1px 6px; }
  p { font-size: 9pt; line-height: 1.5; margin: 5px 0; }
  .jg-doc + .jg-doc { page-break-before: always; }
`;

const escHtml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Print one or more HTML documents, for the client to save as PDF.
 * `docs` is a single html string, or [{ name?, html }].
 */
export function downloadPDF(title, docs) {
  const list = (Array.isArray(docs) ? docs : [{ html: docs }]).filter((d) => d && d.html);
  if (!list.length) return;
  const body = list.map((d) => `<div class="jg-doc">${d.html}</div>`).join("");

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;";
  document.body.appendChild(frame);

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    setTimeout(() => { try { frame.remove(); } catch (e) { /* already gone */ } }, 500);
  };

  try {
    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>${PRINT_CSS}</style></head><body>${body}</body></html>`);
    doc.close();

    const go = () => {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.onafterprint = cleanup;
        frame.contentWindow.print();
      } catch (e) {
        alert("The browser would not open the print dialog. Use the Excel download instead.");
      }
      // Safari never fires onafterprint from a frame; sweep up regardless.
      setTimeout(cleanup, 60000);
    };
    // Give the frame a tick to lay the tables out before measuring pages.
    setTimeout(go, 120);
  } catch (e) {
    cleanup();
    alert("Could not build the PDF in this browser — use the Excel download instead.");
  }
}
