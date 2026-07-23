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
const DERIVED = ["dashboard", "po-list", "po-lines", "invoices", "item-detail", "balance"];

export const {
  useList: useSuppliers, useCreate: useCreateSupplier,
  useUpdate: useUpdateSupplier, useRemove: useDeleteSupplier,
} = crudHooks("suppliers", api.suppliers, DERIVED);

export const {
  useList: useBuyers, useCreate: useCreateBuyer,
  useUpdate: useUpdateBuyer, useRemove: useDeleteBuyer,
} = crudHooks("buyers", api.buyers, DERIVED);

export const {
  useList: useItems, useCreate: useCreateItem,
  useUpdate: useUpdateItem, useRemove: useDeleteItem,
} = crudHooks("items", api.items, DERIVED);

export const {
  useList: useTransports, useCreate: useCreateTransport,
  useUpdate: useUpdateTransport, useRemove: useDeleteTransport,
} = crudHooks("transports", api.transports, DERIVED);

// Purchase orders
export const usePoList = () => useQuery({ queryKey: ["po-list"], queryFn: api.purchaseOrders.list });
export const usePoLines = () => useQuery({ queryKey: ["po-lines"], queryFn: api.purchaseOrders.lines });
export function usePoMutations() {
  const qc = useQueryClient();
  const invalidate = () => ["po-list", "po-lines", "dashboard", "item-detail", "balance"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
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
  const invalidate = () => ["invoices", "dashboard", "po-list", "balance"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  return {
    create: useMutation({ mutationFn: api.invoices.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, body }) => api.invoices.update(id, body), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (id) => api.invoices.remove(id), onSuccess: invalidate }),
  };
}

// Derived / reports
export const useDashboardMatrix = () => useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard.matrix });
export const useItemDetail = () => useQuery({ queryKey: ["item-detail"], queryFn: api.reports.itemDetail });
export const useBalance = () => useQuery({ queryKey: ["balance"], queryFn: api.reports.balance });

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
