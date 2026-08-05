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

/** Save one or more export documents (HTML) as Excel, formulas included.
 *
 *  A document that reproduces one of the client's own workbooks carries its
 *  worksheet ready-built (`d.sheet`) — that layout is the client's, down to the
 *  column widths, so it is written as it stands rather than derived from the
 *  HTML. Its tab still takes the name the caller gave the document, so a
 *  whole-stage workbook stays numbered the way the others are. */
export function downloadDocsExcel(filename, docs) {
  const list = (Array.isArray(docs) ? docs : [docs]).filter((d) => d && (d.html || d.sheet || d.sheets?.length));
  if (!list.length) return;
  const many = list.length > 1;
  downloadWorkbook(filename, list.flatMap((d, i) => {
    const name = d.name || `Sheet${i + 1}`;
    // A document may be a whole workbook of its own — the supplier purchase
    // order is a letter plus an annexure per range. Taken on its own it keeps
    // the tab names its source file uses; gathered with others, each tab is
    // prefixed so one supplier's annexure can't be mistaken for another's.
    if (d.sheets?.length) return d.sheets.map((s) => ({ ...s, name: many ? `${name} ${s.name}` : s.name }));
    return [d.sheet ? { ...d.sheet, name } : htmlToSheet(d.html, name)];
  }));
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
/* Most of the library is wide enough to want landscape; a document that copies
   a client workbook prints the way that workbook is set up (2 · Barcode is
   portrait, as its sheet is), so the page rule is chosen per print job. */
const pageRule = (orientation) => `@page { size: A4 ${orientation === "portrait" ? "portrait" : "landscape"}; margin: 10mm; }`;

const PRINT_CSS = `
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

  /* 2 · Barcode and 3 · Packing print as the client's own workbooks print —
     Arial on a black hairline grid, green codes, bold barcodes — so the paper,
     the preview and the .xlsx are the same sheet. */
  table.wb { font-family: Arial, Helvetica, sans-serif; color: #000; }
  /* Codes and figures are single tokens — never let the printer split one
     across two lines to save a column. Everything else wraps, so a wide sheet
     grows its rows instead of running off the edge of the paper. */
  table.wb td, table.wb th { border: 1px solid #000 !important; padding: 3px 4px; font-size: 8.5pt; vertical-align: middle; word-break: normal; white-space: normal; }
  table.wb .gd, table.wb .gdc, table.wb .bh, table.wb .code,
  table.wb td.c, table.wb td.r { white-space: nowrap; }
  table.wb td.po { white-space: normal; text-align: center; max-width: 150px; }
  table.wb th { background: #fff !important; color: #000 !important; font-weight: 700; text-align: center; }
  table.wb tr.po td { background: #fff !important; color: #000 !important; font-weight: 700; text-align: left; }
  table.wb tr.po.rule td { border-left: none !important; border-right: none !important; border-top: none !important; }
  table.wb tr.po td.red, table.wb th.red { color: #ff0000 !important; }
  table.wb th.r { text-align: right; }
  table.wb .nb { border: none !important; }
  table.wb tr.tot td { background: #fff !important; color: #000 !important; font-weight: 700; }
  table.wb tr.tot td.o { border-left: none !important; border-right: none !important; }
  table.wb .gd { color: #339966 !important; font-weight: 700; }
  table.wb .gdc { color: #339966 !important; font-weight: 700; text-align: center; }
  table.wb .bh { font-weight: 700; text-align: center; }
  table.wb .code { font-weight: 700; text-align: center; }

  /* 6 · Suppliers' PO — the letter, printed as their Page1 prints. */
  table.wb.letter { border: 1px solid #000; table-layout: fixed; width: 100%; }
  table.wb.letter td, table.wb.letter th { border: none !important; padding: 2px 5px; white-space: normal; }
  table.wb.letter th { border: 1px solid #000 !important; background: #fff !important; color: #000 !important; }
  table.wb.letter .ttl { color: #f00 !important; font-weight: 700; text-align: center; border-bottom: 1px solid #000 !important; }
  table.wb.letter .brand { font-family: Centaur, Georgia, serif; font-size: 17pt; font-weight: 700; color: #800000 !important; text-align: right; vertical-align: top; }
  table.wb.letter .logo { float: left; width: 54px; height: auto; margin: 1px 0 0 1px; }
  /* .sub is a block elsewhere in the library; inside the letter it is a cell. */
  table.wb.letter td.sub { display: table-cell; color: #800000 !important; text-align: right; font-size: 8.5pt; margin: 0; }
  table.wb.letter .addr { color: #3366ff !important; text-align: right; }
  table.wb.letter .lbl { color: #00f !important; font-weight: 700; }
  table.wb.letter .gst { color: #00f !important; font-weight: 700; text-align: center; vertical-align: top; }
  table.wb.letter tr.band td { font-weight: 700; }
  table.wb.letter .u { text-decoration: underline; }
  table.wb.letter .bx { border: 1px solid #000 !important; }
  table.wb.letter .sgn { color: #3366ff !important; }
  table.wb.letter tr.sign td { height: 46px; }
  table.wb.letter .buyer { color: #f00 !important; text-decoration: underline; }
  table.wb.letter tr td.l, table.wb.letter tr.band td { border-top: 1px solid #000 !important; border-bottom: 1px solid #000 !important; }
  .pgbrk { page-break-before: always; }

  /* 10 · E-way bill — the portal's entry form, printed as their format sheet. */
  .ew { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #000; }
  .ew table { border-collapse: collapse; width: 100%; margin: 0 0 3px; }
  .ew td { border: none !important; padding: 2px 4px; vertical-align: middle; }
  .ew .lbl { background: none !important; color: #000 !important; font-weight: 400; white-space: nowrap; }
  .ew .hd { font-weight: 400; padding-top: 7px; }
  .ew .fld { border: 1px solid #000 !important; }
  .ew .ph { color: #999 !important; }
  .ew .b { font-weight: 700; }
  .ew .c { text-align: center; }
  .ew .i { font-style: italic; text-align: center; }
  .ew .on { font-weight: 700; font-style: normal; }
  .ew .ewtop td { padding-bottom: 9px; }
  .ew .ewband td { border-top: 1px solid #000 !important; border-bottom: 1px solid #000 !important; padding: 5px 4px; }
  .ew .ewband td:first-child { border-left: 1px solid #000 !important; }
  .ew .ewband td:last-child { border-right: 1px solid #000 !important; }
  .ew .ewitems .hd td, .ew .ewtot .hd td { text-align: center; border: none !important; }
  .ew .ewgrid .gap td { height: 12px; }
  .ew .ewpart { width: auto; margin-left: 110px; }
  .ew .ewpart .lbl { padding-right: 10px; }
  .ew .ewline .fld { min-width: 110px; }

  /* 11 · Despatch instructions — the letter, on the letterhead. */
  .dl { font-family: Calibri, Arial, sans-serif; font-size: 10.5pt; color: #000; line-height: 1.45; }
  .dl table { border-collapse: collapse; width: 100%; margin: 0; }
  .dl td { border: none !important; padding: 0; vertical-align: top; }
  .dl .brand { font-family: Centaur, Georgia, serif; font-size: 34pt; font-weight: 700; color: #8b0000 !important; letter-spacing: 1px; line-height: 1; }
  .dl .sub { font-family: Centaur, Georgia, serif; font-size: 13pt; color: #8b0000 !important; letter-spacing: 2px; padding-left: 48px; }
  .dl .lg { width: 100px; text-align: right; }
  .dl .lg img { width: 86px; height: auto; }
  .dl .rule { border-top: 1px solid #c00; margin: 6px 0 12px; }
  .dl .ref { margin-bottom: 14px; }
  .dl p { margin: 0 0 10px; font-size: 10.5pt; line-height: 1.45; }
  .dl .to { margin-bottom: 14px; }
  .dl .refline .k { display: inline-block; min-width: 30px; }
  .dl .k { background: none !important; color: #000 !important; font-weight: 400; }
  .dl .b { font-weight: 700; }
  .dl .sign { margin-top: 38px; }
  .dl .ins { margin: 0 0 10px; width: auto; }
  .dl .ins td { padding: 0 0 3px; }
  .dl .ins .n { width: 50px; padding-left: 22px; }
  .dl .dlfoot { margin-top: 2px; font-size: 9pt; color: #8b0000 !important; }
  .dl .dlfoot .r { text-align: right; }
`;

const escHtml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Print one or more HTML documents, for the client to save as PDF.
 * `docs` is a single html string, or [{ name?, html }].
 * `opts.orientation` — "portrait" for a document whose sheet is set up that
 * way; anything else keeps the library's landscape default.
 */
export function downloadPDF(title, docs, opts = {}) {
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
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>${pageRule(opts.orientation)}${PRINT_CSS}</style></head><body>${body}</body></html>`);
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
