import { useEffect, useMemo, useRef, useState } from "react";
import {
  ShieldCheck, BadgeCheck, MailWarning, Eye, EyeOff, KeyRound, Check, Copy,
  Mail, RotateCw, Timer, Lock,
} from "lucide-react";
import {
  Btn, Field, Input, Modal, Note, Pill, Mono, PasswordInput, PasswordRules,
} from "../../components/ui/index.jsx";
import { passwordOk } from "../../lib/password.js";
import { useStepUp } from "../../auth/useStepUp.js";
import * as api from "../../api/endpoints.js";

/* Everything held about one account, and the two things only an admin may do
   with it: read the password back, and set a new one.

   Both sit behind a code emailed to the admin at that moment. The session on
   its own is not enough — it may have been open all day on an unlocked
   machine — so the modal asks once and then holds the confirmation for a few
   minutes, which covers reading one password and setting another. */

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
  const [want, setWant] = useState(null);    // "reveal" | "change" — after the code
  const [shown, setShown] = useState(null);  // { password, recoverable }
  const [reveal, setReveal] = useState(false);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const codeRef = useRef(null);
  const pwRef = useRef(null);

  // The account details are long enough to push the password block below the
  // fold. Whatever the admin just asked for is centred in the panel — the code
  // box with its buttons, or the password itself — rather than left half cut
  // off under the footer.
  useEffect(() => {
    const el = step.challenge ? codeRef.current : (shown || step.ready ? pwRef.current : null);
    if (el) el.scrollIntoView({ block: "center" });
    if (step.challenge) codeRef.current?.focus();
  }, [step.challenge, shown, step.ready]);

  // Never leave a password on screen once the modal is left.
  useEffect(() => () => { setShown(null); setPw(""); }, []);

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

  const need = async (what) => {
    setErr(""); setMsg("");
    setWant(what);
    if (step.ready) return runWith(what, step.grant);
    const r = await step.start();
    if (!r.ok) setErr(r.error);
    return undefined;
  };

  const runWith = async (what, grant) => {
    setBusy(true);
    try {
      if (what === "reveal") {
        const r = await api.users.password(user.id, grant);
        setShown(r);
        setReveal(true);
      }
      setErr("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    const c = code.replace(/\D/g, "");
    if (c.length < 4) { setErr("Type the code from your email."); return; }
    setErr("");
    const r = await step.confirm(c);
    if (r.ok) setCode("");
  };

  // The grant only exists after the confirm has landed in state, so whatever
  // the admin asked for waits here rather than racing the response.
  useEffect(() => {
    if (step.ready && want === "reveal" && !shown && !busy) runWith("reveal", step.grant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.ready, want]);

  const savePassword = async () => {
    if (!passwordOk(pw, { name: user.name, email: user.email })) {
      setErr("The password does not meet every rule listed under the box yet.");
      return;
    }
    setBusy(true); setErr(""); setMsg("");
    try {
      await api.users.setPassword(user.id, pw, step.grant);
      setMsg("Password changed. Tell them the new one — they sign in with it straight away.");
      setShown({ password: pw, recoverable: true });
      setPw("");
      onSaved?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shown.password);
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
                  {step.challenge.dev_code && <> Development mode: <b>{step.challenge.dev_code}</b>.</>}
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
            ) : (
              <>
                <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                  <span className="ud-pw">
                    {shown && reveal
                      ? (shown.recoverable ? <Mono>{shown.password}</Mono> : <i>not recoverable</i>)
                      : "••••••••••"}
                  </span>
                  {shown ? (
                    <>
                      <Btn variant="ghost" size="sm" icon={reveal ? EyeOff : Eye} onClick={() => setReveal((r) => !r)}>
                        {reveal ? "Hide" : "Show"}
                      </Btn>
                      {shown.recoverable && reveal && (
                        <Btn variant="ghost" size="sm" icon={copied ? Check : Copy} onClick={copy}>
                          {copied ? "Copied" : "Copy"}
                        </Btn>
                      )}
                    </>
                  ) : (
                    <Btn size="sm" icon={Eye} disabled={busy || step.busy} onClick={() => need("reveal")}>
                      {busy || step.busy ? "Please wait…" : "Reveal password"}
                    </Btn>
                  )}
                </div>

                {shown && !shown.recoverable && (
                  <Note tone="amber">
                    This password was set before it could be stored readably, so it cannot be shown.
                    Set a new one below and hand that over.
                  </Note>
                )}

                {step.ready ? (
                  <div className="stack-sm" style={{ marginTop: 4 }}>
                    <Field label="Set a new password">
                      <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
                      <PasswordRules value={pw} identity={{ name: user.name, email: user.email }} />
                    </Field>
                    <div>
                      <Btn size="sm" icon={KeyRound} disabled={busy || !pw} onClick={savePassword}>
                        {busy ? "Saving…" : "Change password"}
                      </Btn>
                    </div>
                  </div>
                ) : (
                  <Btn variant="ghost" size="sm" icon={KeyRound} disabled={step.busy} onClick={() => need("change")}>
                    Change password
                  </Btn>
                )}
              </>
            )}

            {msg && <Note tone="teal" icon={Check}>{msg}</Note>}
            {(err || step.err) && <Note tone="amber">{err || step.err}</Note>}
          </div>

          <div className="cb-foot">
            <Timer size={11} style={{ verticalAlign: -1 }} /> The confirmation lasts a few minutes, then a
            fresh code is asked for. Only an admin can read or change a password.
          </div>
        </div>
      </div>
    </Modal>
  );
}
