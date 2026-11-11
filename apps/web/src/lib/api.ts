// API client (TDD 6): access token in memory only, one shared refresh for parallel 401s,
// each request retried once after a refresh. Always calls /api/... (Next.js rewrite).
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

let token: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onAuthLost: () => void = () => {};

export const hasToken = () => token !== null;
export const setAuthLostHandler = (fn: () => void) => {
  onAuthLost = fn;
};

async function parse(res: Response) {
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (res.ok) return body;
  const e = body?.error;
  throw new ApiError(
    res.status,
    e?.code ?? 'INTERNAL_ERROR',
    e?.message ?? 'Something went wrong. Please try again.',
    e?.details,
  );
}

// Shared by every caller that hit a 401 at the same time.
export function refresh(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST' })
    .then(parse)
    .then((r: { accessToken: string }) => {
      token = r.accessToken;
      return true;
    })
    .catch(() => {
      token = null;
      return false;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function login(email: string, password: string) {
  const r = await parse(
    await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  );
  token = r.accessToken;
}

export async function logout() {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).catch(() => {});
  token = null;
}

function send(path: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  return fetch(`/api${path}`, { ...init, headers });
}

export async function api<T = unknown>(
  path: string,
  { method = 'GET', body }: { method?: string; body?: unknown } = {},
): Promise<T> {
  const init: RequestInit = {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  };
  let res: Response;
  try {
    res = await send(path, init);
    if (res.status === 401 && !path.startsWith('/auth/')) {
      if (!(await refresh())) {
        onAuthLost();
        throw new ApiError(401, 'UNAUTHENTICATED', 'Please log in again.');
      }
      res = await send(path, init);
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, 'NETWORK', 'No connection. Check your internet and try again.');
  }
  return parse(res);
}

interface SignedUpload {
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  publicId: string;
  signature: string;
}

// Signed direct upload to Cloudinary (photos never pass through the backend, NFR-007).
export async function uploadPhoto(
  file: Blob,
  purpose: 'ITEM_ORIGINAL' | 'ITEM_CLEAN',
): Promise<string> {
  const s = await api<SignedUpload>('/uploads/sign', {
    method: 'POST',
    body: { purpose },
  });
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', s.apiKey);
  form.append('timestamp', String(s.timestamp));
  form.append('public_id', s.publicId);
  form.append('signature', s.signature);
  const res = await fetch(s.uploadUrl, { method: 'POST', body: form }).catch(
    () => null,
  );
  if (!res?.ok) {
    throw new ApiError(502, 'UPLOAD_FAILED', 'Photo upload failed. Please try again.');
  }
  return s.publicId;
}
