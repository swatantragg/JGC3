import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as api from "../api/endpoints.js";
import { onUnauthorized, onPasswordChangeRequired } from "../api/client.js";

/* ============================================================
   Session and access rights, sourced from the API.

   The session is an httpOnly cookie the browser holds and attaches by itself.
   Nothing in this file can read it — which is the point: a token this code
   could read is a token an injected script could read, and one stolen admin
   session is the whole system. So there is no token state here, no expiry
   timer read from a payload, and no localStorage. Whether a session is alive
   is a question only the server can answer, and /api/auth/me is how it is
   asked.

   The permission catalogue (tree, presets, leaf list) is fetched from
   /api/auth/permissions rather than duplicated here — the ticks in
   Setup → Users then always describe what the backend actually enforces.

   `has(perm)` accepts a string or a list and passes when the user holds ANY
   of them, matching the rule the API guards use. Admins pass everything.

   Three things sit alongside that:
   - `login` may answer with a passcode challenge instead of a session, which
     the login screen redeems through `verifyOtp`;
   - a sign-in with a password an admin set comes back with
     `must_change_password`, and the app shows nothing but that screen until
     it is done;
   - a locked-out account can clear its own lock by proving its mailbox,
     without waiting and without an admin.
   ============================================================ */

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const [user, setUser] = useState(null);
  const [catalogue, setCatalogue] = useState({ tree: [], all: [], presets: {} });
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const clear = useCallback(() => {
    setUser(null);
    setMustChangePassword(false);
    qc.clear();
  }, [qc]);

  /* A 401 from anywhere drops us back to the login screen. The cookie is
     already dead server-side by then; there is nothing on this end to erase. */
  useEffect(() => onUnauthorized(() => { setUser(null); setMustChangePassword(false); }), []);

  /* A 403 carrying X-Password-Change-Required means the session is fine but
     the password is an admin's, not the holder's. */
  useEffect(() => onPasswordChangeRequired(() => setMustChangePassword(true)), []);

  // First paint: learn whether the system has an owner yet, load the
  // permission catalogue, and ask the server whether we are signed in.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [status, perms] = await Promise.all([api.auth.status(), api.auth.permissions()]);
        if (!alive) return;
        setNeedsBootstrap(status.needs_bootstrap);
        setCatalogue(perms);
      } catch (e) { /* API down — the login screen reports it */ }

      /* The cookie is invisible here, so there is nothing to inspect before
         asking. A 401 simply means no session, which is not an error worth
         showing anyone. */
      try {
        const me = await api.auth.me();
        if (alive) {
          setUser(me);
          setMustChangePassword(Boolean(me.must_change_password));
        }
      } catch (e) { /* not signed in */ }

      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, []);

  const accept = useCallback((res) => {
    // A passcode challenge is not a session — hand it back for the login
    // screen to redeem.
    if (res?.otp_required) return { ok: true, otp: res };
    setUser(res.user);
    setMustChangePassword(Boolean(res.must_change_password || res.user?.must_change_password));
    setNeedsBootstrap(false);
    setExpired(false);
    qc.clear();
    return { ok: true, mustChangePassword: Boolean(res.must_change_password) };
  }, [qc]);

  const call = useCallback(async (fn) => {
    try {
      return await fn();
    } catch (e) {
      return { ok: false, error: e.message, status: e.status, retryAfter: e.retryAfter };
    }
  }, []);

  const login = useCallback(
    (email, password) => call(async () => accept(await api.auth.login({ email, password }))),
    [accept, call],
  );

  const verifyOtp = useCallback(
    (challenge, code) => call(async () => accept(await api.auth.verifyOtp({ challenge, code }))),
    [accept, call],
  );

  const resendOtp = useCallback(
    (challenge) => call(async () => ({ ok: true, otp: await api.auth.resendOtp({ challenge }) })),
    [call],
  );

  const bootstrap = useCallback(
    (body) => call(async () => accept(await api.auth.bootstrap(body))),
    [accept, call],
  );

  /* "Unlock my account" — a code to the address on file, then the lock lifts.
     Grants no session: the password is still needed afterwards. */
  const unlockStart = useCallback(
    (email) => call(async () => ({ ok: true, otp: await api.auth.unlockStart({ email }) })),
    [call],
  );

  const unlockVerify = useCallback(
    (challenge, code) => call(async () => {
      await api.auth.unlockVerify({ challenge, code });
      return { ok: true };
    }),
    [call],
  );

  /* Replacing an admin-set password. On success the server issues a fresh
     cookie, so the session continues rather than bouncing to the login form. */
  const completeForcedChange = useCallback(
    (currentPassword, newPassword, confirmPassword) => call(async () => {
      await api.auth.changePasswordForced({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setMustChangePassword(false);
      const me = await api.auth.me();
      setUser(me);
      return { ok: true };
    }),
    [call],
  );

  const logout = useCallback(async () => {
    // Best effort: the server ends every session this account has open. Even
    // if the call fails, the local state is cleared.
    try { await api.auth.logout(); } catch (e) { /* already gone */ }
    clear();
  }, [clear]);

  const refresh = useCallback(async () => {
    try {
      const me = await api.auth.me();
      setUser(me);
      setMustChangePassword(Boolean(me.must_change_password));
    } catch (e) { /* handled by the 401 hook */ }
  }, []);

  const value = useMemo(() => {
    const isAdmin = user?.role === "admin";
    const granted = new Set(user?.access || []);
    const has = (perm) => {
      if (!user) return false;
      if (isAdmin) return true;
      return (Array.isArray(perm) ? perm : [perm]).some((p) => granted.has(p));
    };
    return {
      user, isAdmin, has, ready, needsBootstrap,
      sessionExpired: expired,
      mustChangePassword,
      permTree: catalogue.tree || [],
      allPerms: catalogue.all || [],
      presets: catalogue.presets || {},
      login, logout, bootstrap, refresh, verifyOtp, resendOtp,
      unlockStart, unlockVerify, completeForcedChange,
    };
  }, [user, ready, needsBootstrap, expired, mustChangePassword, catalogue, login, logout,
      bootstrap, refresh, verifyOtp, resendOtp, unlockStart, unlockVerify, completeForcedChange]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* Summary shown next to a user — "Admin", a preset name when the ticks match
   one exactly, or a plain count otherwise. */
export function accessLabel(u, presets = {}, allPerms = []) {
  if (u.role === "admin") return "Admin — everything";
  const set = new Set(u.access || []);
  for (const p of Object.values(presets)) {
    if (p.perms.length === set.size && p.perms.every((x) => set.has(x))) return p.label;
  }
  return `${set.size} of ${allPerms.length} areas`;
}
