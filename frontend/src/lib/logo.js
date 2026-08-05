/* The exporter's letterhead mark.

   The supplier purchase order is printed on Jaikvin's own letterhead, so the
   mark has to travel inside the .xlsx rather than be linked to it. The file is
   in public/, and the workbook writer wants the bytes, so it is fetched once
   and kept — the fetch starts as soon as the document engine loads, long
   before anyone clicks a download. Should it ever fail (offline, blocked), the
   letter simply prints without it, which is what it did before. */

const SRC = "/logo.png";
/* Their sheet anchors the mark just inside the left margin of the letterhead
   block, about three quarters of an inch square (EMU: 914400 to the inch). */
const PLACE = { col: 0, colOff: 57150, row: 1, rowOff: 142876, cy: 685800 };

let bytes = null;
let pending = null;

/** Start (or reuse) the fetch. Resolves to the bytes, or null if unavailable. */
export function primeLogo() {
  if (bytes) return Promise.resolve(bytes);
  if (!pending) {
    pending = (typeof fetch === "function" ? fetch(SRC) : Promise.reject())
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => { bytes = new Uint8Array(buf); return bytes; })
      .catch(() => null);
  }
  return pending;
}

/** The image a sheet builder attaches, or null while it is still loading. */
export function logoImage(aspect = 172 / 165) {
  if (!bytes) return null;
  return { data: bytes, ext: "png", ...PLACE, cx: Math.round(PLACE.cy * aspect) };
}

export const LOGO_SRC = SRC;
