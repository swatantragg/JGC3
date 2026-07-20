import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Home, ClipboardList, PackageCheck, Ship, Settings2, FileText, BarChart3, Anchor, Sun, Moon,
} from "lucide-react";
import { IconBtn } from "../ui/index.jsx";

/* Top navigation + page chrome. Feature pages render into <Outlet />. */
const NAV = [
  { to: "/", label: "Dashboard", icon: Home, end: true },
  { to: "/orders", label: "Purchase Orders", icon: ClipboardList },
  { to: "/packing", label: "Packing", icon: PackageCheck },
  { to: "/shipments", label: "Shipment details", icon: Ship },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/reports", label: "Reports", icon: BarChart3 },
];

const TITLES = {
  "/": ["Overview", "Dashboard"],
  "/orders": ["Step 1", "Purchase Orders"],
  "/packing": ["Step 2", "Packing"],
  "/shipments": ["Shipment", "Shipment details"],
  "/documents": ["Library", "Documents"],
  "/reports": ["Anytime", "Reports"],
  "/setup": ["Configure", "Setup"],
};

export default function AppShell() {
  const { pathname } = useLocation();
  const [theme, setTheme] = useState(() => (typeof localStorage !== "undefined" && localStorage.getItem("jg-theme")) || "light");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("jg-theme", theme); } catch (e) { /* ignore */ }
  }, [theme]);

  const [crumb, title] = TITLES[pathname] || ["", "Jaikvin Global"];

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
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
                <n.icon size={17} strokeWidth={2.1} style={{ flexShrink: 0 }} />
                <span className="lbl">{n.label}</span>
              </NavLink>
            ))}
            <span className="nav-sep" />
            <NavLink to="/setup" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
              <Settings2 size={17} strokeWidth={2.1} />
              <span className="lbl">Setup</span>
            </NavLink>
          </nav>

          <div className="topnav-right">
            <IconBtn icon={theme === "dark" ? Sun : Moon} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle theme" />
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
