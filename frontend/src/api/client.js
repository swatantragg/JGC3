/* Thin fetch wrapper. Base URL comes from VITE_API_URL; when empty the app
   calls same-origin /api (dev: Vite proxy, prod: the rewrite in vercel.json).

   The session is an httpOnly cookie the browser attaches by itself — there is
   no token in this file, and that is the point. A token in localStorage can be
   read by any script that gets onto the page, so one injected line is one
   stolen admin session; a cookie marked httpOnly is invisible to JavaScript,
   including an attacker's. `credentials: "include"` is what makes the browser
   send it.

   That only works while the API is same-origin, which is what the /api rewrite
   in vercel.json arranges — the browser talks to the Vercel domain, and Vercel
   forwards to Render server-to-server. Point VITE_API_URL straight at Render
   and the cookie stops travelling.

   A 401 means the session expired or was revoked server-side, so subscribers
   are notified rather than the page reloaded, and nothing in flight is lost.
   A 403 carrying X-Password-Change-Required means the account is holding a
   password an admin set and must replace it before anything else opens. */
const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

const listeners = new Set();
const passwordChangeListeners = new Set();

export const onUnauthorized = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const onPasswordChangeRequired = (fn) => {
  passwordChangeListeners.add(fn);
  return () => passwordChangeListeners.delete(fn);
};

export class ApiError extends Error {
  constructor(message, status, retryAfter) {
    super(message);
    this.status = status;
    /* Seconds until a rate limit or a timed lockout lifts, straight off the
       response, so the UI can count down instead of showing a dead end. */
    this.retryAfter = retryAfter || null;
  }
}

async function request(method, path, body, extraHeaders) {
  const headers = { ...(extraHeaders || {}) };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  /* Marks the call as programmatic. A cross-site form post cannot set it, so
     it is one more thing an attacker cannot forge. */
  headers["X-Requested-With"] = "XMLHttpRequest";

  const res = await fetch(BASE + path, {
    method,
    headers,
    credentials: "include",   // send and accept the session cookie
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch (e) { /* non-JSON error */ }

    if (res.status === 401) {
      listeners.forEach((fn) => fn());
    }
    if (res.status === 403 && res.headers.get("X-Password-Change-Required")) {
      passwordChangeListeners.forEach((fn) => fn());
    }

    const retry = Number(res.headers.get("Retry-After")) || null;
    throw new ApiError(typeof detail === "string" ? detail : JSON.stringify(detail), res.status, retry);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const apiGet = (path, headers) => request("GET", path, undefined, headers);
export const apiPost = (path, body, headers) => request("POST", path, body ?? {}, headers);
export const apiPut = (path, body, headers) => request("PUT", path, body ?? {}, headers);
export const apiDelete = (path) => request("DELETE", path);

/* `headers` carries the step-up grant (`X-Step-Up`) on the call that sets a
   password — see app/deps.py:require_stepup. The grant is short-lived and held
   in memory only, never written to storage. */
export const stepUpHeader = (grant) => (grant ? { "X-Step-Up": grant } : undefined);
