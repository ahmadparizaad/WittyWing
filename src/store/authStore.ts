import { create } from 'zustand';
import axios from 'axios';
import { SERVER_URL as API_URL } from '../config';
import { decodeJWT, isTokenExpiringSoon } from '../utils/jwt';
import type { AuthState, SessionResponse } from '../types';

interface AuthStore extends AuthState {
  refreshToken: string | null;
  checkSession: () => Promise<void>;
  signIn: () => void;
  signOut: () => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => void;
  refreshAccessToken: () => Promise<boolean>;
}

let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

// Attach interceptor once at module load
axios.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Don't intercept the refresh or logout calls themselves
    if (
      originalRequest.url?.includes('/auth/refresh') ||
      originalRequest.url?.includes('/auth/logout')
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Queue the request until refresh completes
      return new Promise((resolve) => {
        refreshSubscribers.push((token: string) => {
          originalRequest.headers['Authorization'] = `Bearer ${token}`;
          resolve(axios(originalRequest));
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const store = useAuthStore.getState();
      const success = await store.refreshAccessToken();
      if (success) {
        const { serverJwt } = useAuthStore.getState();
        isRefreshing = false;
        if (serverJwt) {
          onRefreshed(serverJwt);
          originalRequest.headers['Authorization'] = `Bearer ${serverJwt}`;
        }
        return axios(originalRequest);
      } else {
        isRefreshing = false;
        await store.signOut();
        return Promise.reject(error);
      }
    } catch (err) {
      isRefreshing = false;
      await useAuthStore.getState().signOut();
      return Promise.reject(err);
    }
  }
);

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  serverJwt: null,
  refreshToken: null,

  checkSession: async () => {
    set({ isLoading: true });
    try {
      const result = (await chrome.storage.local.get(['serverJwt', 'refreshToken'])) as {
        serverJwt?: string;
        refreshToken?: string;
      };
      const serverJwt = result.serverJwt || null;
      const refreshToken = result.refreshToken || null;
      set({ serverJwt, refreshToken });

      // Proactively refresh if access token is expiring soon
      if (serverJwt && isTokenExpiringSoon(serverJwt)) {
        if (refreshToken) {
          const success = await get().refreshAccessToken();
          if (success) return;
        }
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      const headers: Record<string, string> = {};
      if (serverJwt) headers['Authorization'] = `Bearer ${serverJwt}`;

      const response = await axios.get<SessionResponse>(`${API_URL}/auth/session`, {
        headers,
        withCredentials: true,
      });

      if (response.data.authenticated && response.data.user) {
        set({ user: response.data.user, isAuthenticated: true, isLoading: false });
      } else {
        if (refreshToken) {
          const success = await get().refreshAccessToken();
          if (success) return;
        }
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch (error) {
      console.error('Session check error:', error);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  signIn: () => {
    (async () => {
      try {
        const cfgResp = await axios.get(`${API_URL}/auth/config`, { withCredentials: true });
        if (cfgResp?.data?.googleOAuthConfigured) {
          window.open(
            `${API_URL}/auth/google`,
            'WittyWing - Sign in with Google',
            'width=600,height=800'
          );
        } else {
          console.warn('Server OAuth not configured:', cfgResp?.data);
        }
      } catch (err: any) {
        console.error(
          'Error checking server OAuth config:',
          err?.response?.status,
          err?.response?.data || err?.message
        );
      }
    })();

    const interval = setInterval(async () => {
      await get().checkSession();
      if (get().isAuthenticated) {
        clearInterval(interval);
      }
    }, 1000);
  },

  signOut: async () => {
    if (proactiveRefreshTimer) {
      clearTimeout(proactiveRefreshTimer);
      proactiveRefreshTimer = null;
    }
    try {
      const { refreshToken } = get();
      await axios.post(`${API_URL}/auth/logout`, { refreshToken }, { withCredentials: true });
    } catch (err) {
      console.error('Sign out request failed:', err);
    }
    chrome.storage.local.remove(['serverJwt', 'refreshToken']);
    set({ user: null, isAuthenticated: false, serverJwt: null, refreshToken: null });
  },

  setTokens: (accessToken: string, refreshToken: string) => {
    chrome.storage.local.set({ serverJwt: accessToken, refreshToken });
    set({ serverJwt: accessToken, refreshToken });

    // Schedule proactive refresh 2 minutes before the access token expires
    if (proactiveRefreshTimer) clearTimeout(proactiveRefreshTimer);
    const payload = decodeJWT(accessToken);
    if (payload?.exp) {
      const msUntilRefresh = (payload.exp - 120) * 1000 - Date.now();
      if (msUntilRefresh > 0) {
        proactiveRefreshTimer = setTimeout(() => {
          get().refreshAccessToken();
        }, msUntilRefresh);
      } else {
        // Token already near expiry — refresh immediately
        get().refreshAccessToken();
      }
    }

    get().checkSession();
  },

  refreshAccessToken: async () => {
    const result = (await chrome.storage.local.get(['refreshToken'])) as { refreshToken?: string };
    const refreshToken = result.refreshToken || get().refreshToken;
    if (!refreshToken) return false;

    try {
      const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
      const { accessToken, refreshToken: newRefreshToken } = response.data;
      if (!accessToken) return false;

      const tokenToStore = newRefreshToken || refreshToken;
      chrome.storage.local.set({ serverJwt: accessToken, refreshToken: tokenToStore });
      set({ serverJwt: accessToken, refreshToken: tokenToStore });

      // Reschedule proactive timer for the new access token
      if (proactiveRefreshTimer) clearTimeout(proactiveRefreshTimer);
      const payload = decodeJWT(accessToken);
      if (payload?.exp) {
        const msUntilRefresh = (payload.exp - 120) * 1000 - Date.now();
        if (msUntilRefresh > 0) {
          proactiveRefreshTimer = setTimeout(() => {
            get().refreshAccessToken();
          }, msUntilRefresh);
        }
      }

      await get().checkSession();
      return true;
    } catch (err) {
      console.error('Token refresh failed:', err);
      chrome.storage.local.remove(['serverJwt', 'refreshToken']);
      set({ serverJwt: null, refreshToken: null, isAuthenticated: false, user: null });
      return false;
    }
  },
}));
