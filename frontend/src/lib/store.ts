import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from './types';

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  setAuth: (accessToken: string, user: AuthUser) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  logout: () => void;
}

/**
 * Global auth store. The access token is kept in memory only (never persisted
 * to localStorage) so it can't be stolen via XSS. On page refresh, the token
 * is null and the axios interceptor silently refreshes it using the HTTP-only
 * refresh-token cookie. Only the `user` object is persisted so the UI knows
 * who's logged in without waiting for the refresh round-trip.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setAuth: (accessToken, user) => set({ accessToken, user }),
      updateUser: (patch) =>
        set((state) => ({ user: state.user ? { ...state.user, ...patch } : state.user })),
      logout: () => set({ accessToken: null, user: null }),
    }),
    {
      name: 'vape-shop-auth',
      // Only persist the user profile — the access token stays in memory.
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
