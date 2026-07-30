/* Display formatters — shared across every feature. */
export const inr = (n) => "₹" + Math.round(Number(n || 0)).toLocaleString("en-IN");
export const usd = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const usdp = (n) => "$" + Number(n || 0).toFixed(4);
export const num = (n, d = 2) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
export const dmy = (s) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const todayISO = () => new Date().toISOString().slice(0, 10);
