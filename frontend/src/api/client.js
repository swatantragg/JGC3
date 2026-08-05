/* Thin fetch wrapper. Base URL comes from VITE_API_URL; when empty the app
   calls same-origin /api (dev: Vite proxy, prod: nginx proxy).

   Every request carries the session token. A 401 means the token expired or
   was revoked server-side, so we clear it and let the app fall back to the
   login screen — subscribers are notified rather than the page reloaded, so
   nothing in-flight is lost. */
const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const TOKEN_KEY = "jg-token";

let token = null;
try { token = localStorage.getItem(TOKEN_KEY); } catch (e) { /* private mode */ }

const listeners = new Set();
export const onUnauthorized = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const getToken = () => token;

export function setToken(next) {
  token = next || null;
  try {
    next ? localStorage.setItem(TOKEN_KEY, next) : localStorage.removeItem(TOKEN_KEY);
  } catch (e) { /* private mode */ }
}

/* When the stored session token stops being valid, in epoch milliseconds —
   read straight off the token's own `exp` claim, so the browser and the API
   agree on the moment without a round trip. Null when there is no token or it
   carries no expiry. Reading the payload needs no signature check: nothing is
   trusted from it, it only decides when to show the login screen again. */
export function tokenExpiresAt() {
  if (!token) return null;
  try {
    const raw = token.split(".")[1];
    if (!raw) return null;
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")));
    return payload.exp ? payload.exp * 1000 : null;
  } catch (e) {
    return null;
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body, extraHeaders) {
  const headers = { ...(extraHeaders || {}) };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch (e) { /* non-JSON error */ }
    if (res.status === 401) {
      setToken(null);
      listeners.forEach((fn) => fn());
    }
    throw new ApiError(typeof detail === "string" ? detail : JSON.stringify(detail), res.status);
  }
  if (res.status === 204) return null;
  return res.json();
}

/* `headers` carries the step-up grant (`X-Step-Up`) on the two calls that read
   or set a password — see app/deps.py:require_stepup. */
export const apiGet = (path, headers) => request("GET", path, undefined, headers);
export const apiPost = (path, body, headers) => request("POST", path, body ?? {}, headers);
export const apiPut = (path, body, headers) => request("PUT", path, body ?? {}, headers);
export const apiDelete = (path) => request("DELETE", path);

export const stepUpHeader = (grant) => (grant ? { "X-Step-Up": grant } : undefined);
