import axios from 'axios';

const apiBase = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api/v1`
  : '/api/v1';

const api = axios.create({
  baseURL: apiBase,
  withCredentials: true, // Send and receive HttpOnly SameSite authentication cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)dayfold_csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

api.interceptors.request.use((config) => {
  // Attach Bearer token if present in localStorage (critical for cross-origin SPA requests)
  if (typeof localStorage !== 'undefined') {
    const token = localStorage.getItem('dayfold_access_token');
    if (token && config.headers) {
      const hasAuth =
        typeof config.headers.get === 'function'
          ? !!config.headers.get('Authorization')
          : !!config.headers['Authorization'];
      if (!hasAuth) {
        if (typeof config.headers.set === 'function') {
          config.headers.set('Authorization', `Bearer ${token}`);
        } else {
          config.headers['Authorization'] = `Bearer ${token}`;
        }
      }
    }
  }

  // Attach CSRF protection header on state-changing requests
  const method = config.method?.toUpperCase();
  if (method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken && config.headers) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return config;
});

function clearStoredAuthAndRedirect(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('dayfold_user');
    localStorage.removeItem('dayfold_access_token');
    localStorage.removeItem('dayfold_refresh_token');
  }
  if (
    typeof window !== 'undefined' &&
    window.location.pathname !== '/login' &&
    window.location.pathname !== '/signup' &&
    window.location.pathname !== '/'
  ) {
    window.location.href = '/login';
  }
}

interface QueuedRequest {
  resolve: (token: string) => void;
  reject: (reason?: any) => void;
}

let isRefreshing = false;
let failedQueue: QueuedRequest[] = [];

const processQueue = (error: any = null, token: string | null = null): void => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    } else {
      prom.reject(new Error('Session refresh failed: missing access token.'));
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const requestUrl = originalRequest?.url || '';

    // Only attempt refresh for 401s on non-auth endpoints
    const isAuthEndpoint =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/register') ||
      requestUrl.includes('/auth/refresh') ||
      requestUrl.includes('/auth/logout');

    if (error.response?.status === 401 && !originalRequest?._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest) {
              originalRequest._retry = true;
              if (originalRequest.headers) {
                if (typeof originalRequest.headers.set === 'function') {
                  originalRequest.headers.set('Authorization', `Bearer ${token}`);
                } else {
                  originalRequest.headers['Authorization'] = `Bearer ${token}`;
                }
              }
            }
            return api(originalRequest);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('dayfold_refresh_token')
          : null;

      if (!refreshToken || !refreshToken.trim()) {
        isRefreshing = false;
        const noTokenError = new Error('No refresh token available');
        processQueue(noTokenError, null);
        clearStoredAuthAndRedirect();
        return Promise.reject(error);
      }

      try {
        const refreshRes = await api.post('/auth/refresh', { refresh_token: refreshToken.trim() });
        const { access_token, refresh_token: newRefreshToken, user } = refreshRes.data || {};

        if (!access_token || typeof access_token !== 'string' || !access_token.trim()) {
          throw new Error('Refresh response missing valid access token');
        }

        const validAccessToken = access_token.trim();

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('dayfold_access_token', validAccessToken);
          if (newRefreshToken && typeof newRefreshToken === 'string' && newRefreshToken.trim()) {
            localStorage.setItem('dayfold_refresh_token', newRefreshToken.trim());
          }
          if (user) {
            localStorage.setItem('dayfold_user', JSON.stringify(user));
          }
        }

        // Set isRefreshing to false before resolving the queue
        isRefreshing = false;
        processQueue(null, validAccessToken);

        // Update authorization header on the retried initial request
        if (originalRequest?.headers) {
          if (typeof originalRequest.headers.set === 'function') {
            originalRequest.headers.set('Authorization', `Bearer ${validAccessToken}`);
          } else {
            originalRequest.headers['Authorization'] = `Bearer ${validAccessToken}`;
          }
        }

        return api(originalRequest);
      } catch (refreshErr) {
        // Set isRefreshing to false before rejecting the queue
        isRefreshing = false;
        processQueue(refreshErr, null);
        clearStoredAuthAndRedirect();
        return Promise.reject(refreshErr);
      }
    }

    if (error.response?.status === 401 && isAuthEndpoint) {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('dayfold_user');
        localStorage.removeItem('dayfold_access_token');
        localStorage.removeItem('dayfold_refresh_token');
      }
    }

    return Promise.reject(error);
  }
);

export default api;
