import { useState, useEffect, useMemo } from "react";
import {
  Home as HomeIcon, ClipboardList, PackageCheck, Ship, FileText, BarChart3, Settings2,
  Anchor, Sun, Moon, Search, Check, CornerDownLeft, FileSpreadsheet, Truck, FileCheck2,
  ChevronDown, LogOut,
} from "lucide-react";

import { AppProvider, useApp } from "./store.jsx";
import { AuthProvider, useAuth, Login } from "./auth.jsx";
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
   Every view in the app, flat — drives the subbar title, hash
   routing and the command palette. `perm` is the leaf permission
   (or any-of list) that unlocks it for a non-admin user.
   ============================================================ */
export const VIEWS = [
  { id: "home", label: "Dashboard", icon: HomeIcon, title: "Dashboard", crumb: "Overview", desc: "What needs doing today", perm: "home" },
  { id: "orders", label: "Purchase Orders", icon: ClipboardList, title: "Purchase Orders", crumb: "Step 1", desc: "What the buyer asked for", perm: "orders.entry" },
  { id: "po-reports", label: "PO Reports", icon: FileSpreadsheet, title: "PO Reports", crumb: "Purchase Orders", desc: "Barcode · packing · purchase · sales · suppliers' PO", group: "PO", perm: "orders.reports" },
  { id: "packing", label: "Packing — FIFO", icon: PackageCheck, title: "Shipment", crumb: "Step 2", desc: "Pack supplier boxes onto an invoice — FIFO", perm: "shipment.packing" },
  { id: "shipments", label: "Shipment details", icon: Ship, title: "Shipment details", crumb: "Shipment", desc: "Invoices, containers, BL", perm: "shipment.details" },
  { id: "supplier-reports", label: "Suppliers' Reports", icon: Truck, title: "Suppliers' Reports", crumb: "Shipment", desc: "Packing · purchase · sales · delivery instructions · e-way", group: "SUP", perm: "shipment.reports" },
  { id: "pre-shipment", label: "Pre-Shipment Reports", icon: FileText, title: "Pre-Shipment Reports", crumb: "Reports", desc: "Everything customs needs before loading", group: "PRE", perm: "pre-shipment" },
  { id: "post-shipment", label: "Post Shipment Reports", icon: FileCheck2, title: "Post Shipment Reports", crumb: "Reports", desc: "Sent after the container sails", group: "POST", perm: "post-shipment" },
  { id: "reports", label: "Other Reports", icon: BarChart3, title: "Other Reports", crumb: "Anytime", desc: "Balance registers & costing", perm: ["reports.balance", "reports.costing"] },
  { id: "documents", label: "All Documents", icon: FileText, title: "Documents", crumb: "Library", desc: "All 40 export papers", perm: ["orders.reports", "shipment.reports", "pre-shipment", "post-shipment", "reports.balance"] },
  { id: "setup", label: "Setup", icon: Settings2, title: "Setup", crumb: "Configure", desc: "Items, buyers, suppliers, users", perm: ["setup.items", "setup.parties"] },
];
const V = Object.fromEntries(VIEWS.map((n) => [n.id, n]));

/* ============================================================
   The menu bar. A `children` entry becomes a dropdown — exactly
   the client's layout: PO Reports lives under Purchase Orders,
   packing / shipment details / suppliers' reports under Shipment.
   ============================================================ */
const MENU = [
  V["home"],
  { ...V["orders"], label: "Purchase Orders", children: [V["orders"], V["po-reports"]] },
  { ...V["packing"], id: "shipment-menu", label: "Shipment", icon: Ship, children: [V["packing"], V["shipments"], V["supplier-reports"]] },
  V["pre-shipment"],
  V["post-shipment"],
  V["reports"],
];
const SETUP = V["setup"];

/* ============================================================
   Command palette — ⌘K / Ctrl+K. Jumps to any page or document.
   ============================================================ */
