/* Typed-ish endpoint helpers, grouped by resource. One place that knows the
   REST shape of the backend; components never build URLs themselves. */
import { apiGet, apiPost, apiPut, apiDelete } from "./client.js";

export const auth = {
  status: () => apiGet("/api/auth/status"),
  permissions: () => apiGet("/api/auth/permissions"),
  bootstrap: (b) => apiPost("/api/auth/bootstrap", b),
  register: (b) => apiPost("/api/auth/register", b),
  login: (b) => apiPost("/api/auth/login", b),
  me: () => apiGet("/api/auth/me"),
  changePassword: (b) => apiPost("/api/auth/change-password", b),
};

export const users = {
  list: () => apiGet("/api/users"),
  create: (b) => apiPost("/api/users", b),
  update: (id, b) => apiPut(`/api/users/${id}`, b),
  remove: (id) => apiDelete(`/api/users/${id}`),
};

export const costing = {
  list: () => apiGet("/api/costing"),
  create: (b) => apiPost("/api/costing", b),
  update: (id, b) => apiPut(`/api/costing/${id}`, b),
  remove: (id) => apiDelete(`/api/costing/${id}`),
  params: () => apiGet("/api/costing/params"),
  saveParams: (b) => apiPut("/api/costing/params", b),
  formulas: () => apiGet("/api/costing/formulas"),
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

export const items = {
  list: () => apiGet("/api/items"),
  create: (b) => apiPost("/api/items", b),
  update: (id, b) => apiPut(`/api/items/${id}`, b),
  remove: (id) => apiDelete(`/api/items/${id}`),
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
};

export const reports = {
  itemDetail: () => apiGet("/api/reports/item-detail"),
  balance: () => apiGet("/api/reports/balance"),
};
