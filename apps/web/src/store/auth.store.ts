import { create } from "zustand";
import type { User } from "@nexus/types";

interface AuthState {
  user: User | null;
  isInitialized: boolean; // Проверили ли мы уже сессию при старте приложения
  setUser: (user: User | null) => void;
  setInitialized: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isInitialized: false,
  setUser: (user) => set({ user }),
  setInitialized: (isInitialized) => set({ isInitialized }),
}));
