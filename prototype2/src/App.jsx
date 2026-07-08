import { useState, useEffect, useMemo } from "react";
import {
  Home as HomeIcon, ClipboardList, PackageCheck, Ship, FileText, BarChart3, Settings2,
  Anchor, Sun, Moon, Search, Check, CornerDownLeft,
} from "lucide-react";

import { AppProvider, useApp } from "./store.jsx";
import { DOC_GROUPS, shipComplete } from "./data.js";
import { DOC_META } from "./docs.js";
import { IconBtn } from "./ui.jsx";

import Home from "./pages/Home.jsx";
import Orders from "./pages/Orders.jsx";
import Packing from "./pages/Packing.jsx";
import Shipments from "./pages/Shipments.jsx";
import Documents from "./pages/Documents.jsx";
import Reports from "./pages/Reports.jsx";
import Setup from "./pages/Setup.jsx";

/* ============================================================
   Six destinations, plain English, in the order work happens.
   Everything the old build called "Stage A–F", "Masters", "2A/7A"
   is still here — it just no longer greets you at the door.
   ============================================================ */
export const NAV = [
  { id: "home", label: "Home", icon: HomeIcon, title: "Home", crumb: "Overview", desc: "What needs doing today" },
  { id: "orders", label: "Orders", icon: ClipboardList, title: "Orders", crumb: "Step 1", desc: "What the buyer asked for" },
  { id: "packing", label: "Packing", icon: PackageCheck, title: "Packing", crumb: "Step 2", desc: "What suppliers delivered" },
  { id: "shipments", label: "Shipments", icon: Ship, title: "Shipments", crumb: "Step 3", desc: "Invoices, containers, BL" },
  { id: "documents", label: "Documents", icon: FileText, title: "Documents", crumb: "Step 4", desc: "All 40 export papers" },
  { id: "reports", label: "Reports", icon: BarChart3, title: "Reports", crumb: "Anytime", desc: "Balances, item & supplier wise" },
];
const SETUP = { id: "setup", label: "Setup", icon: Settings2, title: "Setup", crumb: "Configure", desc: "Items, buyers, suppliers" };

/* ============================================================
   Command palette — ⌘K / Ctrl+K. Jumps to any page or document.
   ============================================================ */
