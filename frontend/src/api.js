// Same-origin API client. Token is shared with the admin page (same key)
// so a logged-in admin carries over to the boardrooms app.
const TOKEN_KEY = 'vms_admin_token';
const USER_KEY  = 'vms_admin_user';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getUser  = () => {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
  catch { return null; }
};
export const setSession = (token, user) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};
export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

async function req(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { clearSession(); location.reload(); return; }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get:   (p)    => req('GET', p),
  post:  (p, b) => req('POST', p, b),
  put:   (p, b) => req('PUT', p, b),
  patch: (p, b) => req('PATCH', p, b),
  del:   (p)    => req('DELETE', p),
};

// Authenticated file download (e.g. CSV export). Fetches with the bearer
// token, then saves the response body as a file — the JSON client above
// can't handle a non-JSON body.
export async function download(path, filename) {
  const res = await fetch('/api' + path, {
    headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {},
  });
  if (res.status === 401) { clearSession(); location.reload(); return; }
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
