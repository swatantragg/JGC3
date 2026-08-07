/* Typed-ish endpoint helpers, grouped by resource. One place that knows the
   REST shape of the backend; components never build URLs themselves. */
import { apiGet, apiPost, apiPut, apiDelete, stepUpHeader } from "./client.js";

export const auth = {
  status: () => apiGet("/api/auth/status"),
  permissions: () => apiGet("/api/auth/permissions"),
  bootstrap: (b) => apiPost("/api/auth/bootstrap", b),
  // There is no register(): accounts are made by an admin under Setup → Users.
  // A public sign-up endpoint that says "that email is already registered" is
  // a free list of who works here, which is where a phishing run starts.
  //
  // Answers with the signed-in user (the session itself arrives as an httpOnly
  // cookie), or with { otp_required, challenge, … } when the address still has
  // to be proved by a mailed code.
  login: (b) => apiPost("/api/auth/login", b),
  verifyOtp: (b) => apiPost("/api/auth/verify-otp", b),
  resendOtp: (b) => apiPost("/api/auth/resend-otp", b),
  me: () => apiGet("/api/auth/me"),
  // Ends the session here *and* everywhere — the server bumps the account's
  // token version, so a token copied out of this browser dies too.
  logout: () => apiPost("/api/auth/logout"),
  // Locked out after too many wrong passwords: prove the mailbox, get back in
  // without waiting and without needing an admin.
  unlockStart: (b) => apiPost("/api/auth/unlock/start", b),
  unlockVerify: (b) => apiPost("/api/auth/unlock/verify", b),
  // Setting somebody's password needs a code answered minutes ago:
  // start → verify hands back a grant that rides on the call below.
  stepUpStart: () => apiPost("/api/auth/step-up/start"),
  stepUpVerify: (b) => apiPost("/api/auth/step-up/verify", b),
  changePassword: (b, grant) => apiPost("/api/auth/change-password", b, stepUpHeader(grant)),
  // Replacing an admin-set password at first sign-in. No step-up code: the
  // point is to retire that password within seconds of receiving it.
  changePasswordForced: (b) => apiPost("/api/auth/change-password/forced", b),
};

export const users = {
  list: () => apiGet("/api/users"),
  create: (b) => apiPost("/api/users", b),
  update: (id, b) => apiPut(`/api/users/${id}`, b),
  remove: (id) => apiDelete(`/api/users/${id}`),
  // No password(): a password cannot be read back. The reversible copy that
  // used to make that possible is gone, so a database dump is no longer a
  // plaintext credential dump. Setting a new one is the way to restore access.
  setPassword: (id, newPassword, confirmPassword, grant) =>
    apiPut(`/api/users/${id}/password`,
           { new_password: newPassword, confirm_password: confirmPassword },
           stepUpHeader(grant)),
  unlock: (id) => apiPost(`/api/users/${id}/unlock`),
  signOut: (id) => apiPost(`/api/users/${id}/sign-out`),
};

/* Who did what — admin only, and read-only by design. */
export const audit = {
  list: (params) => apiGet(`/api/audit${qs(params)}`),
  summary: (days) => apiGet(`/api/audit/summary${qs({ days })}`),
};

export const costing = {
  list: () => apiGet("/api/costing"),
  create: (b) => apiPost("/api/costing", b),
  update: (id, b) => apiPut(`/api/costing/${id}`, b),
  remove: (id) => apiDelete(`/api/costing/${id}`),
  params: () => apiGet("/api/costing/params"),
  saveParams: (b) => apiPut("/api/costing/params", b),
  formulas: () => apiGet("/api/costing/formulas"),
  // Cost a set of typed prices without saving, then save them item-wise.
  preview: (rows) => apiPost("/api/costing/preview", rows),
  upsert: (rows) => apiPut("/api/costing/upsert-by-item", rows),
};

