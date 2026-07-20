/* Thin fetch wrapper. Base URL comes from VITE_API_URL; when empty the app
   calls same-origin /api (dev: Vite proxy, prod: nginx proxy). */
const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch (e) { /* non-JSON error */ }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  if (res.status === 204) return null;
  return res.json();
}

export const apiGet = (path) => request("GET", path);
export const apiPost = (path, body) => request("POST", path, body ?? {});
export const apiPut = (path, body) => request("PUT", path, body ?? {});
export const apiDelete = (path) => request("DELETE", path);
