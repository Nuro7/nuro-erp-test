import type { LoginResponse } from "@/lib/auth";

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

const AUTH_STORAGE_KEY = "nuro7-auth";

// The auth store (lib/store/auth-store.ts) writes the persisted session to
// EITHER localStorage (when "Keep me signed in" is checked) or sessionStorage
// (when it isn't). Reading from a single backing store would silently lose
// the token in the session-only branch and cause an immediate auto-logout —
// so every read/write here checks sessionStorage first, then localStorage.
function readAuthRaw(): { raw: string; storage: Storage } | null {
  if (typeof window === "undefined") return null;
  const fromSession = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
  if (fromSession) return { raw: fromSession, storage: window.sessionStorage };
  const fromLocal = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (fromLocal) return { raw: fromLocal, storage: window.localStorage };
  return null;
}

function getAuthState() {
  const entry = readAuthRaw();
  if (!entry) return null;
  try {
    return (JSON.parse(entry.raw) as { state?: { accessToken?: string | null; refreshToken?: string | null } }).state ?? null;
  } catch {
    return null;
  }
}

function getAccessToken() {
  return getAuthState()?.accessToken ?? null;
}

function getRefreshToken() {
  return getAuthState()?.refreshToken ?? null;
}

function updateAccessToken(newToken: string) {
  const entry = readAuthRaw();
  if (!entry) return;
  try {
    const parsed = JSON.parse(entry.raw);
    parsed.state.accessToken = newToken;
    entry.storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // ignore
  }
}

function clearAuth() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
  window.location.href = "/login";
}

async function handleErrorResponse<T>(response: Response, path: string): Promise<T> {
  // The API error envelope looks like:
  //   { success: false, error: { message, error, statusCode }, path, timestamp }
  // OR, for fallback non-HttpException crashes:
  //   { success: false, error: "Internal server error", ... }
  // Older/raw shapes like { message } are also handled as a last resort.
  try {
    const errBody = (await response.json()) as {
      error?: { message?: string | string[] } | string;
      message?: string | string[];
    };

    const nested = typeof errBody.error === "object" ? errBody.error?.message : undefined;
    const raw =
      nested ??
      errBody.message ??
      (typeof errBody.error === "string" ? errBody.error : undefined);
    const msg = Array.isArray(raw) ? raw.join(", ") : raw;

    throw new Error(msg || `API request failed for ${path}`);
  } catch (e) {
    if (e instanceof Error && e.message && !e.message.startsWith("API request")) throw e;
    throw new Error(`API request failed for ${path}`);
  }
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  // Deduplicate concurrent refresh calls
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${baseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) return null;

      const data = (await response.json()) as { accessToken: string };
      updateAccessToken(data.accessToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = getAccessToken();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  // If 401, try refreshing the token once
  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      const retryResponse = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${newToken}`,
          ...(init?.headers ?? {}),
        },
        cache: "no-store",
      });

      if (retryResponse.ok) {
        if (retryResponse.status === 204) return null as unknown as T;
        const text = await retryResponse.text();
        if (!text) return null as unknown as T;
        try {
          return JSON.parse(text) as T;
        } catch {
          return null as unknown as T;
        }
      }

      // Refresh worked but the retry came back with a NON-401 error (most
      // commonly 403 — the endpoint is gated by role and this user lacks
      // it). That's a permission issue on a single endpoint, NOT a dead
      // session, so surface it as a normal API error instead of clearing
      // auth. Auto-logging out here is what made employees get bounced
      // back to /login the moment any role-gated query (e.g. the dashboard
      // calling /attendance/team) ran with a freshly-refreshed token.
      if (retryResponse.status !== 401) {
        return handleErrorResponse<T>(retryResponse, path);
      }
    }

    // Refresh failed OR retry still 401 — session is genuinely dead.
    clearAuth();
    throw new Error("Session expired. Please log in again.");
  }

  if (!response.ok) {
    return handleErrorResponse<T>(response, path);
  }

  // Handle empty bodies (e.g. endpoints that legitimately return null / 204 No Content).
  // Safari's response.json() throws "The string did not match the expected pattern" on empty bodies.
  if (response.status === 204) return null as unknown as T;
  const text = await response.text();
  if (!text) return null as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null as unknown as T;
  }
}

export async function apiFetchForm<T>(path: string, body: FormData): Promise<T> {
  const accessToken = getAccessToken();
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body,
  });

  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      const retryResponse = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${newToken}` },
        body,
      });
      if (retryResponse.ok) return retryResponse.json() as Promise<T>;
      // Same rationale as apiFetch — a non-401 failure after a successful
      // refresh is an endpoint-level error, not a dead session.
      if (retryResponse.status !== 401) {
        return handleErrorResponse<T>(retryResponse, path);
      }
    }
    clearAuth();
    throw new Error("Session expired.");
  }

  if (!response.ok) {
    return handleErrorResponse<T>(response, path);
  }

  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, data: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function apiPatch<T>(path: string, data: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, {
    method: "DELETE",
  });
}

export async function loginRequest(email: string, password: string) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error("Invalid login credentials.");
  }

  return response.json() as Promise<LoginResponse>;
}

export async function logoutRequest(refreshToken: string) {
  return apiFetch("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export async function downloadWithAuth(path: string, filename: string) {
  const accessToken = getAccessToken();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (!response.ok) {
    // Surface the backend's actual error message so the user sees "Project not found"
    // etc. rather than a generic "Unable to download".
    let msg = `Unable to download ${filename} (${response.status}).`;
    try {
      const ct = response.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const body = await response.json();
        msg = body?.message ?? body?.error?.message ?? msg;
      } else {
        const text = await response.text();
        if (text) msg = text.slice(0, 200);
      }
    } catch {
      // keep default msg
    }
    throw new Error(msg);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}
