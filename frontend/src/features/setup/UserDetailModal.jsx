import { useEffect, useMemo, useRef, useState } from "react";
import {
  ShieldCheck, BadgeCheck, MailWarning, KeyRound, Check, Copy,
  Mail, RotateCw, Timer, Lock, Unlock, LogOut, ShieldAlert,
} from "lucide-react";
import {
  Btn, Field, Input, Modal, Note, Pill, Mono, PasswordInput, PasswordRules,
} from "../../components/ui/index.jsx";
import { passwordOk } from "../../lib/password.js";
import { useStepUp } from "../../auth/useStepUp.js";
import * as api from "../../api/endpoints.js";

/* Everything held about one account, and what an admin may do with it.

   There used to be a "Reveal password" button here, backed by a reversible
   encrypted copy of every password in the database. It is gone, and so is the
   copy: a bcrypt hash cannot be turned back into a password, which is the
   whole reason to store one. What that bought — an admin handing a forgotten
   password back to a colleague — is served instead by setting a new one, which
   the holder is then made to replace at their next sign-in. Two people know it
   for about a minute, and then only one does.

   Setting a password still sits behind a code emailed to the admin at that
   moment: the session on its own is not enough, because it may have been open
   all day on an unlocked machine. */

const fmt = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

const Row = ({ label, children }) => (
  <div className="ud-row">
    <span className="ud-k">{label}</span>
    <span className="ud-v">{children}</span>
  </div>
);

