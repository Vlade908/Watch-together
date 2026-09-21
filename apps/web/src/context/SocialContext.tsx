"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { UserPresence, RoomSummary, RoomInvite, SocialServerMessage, SocialClientMessage, ActiveRoom } from "@/types/social";
import { CATALOG_DATA, CatalogTitle } from "@/data/mockCatalog";

interface SocialContextType {
  currentUser: UserPresence;
  onlineUsers: UserPresence[];
  activeRooms: ActiveRoom[];
  invitations: RoomInvite[];
  unreadInvitesCount: number;
  latestInviteToast: RoomInvite | null;
  isConnected: boolean;
  sendInvite: (toUserId: string, roomId: string, movieSlug: string, movieTitle: string, bannerUrl?: string) => void;
  acceptInvite: (invite: RoomInvite) => void;
  dismissInvite: (inviteId: string) => void;
  markAllInvitesAsRead: () => void;
  dismissToast: () => void;
  updatePresence: (status: "watching" | "idle" | "in_lobby", watchingTitle?: { id: string; name: string; slug: string; bannerUrl: string }, roomId?: string) => void;
}

const SocialContext = createContext<SocialContextType | undefined>(undefined);

// Amigos simulados de fallback para enriquecer a experiência quando estiver em ambiente monousuário
const FALLBACK_MOCK_FRIENDS: UserPresence[] = [
  {
    userId: "f1-lucas",
    userName: "Lucas Alencar",
    avatarColor: "bg-blue-600",
    initials: "LA",
    status: "watching",
    watchingTitle: {
      id: CATALOG_DATA[0].id,
      name: CATALOG_DATA[0].name,
      slug: CATALOG_DATA[0].slug,
      bannerUrl: CATALOG_DATA[0].bannerUrl,
    },
    roomId: "sala-cinephiles-4k",
    device: "TV 4K",
    lastSeen: Date.now(),
  },
  {
    userId: "f2-mariana",
    userName: "Mariana Costa",
    avatarColor: "bg-purple-600",
    initials: "MC",
    status: "watching",
    watchingTitle: {
      id: CATALOG_DATA[2].id,
      name: CATALOG_DATA[2].name,
      slug: CATALOG_DATA[2].slug,
      bannerUrl: CATALOG_DATA[2].bannerUrl,
    },
    roomId: "sala-cyber-odyssey",
    device: "Web Desktop",
    lastSeen: Date.now(),
  },
  {
    userId: "f3-thiago",
    userName: "Thiago Silva",
    avatarColor: "bg-emerald-600",
    initials: "TS",
    status: "idle",
    device: "Mobile",
    lastSeen: Date.now(),
  },
];

// Salas públicas simuladas de fallback
const FALLBACK_MOCK_ROOMS: ActiveRoom[] = [
  {
    code: "cinephiles-4k",
    title: CATALOG_DATA[0],
    hostName: "Lucas Alencar",
    participantsCount: 4,
    maxParticipants: 10,
    syncQuality: "Ultra HD (Sub-50ms sync)",
    isPrivate: false,
  },
  {
    code: "sci-fi-weekend",
    title: CATALOG_DATA[1],
    hostName: "Beatriz Ramos",
    participantsCount: 2,
    maxParticipants: 8,
    syncQuality: "Full HD (HLS Adaptive)",
    isPrivate: false,
  },
];

