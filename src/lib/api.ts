const TOKEN_STORAGE_KEY = 'crm_auth_token';
const USER_STORAGE_KEY = 'crm_auth_user';

const normalizeBasePath = (value: string) => {
  if (!value || value === '/') {
    return '/employeelogin';
  }
  return `/${value.replace(/^\/+|\/+$/g, '')}`;
};

const BASE_PATH = import.meta.env.PROD
  ? normalizeBasePath(import.meta.env.BASE_URL)
  : '/employeelogin';

const API_BASE_QUERY = `${BASE_PATH}/api/index.php?route=`;
const API_BASE_PREFIX = `${BASE_PATH}/api`;
const API_BASE_FALLBACK = '/api';
const API_BASE_ALT = BASE_PATH;

const API_BASE_CANDIDATES = Array.from(
  new Set([API_BASE_QUERY, API_BASE_PREFIX, API_BASE_FALLBACK, API_BASE_ALT]),
);

let resolvedApiBase = API_BASE_CANDIDATES[0];

export type ApiUser = {
  id: number;
  name: string;
  email: string;
  role: string;
};

export function getStoredToken(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
}

export function getStoredUser(): ApiUser | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as ApiUser;
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

export function persistSession(token: string, user: ApiUser): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

export function clearStoredSession(): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

function isLikelyHtmlResponse(response: Response): boolean {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  return contentType.includes('text/html');
}

function isJsonResponse(response: Response): boolean {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  return contentType.includes('application/json') || contentType.includes('+json');
}

function isInvalidApiResponse(response: Response): boolean {
  if (response.status === 404) {
    return true;
  }
  if (isLikelyHtmlResponse(response)) {
    return true;
  }
  if (response.status !== 204 && !isJsonResponse(response)) {
    return true;
  }
  return false;
}

function buildApiUrl(apiBase: string, path: string): string {
  if (apiBase.endsWith('?route=')) {
    return `${apiBase}${path.replace(/^\/+/, '')}`;
  }
  return `${apiBase}${path}`;
}

async function parseResponseJsonSafe(response: Response): Promise<any> {
  const raw = await response.text();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {
      error: response.ok ? 'Unexpected server response' : `Request failed (${response.status})`,
      raw,
    };
  }
}

export async function fetchApiWithFallback(path: string, init: RequestInit = {}, includeAuth = true): Promise<Response> {
  const candidates = [resolvedApiBase, ...API_BASE_CANDIDATES.filter((base) => base !== resolvedApiBase)];
  const token = includeAuth ? getStoredToken() : '';

  let lastError: unknown = null;
  let lastInvalidResponse: Response | null = null;

  for (const apiBase of candidates) {
    try {
      const headers = new Headers(init.headers || {});
      if (includeAuth && token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      const response = await fetch(buildApiUrl(apiBase, path), {
        ...init,
        headers,
      });

      if (isInvalidApiResponse(response)) {
        lastInvalidResponse = response;
        continue;
      }

      resolvedApiBase = apiBase;
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  if (lastInvalidResponse) {
    return lastInvalidResponse;
  }

  throw new Error('Failed to reach API');
}

export async function apiFetch(path: string, init: RequestInit = {}, includeAuth = true): Promise<Response> {
  const response = await fetchApiWithFallback(path, init, includeAuth);

  if (response.status === 401 && includeAuth) {
    clearStoredSession();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
  }

  return response;
}

export async function apiJson<T = any>(path: string, init: RequestInit = {}, includeAuth = true): Promise<T> {
  const response = await apiFetch(path, init, includeAuth);
  const payload = await parseResponseJsonSafe(response);

  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as T;
}

export function apiGet<T = any>(path: string): Promise<T> {
  return apiJson<T>(path, { method: 'GET' });
}

export function apiPost<T = any>(path: string, body?: unknown, isFormData = false): Promise<T> {
  const headers: Record<string, string> = {};
  let payloadBody: BodyInit | undefined;

  if (body instanceof FormData) {
    payloadBody = body;
  } else if (body !== undefined) {
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }
    payloadBody = isFormData ? (body as BodyInit) : JSON.stringify(body);
  }

  return apiJson<T>(path, {
    method: 'POST',
    headers,
    body: payloadBody,
  });
}

export async function uploadLeadImportFile<T = { count?: number; success?: boolean }>(file: File): Promise<T> {
  const formData = new FormData();
  formData.append('file', file);

  const token = getStoredToken();
  const preferredBases = Array.from(
    new Set([API_BASE_PREFIX, API_BASE_FALLBACK, resolvedApiBase, ...API_BASE_CANDIDATES]),
  );

  let lastError: Error | null = null;

  for (const apiBase of preferredBases) {
    try {
      const headers = new Headers();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      const response = await fetch(buildApiUrl(apiBase, '/leads/upload'), {
        method: 'POST',
        headers,
        body: formData,
      });

      if (isInvalidApiResponse(response)) {
        continue;
      }

      const payload = await parseResponseJsonSafe(response);
      if (response.ok) {
        resolvedApiBase = apiBase;
        return payload as T;
      }

      const message = typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status})`;
      if (
        message.toLowerCase().includes('unsupported file type on php deployment') ||
        message.toLowerCase().includes('please upload csv')
      ) {
        lastError = new Error(message);
        continue;
      }

      throw new Error(message);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Failed to upload lead file');
    }
  }

  throw lastError || new Error('Failed to upload lead file');
}

export function apiPut<T = any>(path: string, body?: unknown): Promise<T> {
  return apiJson<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiDelete<T = any>(path: string): Promise<T> {
  return apiJson<T>(path, { method: 'DELETE' });
}

export function createWsUrl(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = getStoredToken();
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';

  const wsPath = `${BASE_PATH}/ws`;
  return `${protocol}//${window.location.host}${wsPath}${tokenQuery}`;
}

export { BASE_PATH };
