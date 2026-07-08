import { Check } from "lucide-react";
import { useApp } from "./store.jsx";
import { shipComplete } from "./data.js";

/* The whole app in one line. Sits at the top of every working page so the
   user always knows where they are and what is waiting for them. */
export default function Rail({ view, go }) {
  const { openPos, pendingBoxes, invoices } = useApp();
  const shipPending = invoices.filter((i) => !shipComplete(i.ship)).length;

  /* "done" means the work of that step is genuinely clear — never merely "behind us" */
  const steps = [
    { id: "orders", n: 1, t: "Order", s: openPos.size ? `${openPos.size} PO open` : "All POs filled", done: !openPos.size },
    { id: "packing", n: 2, t: "Pack", s: pendingBoxes ? `${pendingBoxes} boxes to pack` : "Nothing pending", done: !pendingBoxes },
    { id: "shipments", n: 3, t: "Ship", s: shipPending ? `${shipPending} awaiting BL` : "All details in", done: !shipPending && invoices.length > 0 },
    { id: "documents", n: 4, t: "Documents", s: "Every paper, one click", done: false },
  ];

  return (
    <div className="rail">
      {steps.map((s) => (
        <button key={s.id} className={`rail-step${view === s.id ? " on" : ""}${s.done ? " done" : ""}`} onClick={() => go(s.id)}>
          <span className="rail-num">{s.done && view !== s.id ? <Check size={14} strokeWidth={3} /> : s.n}</span>
          <span className="grow">
            <div className="rail-t">{s.t}</div>
            <div className="rail-s">{s.s}</div>
          </span>
        </button>
      ))}
    </div>
  );
}
