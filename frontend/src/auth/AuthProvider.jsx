import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as api from "../api/endpoints.js";
import { getToken, setToken, onUnauthorized } from "../api/client.js";

/* ============================================================
   Session and access rights, sourced from the API.

   The permission catalogue (tree, presets, leaf list) is fetched from
   /api/auth/permissions rather than duplicated here — the ticks in
   Setup → Users then always describe what the backend actually enforces.

   `has(perm)` accepts a string or a list and passes when the user holds ANY
   of them, matching the rule the API guards use. Admins pass everything.
   ============================================================ */

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const [user, setUser] = useState(null);
  const [catalogue, setCatalogue] = useState({ tree: [], all: [], presets: {} });
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [ready, setReady] = useState(false);

  const clear = useCallback(() => {
    setToken(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  // A 401 from anywhere in the app drops us back to the login screen.
  useEffect(() => onUnauthorized(() => setUser(null)), []);

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
        try {
          const me = await api.auth.me();
          if (alive) setUser(me);
        } catch (e) {
          setToken(null);
        }
      }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, []);

  const accept = useCallback((res) => {
    setToken(res.token);
    setUser(res.user);
    setNeedsBootstrap(false);
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
      permTree: catalogue.tree || [],
      allPerms: catalogue.all || [],
      presets: catalogue.presets || {},
      login, logout: clear, register, bootstrap, refresh,
    };
  }, [user, ready, needsBootstrap, catalogue, login, clear, register, bootstrap, refresh]);

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