export const suppliers = {
  list: () => apiGet("/api/suppliers"),
  create: (b) => apiPost("/api/suppliers", b),
  update: (id, b) => apiPut(`/api/suppliers/${id}`, b),
  remove: (id) => apiDelete(`/api/suppliers/${id}`),
};

export const buyers = {
  list: () => apiGet("/api/buyers"),
  create: (b) => apiPost("/api/buyers", b),
  update: (id, b) => apiPut(`/api/buyers/${id}`, b),
  remove: (id) => apiDelete(`/api/buyers/${id}`),
};

const qs = (params = {}) => {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ).toString();
  return s ? `?${s}` : "";
};

export const items = {
  // params: { supplier_id, group, q } — filtered server-side so the whole
  // 285-row master never has to be sifted in the browser.
  list: (params) => apiGet(`/api/items${qs(params)}`),
  grouped: (params) => apiGet(`/api/items/grouped${qs(params)}`),
  groups: () => apiGet("/api/items/groups"),
  create: (b) => apiPost("/api/items", b),
  update: (id, b) => apiPut(`/api/items/${id}`, b),
  remove: (id) => apiDelete(`/api/items/${id}`),
};

/* The master workbook: what the bundled extract holds, loading it, and the
   2A / 7A derived figures for a set of ordered quantities. */
export const masters = {
  seed: () => apiGet("/api/masters/seed"),
  import: (overwrite = false) => apiPost(`/api/masters/import${qs({ overwrite })}`),
  derive: (rows) => apiPost("/api/masters/derive", rows),
  formulas: () => apiGet("/api/masters/formulas"),
  order: (po) => apiGet(`/api/masters/order/${encodeURIComponent(po)}`),
  supplier: (id, range) => apiGet(`/api/masters/supplier/${id}${qs(range)}`),
  orderLines: (range) => apiGet(`/api/masters/order-lines${qs(range)}`),
};

export const transports = {
  list: () => apiGet("/api/transports"),
  create: (b) => apiPost("/api/transports", b),
  update: (id, b) => apiPut(`/api/transports/${id}`, b),
  remove: (id) => apiDelete(`/api/transports/${id}`),
};

export const purchaseOrders = {
  list: () => apiGet("/api/purchase-orders"),
  lines: () => apiGet("/api/purchase-orders/lines"),
  get: (po) => apiGet(`/api/purchase-orders/${encodeURIComponent(po)}`),
  create: (b) => apiPost("/api/purchase-orders", b),
  update: (po, b) => apiPut(`/api/purchase-orders/${encodeURIComponent(po)}`, b),
  remove: (po) => apiDelete(`/api/purchase-orders/${encodeURIComponent(po)}`),
  // Orders keep the price they were placed at; these report and clear the
  // difference after an item's price is edited in Setup.
  priceDrift: (params) => apiGet(`/api/purchase-orders/price-drift${qs(params)}`),
  applyPrices: (params) => apiPost(`/api/purchase-orders/apply-prices${qs(params)}`),
  pendingForItem: (id) => apiGet(`/api/purchase-orders/pending-for-item/${id}`),
};

export const invoices = {
  list: () => apiGet("/api/invoices"),
  get: (id) => apiGet(`/api/invoices/${id}`),
  serials: (id) => apiGet(`/api/invoices/${id}/serials`),
  create: (b) => apiPost("/api/invoices", b),
  update: (id, b) => apiPut(`/api/invoices/${id}`, b),
  remove: (id) => apiDelete(`/api/invoices/${id}`),
};

export const dashboard = {
  matrix: () => apiGet("/api/dashboard/matrix"),
  badges: () => apiGet("/api/dashboard/badges"),
};

export const reports = {
  itemDetail: () => apiGet("/api/reports/item-detail"),
  balance: () => apiGet("/api/reports/balance"),
  // Doc 38 — supply details item wise / supplier wise.
  // params: { mode: "po" | "invoice", supplier_id, date_from, date_to }
  supplyDetails: (params) => apiGet(`/api/reports/supply-details${qs(params)}`),
};
