"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  UserPresence,
  RoomSummary,
  RoomInvite,
  SocialServerMessage,
  SocialClientMessage,
  ActiveRoom,
  FriendshipItem,
  FriendUser,
  FriendNotification,
  PartySession,
  PartyInvite,
} from "@/types/social";
import { CATALOG_DATA, CatalogTitle } from "@/data/mockCatalog";
import { useAuth, getApiBaseUrl } from "./AuthContext";
import { getWsBaseUrl } from "@/utils/network";

interface SocialContextType {
  currentUser: UserPresence;
  onlineUsers: UserPresence[];
  activeRooms: ActiveRoom[];
  invitations: RoomInvite[];
  unreadInvitesCount: number;
  latestInviteToast: RoomInvite | null;
  isConnected: boolean;
  friends: FriendshipItem[];
  pendingRequests: FriendshipItem[];
  unreadRequestsCount: number;
  latestFriendToast: FriendNotification | null;
  // Watch Party Lobby
  currentParty: PartySession | null;
  isPartyHost: boolean;
  partyInvitations: PartyInvite[];
  latestPartyInviteToast: PartyInvite | null;
  sendInvite: (toUserId: string, roomId: string, movieSlug: string, movieTitle: string, bannerUrl?: string) => void;
  acceptInvite: (invite: RoomInvite) => void;
  dismissInvite: (inviteId: string) => void;
  markAllInvitesAsRead: () => void;
  dismissToast: () => void;
  dismissFriendToast: () => void;
  dismissPartyToast: () => void;
  updatePresence: (
    status: "watching" | "idle" | "in_lobby",
    watchingTitle?: { id: string; name: string; slug: string; bannerUrl: string },
    roomId?: string
  ) => void;
  sendFriendRequest: (targetUserId: string) => Promise<{ success: boolean; message?: string }>;
  acceptFriendRequest: (friendshipId: string) => Promise<{ success: boolean; message?: string }>;
  declineFriendRequest: (friendshipId: string) => Promise<{ success: boolean; message?: string }>;
  searchUsers: (query: string) => Promise<FriendUser[]>;
  fetchFriends: () => Promise<void>;
  // Party Actions
  createParty: () => void;
  inviteToParty: (targetUserId: string) => void;
  acceptPartyInvite: (invite: PartyInvite) => void;
  declinePartyInvite: (partyId: string) => void;
  leaveParty: () => void;
  startPartyMedia: (slug: string, title: string, roomId: string) => void;
}

const SocialContext = createContext<SocialContextType | undefined>(undefined);

// Amigos simulados de fallback para enriquecer a experiência visual
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
    userId: "f3-rodrigo",
    userName: "Rodrigo Silva",
    avatarColor: "bg-emerald-600",
    initials: "RS",
    status: "idle",
    device: "Mobile",
    lastSeen: Date.now() - 3 * 60 * 1000,
  },
];

// Salas mock para catálogo
const FALLBACK_MOCK_ROOMS: ActiveRoom[] = [
  {
    code: "sala-cinephiles-4k",
    title: CATALOG_DATA[0],
    hostName: "Lucas Alencar",
    participantsCount: 4,
    maxParticipants: 10,
    syncQuality: "Ultra HD (Sub-50ms sync)",
    isPrivate: false,
  },
  {
    code: "sala-cyber-odyssey",
    title: CATALOG_DATA[2],
    hostName: "Mariana Costa",
    participantsCount: 2,
    maxParticipants: 6,
    syncQuality: "Full HD (Sub-100ms sync)",
    isPrivate: false,
  },
];

