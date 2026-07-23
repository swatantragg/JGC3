import { useState } from "react";
import { Anchor, LogIn, UserPlus, Clock, ShieldCheck, KeyRound, Mail, User as UserIcon, Rocket } from "lucide-react";
import { Btn, Field, Input, Note, PasswordInput } from "../components/ui/index.jsx";
import { useAuth } from "./AuthProvider.jsx";

/* Sign-in screen. It wears three faces depending on the system's state:
   - a brand-new database has no owner, so the form creates the first admin;
   - existing users sign in;
   - anyone else requests access and waits for an admin to approve them. */

const POINTS = [
  ["Admin", "creates and approves users, ticks the areas each one can see"],
  ["Users", "log in and find only their own work — no clutter, no risk"],
];

export default function LoginPage() {
  const { login, register, bootstrap, needsBootstrap } = useAuth();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const first = needsBootstrap;
  // Creating an account (first-run admin or a request) asks for the password
  // twice — a typo here would otherwise lock the person out of an account
  // nobody can read back.
  const creating = first || mode === "register";

  const submit = async () => {
    setErr("");
    if (creating) {
      if (!name.trim() || !email.trim() || pw.length < 8) {
        setErr("Fill your name and email — the password needs at least 8 characters.");
        return;
      }
      if (pw !== pw2) {
        setErr("The two passwords do not match — retype them and try again.");
        return;
      }
    } else if (!email.trim() || !pw) {
      setErr("Enter your email and password.");
      return;
    }
    setBusy(true);
    const r = first
      ? await bootstrap({ name: name.trim(), email: email.trim(), password: pw })
      : mode === "login"
        ? await login(email.trim(), pw)
        : await register({ name: name.trim(), email: email.trim(), password: pw });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    if (mode === "register" && !first) setSent(true);
  };

  const heading = first ? "Create the admin account" : mode === "login" ? "Sign in" : "Request access";
  const blurb = first
    ? "This system has no users yet. The account you create here becomes the admin — full access, and the only one who can approve everybody else."
    : mode === "login"
      ? "Use the email and password your admin set up for you."
      : "Tell us who you are — the admin approves new accounts before first sign-in.";

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
          {POINTS.map(([t, s]) => (
            <div key={t} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
              <ShieldCheck size={16} style={{ color: "var(--amber)", flexShrink: 0, marginTop: 2 }} />
              <span><b style={{ color: "#fff" }}>{t}</b> {s}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="login-panel">
        <div className="login-card">
          <h2>{heading}</h2>
          <p className="sub" style={{ marginBottom: 18 }}>{blurb}</p>

          {sent ? (
            <Note tone="teal" icon={Clock}>
              Request sent. The admin will approve your account under <b>Setup → Users</b> — try signing in after that.
            </Note>
          ) : (
            <div className="stack-sm">
              {creating && (
                <Field label="Your name">
                  <span className="login-in">
                    <UserIcon size={15} />
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Mehta" />
                  </span>
                </Field>
              )}
              <Field label="Email">
                <span className="login-in">
                  <Mail size={15} />
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@jaikvinglobal.com" onKeyDown={(e) => e.key === "Enter" && submit()} />
                </span>
              </Field>
              <Field label={creating ? "Password — at least 8 characters" : "Password"}>
                <span className="login-in">
                  <KeyRound size={15} />
                  <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)}
                    autoComplete={creating ? "new-password" : "current-password"}
                    onKeyDown={(e) => e.key === "Enter" && submit()} />
                </span>
              </Field>
              {creating && (
                <Field label="Confirm password">
                  <span className="login-in">
                    <KeyRound size={15} />
                    <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)}
                      placeholder="Type it again" autoComplete="new-password"
                      onKeyDown={(e) => e.key === "Enter" && submit()} />
                  </span>
                </Field>
              )}
              {creating && pw2 && pw !== pw2 && <Note tone="amber">The two passwords do not match yet.</Note>}
              {err && <Note tone="amber">{err}</Note>}
              <Btn size="lg" disabled={busy} icon={first ? Rocket : mode === "login" ? LogIn : UserPlus} onClick={submit}>
                {busy ? "Please wait…" : first ? "Create admin & continue" : mode === "login" ? "Sign in" : "Send request"}
              </Btn>
            </div>
          )}

          {!first && (
            <button className="login-switch" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); setSent(false); setPw(""); setPw2(""); }}>
              {mode === "login" ? "New here? Request access" : "Back to sign in"}
            </button>
          )}
        </div>
        <div className="login-foot">Maintained and developed by <b>Avita Technologies</b> · V-1.0</div>
      </div>
    </div>
  );
}
