import { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { Anchor, LogIn, UserPlus, Check, Clock, ShieldCheck, KeyRound, Mail, User as UserIcon } from "lucide-react";
import { Btn, Field, Input, Note } from "./ui.jsx";

/* ============================================================
   Role-based access, kept deliberately small:
   - one Admin who can do everything and manages the user list;
   - everyone else gets ticked areas of the app (leaf permissions).
   A permission is a string like "orders.entry". Parents in the
   tree below are only for display — access is stored per leaf,
   and a nav section unlocks when ANY of its leaves is granted.
   ============================================================ */

export const PERM_TREE = [
  { id: "home", label: "Dashboard", hint: "Overview and next actions" },
  {
    id: "orders", label: "Purchase Orders", children: [
      { id: "orders.entry", label: "Order entry & PO list", hint: "Add buyer orders, 2A / 7A masters" },
      { id: "orders.reports", label: "PO Reports", hint: "Barcode, packing, purchase, sales, suppliers' PO" },
    ],
  },
  {
    id: "shipment", label: "Shipment", children: [
      { id: "shipment.packing", label: "Packing — FIFO", hint: "Record supplier boxes, create invoices" },
      { id: "shipment.details", label: "Shipment details", hint: "BL, vessel, container, seal" },
      { id: "shipment.reports", label: "Suppliers' Reports", hint: "Packing, purchase, sales, DO, e-way" },
    ],
  },
  { id: "pre-shipment", label: "Pre-Shipment Reports", hint: "Customs set before loading" },
  { id: "post-shipment", label: "Post Shipment Reports", hint: "After the container sails" },
  {
    id: "reports", label: "Other Reports", children: [
      { id: "reports.balance", label: "Balance registers", hint: "PO / item / supplier wise" },
      { id: "reports.costing", label: "Costing", hint: "Cost working & profit per item" },
    ],
  },
  {
    id: "setup", label: "Setup", children: [
      { id: "setup.items", label: "Items master", hint: "Codes, packing, prices" },
      { id: "setup.parties", label: "Buyers & suppliers", hint: "Trading partners" },
    ],
  },
];

export const ALL_PERMS = PERM_TREE.flatMap((n) => (n.children ? n.children.map((c) => c.id) : [n.id]));

/* Three ready-made bundles cover almost every real user — the tree is
   only for fine-tuning, so granting access is one click, not eleven. */
export const ACCESS_PRESETS = {
  full: { label: "Full access", perms: ALL_PERMS },
  operations: { label: "Operations", perms: ["home", "orders.entry", "shipment.packing", "shipment.details"] },
  reports: { label: "Reports only", perms: ["home", "orders.reports", "shipment.reports", "pre-shipment", "post-shipment", "reports.balance", "reports.costing"] },
};

const SEED_USERS = [
  { email: "admin@jg.com", password: "12345678", name: "Aalok Shah", role: "admin", status: "active", access: ALL_PERMS },
  { email: "user1@jg.com", password: "12345678", name: "User One", role: "user", status: "active", access: ACCESS_PRESETS.operations.perms },
  { email: "user2@jg.com", password: "12345678", name: "User Two", role: "user", status: "pending", access: ACCESS_PRESETS.reports.perms },
];

const USERS_KEY = "jg-users-v1";
const SESSION_KEY = "jg-session-v1";

const loadUsers = () => {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length) return list;
    }
  } catch (e) { /* ignore */ }
  return SEED_USERS;
};

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [users, setUsers] = useState(loadUsers);
  const [session, setSession] = useState(() => {
    try { return localStorage.getItem(SESSION_KEY) || null; } catch (e) { return null; }
  });

  useEffect(() => {
    try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); } catch (e) { /* ignore */ }
  }, [users]);
  useEffect(() => {
    try { session ? localStorage.setItem(SESSION_KEY, session) : localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }, [session]);

  const login = useCallback((email, password) => {
    const u = users.find((x) => x.email.toLowerCase() === String(email).trim().toLowerCase());
    if (!u || u.password !== password) return { ok: false, error: "Email or password is incorrect." };
    if (u.status === "pending") return { ok: false, error: "This account is waiting for admin approval." };
    setSession(u.email);
    return { ok: true };
  }, [users]);

  const logout = useCallback(() => setSession(null), []);

  const value = useMemo(() => {
    const user = users.find((u) => u.email === session) || null;
    const isAdmin = user?.role === "admin";
    const has = (perm) => {
      if (!user) return false;
      if (isAdmin) return true;
      const list = Array.isArray(perm) ? perm : [perm];
      return list.some((p) => user.access.includes(p));
    };

    const addUser = (u) => {
      if (users.some((x) => x.email.toLowerCase() === u.email.toLowerCase())) return { ok: false, error: "That email is already registered." };
      setUsers((l) => [...l, { role: "user", ...u }]);
      return { ok: true };
    };
    const updateUser = (email, patch) => setUsers((l) => l.map((u) => (u.email === email ? { ...u, ...patch } : u)));
    const removeUser = (email) => {
      setUsers((l) => l.filter((u) => u.email !== email));
      if (session === email) setSession(null);
    };
    const resetUsers = () => { setUsers(SEED_USERS); };

    return { users, user, isAdmin, has, login, logout, addUser, updateUser, removeUser, resetUsers };
  }, [users, session, login, logout]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ============================================================
   Access summary shown next to a user — "Full access", a preset
   name when it matches one, or "5 areas" otherwise.
   ============================================================ */
export function accessLabel(u) {
  if (u.role === "admin") return "Admin — everything";
  const set = new Set(u.access);
  for (const p of Object.values(ACCESS_PRESETS)) {
    if (p.perms.length === set.size && p.perms.every((x) => set.has(x))) return p.label;
  }
  return `${u.access.length} of ${ALL_PERMS.length} areas`;
}

/* ============================================================
   Login screen — with one-click demo accounts so the client can
   hop between roles without typing anything.
   ============================================================ */
export function Login() {
  const { login, addUser, users } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  const submit = () => {
    setErr("");
    if (mode === "login") {
      const r = login(email, pw);
      if (!r.ok) setErr(r.error);
    } else {
      if (!name.trim() || !email.trim() || pw.length < 8) { setErr("Fill your name and email — the password needs at least 8 characters."); return; }
      const r = addUser({ name: name.trim(), email: email.trim(), password: pw, status: "pending", access: ACCESS_PRESETS.operations.perms });
      if (!r.ok) { setErr(r.error); return; }
      setSent(true);
    }
  };

  const quick = (em) => { setErr(""); const r = login(em, "12345678"); if (!r.ok) setErr(`${em}: ${r.error}`); };
  const pendingCount = users.filter((u) => u.status === "pending").length;

  return (
    <div className="login">
      <div className="login-brand">
        <div className="row" style={{ gap: 12 }}>
          <div className="brand-mark" style={{ width: 44, height: 44 }}><Anchor size={24} color="#0b2c4d" strokeWidth={2.6} /></div>
          <div>
            <div style={{ fontWeight: 750, fontSize: 19, color: "#fff" }}>Jaikvin Global</div>
            <div style={{ fontSize: 11, letterSpacing: 1.6, color: "#9fc0d8" }}>EXPORT SYSTEM</div>
          </div>
        </div>
        <h1>Enter once.<br />Generate everything.<br />Always balanced.</h1>
        <p>Orders, packing, shipment papers and costing — one login, and each person sees exactly the areas the admin has given them. Nothing more to learn.</p>
        <div className="login-points">
          {[["Admin", "creates and approves users, ticks the areas each one can see"], ["Users", "log in and find only their own work — no clutter, no risk"]].map(([t, s]) => (
            <div key={t} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
              <ShieldCheck size={16} style={{ color: "var(--amber)", flexShrink: 0, marginTop: 2 }} />
              <span><b style={{ color: "#fff" }}>{t}</b> {s}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="login-panel">
        <div className="login-card">
          <h2>{mode === "login" ? "Sign in" : "Request access"}</h2>
          <p className="sub" style={{ marginBottom: 18 }}>
            {mode === "login" ? "Use your email and password, or hop straight into a demo account below." : "Tell us who you are — the admin approves new accounts before first sign-in."}
          </p>

          {sent ? (
            <Note tone="teal" icon={Clock}>Request sent. The admin will approve your account under <b>Setup → Users</b> — try signing in after that.</Note>
          ) : (
            <div className="stack-sm">
              {mode === "register" && (
                <Field label="Your name"><span className="login-in"><UserIcon size={15} /><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Mehta" /></span></Field>
              )}
              <Field label="Email"><span className="login-in"><Mail size={15} /><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@jg.com" onKeyDown={(e) => e.key === "Enter" && submit()} /></span></Field>
              <Field label="Password"><span className="login-in"><KeyRound size={15} /><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" onKeyDown={(e) => e.key === "Enter" && submit()} /></span></Field>
              {err && <Note tone="amber">{err}</Note>}
              <Btn size="lg" icon={mode === "login" ? LogIn : UserPlus} onClick={submit}>{mode === "login" ? "Sign in" : "Send request"}</Btn>
            </div>
          )}

          <button className="login-switch" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); setSent(false); }}>
            {mode === "login" ? "New here? Request access" : "Back to sign in"}
          </button>

          {mode === "login" && (
            <div className="login-demo">
              <div className="login-demo-t">Demo accounts — one click, password already filled</div>
              {[
                ["admin@jg.com", "Admin", "sees everything, manages users"],
                ["user1@jg.com", "User 1", "operations: orders, packing, shipment"],
                ["user2@jg.com", "User 2", pendingCount ? "reports only — pending admin approval" : "reports only"],
              ].map(([em, t, s]) => (
                <button key={em} className="login-chip" onClick={() => quick(em)}>
                  <span className="lc-ava">{t.replace("User ", "U")[0] + (t.includes("1") ? "1" : t.includes("2") ? "2" : "")}</span>
                  <span className="grow" style={{ textAlign: "left" }}>
                    <b>{t}</b> · {em}
                    <div className="lc-s">{s}</div>
                  </span>
                  <Check size={14} style={{ color: "var(--teal)" }} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="login-foot">Maintained and developed by <b>Avita Technologies</b> · V-3.0</div>
      </div>
    </div>
  );
}
