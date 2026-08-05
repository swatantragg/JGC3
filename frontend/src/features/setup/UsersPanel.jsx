import { useMemo, useState } from "react";
import {
  Users as UsersIcon, ShieldCheck, Clock, UserPlus, KeyRound, Check, Trash2, Pause, Play,
  BadgeCheck, MailWarning, AlertTriangle, Mail, User as UserIcon,
} from "lucide-react";
import {
  Btn, Card, CardHead, Field, Input, Select, Note, Pill, Mono, Modal, Spinner, ErrorState,
  PasswordInput, PasswordRules,
} from "../../components/ui/index.jsx";
import { passwordOk } from "../../lib/password.js";
import { useAuth, accessLabel } from "../../auth/AuthProvider.jsx";
import { useIsMobile } from "../../lib/useIsMobile.js";
import AccessEditor from "../../auth/AccessEditor.jsx";
import UserDetailModal from "./UserDetailModal.jsx";
import { useUsers, useUserMutations } from "../../api/hooks.js";

/* Admin-only account management: approve sign-ups, add people, tick the
   areas each one may open, and pause or remove accounts. Everything writes
   straight to the API — access changes take effect on the user's next call.

   Creating and removing both go through a confirmation that spells out the
   name, the address and — for a new account — every area it is about to be
   given, because both actions are ones an admin only wants to take on purpose:
   an account is a way into the company's order book, and removing one cannot
   be undone. */

const BLANK = { name: "", email: "", password: "", preset: "operations" };

/* Has this person proved their address yet? They do it once, with a code
   mailed on their first sign-in — until then the tick is missing, which is
   the quickest way to spot an address that was typed wrong. */
const VerifiedMark = ({ ok }) => (
  <Pill tone={ok ? "green" : "amber"}>
    {ok ? <BadgeCheck size={11} /> : <MailWarning size={11} />}
    {ok ? "verified" : "not verified"}
  </Pill>
);

/* Name + address, laid out the same way wherever an account is named — in the
   list and inside both confirmations. */
const Identity = ({ name, email }) => (
  <div className="ident">
    <span className="ident-ava">{(name || "?").trim().charAt(0).toUpperCase()}</span>
    <span className="ident-txt">
      <b>{name}</b>
      <Mono>{email}</Mono>
    </span>
  </div>
);

/* Flatten the catalogue to { leafId: "Section → Area" } so a confirmation can
   name the areas in the words the admin just ticked. */
function useLeafLabels(permTree) {
  return useMemo(() => {
    const out = {};
    const walk = (nodes, trail) => nodes.forEach((n) => {
      if (n.children) walk(n.children, [...trail, n.label]);
      else out[n.id] = [...trail, n.label].join(" → ");
    });
    walk(permTree || [], []);
    return out;
  }, [permTree]);
}

