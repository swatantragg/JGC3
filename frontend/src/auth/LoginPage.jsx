import { useEffect, useRef, useState } from "react";
import {
  Anchor, LogIn, UserPlus, Clock, ShieldCheck, KeyRound, Mail, User as UserIcon, Rocket,
  MailCheck, ArrowLeft, RotateCw, Timer,
} from "lucide-react";
import { Btn, Field, Input, Note, PasswordInput, PasswordRules } from "../components/ui/index.jsx";
import { passwordOk } from "../lib/password.js";
import { useAuth } from "./AuthProvider.jsx";

/* Sign-in screen. It wears four faces depending on the system's state:
   - a brand-new database has no owner, so the form creates the first admin;
   - existing users sign in;
   - anyone else requests access and waits for an admin to approve them;
   - and when a sign-in still owes an email verification, the password step
     hands over to a passcode step — a code mailed to the address on file.

   A user meets that fourth face exactly once, on their first sign-in. An admin
   meets it once a day, whenever the 24-hour session they last verified has run
   out. */

const POINTS = [
  ["Admin", "creates and approves users, ticks the areas each one can see"],
  ["Users", "log in and find only their own work — no clutter, no risk"],
];

const OTP_BLURB = {
  user_first_login: "This is your first sign-in, so we are checking the address is yours. It is asked once — after this, your email and password are all you need.",
  admin_session_renewal: "Admin sessions last 24 hours. Yours has run out, so confirm the code we just emailed you to start a new one.",
};

