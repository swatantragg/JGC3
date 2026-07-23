import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Anchor, Sun, Moon, LogOut, ShieldCheck, ChevronDown } from "lucide-react";
import { IconBtn } from "../ui/index.jsx";
import { useAuth, accessLabel } from "../../auth/AuthProvider.jsx";
import { NAV, SETUP_NAV, ROUTE_TITLES } from "../../lib/nav.js";

/* Top navigation + page chrome. Feature pages render into <Outlet />.
   The bar only ever shows links the signed-in user may actually open, so
   nobody meets a page they cannot use. */

const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

export default function AppShell() {
  const { pathname } = useLocation();
  const { user, isAdmin, has, logout, allPerms, presets } = useAuth();

  const [theme, setTheme] = useState(() => (typeof localStorage !== "undefined" && localStorage.getItem("jg-theme")) || "light");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("jg-theme", theme); } catch (e) { /* ignore */ }
  }, [theme]);

  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenu(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);
  useEffect(() => setMenu(false), [pathname]);

  const [crumb, title] = ROUTE_TITLES[pathname] || ["", "Jaikvin Global"];
  const visible = NAV.filter((n) => has(n.perm));
  const canSetup = has(SETUP_NAV.perm) || isAdmin;

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
            {visible.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
                <n.icon size={17} strokeWidth={2.1} style={{ flexShrink: 0 }} />
                <span className="lbl">{n.label}</span>
              </NavLink>
            ))}
            {canSetup && (
              <>
                <span className="nav-sep" />
                <NavLink to={SETUP_NAV.to} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
                  <SETUP_NAV.icon size={17} strokeWidth={2.1} />
                  <span className="lbl">{SETUP_NAV.label}</span>
                </NavLink>
              </>
            )}
          </nav>

          <div className="topnav-right">
            <IconBtn icon={theme === "dark" ? Sun : Moon} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle theme" />
            <div className="acct" ref={menuRef}>
              <button className="acct-btn" onClick={() => setMenu((m) => !m)} title={user?.email}>
                <span className="acct-ava">{initials(user?.name)}</span>
                <span className="acct-name">{user?.name}</span>
                <ChevronDown size={14} />
              </button>
              {menu && (
                <div className="acct-menu">
                  <div className="acct-head">
                    <div className="acct-head-n">{user?.name}</div>
                    <div className="mono acct-head-e">{user?.email}</div>
                    <div className="acct-head-r">
                      {isAdmin && <ShieldCheck size={12} style={{ color: "var(--teal)" }} />}
                      {accessLabel(user || {}, presets, allPerms)}
                    </div>
                  </div>
                  <button className="acct-item" onClick={logout}>
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              )}
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
          </div>
        </div>

        <div className="page">
          <Outlet />
        </div>

        <footer className="footer">
          <span>Maintained and Developed By <b style={{ color: "var(--ink)" }}>Avita Technologies</b></span>
          <span className="mono">V-1.0 · production</span>
        </footer>
      </div>
    </div>
  );
}
