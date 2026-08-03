import axios from 'axios';
import { useAuthStore } from './store';
import { useDraftStore } from './draft';

// Clears both the auth session and the staff draft cart. Devices in a shop
// are often shared between staff, so a stale draft must not survive logout.
function logoutAndClearDraft(): void {
  useAuthStore.getState().logout();
  useDraftStore.getState().clear();
}

/**
 * Pre-configured axios instance pointed at the NestJS backend.
 * - baseURL comes from NEXT_PUBLIC_API_URL (falls back to localhost:4000).
 * - withCredentials lets the browser send/receive the refresh-token cookie.
 */
/**
 * Resolve the API base URL. Accepts either a full base that already includes
 * the `/api/v1` prefix, or just the server origin (e.g. http://localhost:4000)
 * in which case we append the prefix. This keeps it working regardless of how
 * NEXT_PUBLIC_API_URL is set.
 */
function resolveBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
  return /\/api\/v\d+$/.test(raw) ? raw : `${raw}/api/v1`;
}

export const api = axios.create({
  baseURL: resolveBaseUrl(),
  withCredentials: true,
  timeout: 15_000, // 15-second timeout prevents indefinite hangs
});

// Attach the bearer token (if logged in) to every request.
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Refreshes the access token using the HTTP-only refresh cookie. Plain axios
// (not the `api` instance) so this call never recurses through this same
// response interceptor.
let refreshPromise: Promise<string> | null = null;
function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(
        `${resolveBaseUrl()}/auth/refresh`,
        {},
        { withCredentials: true },
      )
      .then((res) => {
        const { accessToken, user } = res.data.data;
        useAuthStore.getState().setAuth(accessToken, user);
        return accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// If the token is rejected, try to silently refresh it and retry the request
// once before giving up and sending the user back to login. Also auto-retry
// transient failures: the free-tier backend sleeps after idle and the first
// request can network-error / 502 while it wakes (~30-50s). We retry those
// automatically so the user doesn't see a scary "Network Error".
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const config = error?.config;
    const isNetwork = !error.response; // no response = network / CORS / cold start
    const isGateway = status === 502 || status === 503 || status === 504;

    if (config && !config.__skipRetry && (isNetwork || isGateway)) {
      config.__retryCount = (config.__retryCount || 0) + 1;
      if (config.__retryCount <= 4) {
        const delay = Math.min(5000, 2000 * config.__retryCount);
        await new Promise((res) => setTimeout(res, delay));
        return api(config);
      }
    }

    const isAuthEndpoint = typeof config?.url === 'string' && config.url.includes('/auth/');
    if (status === 401 && config && !config.__isRetryAfterRefresh && !isAuthEndpoint) {
      config.__isRetryAfterRefresh = true;
      try {
        const accessToken = await refreshAccessToken();
        config.headers.Authorization = `Bearer ${accessToken}`;
        return api(config);
      } catch {
        logoutAndClearDraft();
        return Promise.reject(error);
      }
    }

    if (status === 401) {
      logoutAndClearDraft();
    }
    return Promise.reject(error);
  },
);

/**
 * Ping the backend's health endpoint to start waking it (free-tier cold start)
 * without blocking. Safe to call on app/login mount. Errors are ignored.
 */
export function warmUpBackend(): void {
  try {
    const base = api.defaults.baseURL || '';
    const origin = base.replace(/\/api\/v\d+\/?$/, '');
    fetch(`${origin}/health`, { mode: 'cors' }).catch(() => {});
  } catch {
    /* ignore */
  }
}

// Pull a human-friendly message out of an axios error.
export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (axios.isAxiosError(error)) {
    const data: any = error.response?.data;
    // Surface the specific validation detail(s) instead of a generic message.
    const details = data?.error?.details;
    if (Array.isArray(details) && details.length) {
      const msg = details
        .map((d: any) => d?.message)
        .filter(Boolean)
        .join('; ');
      if (msg) return msg;
    }
    return (
      data?.error?.message ||
      data?.message ||
      error.message ||
      fallback
    );
  }
  return fallback;
}