export default function LoginPage() {
  const { login, register, bootstrap, needsBootstrap, verifyOtp, resendOtp, sessionExpired } = useAuth();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  // The passcode step: the challenge handed back by /login, the typed code,
  // and the seconds left before another code may be asked for.
  const [otp, setOtp] = useState(null);
  const [code, setCode] = useState("");
  const [cool, setCool] = useState(0);
  const [notice, setNotice] = useState("");
  const codeRef = useRef(null);

  const first = needsBootstrap;
  // Creating an account (first-run admin or a request) asks for the password
  // twice — a typo here would otherwise lock the person out of an account
  // nobody can read back.
  const creating = first || mode === "register";

  // Resend cooldown, ticking down once a second while a code is outstanding.
  useEffect(() => {
    if (cool <= 0) return undefined;
    const t = setTimeout(() => setCool((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cool]);

  useEffect(() => { if (otp) codeRef.current?.focus(); }, [otp]);

  const openChallenge = (ch, message = "") => {
    setOtp(ch);
    setCode("");
    setErr("");
    setCool(ch.resend_in || 30);
    setNotice(
      message || (ch.delivered === false
        ? "Email is not set up on this server yet — the code was written to the server log."
        : "")
    );
  };

  const submit = async () => {
    setErr("");
    if (creating) {
      if (!name.trim() || !email.trim()) {
        setErr("Fill in the name and the email address.");
        return;
      }
      if (!passwordOk(pw, { name, email })) {
        setErr("The password does not meet every rule listed under the box yet.");
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
    if (r.otp) { openChallenge(r.otp); return; }
    if (mode === "register" && !first) setSent(true);
  };

  const submitCode = async () => {
    const c = code.replace(/\D/g, "");
    if (c.length < 4) { setErr("Type the code from your email."); return; }
    setErr("");
    setBusy(true);
    const r = await verifyOtp(otp.challenge, c);
    setBusy(false);
    // Success unmounts this screen — the provider now holds a session.
    if (!r.ok) { setErr(r.error); setCode(""); codeRef.current?.focus(); }
  };

  const again = async () => {
    setErr("");
    setBusy(true);
    const r = await resendOtp(otp.challenge);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    openChallenge(r.otp, "A new code is on its way — the earlier one no longer works.");
  };

  const backToPassword = () => {
    setOtp(null); setCode(""); setErr(""); setNotice(""); setPw("");
  };

  const heading = otp
    ? "Check your email"
    : first ? "Create the admin account" : mode === "login" ? "Sign in" : "Request access";
  const blurb = otp
    ? OTP_BLURB[otp.reason] || "Confirm the code we just emailed you."
    : first
      ? "This system has no users yet. The account you create here becomes the admin — full access, and the only one who can approve everybody else."
      : mode === "login"
        ? "Use the email and password your admin set up for you."
        : "Tell us who you are — the admin approves new accounts before first sign-in.";

  return (
    <div className="login">
      <div className="login-brand">
        {/* The name is the whole statement here — no tagline above it. */}
        <div className="row" style={{ gap: 18 }}>
          <div className="brand-mark" style={{ width: 76, height: 76, borderRadius: 20 }}>
            <Anchor size={42} color="#0b2c4d" strokeWidth={2.6} />
          </div>
          <div>
            <div style={{ fontWeight: 780, fontSize: 40, lineHeight: 1.1, color: "#fff", letterSpacing: "-0.5px" }}>Jaikvin Global</div>
            <div style={{ fontSize: 15, letterSpacing: 5, color: "#9fc0d8", marginTop: 6 }}>EXPORT SYSTEM</div>
          </div>
        </div>
        <p style={{ marginTop: 26 }}>Orders, packing, shipment papers and costing — one login, and each person sees exactly the areas the admin has given them. Nothing more to learn.</p>
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

          {otp ? (
            <div className="stack-sm">
              <Note tone="teal" icon={MailCheck}>
                Code sent to <b>{otp.email}</b> — it is valid for {Math.round((otp.expires_in || 600) / 60)} minutes.
              </Note>
              {notice && <Note tone="amber">{notice}</Note>}
              {otp.dev_code && <Note tone="amber">Development mode — the code is <b>{otp.dev_code}</b>.</Note>}
              <Field label="Verification code">
                <span className="login-in">
                  <KeyRound size={15} />
                  <Input
                    ref={codeRef}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="123456"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    style={{ letterSpacing: 8, fontWeight: 700, fontSize: 18 }}
                    onKeyDown={(e) => e.key === "Enter" && submitCode()}
                  />
                </span>
              </Field>
              {err && <Note tone="amber">{err}</Note>}
              <Btn size="lg" disabled={busy || code.length < 4} icon={ShieldCheck} onClick={submitCode}>
                {busy ? "Checking…" : "Verify & sign in"}
              </Btn>
              <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                <Btn variant="ghost" size="sm" icon={ArrowLeft} onClick={backToPassword}>Use a different account</Btn>
                <Btn variant="ghost" size="sm" icon={cool > 0 ? Timer : RotateCw} disabled={busy || cool > 0} onClick={again}>
                  {cool > 0 ? `Send again in ${cool}s` : "Send the code again"}
                </Btn>
              </div>
            </div>
          ) : sent ? (
            <Note tone="teal" icon={Clock}>
              Request sent. The admin will approve your account under <b>Setup → Users</b> — try signing in after that.
            </Note>
          ) : (
            <div className="stack-sm">
              {sessionExpired && (
                <Note tone="amber" icon={Timer}>
                  Your 24-hour session has ended — sign in again to carry on.
                </Note>
              )}
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
              <Field label="Password">
                <span className="login-in">
                  <KeyRound size={15} />
                  <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)}
                    autoComplete={creating ? "new-password" : "current-password"}
                    onKeyDown={(e) => e.key === "Enter" && submit()} />
                </span>
                {/* Only while a password is being set — spelling the rules out
                    on a sign-in box would just tell a stranger what to try. */}
                <PasswordRules value={pw} identity={{ name, email }} show={creating} />
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

          {!first && !otp && (
            <button className="login-switch" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); setSent(false); setPw(""); setPw2(""); }}>
              {mode === "login" ? "New here? Request access" : "Back to sign in"}
            </button>
          )}
        </div>
        <div className="login-foot">Maintained and developed by <b>Avita Technologies</b> · V-5.5</div>
      </div>
    </div>
  );
}
