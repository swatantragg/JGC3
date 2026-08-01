/* Display formatters — shared across every feature. */
export const inr = (n) => "₹" + Math.round(Number(n || 0)).toLocaleString("en-IN");
export const usd = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const usdp = (n) => "$" + Number(n || 0).toFixed(4);
export const num = (n, d = 2) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
export const dmy = (s) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
/* Numeric date, the way the client writes it on a PO: 13/03/2026. Parsed off
   the ISO string rather than through Date, so a yyyy-mm-dd never shifts a day
   across a timezone. */
export const dmyNum = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s ? new Date(s).toLocaleDateString("en-GB") : "—";
};
export const todayISO = () => new Date().toISOString().slice(0, 10);
/* Boxes, undivided — 0.71 rather than a rounded-up 1, so a short order reads
   as short. Packing and allocation still count whole boxes. */
export const boxesExact = (n) => Number(n || 0).toFixed(2);
