/* ============================================================================
   A real .xlsx writer, with no dependencies.

   The old exports were HTML pretending to be a workbook: Excel opened them,
   but every figure arrived as dead text. The client needs the arithmetic to
   survive the download — change the pieces in the sheet and the total value
   must follow — so this writes the genuine OOXML package with `<f>` formulas
   in it.

   A workbook is a plain object:

     { sheets: [{ name, rows, merges, widths, freeze }] }

   `rows` is an array of rows, a row an array of cells, a cell one of:

     null | "" ................. blank
     "text" .................... an inline string
     { v: 1234, t: "n", fmt } .. a number, optionally with a format name
     { f: "D5*E5", fmt } ....... a formula — Excel works the value out itself
     { v, s: { … } } ........... any of the above with explicit styling

   Cells carry no cached result, and the workbook asks for a full calculation
   on load, so what opens is always what the formulas say — never a stale
   number baked in at download time.
   ============================================================================ */

/* ---- CRC-32, for the zip entries ---- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* ---- ZIP (stored, no compression — valid, and keeps this dependency-free) ---- */
function zipBlob(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  files.forEach((f) => {
    const name = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);       // version needed to extract
    lv.setUint16(6, 0x0800, true);   // UTF-8 file names
    lv.setUint16(8, 0, true);        // method 0 — stored
    lv.setUint16(10, 0, true);       // mod time
    lv.setUint16(12, 0x21, true);    // mod date (1980-01-01)
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    parts.push(local, data);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    central.push(cd);

    offset += local.length + data.length;
  });

  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/* ---- XML helpers ---- */
const X = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  // Control characters are illegal in XML 1.0 and would make Excel refuse
  // the whole file, so they are dropped rather than escaped.
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

const utf8 = (s) => new TextEncoder().encode(s);

export function colLetter(n) {
  let s = "";
  let x = Math.max(1, Math.floor(n));
  while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); }
  return s;
}
export const cellRef = (row, col) => `${colLetter(col)}${row}`;

/* ---- number formats, by name ---- */
export const FORMATS = {
  int: "#,##0",
  num: "#,##0.00",
  num1: "#,##0.0",
  num3: "#,##0.000",
  inr: '"₹"#,##0.00',
  inr0: '"₹"#,##0',
  usd: '"$"#,##0.00',
  usd4: '"$"#,##0.0000',
  pct: "0.00%",
  pct1: "0.0",
  date: "dd/mm/yyyy",
};

/* ---- style registry ------------------------------------------------------
   Styles are described by name rather than by index, and the registry hands
   out the OOXML indices at write time, so a builder never has to know what
   number a font ended up as.                                              */
const FONTS = [
  { key: "base", xml: '<font><sz val="10.5"/><color theme="1"/><name val="Calibri"/></font>' },
  { key: "bold", xml: '<font><b/><sz val="10.5"/><color rgb="FF0B2C4D"/><name val="Calibri"/></font>' },
  { key: "white", xml: '<font><b/><sz val="10.5"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' },
  { key: "title", xml: '<font><b/><sz val="15"/><color rgb="FF0B2C4D"/><name val="Calibri"/></font>' },
  { key: "h2", xml: '<font><b/><sz val="12"/><color rgb="FF0B2C4D"/><name val="Calibri"/></font>' },
  { key: "sub", xml: '<font><sz val="9.5"/><color rgb="FF516170"/><name val="Calibri"/></font>' },
];
const FILLS = [
  { key: "none", xml: '<fill><patternFill patternType="none"/></fill>' },
  { key: "gray", xml: '<fill><patternFill patternType="gray125"/></fill>' },
  { key: "head", xml: '<fill><patternFill patternType="solid"><fgColor rgb="FF0B2C4D"/><bgColor indexed="64"/></patternFill></fill>' },
  { key: "key", xml: '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F5F8"/><bgColor indexed="64"/></patternFill></fill>' },
  { key: "sec", xml: '<fill><patternFill patternType="solid"><fgColor rgb="FFE6EDF4"/><bgColor indexed="64"/></patternFill></fill>' },
  { key: "tot", xml: '<fill><patternFill patternType="solid"><fgColor rgb="FFFBE6C2"/><bgColor indexed="64"/></patternFill></fill>' },
];
const BORDERS = [
  { key: "none", xml: "<border><left/><right/><top/><bottom/><diagonal/></border>" },
  {
    key: "thin",
    xml: '<border><left style="thin"><color rgb="FFAEBCCB"/></left><right style="thin"><color rgb="FFAEBCCB"/></right>'
      + '<top style="thin"><color rgb="FFAEBCCB"/></top><bottom style="thin"><color rgb="FFAEBCCB"/></bottom><diagonal/></border>',
  },
];
const fontIx = (k) => Math.max(0, FONTS.findIndex((f) => f.key === k));
const fillIx = (k) => Math.max(0, FILLS.findIndex((f) => f.key === k));

