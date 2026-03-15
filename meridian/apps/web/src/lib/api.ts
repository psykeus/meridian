/**
 * Shared API utilities — centralized auth headers, automatic token refresh,
 * and fetch wrapper with 401 retry.
 *
 * Usage:
 *   import { authHeaders, apiFetch } from "@/lib/api";
 *   const resp = await apiFetch("/api/v1/events");
 *   const data = await fetch("/api/v1/foo", { headers: authHeaders() });
 */

/** Build auth headers with the current JWT from localStorage. */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = localStorage.getItem("access_token") ?? "";
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

// ── Token refresh logic ─────────────────────────────────────────────────────

let _refreshPromise: Promise<string | null> | null = null;

/** Refresh the access token using the stored refresh token.
 *  De-duplicates concurrent refresh attempts. */
export async function refreshAccessToken(): Promise<string | null> {
  // If a refresh is already in-flight, piggyback on it
  if (_refreshPromise) return _refreshPromise;

  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return null;

  _refreshPromise = (async () => {
    try {
      const resp = await fetch("/api/v1/auth/refresh", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${refreshToken}`,
          "Content-Type": "application/json",
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.access_token) {
          localStorage.setItem("access_token", data.access_token);
          if (data.refresh_token) localStorage.setItem("refresh_token", data.refresh_token);
          return data.access_token as string;
        }
      }
      return null;
    } catch {
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

/** Check whether the stored access token is expired (or nearly expired).
 *  Returns true if the token should be refreshed. */
export function isTokenExpiringSoon(bufferSeconds = 300): boolean {
  const token = localStorage.getItem("access_token");
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const exp = payload.exp as number;
    return Date.now() / 1000 > exp - bufferSeconds;
  } catch {
    return true;
  }
}

/** Proactively refresh the token if it's expired or expiring within 5 min.
 *  Safe to call on app startup / page refresh. */
export async function ensureFreshToken(): Promise<void> {
  if (isTokenExpiringSoon()) {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      // Refresh failed — clear stale tokens so RequireAuth redirects to login
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
    }
  }
}

// ── Fetch wrapper with automatic 401 retry ──────────────────────────────────

/** Convenience wrapper around fetch with auth headers and automatic
 *  401 → refresh → retry (once). */
export async function apiFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = {
    ...authHeaders(),
    ...(init.headers as Record<string, string> ?? {}),
  };
  const resp = await fetch(url, { ...init, headers });

  // On 401, attempt one token refresh + retry
  if (resp.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      const retryHeaders = {
        ...authHeaders(),
        ...(init.headers as Record<string, string> ?? {}),
      };
      return fetch(url, { ...init, headers: retryHeaders });
    }
  }

  return resp;
}
