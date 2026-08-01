/* ============================================================================
   Two ways into the workbook model that lib/xlsx.js writes.

   `gridToSheet` is for the app's own tables: give it the column definitions
   and the rows and it produces a sheet with the formulas already wired.

   `htmlToSheet` is for the 40 export documents. Those are built as HTML — the
   preview on screen and the download are the same layout, and that is worth
   keeping — so the builders annotate the cells that carry arithmetic and this
   reads the annotations back out:

     <th  data-k="qty">      names the column, so a formula can refer to it
     <td  data-t="int"       the number format, and a signal that this cell is
                             a number rather than text
          data-v="2000"      the exact value, free of ₹ / commas / rounding
          data-f="{qty}*{rate}">   a formula, in terms of the column names

   A footer cell marked `data-sum="qty"` becomes SUM() over that column's data
   rows. Everything unannotated stays text, so an unconverted document can
   never come out with a mangled figure — it just comes out as it looks.
   ============================================================================ */
import { colLetter, cellRef } from "./xlsx.js";

/* ---------- shared style descriptions ---------- */
const S = {
  title: { font: "title", border: false },
  h2: { font: "h2", border: false },
  sub: { font: "sub", border: false },
  plain: { border: false },
  head: { font: "white", fill: "head", align: "center", wrap: true },
  key: { font: "bold", fill: "key" },
  sec: { font: "bold", fill: "sec" },
  tot: { font: "bold", fill: "tot" },
  bold: { font: "bold" },
};

const withFmt = (base, fmt, align) => {
  const out = { ...base };
  if (fmt) out.fmt = fmt;
  if (align) out.align = align;
  return out;
};

/* Rough column width from the text it has to hold. */
function widthsFor(rows, min = 8, max = 46) {
  const w = [];
  rows.forEach((row) => (row || []).forEach((cell, i) => {
    const c = cell && typeof cell === "object" ? cell : { v: cell };
    const text = c.f ? "0000000000" : String(c.v ?? "");
    const longest = text.split("\n").reduce((m, l) => Math.max(m, l.length), 0);
    w[i] = Math.max(w[i] || min, Math.min(max, longest + 2));
  }));
  return w;
}

/* ============================================================================
   1 · The app's own tables
   ==========================================================================*/

/**
 * Build a sheet from column definitions and rows.
 *
 * A column is `{ h, key, t, v, f, fml, sum, w, align }`:
 *   h    header text
 *   key  name other columns' formulas refer to as {key}
 *   t    number format name (int / num / num3 / inr / usd / usd4 …)
 *   v    (row) => number — the value, when the column is numeric
 *   f    (row) => string — the text, when it is not
 *   fml  formula template, e.g. "{qty}*{rate}" — wins over v
 *   sum  true to total the column in the footer row
 *
 * `opts.title` / `opts.subtitle` put heading rows above the table, and
 * `opts.footLabel` names the totals row.
 */
export function gridToSheet(name, columns, rows, opts = {}) {
  const cols = columns.filter(Boolean);
  const out = [];
  const merges = [];
  const span = Math.max(1, cols.length);

  const heading = (text, style) => {
    if (!text) return;
    out.push([{ v: text, s: style }]);
    if (span > 1) merges.push(`A${out.length}:${colLetter(span)}${out.length}`);
  };
  heading(opts.title, S.title);
  heading(opts.subtitle, S.sub);
  if (out.length) out.push([]);

  const headRow = out.length + 1;
  out.push(cols.map((c) => ({ v: c.h, s: S.head })));

  const colOf = {};
  cols.forEach((c, i) => { if (c.key) colOf[c.key] = i + 1; });

  // "{qty}*{rate}" -> "D7*E7"; an unknown name resolves to 0 so a formula can
  // never reference a column that is not on this sheet.
  const resolve = (tpl, rowNo) =>
    String(tpl).replace(/\{(\w+)\}/g, (_, k) => (colOf[k] ? cellRef(rowNo, colOf[k]) : "0"));

  const first = out.length + 1;
  rows.forEach((r, ri) => {
    const rowNo = first + ri;
    out.push(cols.map((c) => {
      const align = c.align || (c.t ? "right" : undefined);
      if (c.fml) {
        const tpl = typeof c.fml === "function" ? c.fml(r, rowNo) : c.fml;
        if (tpl) return { f: resolve(tpl, rowNo), s: withFmt({}, c.t, align) };
      }
      if (c.v) {
        const n = Number(c.v(r, ri));
        return { v: Number.isFinite(n) ? n : 0, t: "n", s: withFmt({}, c.t, align) };
      }
      const text = c.f ? c.f(r, ri) : r[c.key];
      return { v: text == null ? "" : String(text), s: withFmt({}, null, c.align) };
    }));
  });
  const last = out.length;

  if (rows.length && cols.some((c) => c.sum)) {
    out.push(cols.map((c, i) => {
      if (i === 0) return { v: opts.footLabel || "TOTAL", s: S.tot };
      if (!c.sum) return { v: "", s: S.tot };
      const L = colLetter(i + 1);
      return { f: `SUM(${L}${first}:${L}${last})`, s: withFmt({ ...S.tot }, c.t, "right") };
    }));
  }

  const widths = cols.map((c, i) => c.w || Math.max(String(c.h || "").length + 3,
    widthsFor(out.slice(headRow))[i] || 10));

  return { name, rows: out, merges, widths, freeze: headRow };
}

