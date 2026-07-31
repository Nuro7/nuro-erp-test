"use client";

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { AuthUser, LoginResponse } from "@/lib/auth";

/**
 * No-op kept for source compatibility with the old "Keep me signed in"
 * checkbox. Sessions now always persist to localStorage and only end
 * when the user explicitly clicks Logout, so the per-login preference
 * no longer has any effect.
 */
export function setRememberPreference(_remember: boolean) {
  /* intentional no-op */
}

/**
 * Auth always persists to localStorage — survives tab close, window
 * close, and full browser restart. The only way to end a session is
 * the explicit Logout flow (or admin-side account deactivation).
 *
 * The legacy sessionStorage branch is still read on the way in so
 * users who logged in before this change don't have to re-authenticate;
 * the next setItem migrates them onto localStorage.
 */
const persistentStorage: StateStorage = {
  getItem: (name) => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(name) ?? window.sessionStorage.getItem(name);
  },
  setItem: (name, value) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(name, value);
    window.sessionStorage.removeItem(name);
  },
  removeItem: (name) => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(name);
    window.sessionStorage.removeItem(name);
  },
};

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  hydrated: boolean;
  setSession: (session: LoginResponse) => void;
  clearSession: () => void;
  markHydrated: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      hydrated: false,
      setSession: (session) =>
        set({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          user: session.user,
        }),
      clearSession: () => {
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
        });
      },
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "nuro7-auth",
      storage: createJSONStorage(() => persistentStorage),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);
