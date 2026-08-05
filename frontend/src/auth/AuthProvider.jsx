import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as api from "../api/endpoints.js";
import { getToken, setToken, onUnauthorized, tokenExpiresAt } from "../api/client.js";

/* ============================================================
   Session and access rights, sourced from the API.

   The permission catalogue (tree, presets, leaf list) is fetched from
   /api/auth/permissions rather than duplicated here — the ticks in
   Setup → Users then always describe what the backend actually enforces.

   `has(perm)` accepts a string or a list and passes when the user holds ANY
   of them, matching the rule the API guards use. Admins pass everything.

   Two things sit alongside that:
   - `login` may answer with a passcode challenge instead of a session, which
     the login screen redeems through `verifyOtp`;
   - a session lasts 24 hours and is dropped the moment its token expires,
     rather than waiting for the next request to come back 401.
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

  const clear = useCallback(() => {
    setToken(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  // A 401 from anywhere in the app drops us back to the login screen.
  useEffect(() => onUnauthorized(() => setUser(null)), []);

  /* Sign the person out the instant their 24 hours are up. The timer covers
     an open tab; the interval covers a laptop that was asleep when it fired. */
  useEffect(() => {
    if (!user) return undefined;
    const at = tokenExpiresAt();
    if (!at) return undefined;
    const end = () => { setExpired(true); clear(); };
    if (at <= Date.now()) { end(); return undefined; }
    const timer = setTimeout(end, at - Date.now());
    const poll = setInterval(() => { if (Date.now() >= at) end(); }, 30000);
    return () => { clearTimeout(timer); clearInterval(poll); };
  }, [user, clear]);

  // First paint: learn whether the system has an owner yet, load the
  // permission catalogue, and restore the session if a token is stored.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [status, perms] = await Promise.all([api.auth.status(), api.auth.permissions()]);
        if (!alive) return;
        setNeedsBootstrap(status.needs_bootstrap);
        setCatalogue(perms);
      } catch (e) { /* API down — the login screen reports it */ }

      if (getToken()) {
        const at = tokenExpiresAt();
        if (at && at <= Date.now()) {
          // Came back to a tab, or reopened the app, after the 24 hours ran
          // out — say so rather than showing a bare login form.
          setToken(null);
          if (alive) setExpired(true);
        } else {
          try {
            const me = await api.auth.me();
            if (alive) setUser(me);
          } catch (e) {
            setToken(null);
          }
        }
      }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, []);

  const accept = useCallback((res) => {
    // A passcode challenge is not a session — hand it back for the login
    // screen to redeem, and leave the stored token untouched.
    if (res?.otp_required) return { ok: true, otp: res };
    setToken(res.token);
    setUser(res.user);
    setNeedsBootstrap(false);
    setExpired(false);
    qc.clear();
    return { ok: true };
  }, [qc]);

  const login = useCallback(async (email, password) => {
    try {
      return accept(await api.auth.login({ email, password }));
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [accept]);

  const verifyOtp = useCallback(async (challenge, code) => {
    try {
      return accept(await api.auth.verifyOtp({ challenge, code }));
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [accept]);

  const resendOtp = useCallback(async (challenge) => {
    try {
      return { ok: true, otp: await api.auth.resendOtp({ challenge }) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, []);

  const bootstrap = useCallback(async (body) => {
    try {
      return accept(await api.auth.bootstrap(body));
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [accept]);

  const register = useCallback(async (body) => {
    try {
      await api.auth.register(body);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, []);

  const refresh = useCallback(async () => {
    try { setUser(await api.auth.me()); } catch (e) { /* handled by the 401 hook */ }
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
      permTree: catalogue.tree || [],
      allPerms: catalogue.all || [],
      presets: catalogue.presets || {},
      login, logout: clear, register, bootstrap, refresh, verifyOtp, resendOtp,
    };
  }, [user, ready, needsBootstrap, expired, catalogue, login, clear, register, bootstrap, refresh, verifyOtp, resendOtp]);

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
