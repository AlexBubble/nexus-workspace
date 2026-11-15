"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, Send, Wifi, WifiOff } from "lucide-react";
import type { Socket } from "socket.io-client";
import { api } from "@/lib/api";

export interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  channelId: string;
  author: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
  };
}

interface ChatAreaProps {
  channel: { id: string; name: string };
  socket: Socket | null;
  isConnected: boolean;
}

export function ChatArea({ channel, socket, isConnected }: ChatAreaProps) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  // Состояние тех, кто прямо сейчас печатает в этом канале: { [userId]: fullName }
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  // Хранилище активных таймеров сброса для каждого пользователя (защита от утечек памяти!)
  const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Время последней отправки сигнала "я печатаю", чтобы не спамить сервер на каждую букву
  const lastTypingSentRef = useRef<number>(0);

  // 1. Загружаем историю сообщений из PostgreSQL через TanStack Query
  const { data: messages = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: ["messages", channel.id],
    queryFn: async () => {
      const res = await api.get(`/messages/${channel.id}`);
      return res.data.messages;
    },
  });

  // 2. Подключаемся к WebSocket-комнате канала и слушаем входящие сообщения в реальном времени
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Входим в комнату канала на сервере
    socket.emit("join_channel", channel.id);

    // Обработчик прилета нового сообщения через Redis Pub/Sub
    const handleNewMessage = (newMsg: ChatMessage) => {
      if (newMsg.channelId !== channel.id) return;

      // Мгновенно дописываем сообщение в кэш React Query без перезагрузки с сервера!
      queryClient.setQueryData<ChatMessage[]>(["messages", channel.id], (old = []) => {
        // Защита от дубликатов, если сообщение уже есть в списке
        if (old.some((m) => m.id === newMsg.id)) return old;
        return [...old, newMsg];
      });
    };

    socket.on("new_message", handleNewMessage);

    // Обработчик индикатора "Печатает..." от других участников канала
    const handleUserTyping = (data: { channelId: string; userId: string; fullName: string }) => {
      if (data.channelId !== channel.id) return;

      // Добавляем имя человека в список печатающих
      setTypingUsers((prev) => ({ ...prev, [data.userId]: data.fullName }));

      // Если для этого человека уже тикал старый таймер — сбрасываем его!
      if (typingTimeoutsRef.current[data.userId]) {
        clearTimeout(typingTimeoutsRef.current[data.userId]);
      }

      // Ставим новый таймер: если через 3 секунды новых букв не будет — убираем надпись
      typingTimeoutsRef.current[data.userId] = setTimeout(() => {
        setTypingUsers((prev) => {
          const updated = { ...prev };
          delete updated[data.userId];
          return updated;
        });
        delete typingTimeoutsRef.current[data.userId];
      }, 3000);
    };

    socket.on("user_typing", handleUserTyping);

    return () => {
      socket.off("new_message", handleNewMessage);
      socket.off("user_typing", handleUserTyping);
      // Очищаем все активные таймеры при смене канала или размонтировании (ноль утечек памяти!)
      Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
      typingTimeoutsRef.current = {};
      setTypingUsers({});
    };
  }, [socket, isConnected, channel.id, queryClient]);

  // 3. Автоматическая прокрутка ленты вниз при появлении новых сообщений
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 4. Отправка сообщения по WebSocket
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !socket || !isConnected) return;

    socket.emit("send_message", {
      channelId: channel.id,
      content: trimmed,
    });

    setText("");
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);

    // Отправляем сигнал "typing" не чаще чем раз в 1.5 секунды (Throttle)
    const now = Date.now();
    if (socket && isConnected && now - lastTypingSentRef.current > 1500) {
      socket.emit("typing", channel.id);
      lastTypingSentRef.current = now;
    }
  };

  return (
    <div className="flex flex-1 flex-col bg-slate-950">
      {/* Верхняя шапка канала */}
      <header className="flex h-14 items-center justify-between border-b border-slate-800/80 px-6">
        <div className="flex items-center gap-2">
          <Hash className="h-5 w-5 text-slate-400" />
          <h2 className="font-semibold text-white">{channel.name}</h2>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {isConnected ? (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-400">
              <Wifi className="h-3.5 w-3.5" /> Live
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-400">
              <WifiOff className="h-3.5 w-3.5" /> Connecting...
            </span>
          )}
        </div>
      </header>

      {/* Лента сообщений */}
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            Загрузка истории переписки...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-indigo-400">
              <Hash className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-white">
              Добро пожаловать в #{channel.name}!
            </h3>
            <p className="mt-1 max-w-sm text-sm text-slate-400">
              Это самое начало канала. Напишите первое сообщение ниже.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="group flex items-start gap-3.5">
              {/* Аватарка с первой буквой имени */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600/20 text-sm font-bold text-indigo-400">
                {msg.author.fullName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-slate-200">
                    {msg.author.fullName}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">
                  {msg.content}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Живой индикатор "Печатает..." */}
      <div className="h-6 px-6 text-xs text-indigo-400">
        {Object.values(typingUsers).length > 0 && (
          <span className="animate-pulse">
            {Object.values(typingUsers).join(", ")} печатает...
          </span>
        )}
      </div>

      {/* Форма отправки сообщения */}
      <form onSubmit={handleSend} className="border-t border-slate-800/80 p-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 focus-within:border-indigo-500">
          <input
            type="text"
            value={text}
            onChange={handleInputChange}
            placeholder={`Написать в #${channel.name}...`}
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!text.trim() || !isConnected}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
