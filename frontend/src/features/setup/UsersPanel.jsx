import { useState } from "react";
import {
  Users as UsersIcon, ShieldCheck, Clock, UserPlus, KeyRound, Check, Trash2, Pause, Play,
} from "lucide-react";
import {
  Btn, Card, CardHead, Field, Input, Select, Note, Pill, Mono, Modal, Spinner, ErrorState,
  PasswordInput,
} from "../../components/ui/index.jsx";
import { useAuth, accessLabel } from "../../auth/AuthProvider.jsx";
import AccessEditor from "../../auth/AccessEditor.jsx";
import { useUsers, useUserMutations } from "../../api/hooks.js";

/* Admin-only account management: approve sign-ups, add people, tick the
   areas each one may open, and pause or remove accounts. Everything writes
   straight to the API — access changes take effect on the user's next call. */

const BLANK = { name: "", email: "", password: "", preset: "operations" };

export default function UsersPanel() {
  const { user: me, presets, allPerms } = useAuth();
  const q = useUsers();
  const { create, update, remove } = useUserMutations();

  const [draft, setDraft] = useState(BLANK);
  const [editAccess, setEditAccess] = useState(null); // { id, name, access }
  const [err, setErr] = useState("");

  if (q.isLoading) return <Spinner label="Loading users…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;

  const users = q.data || [];
  const pending = users.filter((u) => u.status === "pending");
  const rest = users.filter((u) => u.status !== "pending");

  const run = (p) => p.then(() => setErr("")).catch((e) => setErr(e.message));
  const patch = (id, body) => run(update.mutateAsync({ id, body }));

  const add = () => {
    if (!draft.name.trim() || !draft.email.trim() || draft.password.length < 8) {
      setErr("Fill name and email — the password needs at least 8 characters.");
      return;
    }
    run(
      create.mutateAsync({
        name: draft.name.trim(),
        email: draft.email.trim(),
        password: draft.password,
        status: "active",
        access: [...(presets[draft.preset]?.perms || [])],
      }).then(() => setDraft(BLANK))
    );
  };

  return (
    <div className="stack">
      {err && <Note tone="amber">{err}</Note>}

      {pending.length > 0 && (
        <Card>
          <CardHead icon={Clock} title={`${pending.length} request${pending.length === 1 ? "" : "s"} waiting for approval`} />
          {pending.map((u, i) => (
            <div key={u.id} className="row" style={{ padding: "12px 16px", borderTop: i ? "1px solid var(--border)" : "none", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ color: "var(--ink)", fontWeight: 650, fontSize: 13.5 }}>{u.name} <Pill tone="amber">pending</Pill></div>
                <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}>
                  <Mono>{u.email}</Mono> · will get: {accessLabel(u, presets, allPerms)}
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Btn size="sm" icon={Check} onClick={() => patch(u.id, { status: "active" })}>Approve</Btn>
                <Btn variant="ghost" size="sm" onClick={() => run(remove.mutateAsync(u.id))}>Decline</Btn>
              </div>
            </div>
          ))}
          <div className="card-foot">
            <Note tone="amber">New sign-up requests land here. Approve to let the person in — you can change what they see any time after.</Note>
          </div>
        </Card>
      )}

      <div className="split">
        <Card>
          <CardHead icon={UsersIcon} title={`${rest.length} account${rest.length === 1 ? "" : "s"}`} />
          {rest.map((u, i) => {
            const mine = u.id === me.id;
            return (
              <div key={u.id} className="row" style={{ padding: "12px 16px", borderTop: i ? "1px solid var(--border)" : "none", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div className="row" style={{ gap: 7 }}>
                    <span style={{ color: "var(--ink)", fontWeight: 650, fontSize: 13.5 }}>{u.name}</span>
                    {u.role === "admin"
                      ? <Pill tone="teal"><ShieldCheck size={11} /> Admin</Pill>
                      : <Pill>{accessLabel(u, presets, allPerms)}</Pill>}
                    {mine && <Pill tone="green">you</Pill>}
                    {u.status === "disabled" && <Pill tone="amber">paused</Pill>}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}><Mono>{u.email}</Mono></div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {u.role !== "admin" && (
                    <Btn variant="ghost" size="sm" icon={KeyRound}
                      onClick={() => setEditAccess({ id: u.id, name: u.name, access: [...(u.access || [])] })}>
                      Access
                    </Btn>
                  )}
                  {!mine && (
                    <Btn variant="ghost" size="sm" icon={u.status === "active" ? Pause : Play}
                      onClick={() => patch(u.id, { status: u.status === "active" ? "disabled" : "active" })}>
                      {u.status === "active" ? "Pause" : "Resume"}
                    </Btn>
                  )}
                  {!mine && (
                    <button className="icon-btn bare" title="Remove user" onClick={() => run(remove.mutateAsync(u.id))}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </Card>

        <Card pad>
          <div style={{ marginBottom: 12 }}>
            <div className="card-title"><UserPlus size={15} style={{ color: "var(--teal)" }} />Add a user</div>
            <p className="sub" style={{ marginTop: 4 }}>Pick a bundle — you can fine-tune the areas afterwards with one click.</p>
          </div>
          <div className="stack-sm">
            <Field label="Name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Priya Mehta" /></Field>
            <Field label="Email"><Input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="priya@jaikvinglobal.com" /></Field>
            <Field label="Password — at least 8 characters">
              <PasswordInput value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} autoComplete="new-password" />
            </Field>
            <Field label="What can they see?">
              <Select value={draft.preset} onChange={(e) => setDraft({ ...draft, preset: e.target.value })}>
                {Object.entries(presets).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
              </Select>
            </Field>
            <div>
              <Btn icon={UserPlus} disabled={create.isPending || !draft.name || !draft.email} onClick={add}>
                {create.isPending ? "Adding…" : "Add user"}
              </Btn>
            </div>
          </div>
        </Card>
      </div>

      <Note tone="teal">
        <b>How access works:</b> the admin sees everything, always. Everyone else sees only the ticked
        areas — the menu bar shrinks to match, and the API refuses anything outside them, so nobody
        ever meets a page they can't use.
      </Note>

      {editAccess && (
        <Modal
          title={`Access · ${editAccess.name}`}
          icon={KeyRound}
          onClose={() => setEditAccess(null)}
          footer={
            <>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                {editAccess.access.length} of {allPerms.length} areas ticked — changes apply the moment you save.
              </span>
              <div className="row" style={{ gap: 8 }}>
                <Btn variant="ghost" size="sm" onClick={() => setEditAccess(null)}>Cancel</Btn>
                <Btn size="sm" icon={Check}
                  onClick={() => { patch(editAccess.id, { access: editAccess.access }); setEditAccess(null); }}>
                  Save access
                </Btn>
              </div>
            </>
          }
        >
          <AccessEditor access={editAccess.access} onChange={(a) => setEditAccess({ ...editAccess, access: a })} />
        </Modal>
      )}
    </div>
  );
}