export default function UsersPanel() {
  const { user: me, presets, allPerms, permTree } = useAuth();
  const q = useUsers();
  const { create, update, remove } = useUserMutations();
  const leafLabels = useLeafLabels(permTree);
  const mobile = useIsMobile();
  // On a phone the add form is a dialog; the accounts stay the first thing seen.
  const [adding, setAdding] = useState(false);

  const [draft, setDraft] = useState(BLANK);
  const [editAccess, setEditAccess] = useState(null); // { id, name, access }
  const [confirmAdd, setConfirmAdd] = useState(null); // the draft, frozen
  const [confirmDel, setConfirmDel] = useState(null); // the user being removed
  const [detail, setDetail] = useState(null);         // the account being read
  const [err, setErr] = useState("");

  if (q.isLoading) return <Spinner label="Loading users…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;

  const users = q.data || [];
  const pending = users.filter((u) => u.status === "pending");
  const rest = users.filter((u) => u.status !== "pending");

  const run = (p) => p.then(() => setErr("")).catch((e) => setErr(e.message));
  const patch = (id, body) => run(update.mutateAsync({ id, body }));

  // Step one: check the form, then ask. Nothing is sent until the admin has
  // read back what they typed.
  const review = () => {
    if (!draft.name.trim() || !draft.email.trim()) {
      setErr("Fill in the name and the email address.");
      return;
    }
    if (!passwordOk(draft.password, { name: draft.name, email: draft.email })) {
      setErr("The password does not meet every rule listed under the box yet.");
      return;
    }
    setErr("");
    // The confirmation replaces the add dialog rather than stacking on it.
    setAdding(false);
    setConfirmAdd({ ...draft, name: draft.name.trim(), email: draft.email.trim() });
  };

  const reallyAdd = () => {
    const body = {
      name: confirmAdd.name,
      email: confirmAdd.email,
      password: confirmAdd.password,
      status: "active",
      access: [...(presets[confirmAdd.preset]?.perms || [])],
    };
    setConfirmAdd(null);
    run(create.mutateAsync(body).then(() => setDraft(BLANK)));
  };

  const reallyRemove = () => {
    const { id } = confirmDel;
    setConfirmDel(null);
    run(remove.mutateAsync(id));
  };

  const grantedPerms = confirmAdd ? (presets[confirmAdd.preset]?.perms || []) : [];

  /* One copy of the add form, shown either in the column beside the list or
     inside a dialog — a second copy would drift out of step with the first. */
  const addForm = (
    <div className="stack-sm">
              <Field label="Name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Priya Mehta" /></Field>
              <Field label="Email"><Input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="priya@jaikvinglobal.com" /></Field>
              <Field label="Password">
                <PasswordInput value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} autoComplete="new-password" />
                <PasswordRules value={draft.password} identity={{ name: draft.name, email: draft.email }} />
              </Field>
              <Field label="What can they see?">
                <Select value={draft.preset} onChange={(e) => setDraft({ ...draft, preset: e.target.value })}>
                  {Object.entries(presets).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
                </Select>
              </Field>
              <div>
                <Btn icon={UserPlus} disabled={create.isPending || !draft.name || !draft.email} onClick={review}>
                  {create.isPending ? "Adding…" : "Add user"}
                </Btn>
              </div>
            </div>
  );

  return (
    <div className="stack">
      {err && <Note tone="amber">{err}</Note>}

      {pending.length > 0 && (
        <Card>
          <CardHead icon={Clock} title={`${pending.length} request${pending.length === 1 ? "" : "s"} waiting for approval`} />
          {pending.map((u, i) => (
            <div key={u.id} className="user-row" style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
              <div className="ur-main">
                <div className="ur-top">
                  <span className="ur-name">{u.name}</span>
                  <Pill tone="amber">pending</Pill>
                </div>
                <div className="ur-sub">
                  <Mono>{u.email}</Mono>
                  <span className="ur-note">will get: {accessLabel(u, presets, allPerms)}</span>
                </div>
              </div>
              <div className="ur-acts">
                <Btn size="sm" icon={Check} onClick={() => patch(u.id, { status: "active" })}>Approve</Btn>
                <Btn variant="ghost" size="sm" onClick={() => setConfirmDel(u)}>Decline</Btn>
              </div>
            </div>
          ))}
        </Card>
      )}

      <div className="split split-users">
        <Card>
          <CardHead icon={UsersIcon} title={`${rest.length} account${rest.length === 1 ? "" : "s"}`}>
            {mobile && <Btn size="sm" icon={UserPlus} onClick={() => setAdding(true)}>Add user</Btn>}
          </CardHead>
          {rest.map((u, i) => {
            const mine = u.id === me.id;
            return (
              <div key={u.id} className="user-row" style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                {/* The identity is the way in to the account's details — the
                    buttons beside it keep their own jobs. */}
                <button className="ur-main" onClick={() => setDetail(u)} title="Open this account">
                  <div className="ur-top">
                    <span className="ur-name">{u.name}</span>
                    {u.role === "admin"
                      ? <Pill tone="teal"><ShieldCheck size={11} /> Admin</Pill>
                      : <Pill>{accessLabel(u, presets, allPerms)}</Pill>}
                    {mine && <Pill tone="green">you</Pill>}
                    {u.status === "disabled" && <Pill tone="amber">paused</Pill>}
                  </div>
                  <div className="ur-sub">
                    <Mono>{u.email}</Mono>
                    <VerifiedMark ok={u.email_verified} />
                  </div>
                </button>
                <div className="ur-acts">
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
                    <button className="icon-btn bare" title="Remove user" onClick={() => setConfirmDel(u)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </Card>

        {!mobile && (
        <Card pad>
          <div style={{ marginBottom: 12 }}>
            <div className="card-title"><UserPlus size={15} style={{ color: "var(--teal)" }} />Add a user</div>
          </div>
          {addForm}
        </Card>
        )}
      </div>

      {adding && (
        <Modal title="Add a user" icon={UserPlus} onClose={() => setAdding(false)}
          footer={<Btn variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Btn>}>
          {addForm}
        </Modal>
      )}

      {detail && (
        <UserDetailModal
          user={users.find((u) => u.id === detail.id) || detail}
          permTree={permTree}
          presets={presets}
          allPerms={allPerms}
          onClose={() => setDetail(null)}
          onSaved={() => q.refetch()}
        />
      )}

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

      {confirmAdd && (
        <Modal
          title="Create this account?"
          icon={UserPlus}
          size="sm"
          onClose={() => setConfirmAdd(null)}
          footer={
            <>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                They sign in with this email and password, and are emailed a code the first time.
              </span>
              <div className="row" style={{ gap: 8 }}>
                <Btn variant="ghost" size="sm" onClick={() => setConfirmAdd(null)}>Go back and edit</Btn>
                <Btn size="sm" icon={Check} disabled={create.isPending} onClick={reallyAdd}>
                  {create.isPending ? "Creating…" : "Yes, create the user"}
                </Btn>
              </div>
            </>
          }
        >
          <div className="stack-sm">
            <Identity name={confirmAdd.name} email={confirmAdd.email} />

            <div className="confirm-block">
              <div className="cb-head">
                <span>Access being given</span>
                <Pill tone="teal">{presets[confirmAdd.preset]?.label || confirmAdd.preset}</Pill>
              </div>
              <ul className="cb-list">
                {grantedPerms.map((p) => (
                  <li key={p}><Check size={12} />{leafLabels[p] || p}</li>
                ))}
              </ul>
              <div className="cb-foot">
                {grantedPerms.length} of {allPerms.length} areas. Everything not listed stays closed
                to them — and can be changed later with <b>Access</b>.
              </div>
            </div>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Modal
          title={confirmDel.status === "pending" ? "Decline this request?" : "Remove this user?"}
          icon={AlertTriangle}
          size="sm"
          onClose={() => setConfirmDel(null)}
          footer={
            <>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>This cannot be undone.</span>
              <div className="row" style={{ gap: 8 }}>
                <Btn variant="ghost" size="sm" onClick={() => setConfirmDel(null)}>Cancel</Btn>
                <Btn variant="danger" size="sm" icon={Trash2} disabled={remove.isPending} onClick={reallyRemove}>
                  {remove.isPending
                    ? "Removing…"
                    : confirmDel.status === "pending" ? "Yes, decline" : "Yes, remove the user"}
                </Btn>
              </div>
            </>
          }
        >
          <div className="stack-sm">
            <Identity name={confirmDel.name} email={confirmDel.email} />
            <Note tone="amber" icon={AlertTriangle}>
              {confirmDel.status === "pending" ? (
                <>Declining deletes the request. This person can ask for access again later.</>
              ) : (
                <>
                  The account is deleted and this sign-in stops working straight away. Orders,
                  invoices and documents they entered are <b>not</b> touched. To stop the sign-in
                  but keep the account, use <b>Pause</b> instead.
                </>
              )}
            </Note>
          </div>
        </Modal>
      )}
    </div>
  );
}