/* A style is { font, fill, border, align, wrap, fmt }. */
function styleXfs(specs) {
  const numFmts = [];
  const fmtId = (name) => {
    if (!name) return 0;
    const pattern = FORMATS[name] || name;
    let i = numFmts.indexOf(pattern);
    if (i < 0) { numFmts.push(pattern); i = numFmts.length - 1; }
    return 164 + i;
  };
  const xfs = specs.map((s) => {
    const parts = [
      `numFmtId="${fmtId(s.fmt)}"`,
      `fontId="${fontIx(s.font || "base")}"`,
      `fillId="${fillIx(s.fill || "none")}"`,
      `borderId="${s.border === false ? 0 : 1}"`,
      'xfId="0"',
      s.fmt ? 'applyNumberFormat="1"' : "",
      "applyFont=\"1\" applyFill=\"1\" applyBorder=\"1\" applyAlignment=\"1\"",
    ].filter(Boolean).join(" ");
    const al = [
      s.align ? `horizontal="${s.align}"` : "",
      `vertical="${s.valign || "top"}"`,
      s.wrap ? 'wrapText="1"' : "",
    ].filter(Boolean).join(" ");
    return `<xf ${parts}><alignment ${al}/></xf>`;
  });
  const nf = numFmts.length
    ? `<numFmts count="${numFmts.length}">${numFmts.map((p, i) => `<numFmt numFmtId="${164 + i}" formatCode="${X(p)}"/>`).join("")}</numFmts>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${nf}<fonts count="${FONTS.length}">${FONTS.map((f) => f.xml).join("")}</fonts><fills count="${FILLS.length}">${FILLS.map((f) => f.xml).join("")}</fills><borders count="${BORDERS.length}">${BORDERS.map((b) => b.xml).join("")}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

/* ---- turning one sheet's rows into worksheet XML ---- */
function sheetXml(sheet, styleOf) {
  const rows = sheet.rows || [];
  const body = rows.map((row, ri) => {
    const r = ri + 1;
    const cells = (row || []).map((raw, ci) => {
      if (raw == null || raw === "") return "";
      const cell = (typeof raw === "object") ? raw : { v: raw };
      const ref = cellRef(r, ci + 1);
      const s = styleOf(cell.s || {});
      const sAttr = s ? ` s="${s}"` : "";

      if (cell.f) return `<c r="${ref}"${sAttr}><f>${X(String(cell.f).replace(/^=/, ""))}</f></c>`;

      const v = cell.v;
      const numeric = cell.t === "n"
        || (cell.t !== "s" && typeof v === "number" && Number.isFinite(v));
      if (numeric) {
        const n = Number(v);
        if (!Number.isFinite(n)) return `<c r="${ref}"${sAttr}/>`;
        return `<c r="${ref}"${sAttr}><v>${n}</v></c>`;
      }
      const text = String(v ?? "");
      if (!text) return sAttr ? `<c r="${ref}"${sAttr}/>` : "";
      return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${X(text)}</t></is></c>`;
    }).filter(Boolean).join("");
    return cells ? `<row r="${r}">${cells}</row>` : "";
  }).filter(Boolean).join("");

  const widths = sheet.widths || [];
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(4, Math.min(70, Number(w) || 12)).toFixed(2)}" customWidth="1"/>`).join("")}</cols>`
    : "";

  const merges = (sheet.merges || []).filter(Boolean);
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${X(m)}"/>`).join("")}</mergeCells>`
    : "";

  const pane = sheet.freeze
    ? `<sheetView workbookViewId="0"><pane ySplit="${sheet.freeze}" topLeftCell="A${sheet.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView>`
    : '<sheetView workbookViewId="0"/>';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews>${pane}</sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${body}</sheetData>${mergeXml}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/></worksheet>`;
}

/* Excel forbids : \ / ? * [ ] in a sheet name, and caps it at 31 characters. */
function safeName(name, taken) {
  let n = String(name || "Sheet").replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Sheet";
  let i = 2;
  while (taken.has(n.toLowerCase())) {
    const suffix = ` (${i++})`;
    n = `${n.slice(0, 31 - suffix.length)}${suffix}`;
  }
  taken.add(n.toLowerCase());
  return n;
}

/** Build the .xlsx package for a workbook and hand back a Blob. */
export function buildXLSX(workbook) {
  const specs = [];
  const seen = new Map();
  const styleOf = (spec) => {
    const key = JSON.stringify(spec || {});
    if (key === "{}") return 0;
    if (seen.has(key)) return seen.get(key);
    const ix = specs.length;
    specs.push(spec);
    seen.set(key, ix);
    return ix;
  };
  specs.push({});           // index 0 — the plain, bordered default
  seen.set("{}", 0);

  const taken = new Set();
  const sheets = (workbook.sheets || []).map((s) => ({ ...s, name: safeName(s.name, taken) }));
  if (!sheets.length) sheets.push({ name: "Sheet1", rows: [] });

  // Styles must be collected before styles.xml is written, so render first.
  const sheetXmls = sheets.map((s) => sheetXml(s, styleOf));

  const files = [
    {
      name: "[Content_Types].xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    },
    {
      name: "_rels/.rels",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    },
    {
      name: "xl/workbook.xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${X(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr calcId="0" fullCalcOnLoad="1"/></workbook>`),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    },
    { name: "xl/styles.xml", data: utf8(styleXfs(specs)) },
    ...sheetXmls.map((xml, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: utf8(xml) })),
  ];

  return zipBlob(files);
}
