"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

export default function HomePage() {
  const router = useRouter();
  const { user, isInitialized, setUser } = useAuthStore();

  useEffect(() => {
    // Если проверка сессии завершилась и пользователя нет — отправляем на страницу входа
    if (isInitialized && !user) {
      router.replace("/login");
    }
  }, [isInitialized, user, router]);

  const handleLogout = async () => {
    await api.post("/auth/logout");
    setUser(null);
    router.replace("/login");
  };

  // Пока идет фоновый запрос /api/auth/me — показываем индикатор загрузки
  if (!isInitialized || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            ● Авторизован (HttpOnly Cookie)
          </span>
          <button
            onClick={handleLogout}
            className="text-xs font-medium text-slate-400 transition hover:text-red-400"
          >
            Выйти
          </button>
        </div>

        <h1 className="text-xl font-bold text-white">Привет, {user.fullName}!</h1>
        <p className="mt-1 text-sm text-slate-400">{user.email}</p>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-400">
          Сессия защищена парой <span className="text-indigo-400">Access + Refresh</span> токенов в Redis.
        </div>
      </div>
    </main>
  );
}
