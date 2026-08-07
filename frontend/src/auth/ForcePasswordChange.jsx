import { useState } from "react";
import { Anchor, KeyRound, ShieldCheck, LogOut } from "lucide-react";
import { Btn, Field, Note, PasswordInput, PasswordRules } from "../components/ui/index.jsx";
import { passwordOk } from "../lib/password.js";
import { useAuth } from "./AuthProvider.jsx";

/* The one screen an account with `must_change_password` can reach.

   An admin who sets somebody's password has to tell them what it is — over a
   phone call, across a desk, in a chat window. That makes it a delivery
   mechanism, not a secret: at least two people know it, and it has travelled
   over something nobody controls. This screen retires it within seconds of
   arrival, after which only the holder knows the live password.

   The API enforces the same thing — every other endpoint answers 403 while
   the flag stands — so closing this tab and reloading changes nothing. */

export default function ForcePasswordChange() {
  const { user, completeForcedChange, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const identity = { name: user?.name || "", email: user?.email || "" };
  const ready = current && passwordOk(pw, identity) && pw === pw2;

  const submit = async () => {
    setErr("");
    if (!current) { setErr("Type the password you were given."); return; }
    if (!passwordOk(pw, identity)) {
      setErr("The new password does not meet every rule listed under the box yet.");
      return;
    }
    if (pw !== pw2) { setErr("The two new passwords do not match."); return; }
    if (pw === current) { setErr("The new password must be different from the one you were given."); return; }

    setBusy(true);
    const r = await completeForcedChange(current, pw, pw2);
    setBusy(false);
    if (!r.ok) setErr(r.error);
    // Success re-renders the app: the flag is down and the session continues.
  };

  return (
    <div className="login">
      <div className="login-brand">
        <div className="row" style={{ gap: 18 }}>
          <div className="brand-mark" style={{ width: 76, height: 76, borderRadius: 20 }}>
            <Anchor size={42} color="#0b2c4d" strokeWidth={2.6} />
          </div>
          <div>
            <div style={{ fontWeight: 780, fontSize: 40, lineHeight: 1.1, color: "#fff", letterSpacing: "-0.5px" }}>Jaikvin Global</div>
            <div style={{ fontSize: 15, letterSpacing: 5, color: "#9fc0d8", marginTop: 6 }}>EXPORT SYSTEM</div>
          </div>
        </div>
        <p style={{ marginTop: 26 }}>
          The password you were given was typed by somebody else and told to you.
          Choose your own now — from this point nobody but you knows it, and
          nobody, including the admin, can read it back.
        </p>
      </div>

      <div className="login-panel">
        <div className="login-card">
          <h2>Choose your password</h2>
          <p className="sub" style={{ marginBottom: 18 }}>
            Signed in as <b>{user?.email}</b>. This is the only screen open until it is done.
          </p>

          <div className="stack-sm">
            <Field label="The password you were given">
              <span className="login-in">
                <KeyRound size={15} />
                <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="current-password"
                  onKeyDown={(e) => e.key === "Enter" && submit()} />
              </span>
            </Field>

            <Field label="Your new password">
              <span className="login-in">
                <KeyRound size={15} />
                <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)}
                  autoComplete="new-password"
                  onKeyDown={(e) => e.key === "Enter" && submit()} />
              </span>
              <PasswordRules value={pw} identity={identity} show />
            </Field>

            <Field label="Confirm your new password">
              <span className="login-in">
                <KeyRound size={15} />
                <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)}
                  placeholder="Type it again" autoComplete="new-password"
                  onKeyDown={(e) => e.key === "Enter" && submit()} />
              </span>
            </Field>

            {pw2 && pw !== pw2 && <Note tone="amber">The two passwords do not match yet.</Note>}
            {err && <Note tone="amber">{err}</Note>}

            <Btn size="lg" disabled={busy || !ready} icon={ShieldCheck} onClick={submit}>
              {busy ? "Saving…" : "Save and continue"}
            </Btn>
            <Btn variant="ghost" size="sm" icon={LogOut} onClick={logout}>
              Sign out instead
            </Btn>
          </div>
        </div>
        <div className="login-foot">Maintained and developed by <b>Avita Technologies</b> · V-5.7</div>
      </div>
    </div>
  );
}