function Palette({ onClose, go, openDoc, has }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const entries = useMemo(() => {
    const pages = VIEWS.filter((n) => has(n.perm)).map((n) => ({ kind: "page", id: n.id, label: n.label, sub: n.desc, icon: n.icon }));
    const docs = has(V["documents"].perm)
      ? DOC_GROUPS.flatMap((g) => g.docs.map((no) => ({ kind: "doc", id: no, label: `${no} · ${DOC_META[no] || ""}`, sub: g.t, icon: FileText })))
      : [];
    const all = [...pages, ...docs];
    const s = q.trim().toLowerCase();
    return (s ? all.filter((e) => (e.label + " " + e.sub).toLowerCase().includes(s)) : all).slice(0, 40);
  }, [q, has]);

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

const IDS = VIEWS.map((n) => n.id);
const hashView = () => {
  const h = (window.location.hash || "").replace(/^#\/?/, "");
  return IDS.includes(h) ? h : "home";
};

function Shell() {
  const app = useApp();
  const { user, has, logout, isAdmin } = useAuth();
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

  // Access guard: landing on a view this user isn't allowed bounces
  // to their first permitted page — deep links included.
  const allowed = (id) => has(V[id]?.perm);
  useEffect(() => {
    if (!allowed(view)) {
      const first = VIEWS.find((n) => has(n.perm));
      if (first) go(first.id);
    }
  }, [view, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const shipPending = app.invoices.filter((i) => !shipComplete(i.ship)).length;
  const badges = { orders: app.openPos.size, packing: app.pendingBoxes, shipments: shipPending };
  const meta = V[view] || V["home"];

  const menuFor = (n) => {
    if (!n.children) return allowed(n.id) ? n : null;
    const kids = n.children.filter((c) => allowed(c.id));
    if (!kids.length) return null;
    return { ...n, children: kids };
  };
  const menu = MENU.map(menuFor).filter(Boolean);

  const isActive = (n) => (n.children ? n.children.some((c) => c.id === view) : view === n.id);
  const badgeOf = (n) => (n.children ? n.children.reduce((s, c) => s + (badges[c.id] || 0), 0) : badges[n.id] || 0);

  const NavBtn = ({ n }) => {
    const btn = (
      <button className={`nav-item${isActive(n) ? " active" : ""}`} onClick={() => go(n.children ? n.children[0].id : n.id)}>
        <n.icon size={17} strokeWidth={2.1} style={{ color: isActive(n) ? "var(--amber)" : undefined, flexShrink: 0 }} />
        <span className="lbl">{n.label}</span>
        {badgeOf(n) > 0 && <span className="nav-count">{badgeOf(n)}</span>}
        {n.children && <ChevronDown size={13} strokeWidth={2.4} style={{ opacity: 0.7, flexShrink: 0 }} />}
      </button>
    );
    if (!n.children) return btn;
    return (
      <div className="nav-drop">
        {btn}
        <div className="nav-menu">
          {n.children.map((c) => (
            <button key={c.id} className={`nav-menu-item${view === c.id ? " on" : ""}`} onClick={() => go(c.id)}>
              <c.icon size={15} strokeWidth={2.1} />
              <span className="grow">
                <span className="nmi-t">{c.label}</span>
                <span className="nmi-s">{c.desc}</span>
              </span>
              {badges[c.id] > 0 && <span className="nav-count">{badges[c.id]}</span>}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const initials = (user?.name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

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
            {menu.map((n) => <NavBtn key={n.id} n={n} />)}
            {(allowed("setup") || isAdmin) && <><span className="nav-sep" /><NavBtn n={SETUP} /></>}
          </nav>

          <div className="topnav-right">
            <IconBtn icon={theme === "dark" ? Sun : Moon} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle theme" />
            <div className="user-chip" title={user?.email}>
              <span className="uc-ava">{initials}</span>
              <span className="uc-txt">
                <span className="uc-n">{user?.name}</span>
                <span className="uc-r">{isAdmin ? "Admin" : "User"}</span>
              </span>
              <IconBtn bare icon={LogOut} size={15} onClick={logout} title="Sign out" />
            </div>
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
          {view === "po-reports" && <Documents go={go} group="PO" />}
          {view === "supplier-reports" && <Documents go={go} group="SUP" />}
          {view === "pre-shipment" && <Documents go={go} group="PRE" />}
          {view === "post-shipment" && <Documents go={go} group="POST" />}
          {view === "reports" && <Reports go={go} openDoc={openDoc} />}
          {view === "setup" && <Setup go={go} />}
        </div>

        <footer className="footer">
          <span>Maintained and Developed By <b style={{ color: "var(--ink)" }}>Avita Technologies</b></span>
          <span className="mono">V-3.0</span>
        </footer>
      </div>

      {palette && <Palette onClose={() => setPalette(false)} go={go} openDoc={openDoc} has={has} />}
      <Toasts />
    </div>
  );
}

/* Signed out → the login screen; signed in → the app. */
function Gate() {
  const { user } = useAuth();
  // The saved theme must apply to the login screen too — Shell isn't mounted yet.
  useEffect(() => {
    try { document.documentElement.setAttribute("data-theme", localStorage.getItem("jg-theme") || "light"); } catch (e) { /* ignore */ }
  }, []);
  if (!user) return <Login />;
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
