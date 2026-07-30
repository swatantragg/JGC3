/* Browser downloads — CSV for the raw sheets, .xls for the formatted ones.
   The document engine in lib/docs.js writes its own workbooks; this is for
   the plain table exports. */

export function downloadCSV(filename, headers, rows) {
  const esc = (c) => `"${String(c ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  try {
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (e) {
    alert("Download blocked by the browser — the table on screen holds the same data.");
  }
}