function Palette({ onClose, go, openDoc }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const entries = useMemo(() => {
    const pages = [...NAV, SETUP].map((n) => ({ kind: "page", id: n.id, label: n.label, sub: n.desc, icon: n.icon }));
    const docs = DOC_GROUPS.flatMap((g) => g.docs.map((no) => ({ kind: "doc", id: no, label: `${no} · ${DOC_META[no] || ""}`, sub: g.t, icon: FileText })));
    const all = [...pages, ...docs];
    const s = q.trim().toLowerCase();
    return (s ? all.filter((e) => (e.label + " " + e.sub).toLowerCase().includes(s)) : all).slice(0, 40);
  }, [q]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(i + 1, entries.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
      if (e.key === "Enter") { e.preventDefault(); const en = entries[sel]; if (!en) return; en.kind === "page" ? go(en.id) : openDoc(en.id); onClose(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [entries, sel, go, openDoc, onClose]);

  return (
    <div className="backdrop" style={{ alignItems: "flex-start" }} onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Go to a page, or find any of the 40 documents…" />
        <div className="palette-list">
          {entries.map((e, i) => (
            <div key={e.kind + e.id} className={`p-item${i === sel ? " on" : ""}`} onMouseEnter={() => setSel(i)}
              onClick={() => { e.kind === "page" ? go(e.id) : openDoc(e.id); onClose(); }}>
              <e.icon size={15} />
              <span>{e.label}</span>
              <span className="p-sub">{e.sub}</span>
              {i === sel && <CornerDownLeft size={13} style={{ color: "var(--faint)" }} />}
            </div>
          ))}
          {!entries.length && <div style={{ padding: 24, textAlign: "center", color: "var(--faint)", fontSize: 13 }}>Nothing matches “{q}”.</div>}
        </div>
      </div>
    </div>
  );
}

function Toasts() {
  const { toasts } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="toast-wrap">
      {toasts.map((t) => <div key={t.id} className="toast"><Check size={16} className="ti" strokeWidth={2.6} />{t.msg}</div>)}
    </div>
  );
}

const IDS = [...NAV, SETUP].map((n) => n.id);
const hashView = () => {
  const h = (window.location.hash || "").replace(/^#\/?/, "");
  return IDS.includes(h) ? h : "home";
};

function Shell() {
  const app = useApp();
  const [view, setView] = useState(hashView);
  const [palette, setPalette] = useState(false);
  const [docJump, setDocJump] = useState(null);
  const [theme, setTheme] = useState(() => (typeof localStorage !== "undefined" && localStorage.getItem("jg-theme")) || "light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("jg-theme", theme); } catch (e) { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    const h = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // Deep-linkable views, so the browser Back button and shared URLs both work
  useEffect(() => {
    const h = () => setView(hashView());
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);

  const go = (v) => { window.location.hash = "/" + v; setView(v); window.scrollTo({ top: 0 }); };
  const openDoc = (no) => { setDocJump(no); go("documents"); };

  const shipPending = app.invoices.filter((i) => !shipComplete(i.ship)).length;
  const badges = { orders: app.openPos.size, packing: app.pendingBoxes, shipments: shipPending };
  const meta = [...NAV, SETUP].find((n) => n.id === view);

  const NavBtn = ({ n }) => (
    <button className={`nav-item${view === n.id ? " active" : ""}`} onClick={() => go(n.id)}>
      <n.icon size={17} strokeWidth={2.1} style={{ color: view === n.id ? "var(--amber)" : undefined, flexShrink: 0 }} />
      <span className="lbl">{n.label}</span>
      {badges[n.id] > 0 && <span className="nav-count">{badges[n.id]}</span>}
    </button>
  );

  return (
    <div className="app">
      <header className="topnav">
        <div className="topnav-inner">
          <div className="brand">
            <div className="brand-mark"><Anchor size={19} color="#0b2c4d" strokeWidth={2.6} /></div>
            <div>
              <div className="brand-name">Jaikvin Global</div>
              <div className="brand-sub">EXPORT SYSTEM</div>
            </div>
          </div>

          <nav className="nav">
            {NAV.map((n) => <NavBtn key={n.id} n={n} />)}
            <span className="nav-sep" />
            <NavBtn n={SETUP} />
          </nav>

          <div className="topnav-right">
            <IconBtn icon={theme === "dark" ? Sun : Moon} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle theme" />
            <span className="pill pill-amber">v2 · prototype</span>
          </div>
        </div>
      </header>

      <div className="main">
        <div className="subbar">
          <div className="subbar-inner">
            <div>
              <div className="crumb">{meta.crumb}</div>
              <h1>{meta.title}</h1>
            </div>
            <div className="grow" />
            <button className="searchbtn" onClick={() => setPalette(true)}>
              <Search size={16} />
              <span>Search pages &amp; documents</span>
              <span className="kbd">⌘K</span>
            </button>
          </div>
        </div>

        <div className="page">
          {view === "home" && <Home go={go} />}
          {view === "orders" && <Orders go={go} />}
          {view === "packing" && <Packing go={go} />}
          {view === "shipments" && <Shipments go={go} />}
          {view === "documents" && <Documents go={go} jump={docJump} clearJump={() => setDocJump(null)} />}
          {view === "reports" && <Reports go={go} />}
          {view === "setup" && <Setup go={go} />}
        </div>

        <footer className="footer">
          <span>Maintained and Developed By <b style={{ color: "var(--ink)" }}>Avita Technologies</b></span>
          <span className="mono">V-2.0</span>
        </footer>
      </div>

      {palette && <Palette onClose={() => setPalette(false)} go={go} openDoc={openDoc} />}
      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
