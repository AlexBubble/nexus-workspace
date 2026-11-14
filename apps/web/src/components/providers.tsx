"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

export function Providers({ children }: { children: React.ReactNode }) {
  // Создаем QueryClient один раз на весь жизненный цикл вкладки браузера
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 30, // Данные считаются свежими 30 секунд без лишних перезапросов
            retry: 1,
          },
        },
      })
  );

  const { setUser, setInitialized } = useAuthStore();

  // При первом открытии сайта тихо проверяем, залогинен ли пользователь
  useEffect(() => {
    api
      .get("/auth/me")
      .then((res) => {
        setUser(res.data.user);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setInitialized(true);
      });
  }, [setUser, setInitialized]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