export default function UserDetailModal({ user, permTree, presets, allPerms, onClose, onSaved }) {
  const step = useStepUp();
  const [code, setCode] = useState("");
  // The password just set, held only long enough for the admin to read it out
  // to its owner. Never fetched — the server cannot supply one.
  const [issued, setIssued] = useState(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const codeRef = useRef(null);
  const pwRef = useRef(null);

  const locked = Boolean(user.hard_locked) ||
    Boolean(user.locked_until && new Date(user.locked_until) > new Date());

  // The account details are long enough to push the password block below the
  // fold. Whatever the admin just asked for is centred in the panel — the code
  // box with its buttons, or the new password itself — rather than left half
  // cut off under the footer.
  useEffect(() => {
    const el = step.challenge ? codeRef.current : (issued || step.ready ? pwRef.current : null);
    if (el) el.scrollIntoView({ block: "center" });
    if (step.challenge) codeRef.current?.focus();
  }, [step.challenge, issued, step.ready]);

  // Never leave a password on screen once the modal is left.
  useEffect(() => () => { setIssued(null); setPw(""); setPw2(""); }, []);

  const leafLabels = useMemo(() => {
    const out = {};
    const walk = (nodes, trail) => nodes.forEach((n) => {
      if (n.children) walk(n.children, [...trail, n.label]);
      else out[n.id] = [...trail, n.label].join(" → ");
    });
    walk(permTree || [], []);
    return out;
  }, [permTree]);

  const areas = user.role === "admin" ? allPerms : (user.access || []);

  const need = async () => {
    setErr(""); setMsg("");
    if (step.ready) return undefined;
    const r = await step.start();
    if (!r.ok) setErr(r.error);
    return undefined;
  };

  const submitCode = async () => {
    const c = code.replace(/\D/g, "");
    if (c.length < 4) { setErr("Type the code from your email."); return; }
    setErr("");
    const r = await step.confirm(c);
    if (r.ok) setCode("");
  };

  const savePassword = async () => {
    if (!passwordOk(pw, { name: user.name, email: user.email })) {
      setErr("The password does not meet every rule listed under the box yet.");
      return;
    }
    if (pw !== pw2) { setErr("The two passwords do not match — retype them and try again."); return; }
    setBusy(true); setErr(""); setMsg("");
    try {
      await api.users.setPassword(user.id, pw, pw2, step.grant);
      setMsg("Password set. Read it out to them now — they must replace it at their next sign-in, "
             + "and every session they had open has been signed out.");
      setIssued(pw);
      setPw(""); setPw2("");
      onSaved?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const unlock = async () => {
    setBusy(true); setErr(""); setMsg("");
    try {
      await api.users.unlock(user.id);
      setMsg("Account unlocked. They can sign in with their existing password.");
      onSaved?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const signOutEverywhere = async () => {
    setBusy(true); setErr(""); setMsg("");
    try {
      await api.users.signOut(user.id);
      setMsg("Every session on this account has been signed out, on every device.");
      onSaved?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (e) { setErr("The browser would not let the page copy — select it by hand."); }
  };

  return (
    <Modal title={user.name} icon={user.role === "admin" ? ShieldCheck : KeyRound} onClose={onClose}
      footer={
        <>
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
            {step.ready ? "Confirmed — passwords stay open for a few minutes." : "A password needs an emailed code."}
          </span>
          <Btn variant="ghost" size="sm" onClick={onClose}>Close</Btn>
        </>
      }
    >
      <div className="stack-sm">
        <div className="ud-grid">
          <Row label="Name">{user.name}</Row>
          <Row label="Email"><Mono>{user.email}</Mono></Row>
          <Row label="Role">
            {user.role === "admin"
              ? <Pill tone="teal"><ShieldCheck size={11} /> Admin</Pill>
              : <Pill>User</Pill>}
          </Row>
          <Row label="Status">
            <Pill tone={user.status === "active" ? "green" : "amber"}>{user.status}</Pill>
          </Row>
          <Row label="Email verified">
            <Pill tone={user.email_verified ? "green" : "amber"}>
              {user.email_verified ? <BadgeCheck size={11} /> : <MailWarning size={11} />}
              {user.email_verified ? "verified" : "not verified"}
            </Pill>
          </Row>
          <Row label="Added">{fmt(user.created_at)}</Row>
          <Row label="Last sign-in">{fmt(user.last_login)}</Row>
        </div>

        <div className="confirm-block">
          <div className="cb-head">
            <span>Access</span>
            <Pill tone="teal">{areas.length} of {allPerms.length} areas</Pill>
          </div>
          <ul className="cb-list">
            {areas.map((p) => <li key={p}><Check size={12} />{leafLabels[p] || p}</li>)}
            {!areas.length && <li style={{ color: "var(--faint)" }}>Nothing ticked yet.</li>}
          </ul>
        </div>

        <div className="confirm-block" ref={pwRef}>
          <div className="cb-head">
            <span>Password</span>
            <Pill tone={step.ready ? "green" : ""}>
              {step.ready ? <><Check size={11} /> confirmed</> : <><Lock size={11} /> code needed</>}
            </Pill>
          </div>

          <div style={{ padding: "12px 14px" }} className="stack-sm">
            {step.challenge ? (
              <>
                <Note tone="teal" icon={Mail}>
                  Code sent to <b>{step.challenge.email}</b>.
                  {step.challenge.delivered === false && " Email is not set up on this server — it is in the server log."}
                </Note>
                <Field label="Enter the code">
                  <Input ref={codeRef} value={code} inputMode="numeric" autoComplete="one-time-code"
                    placeholder="123456" style={{ letterSpacing: 8, fontWeight: 700 }}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    onKeyDown={(e) => e.key === "Enter" && submitCode()} />
                </Field>
                <div className="row" style={{ gap: 8 }}>
                  <Btn size="sm" icon={Check} disabled={step.busy || code.length < 4} onClick={submitCode}>
                    {step.busy ? "Checking…" : "Confirm"}
                  </Btn>
                  <Btn variant="ghost" size="sm" icon={RotateCw} disabled={step.busy} onClick={step.resend}>Send again</Btn>
                  <Btn variant="ghost" size="sm" onClick={() => { step.reset(); setWant(null); }}>Cancel</Btn>
                </div>
              </>
            ) : issued ? (
              <>
                <Note tone="teal" icon={Check}>
                  Read this out to them now — it is shown once and cannot be looked up again.
                </Note>
                <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                  <span className="ud-pw"><Mono>{issued}</Mono></span>
                  <Btn variant="ghost" size="sm" icon={copied ? Check : Copy} onClick={copy}>
                    {copied ? "Copied" : "Copy"}
                  </Btn>
                </div>
              </>
            ) : (
              <>
                <Note>
                  A password cannot be read back — the system stores a one-way hash, so
                  there is nothing to show. If this person has forgotten theirs, set a
                  new one and read it out; they must replace it at their next sign-in.
                </Note>

                {step.ready ? (
                  <div className="stack-sm" style={{ marginTop: 4 }}>
                    <Field label="Set a new password">
                      <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
                      <PasswordRules value={pw} identity={{ name: user.name, email: user.email }} />
                    </Field>
                    <Field label="Confirm the new password">
                      <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)}
                        placeholder="Type it again" autoComplete="new-password" />
                    </Field>
                    {pw2 && pw !== pw2 && <Note tone="amber">The two passwords do not match yet.</Note>}
                    <div>
                      <Btn size="sm" icon={KeyRound} disabled={busy || !pw || pw !== pw2} onClick={savePassword}>
                        {busy ? "Saving…" : "Set password"}
                      </Btn>
                    </div>
                  </div>
                ) : (
                  <Btn variant="ghost" size="sm" icon={KeyRound} disabled={step.busy} onClick={need}>
                    Set a new password
                  </Btn>
                )}
              </>
            )}

            {msg && <Note tone="teal" icon={Check}>{msg}</Note>}
            {(err || step.err) && <Note tone="amber">{err || step.err}</Note>}
          </div>

          <div className="cb-foot">
            <Timer size={11} style={{ verticalAlign: -1 }} /> The confirmation lasts a few minutes, then a
            fresh code is asked for. Nobody — admin included — can read an existing password back.
          </div>
        </div>

        {/* Account safety: the two things that need doing when something has
            gone wrong rather than when somebody has forgotten something. */}
        <div className="confirm-block">
          <div className="cb-head">
            <span>Account safety</span>
            {locked
              ? <Pill tone="amber"><Lock size={11} /> locked</Pill>
              : <Pill tone="green"><Check size={11} /> normal</Pill>}
          </div>
          <div style={{ padding: "12px 14px" }} className="stack-sm">
            {locked && (
              <Note tone="amber" icon={ShieldAlert}>
                Locked after repeated failed sign-ins{user.last_failed_at ? ` — last attempt ${fmt(user.last_failed_at)}` : ""}.
                They can also clear this themselves with “Locked out?” on the sign-in screen.
              </Note>
            )}
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Btn variant="ghost" size="sm" icon={Unlock} disabled={busy || !locked} onClick={unlock}>
                Unlock account
              </Btn>
              <Btn variant="ghost" size="sm" icon={LogOut} disabled={busy} onClick={signOutEverywhere}>
                Sign out everywhere
              </Btn>
            </div>
          </div>
          <div className="cb-foot">
            “Sign out everywhere” ends every open session on every device at once — for a
            lost laptop or a phone left behind.
          </div>
        </div>
      </div>
    </Modal>
  );
}