export const SocialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const { user: authUser, token, isLoading: isAuthLoading } = useAuth();

  // Presença do usuário autenticado
  const [currentUser, setCurrentUser] = useState<UserPresence>(() => {
    return {
      userId: authUser ? authUser.id : "",
      userName: authUser ? authUser.name : "Você",
      avatarColor: "bg-[#e50914]",
      initials: authUser ? authUser.name.substring(0, 2).toUpperCase() : "VC",
      status: "idle",
      device: "Web Desktop",
      lastSeen: Date.now(),
    };
  });

  const currentUserRef = useRef<UserPresence>(currentUser);
  currentUserRef.current = currentUser;

  // Atualiza identidade quando o usuário logar ou atualizar perfil
  useEffect(() => {
    if (authUser) {
      const updated: UserPresence = {
        userId: authUser.id,
        userName: authUser.name,
        avatarColor: "bg-[#e50914]",
        initials: authUser.name.substring(0, 2).toUpperCase(),
        status: currentUserRef.current.status || "idle",
        watchingTitle: currentUserRef.current.watchingTitle,
        roomId: currentUserRef.current.roomId,
        device: "Web Desktop",
        lastSeen: Date.now(),
      };
      setCurrentUser(updated);
      currentUserRef.current = updated;
    }
  }, [authUser]);

  const [realOnlineUsers, setRealOnlineUsers] = useState<UserPresence[]>([]);
  const [realActiveRooms, setRealActiveRooms] = useState<RoomSummary[]>([]);
  const [invitations, setInvitations] = useState<RoomInvite[]>([]);
  const [latestInviteToast, setLatestInviteToast] = useState<RoomInvite | null>(null);
  const [latestFriendToast, setLatestFriendToast] = useState<FriendNotification | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Watch Party Lobby State
  const [currentParty, setCurrentParty] = useState<PartySession | null>(null);
  const [partyInvitations, setPartyInvitations] = useState<PartyInvite[]>([]);
  const [latestPartyInviteToast, setLatestPartyInviteToast] = useState<PartyInvite | null>(null);

  // Amizades
  const [friends, setFriends] = useState<FriendshipItem[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendshipItem[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Envio tipado para o WebSocket Social
  const send = useCallback((msg: SocialClientMessage) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Resolução limpa de URL para conexões em produção e dev/local/LAN
  const resolveSocialWsUrl = useCallback((authToken: string) => {
    const base = getWsBaseUrl();
    return `${base}/ws/social?token=${encodeURIComponent(authToken)}`;
  }, []);

  // Busca lista de amizades e solicitações
  const fetchFriends = useCallback(async () => {
    if (!token) {
      setFriends([]);
      setPendingRequests([]);
      return;
    }
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/friends`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const mappedRequests: FriendshipItem[] = [
          ...(data.receivedRequests || []).map((r: any) => ({
            id: r.friendshipId,
            status: "PENDING" as const,
            createdAt: r.createdAt,
            sender: r.from,
            isSender: false,
          })),
          ...(data.sentRequests || []).map((r: any) => ({
            id: r.friendshipId,
            status: "PENDING" as const,
            createdAt: r.createdAt,
            receiver: r.to,
            isSender: true,
          })),
        ];
        setFriends(data.friends || []);
        setPendingRequests(mappedRequests);
      }
    } catch (err) {
      console.error("[Social] Erro ao carregar amizades:", err);
    }
  }, [token]);

  const fetchFriendsRef = useRef(fetchFriends);
  fetchFriendsRef.current = fetchFriends;

  useEffect(() => {
    if (token) {
      fetchFriends();
    }
  }, [token, fetchFriends]);

  // Ciclo de Vida da Conexão Social: Conecta SOMENTE quando autenticado e pronto
  useEffect(() => {
    if (isAuthLoading || !token) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    let isUnmounted = false;

    function connect() {
      if (isUnmounted || !token) return;
      const wsUrl = resolveSocialWsUrl(token);

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
              user: currentUserRef.current,
            })
          );
        };

        ws.onmessage = (event) => {
          if (isUnmounted) return;
          try {
            const data = JSON.parse(event.data) as SocialServerMessage;
            const currentUserId = currentUserRef.current.userId;

            switch (data.type) {
              case "social_snapshot": {
                setRealOnlineUsers(data.onlineUsers.filter((u) => u.userId !== currentUserId));
                setRealActiveRooms(data.activeRooms);
                break;
              }

              case "user_presence_changed": {
                if (data.user.userId === currentUserId) return;
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

              case "friend_notification": {
                setLatestFriendToast(data.notification);
                fetchFriendsRef.current();
                break;
              }

              // ================= WATCH PARTY EVENTS =================
              case "party_snapshot": {
                setCurrentParty(data.party);
                break;
              }

              case "party_invitation": {
                const inviteWithRead = { ...data.invite, read: false };
                setPartyInvitations((prev) => [inviteWithRead, ...prev]);
                setLatestPartyInviteToast(inviteWithRead);
                break;
              }

              case "party_updated": {
                setCurrentParty(data.party);
                break;
              }

              case "party_disbanded": {
                setCurrentParty(null);
                break;
              }

              case "party_navigate": {
                console.log(`[Watch Party] Sincronização de navegação do Host ${data.hostName} -> /watch/${data.slug}?mode=room&room=${data.roomId}`);
                router.push(`/watch/${data.slug}?mode=room&room=${data.roomId}`);
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
          setIsConnected(false);
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      }
    }

    connect();

    return () => {
      isUnmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [token, isAuthLoading, resolveSocialWsUrl, router]);

  // Ações de Amizade
  const sendFriendRequest = useCallback(
    async (targetUserId: string) => {
      if (!token) return { success: false, message: "Você precisa estar logado para adicionar amigos." };
      try {
        const apiBase = getApiBaseUrl();
        const res = await fetch(`${apiBase}/api/friends/request`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ targetUserId }),
        });
        const data = await res.json();
        if (res.ok) {
          fetchFriends();
          return { success: true, message: data.message };
        }
        return { success: false, message: data.message || "Erro ao solicitar amizade." };
      } catch {
        return { success: false, message: "Falha de comunicação com o servidor." };
      }
    },
    [token, fetchFriends]
  );

  const acceptFriendRequest = useCallback(
    async (friendshipId: string) => {
      if (!token) return { success: false, message: "Você precisa estar logado." };
      try {
        const apiBase = getApiBaseUrl();
        const res = await fetch(`${apiBase}/api/friends/accept`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ friendshipId }),
        });
        const data = await res.json();
        if (res.ok) {
          fetchFriends();
          return { success: true, message: data.message };
        }
        return { success: false, message: data.message || "Erro ao aceitar solicitação." };
      } catch {
        return { success: false, message: "Falha de comunicação com o servidor." };
      }
    },
    [token, fetchFriends]
  );

  const declineFriendRequest = useCallback(
    async (friendshipId: string) => {
      if (!token) return { success: false, message: "Você precisa estar logado." };
      try {
        const apiBase = getApiBaseUrl();
        const res = await fetch(`${apiBase}/api/friends/decline`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ friendshipId }),
        });
        const data = await res.json();
        if (res.ok) {
          fetchFriends();
          return { success: true, message: data.message };
        }
        return { success: false, message: data.message || "Erro ao recusar solicitação." };
      } catch {
        return { success: false, message: "Falha de comunicação com o servidor." };
      }
    },
    [token, fetchFriends]
  );

  const searchUsers = useCallback(
    async (query: string): Promise<FriendUser[]> => {
      if (!token || !query.trim()) return [];
      try {
        const apiBase = getApiBaseUrl();
        const res = await fetch(`${apiBase}/api/friends/search?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          return data.users || [];
        }
        return [];
      } catch {
        return [];
      }
    },
    [token]
  );

  // Enviar convite direto de sala
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

  const acceptInvite = useCallback(
    (invite: RoomInvite) => {
      setInvitations((prev) => prev.map((i) => (i.inviteId === invite.inviteId ? { ...i, read: true } : i)));
      setLatestInviteToast(null);
      router.push(`/watch/${invite.movieSlug}?mode=room&room=${invite.roomId}`);
    },
    [router]
  );

  const dismissInvite = useCallback((inviteId: string) => {
    setInvitations((prev) => prev.filter((i) => i.inviteId !== inviteId));
  }, []);

  const markAllInvitesAsRead = useCallback(() => {
    setInvitations((prev) => prev.map((i) => ({ ...i, read: true })));
  }, []);

  const dismissToast = useCallback(() => {
    setLatestInviteToast(null);
  }, []);

  const dismissFriendToast = useCallback(() => {
    setLatestFriendToast(null);
  }, []);

  const dismissPartyToast = useCallback(() => {
    setLatestPartyInviteToast(null);
  }, []);

  // ================= AÇÕES DA WATCH PARTY LOBBY =================
  const createParty = useCallback(() => {
    send({ type: "party_create" });
  }, [send]);

  const inviteToParty = useCallback(
    (targetUserId: string) => {
      send({ type: "party_invite", targetUserId });
    },
    [send]
  );

  const acceptPartyInvite = useCallback(
    (invite: PartyInvite) => {
      setPartyInvitations((prev) => prev.filter((i) => i.partyId !== invite.partyId));
      setLatestPartyInviteToast(null);
      send({ type: "party_accept_invite", partyId: invite.partyId });
    },
    [send]
  );

  const declinePartyInvite = useCallback(
    (partyId: string) => {
      setPartyInvitations((prev) => prev.filter((i) => i.partyId !== partyId));
      setLatestPartyInviteToast(null);
      send({ type: "party_decline_invite", partyId });
    },
    [send]
  );

  const leaveParty = useCallback(() => {
    send({ type: "party_leave" });
    setCurrentParty(null);
  }, [send]);

  const startPartyMedia = useCallback(
    (slug: string, title: string, roomId: string) => {
      send({ type: "party_start_media", slug, title, roomId });
    },
    [send]
  );

  // Atualizar estado de presença do usuário
  const updatePresence = useCallback(
    (
      status: "watching" | "idle" | "in_lobby",
      watchingTitle?: { id: string; name: string; slug: string; bannerUrl: string },
      roomId?: string
    ) => {
      setCurrentUser((prev) => {
        const updated: UserPresence = {
          ...prev,
          status,
          watchingTitle,
          roomId,
          lastSeen: Date.now(),
        };
        currentUserRef.current = updated;
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

  // Amigos online: combina usuários reais com fallback
  const onlineUsers = realOnlineUsers.length > 0 ? realOnlineUsers : FALLBACK_MOCK_FRIENDS;

  // Salas ativas: combina salas reais mapeadas para o catálogo com fallback
  const activeRooms: ActiveRoom[] =
    realActiveRooms.length > 0
      ? realActiveRooms.map((room) => {
          const catalogItem = CATALOG_DATA.find((m) => m.slug === room.slug) || CATALOG_DATA[0];
          return {
            code: room.roomId,
            title: catalogItem,
            hostName: room.hostName,
            participantsCount: room.participantsCount,
            maxParticipants: room.maxParticipants,
            syncQuality: room.syncQuality || "Full HD (Sub-100ms sync)",
            isPrivate: room.isPrivate,
          };
        })
      : FALLBACK_MOCK_ROOMS;

  const unreadInvitesCount = invitations.filter((i) => !i.read).length;
  const unreadRequestsCount = pendingRequests.filter((r) => !r.isSender).length;
  const isPartyHost = currentParty?.hostId === currentUser.userId;

  return (
    <SocialContext.Provider
      value={{
        currentUser,
        onlineUsers,
        activeRooms,
        invitations,
        unreadInvitesCount,
        latestInviteToast,
        latestFriendToast,
        isConnected,
        friends,
        pendingRequests,
        unreadRequestsCount,
        // Party
        currentParty,
        isPartyHost,
        partyInvitations,
        latestPartyInviteToast,
        sendInvite,
        acceptInvite,
        dismissInvite,
        markAllInvitesAsRead,
        dismissToast,
        dismissFriendToast,
        dismissPartyToast,
        updatePresence,
        sendFriendRequest,
        acceptFriendRequest,
        declineFriendRequest,
        searchUsers,
        fetchFriends,
        createParty,
        inviteToParty,
        acceptPartyInvite,
        declinePartyInvite,
        leaveParty,
        startPartyMedia,
      }}
    >
      {children}
    </SocialContext.Provider>
  );
};

export const useSocial = () => {
  const context = useContext(SocialContext);
  if (!context) {
    throw new Error("useSocial deve ser utilizado dentro de um SocialProvider");
  }
  return context;
};
