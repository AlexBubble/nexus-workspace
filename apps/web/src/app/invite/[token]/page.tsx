"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { user, isInitialized } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isInitialized || !user) return;

    api
      .post(`/workspaces/join/${params.token}`)
      .then(() => {
        router.replace("/");
      })
      .catch((err: unknown) => {
        const axiosErr = err as { response?: { data?: { message?: string } } };
        setError(axiosErr.response?.data?.message || "Не удалось принять приглашение");
      });
  }, [isInitialized, user, params.token, router]);

  if (!isInitialized) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center shadow-2xl">
          <h1 className="text-xl font-bold text-white">Вас пригласили в команду Nexus</h1>
          <p className="mt-2 text-sm text-slate-400">
            Войдите в аккаунт или зарегистрируйтесь, чтобы присоединиться к рабочему пространству.
          </p>
          <div className="mt-6 flex gap-3">
            <Link
              href="/login"
              className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Войти
            </Link>
            <Link
              href="/register"
              className="flex-1 rounded-lg border border-slate-700 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Регистрация
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center">
        {error ? (
          <>
            <p className="text-sm font-medium text-red-400">{error}</p>
            <Link href="/" className="mt-4 inline-block text-xs text-indigo-400 hover:underline">
              Вернуться на главную
            </Link>
          </>
        ) : (
          <p className="text-sm text-slate-300">Присоединяемся к рабочему пространству...</p>
        )}
      </div>
    </main>
  );
}