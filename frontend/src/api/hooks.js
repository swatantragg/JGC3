/* React Query hooks — the components' single door to server state.
   A tiny factory gives every master the same list/create/update/delete hooks,
   with cache invalidation wired so the UI refreshes after every mutation. */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./endpoints.js";

function crudHooks(key, resource, extraInvalidate = []) {
  const useList = () => useQuery({ queryKey: [key], queryFn: resource.list });
  const useInvalidate = () => {
    const qc = useQueryClient();
    return () => {
      qc.invalidateQueries({ queryKey: [key] });
      extraInvalidate.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    };
  };
  const useCreate = () => {
    const invalidate = useInvalidate();
    return useMutation({ mutationFn: (body) => resource.create(body), onSuccess: invalidate });
  };
  const useUpdate = () => {
    const invalidate = useInvalidate();
    return useMutation({ mutationFn: ({ id, body }) => resource.update(id, body), onSuccess: invalidate });
  };
  const useRemove = () => {
    const invalidate = useInvalidate();
    return useMutation({ mutationFn: (id) => resource.remove(id), onSuccess: invalidate });
  };
  return { useList, useCreate, useUpdate, useRemove };
}

// Masters — mutations also refresh dependent computed views.
const DERIVED = ["dashboard", "badges", "po-list", "po-lines", "invoices", "item-detail",
  "balance", "item-groups", "items-grouped", "order-lines", "master-2a", "master-7a", "derive"];

export const {
  useList: useSuppliers, useCreate: useCreateSupplier,
  useUpdate: useUpdateSupplier, useRemove: useDeleteSupplier,
} = crudHooks("suppliers", api.suppliers, DERIVED);

export const {
  useList: useBuyers, useCreate: useCreateBuyer,
  useUpdate: useUpdateBuyer, useRemove: useDeleteBuyer,
} = crudHooks("buyers", api.buyers, DERIVED);

const itemHooks = crudHooks("items", api.items, DERIVED);
export const { useCreate: useCreateItem, useUpdate: useUpdateItem, useRemove: useDeleteItem } = itemHooks;

/* Items take optional server-side filters — { supplier_id, group, q }. The
   filters are part of the cache key, so switching supplier is instant once
   seen and a mutation still invalidates every variation. */
export const useItems = (params) =>
  useQuery({ queryKey: ["items", params || {}], queryFn: () => api.items.list(params) });

export const useItemGroups = () =>
  useQuery({ queryKey: ["item-groups"], queryFn: api.items.groups });

/* The master keyed the way an order is placed — one product, then the
   suppliers who make it. */
export const useGroupedItems = (params) =>
  useQuery({ queryKey: ["items-grouped", params || {}], queryFn: () => api.items.grouped(params) });

export const {
  useList: useTransports, useCreate: useCreateTransport,
  useUpdate: useUpdateTransport, useRemove: useDeleteTransport,
} = crudHooks("transports", api.transports, DERIVED);

/* Master workbook — what the bundled extract holds, loading it into the
   database, and the 2A / 7A figures for a set of ordered quantities. The
   derivation is asked of the API rather than repeated in the browser, so a
   screen can never show a number the backend would not agree with. */
export const useMastersSeed = () =>
  useQuery({ queryKey: ["masters-seed"], queryFn: api.masters.seed, staleTime: Infinity });

export const useMasterFormulas = () =>
  useQuery({ queryKey: ["master-formulas"], queryFn: api.masters.formulas, staleTime: Infinity });

export function useImportMasters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (overwrite) => api.masters.import(overwrite),
    onSuccess: () => ["items", "item-groups", "suppliers", "buyers", "transports", ...DERIVED]
      .forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}

/* `rows` is [{ item_id, qty, rbi }]. Disabled while empty so an untouched
   order form makes no request. */
export const useDerive = (rows) =>
  useQuery({
    queryKey: ["derive", rows],
    queryFn: () => api.masters.derive(rows),
    enabled: Array.isArray(rows) && rows.length > 0,
    placeholderData: (prev) => prev,
  });

/* The two master sheets themselves — 2A for a buyer order, 7A for a
   supplier's whole open book. */
export const useOrderMaster = (po) =>
  useQuery({ queryKey: ["master-2a", po], queryFn: () => api.masters.order(po), enabled: !!po });

export const useOrderLines = (range) =>
  useQuery({ queryKey: ["order-lines", range || {}], queryFn: () => api.masters.orderLines(range) });

export const useSupplierMaster = (supplierId, range) =>
  useQuery({
    queryKey: ["master-7a", supplierId, range || {}],
    queryFn: () => api.masters.supplier(supplierId, range),
    enabled: !!supplierId,
  });

