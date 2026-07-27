import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Check } from "lucide-react";

/* Short confirmations — "Order 03540 added", "Invoice created". They say what
   happened after a save so the user never has to hunt for proof. */
const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);

let seq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((msg) => {
    const id = ++seq;
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const value = useMemo(() => toast, [toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-wrap">
          {toasts.map((t) => (
            <div key={t.id} className="toast"><Check size={16} className="ti" strokeWidth={2.6} />{t.msg}</div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}
