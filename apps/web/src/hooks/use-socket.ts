"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

export function useSocket(enabled: boolean): { socket: Socket | null; isConnected: boolean } {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    // Инициализируем клиент Socket.io с передачей HttpOnly кук при рукопожатии
    const socketInstance = io(SOCKET_URL, {
      withCredentials: true,
      transports: ["websocket"], // Сразу используем быстрый протокол WebSocket без старого HTTP-поллинга
    });

    socketInstance.on("connect", () => {
      setIsConnected(true);
    });

    socketInstance.on("disconnect", () => {
      setIsConnected(false);
    });

    setSocket(socketInstance);

    // При закрытии вкладки или выходе из аккаунта корректно рвем соединение
    return () => {
      socketInstance.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [enabled]);

  return { socket, isConnected };
}
