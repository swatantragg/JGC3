import { createContext, useContext, useState, useCallback, useMemo } from "react";
import {
  SEED_ITEMS, SEED_BM, SEED_INVOICES, SUPPLIERS, BUYERS,
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

    return {
      items, setItems, buyers, setBuyers, suppliers, setSuppliers,
      buyerMaster, setBuyerMaster, invoices, setInvoices,
      receipts, ledger, pendingBoxes, openPos,
      supCode, supById, buyerById, suppliersForItem,
      toast, toasts,
    };
  }, [items, buyers, suppliers, buyerMaster, invoices, toasts, toast]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
