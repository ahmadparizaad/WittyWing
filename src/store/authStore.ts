import { create } from 'zustand';
import axios from 'axios';
import { SERVER_URL as API_URL } from '../config';
import type { AuthState, SessionResponse } from '../types';

interface AuthStore extends AuthState {
  refreshToken: string | null;
  checkSession: () => Promise<void>;
  signIn: () => void;
  signOut: () => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => void;
  refreshAccessToken: () => Promise<boolean>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  serverJwt: null,
  refreshToken: null,

  checkSession: async () => {
    set({ isLoading: true });
    try {
      // Try to read locally cached tokens
      const result = await chrome.storage.local.get(['serverJwt', 'refreshToken']) as { serverJwt?: string; refreshToken?: string };
      const serverJwt = result.serverJwt || null;
      const refreshToken = result.refreshToken || null;
      set({ serverJwt, refreshToken });

      const headers: Record<string, string> = {};
      if (serverJwt) headers['Authorization'] = `Bearer ${serverJwt}`;

      const response = await axios.get<SessionResponse>(`${API_URL}/auth/session`, {
        headers,
        withCredentials: true,
      });

      if (response.data.authenticated && response.data.user) {
        set({
          user: response.data.user,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        // If session check fails but we have a refresh token, try refreshing
        if (refreshToken) {
          const success = await get().refreshAccessToken();
          if (success) return; // refreshAccessToken will call checkSession again
        }
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } catch (error) {
      console.error('Session check error:', error);
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  signIn: () => {
    // Check server OAuth configuration before opening sign-in window
    (async () => {
      try {
        const cfgResp = await axios.get(`${API_URL}/auth/config`, { withCredentials: true });
        if (cfgResp?.data?.googleOAuthConfigured) {
          // Open the OAuth flow in a new window
          window.open(
            `${API_URL}/auth/google`,
            'WittyWing - Sign in with Google',
            'width=600,height=800'
          );
        } else {
          console.warn('Server OAuth not configured:', cfgResp?.data);
        }
      } catch (err: any) {
        console.error('Error checking server OAuth config:', err?.response?.status, err?.response?.data || err?.message);
      }
    })();

    // Poll session state until signed in
    const interval = setInterval(async () => {
      await get().checkSession();
      if (get().isAuthenticated) {
        clearInterval(interval);
      }
    }, 1000);
  },

  signOut: async () => {
    try {
      await axios.post(`${API_URL}/auth/logout`, {}, { withCredentials: true });
      chrome.storage.local.remove(['serverJwt', 'refreshToken']);
      set({
        user: null,
        isAuthenticated: false,
        serverJwt: null,
        refreshToken: null,
      });
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  },

  setTokens: (accessToken: string, refreshToken: string) => {
    chrome.storage.local.set({ serverJwt: accessToken, refreshToken });
    set({ serverJwt: accessToken, refreshToken });
    // Recheck session after tokens are set
    get().checkSession();
  },

  refreshAccessToken: async () => {
    const { refreshToken } = get();
    if (!refreshToken) return false;

    try {
      const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
      const { accessToken } = response.data;
      if (accessToken) {
        chrome.storage.local.set({ serverJwt: accessToken });
        set({ serverJwt: accessToken });
        await get().checkSession();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Token refresh failed:', err);
      // Clean up if refresh fails
      chrome.storage.local.remove(['serverJwt', 'refreshToken']);
      set({ serverJwt: null, refreshToken: null, isAuthenticated: false, user: null });
      return false;
    }
  },
}));