/* The same column spec, rendered as the document-styled HTML the PDF print
   view expects — so a report's Excel and its PDF can never drift apart. */
export function gridToHtml(columns, rows, opts = {}) {
  const cols = columns.filter(Boolean);
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fmt = (c, r, i) => {
    if (c.text) return esc(c.text(r, i));
    if (c.v) {
      const n = Number(c.v(r, i));
      if (!Number.isFinite(n)) return "";
      const d = c.t === "int" ? 0 : c.t === "num3" ? 3 : c.t === "usd4" ? 4 : 2;
      const s = n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
      return c.t === "inr" ? `₹${s}` : (c.t === "usd" || c.t === "usd4") ? `$${s}` : s;
    }
    const raw = c.f ? c.f(r, i) : r[c.key];
    return esc(raw == null ? "" : raw);
  };

  const head = `<tr>${cols.map((c) => `<th>${esc(c.h)}</th>`).join("")}</tr>`;
  const body = rows.map((r, i) => `<tr>${cols.map((c) =>
    `<td class="${c.t || c.align === "right" ? "r" : c.align === "center" ? "c" : ""}">${fmt(c, r, i)}</td>`).join("")}</tr>`).join("");

  const totals = cols.some((c) => c.sum) && rows.length
    ? `<tr class="tot">${cols.map((c, i) => {
      if (i === 0) return `<td>${esc(opts.footLabel || "TOTAL")}</td>`;
      if (!c.sum) return "<td></td>";
      const t = rows.reduce((s, r, ri) => s + (Number(c.v ? c.v(r, ri) : r[c.key]) || 0), 0);
      const d = c.t === "int" ? 0 : c.t === "num3" ? 3 : c.t === "usd4" ? 4 : 2;
      const s = t.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
      return `<td class="r">${c.t === "inr" ? "₹" : (c.t === "usd" || c.t === "usd4") ? "$" : ""}${s}</td>`;
    }).join("")}</tr>`
    : "";

  return `${opts.title ? `<div class="title">${esc(opts.title)}</div>` : ""}`
    + `${opts.subtitle ? `<div class="sub">${esc(opts.subtitle)}</div>` : ""}`
    + `<table>${head}${body}${totals}</table>`;
}

/* ============================================================================
   2 · The export documents (HTML in, sheet out)
   ==========================================================================*/

/** Text of a node, with <br> read as a line break. */
function textOf(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  return clone.textContent.replace(/ /g, " ").replace(/[ \t]+\n/g, "\n")
    .split("\n").map((l) => l.trim()).join("\n").trim();
}