export function SocialProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // 1. Identidade estável do usuário
  const [currentUser, setCurrentUser] = useState<UserPresence>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("wt_current_user");
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {}
      }
      const newUser: UserPresence = {
        userId: `user-${Math.random().toString(36).substring(2, 7)}`,
        userName: "Vlad Principal",
        avatarColor: "bg-[#e50914]",
        initials: "VP",
        status: "idle",
        device: "Web Desktop",
        lastSeen: Date.now(),
      };
      localStorage.setItem("wt_current_user", JSON.stringify(newUser));
      return newUser;
    }
    return {
      userId: "user-default",
      userName: "Vlad Principal",
      avatarColor: "bg-[#e50914]",
      initials: "VP",
      status: "idle",
      device: "Web Desktop",
      lastSeen: Date.now(),
    };
  });

  const [realOnlineUsers, setRealOnlineUsers] = useState<UserPresence[]>([]);
  const [realActiveRooms, setRealActiveRooms] = useState<RoomSummary[]>([]);
  const [invitations, setInvitations] = useState<RoomInvite[]>([
    {
      inviteId: "mock-invite-1",
      fromUser: {
        userId: "f1-lucas",
        userName: "Lucas Alencar",
        avatarColor: "bg-blue-600",
        initials: "LA",
      },
      toUserId: currentUser.userId,
      roomId: "sala-cinephiles-4k",
      movieSlug: CATALOG_DATA[0].slug,
      movieTitle: CATALOG_DATA[0].name,
      bannerUrl: CATALOG_DATA[0].bannerUrl,
      timestamp: Date.now() - 5 * 60 * 1000,
      read: false,
    },
  ]);
  const [latestInviteToast, setLatestInviteToast] = useState<RoomInvite | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Envio tipado para o WebSocket Social
  const send = useCallback((msg: SocialClientMessage) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Resolução dinâmica de URL para conexões em dev/local/LAN na porta 54321
  const resolveSocialWsUrl = useCallback(() => {
    let base = process.env.NEXT_PUBLIC_WS_URL;
    if (!base && typeof window !== "undefined") {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.hostname || "localhost";
      base = `${protocol}//${host}:54321`;
    }
    if (!base) {
      base = "ws://localhost:54321";
    }
    return `${base}/ws/social?userId=${encodeURIComponent(currentUser.userId)}&userName=${encodeURIComponent(currentUser.userName)}`;
  }, [currentUser.userId, currentUser.userName]);

  // Ciclo de Vida da Conexão Social
  useEffect(() => {
    let isUnmounted = false;

    function connect() {
      if (isUnmounted) return;
      const wsUrl = resolveSocialWsUrl();

      try {
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          if (isUnmounted) return;
          setIsConnected(true);
          console.log("[Social Hub] ✓ Conectado à camada de presença em tempo real.");

          // Identifica o usuário
          ws.send(
            JSON.stringify({
              type: "social_identify",
              user: currentUser,
            })
          );
        };

        ws.onmessage = (event) => {
          if (isUnmounted) return;
          try {
            const data = JSON.parse(event.data) as SocialServerMessage;

            switch (data.type) {
              case "social_snapshot": {
                // Filtra o próprio usuário da lista de amigos online
                setRealOnlineUsers(data.onlineUsers.filter((u) => u.userId !== currentUser.userId));
                setRealActiveRooms(data.activeRooms);
                break;
              }

              case "user_presence_changed": {
                if (data.user.userId === currentUser.userId) return;
                setRealOnlineUsers((prev) => {
                  const exists = prev.some((u) => u.userId === data.user.userId);
                  if (exists) {
                    return prev.map((u) => (u.userId === data.user.userId ? data.user : u));
                  }
                  return [data.user, ...prev];
                });
                break;
              }

              case "user_went_offline": {
                setRealOnlineUsers((prev) => prev.filter((u) => u.userId !== data.userId));
                break;
              }

              case "active_rooms_update": {
                setRealActiveRooms(data.activeRooms);
                break;
              }

              case "room_invitation": {
                const inviteWithRead = { ...data.invite, read: false };
                setInvitations((prev) => [inviteWithRead, ...prev]);
                setLatestInviteToast(inviteWithRead);
                break;
              }
            }
          } catch (err) {
            console.error("[Social WS Message Parse Error]:", err);
          }
        };

        ws.onclose = () => {
          if (isUnmounted) return;
          setIsConnected(false);
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          if (isUnmounted) return;
          try {
            ws.close();
          } catch {}
        };
      } catch (err) {
        if (!isUnmounted) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      }
    }

    connect();

    return () => {
      isUnmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        const sock = socketRef.current;
        sock.onopen = null;
        sock.onmessage = null;
        sock.onerror = null;
        sock.onclose = null;
        if (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING) {
          try {
            sock.close();
          } catch {}
        }
        socketRef.current = null;
      }
    };
  }, [currentUser, resolveSocialWsUrl]);

  // Atualização explícita de presença (ao assistir filme ou mudar de página)
  const updatePresence = useCallback(
    (
      status: "watching" | "idle" | "in_lobby",
      watchingTitle?: { id: string; name: string; slug: string; bannerUrl: string },
      roomId?: string
    ) => {
      setCurrentUser((prev) => {
        const updated = {
          ...prev,
          status,
          watchingTitle,
          roomId,
          lastSeen: Date.now(),
        };
        if (typeof window !== "undefined") {
          localStorage.setItem("wt_current_user", JSON.stringify(updated));
        }
        return updated;
      });

      send({
        type: "social_update_presence",
        status,
        watchingTitle,
        roomId,
      });
    },
    [send]
  );

  // Disparo de Convite para Sala
  const sendInvite = useCallback(
    (toUserId: string, roomId: string, movieSlug: string, movieTitle: string, bannerUrl?: string) => {
      send({
        type: "send_invite",
        toUserId,
        roomId,
        movieSlug,
        movieTitle,
        bannerUrl,
      });
    },
    [send]
  );

  // Aceitar convite e navegar diretamente para a sala
  const acceptInvite = useCallback(
    (invite: RoomInvite) => {
      setInvitations((prev) =>
        prev.map((inv) => (inv.inviteId === invite.inviteId ? { ...inv, read: true } : inv))
      );
      setLatestInviteToast(null);
      router.push(`/watch/${invite.movieSlug}?mode=room&room=${encodeURIComponent(invite.roomId)}`);
    },
    [router]
  );

  // Dispensar convite
  const dismissInvite = useCallback((inviteId: string) => {
    setInvitations((prev) => prev.filter((inv) => inv.inviteId !== inviteId));
  }, []);

  const markAllInvitesAsRead = useCallback(() => {
    setInvitations((prev) => prev.map((inv) => ({ ...inv, read: true })));
  }, []);

  const dismissToast = useCallback(() => {
    setLatestInviteToast(null);
  }, []);

  // Mescla usuários reais com os amigos de mock quando houver poucos membros
  const mergedOnlineUsers = React.useMemo(() => {
    const realMap = new Map(realOnlineUsers.map((u) => [u.userId, u]));
    const list = [...realOnlineUsers];

    for (const mock of FALLBACK_MOCK_FRIENDS) {
      if (!realMap.has(mock.userId)) {
        list.push(mock);
      }
    }
    return list;
  }, [realOnlineUsers]);

  // Mescla salas ativas do Redis com salas públicas de demonstração
  const mergedActiveRooms = React.useMemo(() => {
    const realMapped: ActiveRoom[] = realActiveRooms.map((summary) => {
      const catalogFound = CATALOG_DATA.find((t) => t.slug === summary.slug || t.id === summary.mediaId);
      const title: CatalogTitle = catalogFound || {
        id: summary.mediaId,
        slug: summary.slug,
        name: summary.titleName,
        type: "MOVIE",
        genres: ["Ficção Científica"],
        bannerUrl: summary.bannerUrl,
        matchPercentage: 98,
        ageRating: "12",
        releaseYear: 2024,
        synopsis: "Sessão síncrona iniciada pela comunidade no Watch Together.",
        cast: ["Comunidade Watch Together"],
        director: "Watch Together Host",
        moods: ["Empolgante", "Social"],
      };

      return {
        code: summary.roomId,
        title,
        hostName: summary.hostName,
        participantsCount: summary.participantsCount,
        maxParticipants: summary.maxParticipants,
        syncQuality: summary.syncQuality || "Ultra HD (Sub-50ms sync)",
        isPrivate: summary.isPrivate,
      };
    });

    const existingCodes = new Set(realMapped.map((r) => r.code));
    const list = [...realMapped];

    for (const mock of FALLBACK_MOCK_ROOMS) {
      if (!existingCodes.has(mock.code)) {
        list.push(mock);
      }
    }

    return list;
  }, [realActiveRooms]);

  const unreadInvitesCount = invitations.filter((inv) => !inv.read).length;

  return (
    <SocialContext.Provider
      value={{
        currentUser,
        onlineUsers: mergedOnlineUsers,
        activeRooms: mergedActiveRooms,
        invitations,
        unreadInvitesCount,
        latestInviteToast,
        isConnected,
        sendInvite,
        acceptInvite,
        dismissInvite,
        markAllInvitesAsRead,
        dismissToast,
        updatePresence,
      }}
    >
      {children}
    </SocialContext.Provider>
  );
}

export function useSocial() {
  const context = useContext(SocialContext);
  if (!context) {
    throw new Error("useSocial deve ser usado dentro de um SocialProvider");
  }
  return context;
}
