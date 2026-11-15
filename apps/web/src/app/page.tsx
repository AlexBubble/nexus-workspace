"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Hash, LogOut, Plus, Sparkles, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useSocket } from "@/hooks/use-socket";
import { ChatArea } from "@/components/chat-area";

interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  myRole: string;
}

interface WorkspaceDetails {
  id: string;
  name: string;
  slug: string;
  myRole: string;
  channels: Array<{ id: string; name: string; isPrivate: boolean }>;
}

export default function WorkspaceDashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isInitialized, setUser } = useAuthStore();

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [newWsName, setNewWsName] = useState("");
  const [newWsSlug, setNewWsSlug] = useState("");
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");

  const [copiedInvite, setCopiedInvite] = useState(false);

  const handleCopyInvite = async () => {
    if (!selectedSlug) return;
    const res = await api.post(`/workspaces/${selectedSlug}/invites`);
    const inviteUrl = `${window.location.origin}/invite/${res.data.code}`;
    await navigator.clipboard.writeText(inviteUrl);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2500);
  };

  // Подключаем WebSocket, как только убедились, что пользователь авторизован
  const { socket, isConnected } = useSocket(Boolean(user));

  useEffect(() => {
    if (isInitialized && !user) {
      router.replace("/login");
    }
  }, [isInitialized, user, router]);

  // Загружаем список всех рабочих пространств пользователя
  const { data: workspaces = [], isLoading: isWsLoading } = useQuery<WorkspaceSummary[]>({
    queryKey: ["workspaces"],
    enabled: Boolean(user),
    queryFn: async () => {
      const res = await api.get("/workspaces");
      return res.data.workspaces;
    },
  });

  // Автоматически выбираем первую команду при загрузке
  useEffect(() => {
    if (!selectedSlug && workspaces.length > 0 && workspaces) {
      setSelectedSlug(workspaces[0]!.slug);
    }
  }, [workspaces, selectedSlug]);

  // Загружаем каналы выбранной команды
  const { data: activeWorkspace } = useQuery<WorkspaceDetails>({
    queryKey: ["workspace", selectedSlug],
    enabled: Boolean(selectedSlug),
    queryFn: async () => {
      const res = await api.get(`/workspaces/${selectedSlug}`);
      return res.data.workspace;
    },
  });

  // Автоматически выбираем первый канал (#general) при смене команды
  useEffect(() => {
    if (activeWorkspace?.channels && activeWorkspace.channels.length > 0) {
      const exists = activeWorkspace.channels.some((c) => c.id === selectedChannelId);
      if (!exists && activeWorkspace.channels) {
        setSelectedChannelId(activeWorkspace.channels[0]!.id);
      }
    }
  }, [activeWorkspace, selectedChannelId]);

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim() || !newWsSlug.trim()) return;
    const res = await api.post("/workspaces", { name: newWsName, slug: newWsSlug });
    setNewWsName("");
    setNewWsSlug("");
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    setSelectedSlug(res.data.workspace.slug);
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim() || !selectedSlug) return;
    const res = await api.post(`/workspaces/${selectedSlug}/channels`, {
      name: newChannelName.toLowerCase(),
    });
    setNewChannelName("");
    setIsCreatingChannel(false);
    await queryClient.invalidateQueries({ queryKey: ["workspace", selectedSlug] });
    setSelectedChannelId(res.data.channel.id);
  };

  const handleLogout = async () => {
    await api.post("/auth/logout");
    setUser(null);
    router.replace("/login");
  };

  if (!isInitialized || !user || isWsLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </main>
    );
  }

  if (workspaces.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold text-white">Создайте рабочее пространство</h1>
          <p className="mt-1 text-sm text-slate-400">
            Это единый дом для каналов и переписки вашей команды.
          </p>

          <form onSubmit={handleCreateWorkspace} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-slate-400">
                Название компании или команды
              </label>
              <input
                type="text"
                required
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                placeholder="Acme Corp"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-slate-400">
                Уникальный адрес (slug)
              </label>
              <input
                type="text"
                required
                value={newWsSlug}
                onChange={(e) => setNewWsSlug(e.target.value.toLowerCase())}
                placeholder="acme-corp"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Создать пространство
            </button>
          </form>
        </div>
      </main>
    );
  }

  const activeChannel = activeWorkspace?.channels.find((c) => c.id === selectedChannelId);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <aside className="flex w-64 flex-col border-r border-slate-800/80 bg-slate-900/50">
        <div className="flex h-14 items-center justify-between border-b border-slate-800/80 px-4">
          <select
            value={selectedSlug || ""}
            onChange={(e) => setSelectedSlug(e.target.value)}
            className="w-full bg-transparent text-sm font-bold text-white focus:outline-none"
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.slug} className="bg-slate-900">
                {ws.name}
              </option>
            ))}
          </select>
          {(activeWorkspace?.myRole === "OWNER" || activeWorkspace?.myRole === "ADMIN") && (
            <button
              onClick={handleCopyInvite}
              title="Скопировать ссылку-приглашение"
              className="ml-2 shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-indigo-400"
            >
              {copiedInvite ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="mb-2 flex items-center justify-between px-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Каналы
            </span>
            {(activeWorkspace?.myRole === "OWNER" || activeWorkspace?.myRole === "ADMIN") && (
              <button
                onClick={() => setIsCreatingChannel((v) => !v)}
                title="Создать канал"
                className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>

          {isCreatingChannel && (
            <form onSubmit={handleCreateChannel} className="mb-2 px-1">
              <input
                type="text"
                autoFocus
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="new-channel"
                className="w-full rounded border border-indigo-500 bg-slate-950 px-2 py-1 text-xs text-white focus:outline-none"
              />
            </form>
          )}

          <nav className="space-y-0.5">
            {activeWorkspace?.channels.map((channel) => {
              const isActive = channel.id === selectedChannelId;
              return (
                <button
                  key={channel.id}
                  onClick={() => setSelectedChannelId(channel.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition ${
                    isActive
                      ? "bg-indigo-600/20 font-medium text-indigo-300"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                  }`}
                >
                  <Hash className="h-4 w-4 shrink-0 opacity-70" />
                  <span className="truncate">{channel.name}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800/80 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{user.fullName}</p>
            <p className="truncate text-[11px] text-slate-500">{activeWorkspace?.myRole}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Выйти из аккаунта"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {activeChannel ? (
        <ChatArea channel={activeChannel} socket={socket} isConnected={isConnected} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
          Выберите канал слева
        </div>
      )}
    </div>
  );
}
