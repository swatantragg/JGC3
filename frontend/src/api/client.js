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

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  const headers = {};
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

export const apiGet = (path) => request("GET", path);
export const apiPost = (path, body) => request("POST", path, body ?? {});
export const apiPut = (path, body) => request("PUT", path, body ?? {});
export const apiDelete = (path) => request("DELETE", path);
