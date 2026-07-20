import { createContext, useContext, useState, useCallback, useMemo } from "react";
import {
  SEED_ITEMS, SEED_BM, SEED_INVOICES, SUPPLIERS, BUYERS,
  SEED_COSTING, COST_PARAMS, SEED_TRANSPORTS,
  invReceipts, computeLedger,
} from "./data.js";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

let toastSeq = 0;

export function AppProvider({ children }) {
  const [items, setItems] = useState(SEED_ITEMS);
  const [buyers, setBuyers] = useState(BUYERS);
  const [suppliers, setSuppliers] = useState(SUPPLIERS);
  const [buyerMaster, setBuyerMaster] = useState(SEED_BM);
  const [invoices, setInvoices] = useState(SEED_INVOICES);
  const [transports, setTransports] = useState(SEED_TRANSPORTS);
  const [costing, setCosting] = useState(SEED_COSTING);
  const [costParams, setCostParams] = useState(COST_PARAMS);
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((msg) => {
    const id = ++toastSeq;
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const value = useMemo(() => {
    const receipts = invReceipts(invoices);
    const ledger = computeLedger(buyerMaster, receipts, items);
    const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
    const supById = (id) => suppliers.find((s) => s.id === id) || suppliers[0];
    const buyerById = (id) => buyers.find((b) => b.id === id) || buyers[0];
    // Prototype rule: every item is offered by its primary supplier + the next one in the list
    const suppliersForItem = (it) => {
      const primary = suppliers.find((s) => s.id === it.supplierId) || suppliers[0];
      const idx = suppliers.findIndex((s) => s.id === primary.id);
      return [primary, suppliers[(idx + 1) % suppliers.length]];
    };
    const pendingBoxes = Object.values(ledger).reduce((s, b) => s + b.demands.reduce((t, d) => t + d.remaining, 0), 0);
    const openPos = new Set(
      Object.values(ledger).flatMap((b) => b.demands.filter((d) => d.remaining > 0).map((d) => d.po))
    );

    // --- Edit / delete for POs (buyer-master rows) and invoices ---
    const deletePo = (po) => setBuyerMaster((l) => l.filter((r) => r.po !== po));
    const updatePoRows = (po, updater) => setBuyerMaster((l) => updater(l.filter((r) => r.po === po)).concat(l.filter((r) => r.po !== po)));
    const deleteInvoice = (id) => setInvoices((l) => l.filter((x) => x.id !== id));
    const updateInvoice = (id, patch) => setInvoices((l) => l.map((x) => (x.id === id ? { ...x, ...(typeof patch === "function" ? patch(x) : patch) } : x)));

    return {
      items, setItems, buyers, setBuyers, suppliers, setSuppliers,
      buyerMaster, setBuyerMaster, invoices, setInvoices,
      transports, setTransports,
      costing, setCosting, costParams, setCostParams,
      receipts, ledger, pendingBoxes, openPos,
      supCode, supById, buyerById, suppliersForItem,
      deletePo, updatePoRows, deleteInvoice, updateInvoice,
      toast, toasts,
    };
  }, [items, buyers, suppliers, buyerMaster, invoices, transports, costing, costParams, toasts, toast]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
