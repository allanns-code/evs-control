const TOKEN_KEY = "evs_token";
const ADMIN_TOKEN_KEY = "evs_admin_token";

let token = localStorage.getItem(TOKEN_KEY) || null;
let adminToken = localStorage.getItem(ADMIN_TOKEN_KEY) || null;

export function getToken() {
  return token;
}
export function setToken(t) {
  token = t;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}
export function getAdminToken() {
  return adminToken;
}
export function setAdminToken(t) {
  adminToken = t;
  if (t) localStorage.setItem(ADMIN_TOKEN_KEY, t);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function request(path, { method = "GET", body, useAdmin = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  const t = useAdmin ? (adminToken || token) : token;
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok || (json && json.ok === false)) {
    const msg = json?.mensagem || `Erro ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return json;
}

export const api = {
  get: (p, opts) => request(p, opts),
  post: (p, body, opts) => request(p, { ...opts, method: "POST", body }),
  put: (p, body, opts) => request(p, { ...opts, method: "PUT", body }),
  patch: (p, body, opts) => request(p, { ...opts, method: "PATCH", body }),
  del: (p, opts) => request(p, { ...opts, method: "DELETE" }),
};
