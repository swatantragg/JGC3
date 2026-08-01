import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Anchor, Sun, Moon, LogOut, Search, ChevronDown, CornerDownLeft, FileText,
} from "lucide-react";
import { IconBtn } from "../ui/index.jsx";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useBadges } from "../../api/hooks.js";
import { VIEWS, MENU, SETUP, ROUTE_TITLES } from "../../lib/nav.js";
import { DOC_GROUPS, DOC_META } from "../../lib/docs.js";

/* Top navigation + page chrome. Feature pages render into <Outlet />.

   The bar only ever shows what the signed-in user may actually open, so
   nobody meets a page they cannot use — a dropdown disappears entirely once
   all of its entries are out of reach. */

const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

/* Command palette — ⌘K / Ctrl+K. Jumps to any page or document. */
function Palette({ onClose, go, has }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  const entries = useMemo(() => {
    const pages = VIEWS.filter((n) => has(n.perm))
      .map((n) => ({ kind: "page", id: n.to, label: n.label, sub: n.desc, icon: n.icon }));
    const docs = has(VIEWS.find((v) => v.id === "documents").perm)
      ? DOC_GROUPS.flatMap((g) => g.docs.map((no) => ({
        kind: "doc", id: no, label: `${no} · ${DOC_META[no] || ""}`, sub: g.t, icon: FileText,
      })))
      : [];
    const all = [...pages, ...docs];
    const s = q.trim().toLowerCase();
    return (s ? all.filter((e) => `${e.label} ${e.sub}`.toLowerCase().includes(s)) : all).slice(0, 40);
  }, [q, has]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(i + 1, entries.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
      if (e.key === "Enter") {
        e.preventDefault();
        const en = entries[sel];
        if (!en) return;
        go(en.kind === "page" ? en.id : `/documents?doc=${en.id}`);
        onClose();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [entries, sel, go, onClose]);

  return (
    <div className="backdrop" style={{ alignItems: "flex-start" }} onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Go to a page, or find any of the 40 documents…" />
        <div className="palette-list">
          {entries.map((e, i) => (
            <div key={e.kind + e.id} className={`p-item${i === sel ? " on" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => { go(e.kind === "page" ? e.id : `/documents?doc=${e.id}`); onClose(); }}>
              <e.icon size={15} />
              <span>{e.label}</span>
              <span className="p-sub">{e.sub}</span>
              {i === sel && <CornerDownLeft size={13} style={{ color: "var(--faint)" }} />}
            </div>
          ))}
          {!entries.length && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
              Nothing matches “{q}”.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AppShell() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { user, isAdmin, has, logout } = useAuth();
  const badges = useBadges().data || {};

  const [theme, setTheme] = useState(() => (typeof localStorage !== "undefined" && localStorage.getItem("jg-theme")) || "light");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("jg-theme", theme); } catch (e) { /* ignore */ }
  }, [theme]);

  const [palette, setPalette] = useState(false);
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const [crumb, title] = ROUTE_TITLES[pathname] || ["", "Jaikvin Global"];

  // A dropdown keeps only the entries this user can reach, and disappears
  // once none are left.
  const menuFor = (n) => {
    if (!n.children) return has(n.perm) ? n : null;
    const kids = n.children.filter((c) => has(c.perm));
    return kids.length ? { ...n, children: kids } : null;
  };
  const menu = MENU.map(menuFor).filter(Boolean);

  const isActive = (n) => (n.children ? n.children.some((c) => c.to === pathname) : pathname === n.to);
  const badgeOf = (n) => (n.children
    ? n.children.reduce((s, c) => s + (badges[c.id] || 0), 0)
    : badges[n.id] || 0);

  const NavBtn = ({ n }) => {
    const btn = (
      <button className={`nav-item${isActive(n) ? " active" : ""}`}
        onClick={() => nav(n.children ? n.children[0].to : n.to)}>
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
            <button key={c.id} className={`nav-menu-item${pathname === c.to ? " on" : ""}`} onClick={() => nav(c.to)}>
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
            {(has(SETUP.perm) || isAdmin) && <><span className="nav-sep" /><NavBtn n={SETUP} /></>}
          </nav>

          <div className="topnav-right">
            <IconBtn icon={theme === "dark" ? Sun : Moon}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle theme" />
            <div className="user-chip" title={user?.email}>
              <span className="uc-ava">{initials(user?.name)}</span>
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
              <div className="crumb">{crumb}</div>
              <h1>{title}</h1>
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
          <Outlet />
        </div>

        <footer className="footer">
          <span>Maintained and Developed By <b style={{ color: "var(--ink)" }}>Avita Technology</b></span>
          <span className="mono">V-3.3</span>
        </footer>
      </div>

      {palette && <Palette onClose={() => setPalette(false)} go={nav} has={has} />}
    </div>
  );
}