// Purchase orders
export const usePoList = () => useQuery({ queryKey: ["po-list"], queryFn: api.purchaseOrders.list });
export const usePoLines = () => useQuery({ queryKey: ["po-lines"], queryFn: api.purchaseOrders.lines });
export function usePoMutations() {
  const qc = useQueryClient();
  const invalidate = () => ["po-list", "po-lines", "dashboard", "badges", "item-detail", "balance",
    "order-lines", "master-2a", "master-7a"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  return {
    create: useMutation({ mutationFn: api.purchaseOrders.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ po, body }) => api.purchaseOrders.update(po, body), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (po) => api.purchaseOrders.remove(po), onSuccess: invalidate }),
  };
}

// Invoices
export const useInvoices = () => useQuery({ queryKey: ["invoices"], queryFn: api.invoices.list });
export function useInvoiceMutations() {
  const qc = useQueryClient();
  const invalidate = () => ["invoices", "dashboard", "badges", "po-list", "balance", "order-lines",
    "master-2a", "master-7a"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  return {
    create: useMutation({ mutationFn: api.invoices.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, body }) => api.invoices.update(id, body), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (id) => api.invoices.remove(id), onSuccess: invalidate }),
  };
}

// Derived / reports
export const useDashboardMatrix = () => useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard.matrix });

/* The three counters the menu bar carries. Refetched after any mutation that
   could move them, so a badge never lies about what is still open. */
export const useBadges = () => useQuery({ queryKey: ["badges"], queryFn: api.dashboard.badges });
export const useItemDetail = () => useQuery({ queryKey: ["item-detail"], queryFn: api.reports.itemDetail });
export const useBalance = () => useQuery({ queryKey: ["balance"], queryFn: api.reports.balance });

/* Doc 38 — supply details, item wise / supplier wise. The filters are part of
   the cache key, so flipping between PO and invoice is instant once seen. */
export const useSupplyDetails = (params) =>
  useQuery({
    queryKey: ["supply-details", params || {}],
    queryFn: () => api.reports.supplyDetails(params),
    placeholderData: (prev) => prev,
  });

/* How many still-open order lines are priced at something the item master no
   longer says. Pass { item_id } to ask about a single product. */
export const usePriceDrift = (params) =>
  useQuery({ queryKey: ["price-drift", params || {}], queryFn: () => api.purchaseOrders.priceDrift(params) });

/* Which orders still have this item outstanding — shown beside the "apply to
   pending orders" tick in the edit form, so the effect is visible first. */
export const usePendingForItem = (itemId) =>
  useQuery({
    queryKey: ["pending-for-item", itemId],
    queryFn: () => api.purchaseOrders.pendingForItem(itemId),
    enabled: !!itemId,
  });

export function useApplyPrices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params) => api.purchaseOrders.applyPrices(params),
    onSuccess: () => ["price-drift", "pending-for-item", "po-list", "po-lines", "order-lines",
      "master-2a", "master-7a", "item-detail", "balance", "supply-details", "dashboard"]
      .forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}

// Users — admin only; the query is disabled for everyone else so a
// non-admin never fires a request the API would refuse.
export const useUsers = (enabled = true) =>
  useQuery({ queryKey: ["users"], queryFn: api.users.list, enabled });

export function useUserMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] });
  return {
    create: useMutation({ mutationFn: api.users.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, body }) => api.users.update(id, body), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (id) => api.users.remove(id), onSuccess: invalidate }),
  };
}

// Costing — every row arrives with its worked-out `computed` block, and the
// shared parameters feed those figures, so saving them refreshes the rows.
export const useCosting = () => useQuery({ queryKey: ["costing"], queryFn: api.costing.list });
export const useCostParams = () => useQuery({ queryKey: ["cost-params"], queryFn: api.costing.params });
export const useCostFormulas = () => useQuery({ queryKey: ["cost-formulas"], queryFn: api.costing.formulas, staleTime: Infinity });

/* The live working behind the costing screen. `rows` is
   [{ item_id, price_new }]; disabled while empty so an untouched sheet makes
   no request. The arithmetic is the API's, never the browser's. */
export const useCostPreview = (rows) =>
  useQuery({
    queryKey: ["cost-preview", rows],
    queryFn: () => api.costing.preview(rows),
    enabled: Array.isArray(rows) && rows.length > 0,
    placeholderData: (prev) => prev,
  });

export function useSaveCosting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.costing.upsert,
    onSuccess: () => ["costing", "cost-preview"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}

export function useCostingMutations() {
  const qc = useQueryClient();
  const invalidate = () => ["costing", "cost-params"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  return {
    create: useMutation({ mutationFn: api.costing.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, body }) => api.costing.update(id, body), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (id) => api.costing.remove(id), onSuccess: invalidate }),
    saveParams: useMutation({ mutationFn: api.costing.saveParams, onSuccess: invalidate }),
  };
}
