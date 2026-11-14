import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // КРИТИЧЕСКИ ВАЖНО: разрешает браузеру отправлять и принимать HttpOnly куки!
  headers: {
    "Content-Type": "application/json",
  },
});

// Флаг и очередь для защиты от одновременных запросов на /refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: unknown) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

// Перехватчик ответов от сервера
api.interceptors.response.use(
  (response) => response, // Если статус 2xx — просто пропускаем ответ дальше
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Если получили 401 и это НЕ повторный запрос и НЕ сам запрос на /auth/refresh или /auth/login
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/refresh") &&
      !originalRequest.url?.includes("/auth/login")
    ) {
      if (isRefreshing) {
        // Если обновление токена уже идет — ставим текущий запрос в очередь ожидания
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Пытаемся обновить пару токенов через HttpOnly куку nexus_refresh
        await api.post("/auth/refresh");
        processQueue(null);
        // Повторяем исходный запрос пользователя с новыми куками!
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