const NUMERIC = /^-?[\d.,]+$/;
function parseNumber(text) {
  const cleaned = String(text).replace(/[₹$,%\s]/g, "").replace(/[–—]/g, "");
  if (!cleaned || !NUMERIC.test(cleaned)) return null;
  const n = Number(cleaned.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function styleForCell(el, isHead) {
  const cls = el.className || "";
  const base = isHead ? { ...S.head }
    : cls.includes("tot") ? { ...S.tot }
      : cls.includes("sec") ? { ...S.sec }
        : cls.includes("k") && /\bk\b/.test(cls) ? { ...S.key }
          : cls.includes("b") && /\bb\b/.test(cls) ? { ...S.bold }
            : {};
  if (!isHead) {
    if (/\br\b/.test(cls)) base.align = "right";
    else if (/\bc\b/.test(cls)) base.align = "center";
  }
  const fmt = el.getAttribute("data-t");
  if (fmt) { base.fmt = fmt; if (!base.align) base.align = "right"; }
  return base;
}

/* One <table> with no nested tables -> a block of rows. */
function gridFromTable(table, out, merges) {
  const trs = table.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr");
  if (!trs.length) return;

  const colOf = {};                     // data-k -> 1-based column
  let dataFrom = 0;
  let dataTo = 0;
  const startRow = out.length + 1;

  const rowsOfThisTable = [];
  trs.forEach((tr) => {
    const cells = [];
    let ci = 0;
    let headRow = false;
    Array.from(tr.children).forEach((el) => {
      const tag = el.tagName.toLowerCase();
      if (tag !== "td" && tag !== "th") return;
      const isHead = tag === "th";
      if (isHead) headRow = true;
      const wide = Math.max(1, parseInt(el.getAttribute("colspan") || "1", 10) || 1);
      ci += 1;
      const key = el.getAttribute("data-k");
      if (key && isHead) colOf[key] = ci;

      cells.push({ el, isHead, at: ci, wide });
      for (let k = 1; k < wide; k++) { cells.push(null); ci += 1; }
    });
    rowsOfThisTable.push({ cells, headRow, tr });
  });

  /* Data rows are everything that is not a header and not a totals or section
     band — that is the range a SUM() in the footer covers. The totals class
     sits on the <tr>, not on its cells, and missing it would make every SUM
     include its own answer: a circular reference Excel refuses to open
     cleanly. Both are checked. */
  const isBandRow = (r) => /\b(tot|sec)\b/.test(r.tr.className || "")
    || r.cells.some((c) => c && /\b(tot|sec)\b/.test(c.el.className || ""));
  rowsOfThisTable.forEach((r, i) => {
    if (!r.headRow && !isBandRow(r)) {
      const rowNo = startRow + i;
      if (!dataFrom) dataFrom = rowNo;
      dataTo = rowNo;
    }
  });

  const resolve = (tpl, rowNo) =>
    String(tpl).replace(/\{(\w+)\}/g, (_, k) => (colOf[k] ? cellRef(rowNo, colOf[k]) : "0"));

  rowsOfThisTable.forEach((r, i) => {
    const rowNo = startRow + i;
    const row = [];
    r.cells.forEach((c) => {
      if (!c) { row.push(null); return; }
      const { el, isHead, at, wide } = c;
      const style = styleForCell(el, isHead);
      const fml = el.getAttribute("data-f");
      const sumKey = el.getAttribute("data-sum");
      const fmt = el.getAttribute("data-t");

      if (wide > 1) merges.push(`${cellRef(rowNo, at)}:${cellRef(rowNo, at + wide - 1)}`);

      if (sumKey && colOf[sumKey] && dataFrom && dataTo >= dataFrom) {
        const L = colLetter(colOf[sumKey]);
        row.push({ f: `SUM(${L}${dataFrom}:${L}${dataTo})`, s: style });
        return;
      }
      if (fml && dataFrom) { row.push({ f: resolve(fml, rowNo), s: style }); return; }

      const text = textOf(el);
      if (fmt) {
        const attr = el.getAttribute("data-v");
        const n = attr != null && attr !== "" ? Number(attr) : parseNumber(text);
        if (n != null && Number.isFinite(n)) { row.push({ v: n, t: "n", s: style }); return; }
      }
      row.push({ v: text, s: style });
    });
    out.push(row);
  });
}

/* Walk the document's block structure, flattening layout tables. */
function walk(node, out, merges) {
  Array.from(node.childNodes).forEach((child) => {
    if (child.nodeType === 3) {
      const t = child.textContent.trim();
      if (t) out.push([{ v: t, s: S.plain }]);
      return;
    }
    if (child.nodeType !== 1) return;
    const tag = child.tagName.toLowerCase();
    if (tag === "br" || tag === "style" || tag === "script") return;

    if (tag === "table") {
      // A table used purely for page layout (the mastheads) holds other
      // tables; flatten it rather than trying to keep its two columns.
      if (child.querySelector("table")) {
        Array.from(child.querySelectorAll(":scope > tbody > tr > td, :scope > tr > td"))
          .forEach((td) => walk(td, out, merges));
      } else {
        gridFromTable(child, out, merges);
        out.push([]);
      }
      return;
    }

    if (child.querySelector && child.querySelector("table")) { walk(child, out, merges); return; }

    const cls = child.className || "";
    const text = textOf(child);
    if (!text) return;
    const style = cls.includes("title") ? S.title
      : cls.includes("lg") ? S.h2
        : cls.includes("sub") ? S.sub : S.plain;
    out.push([{ v: text, s: style }]);
  });
}

/** Turn one document's HTML into a sheet for the workbook writer. */
export function htmlToSheet(html, name = "Sheet1") {
  const doc = new DOMParser().parseFromString(`<body><div id="jg-root">${html}</div></body>`, "text/html");
  const root = doc.getElementById("jg-root");
  const rows = [];
  const merges = [];
  if (root) walk(root, rows, merges);

  const width = rows.reduce((m, r) => Math.max(m, (r || []).length), 1);
  // A lone heading cell is stretched across the table beneath it.
  rows.forEach((r, i) => {
    if (r && r.length === 1 && r[0] && r[0].s && r[0].s.border === false && width > 1) {
      merges.push(`A${i + 1}:${colLetter(width)}${i + 1}`);
    }
  });

  return { name, rows, merges, widths: widthsFor(rows) };
}
