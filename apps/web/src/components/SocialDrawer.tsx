"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  X,
  Play,
  Plus,
  Radio,
  Check,
  Copy,
  Sparkles,
  Send,
  UserPlus,
  UserCheck,
  UserX,
  Search,
  Loader2,
  Clock,
  ShieldCheck,
  FileVideo,
  Film,
  MoreVertical,
  UserMinus,
  Ban,
  AlertTriangle,
} from "lucide-react";
import { CATALOG_DATA, CatalogTitle } from "@/data/mockCatalog";
import { useSocial } from "@/context/SocialContext";
import { useAuth, getApiBaseUrl } from "@/context/AuthContext";
import { FriendUser } from "@/types/social";
import { useRouter } from "next/navigation";

interface SocialDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "friends" | "rooms" | "create";
}

export function SocialDrawer({ isOpen, onClose, defaultTab = "friends" }: SocialDrawerProps) {
  const {
    onlineUsers,
    onlineFriends,
    activeRooms,
    sendInvite,
    currentUser,
    friends,
    pendingRequests,
    unreadRequestsCount,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    blockUser,
    searchUsers,
    fetchFriends,
    inviteToParty,
    currentParty,
  } = useSocial();

  const { isAuthenticated, getAuthHeaders } = useAuth();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"friends" | "rooms" | "create">(defaultTab);
  const [friendSubTab, setFriendSubTab] = useState<"online" | "all" | "requests" | "search">("online");
  const [isLaunchingRoom, setIsLaunchingRoom] = useState(false);

  const [selectedMovieForRoom, setSelectedMovieForRoom] = useState<CatalogTitle>(CATALOG_DATA[0]);
  const [createSourceMode, setCreateSourceMode] = useState<"catalog" | "local">("catalog");
  const [roomType, setRoomType] = useState<"friends" | "public">("friends");
  const [hostOnlyControls, setHostOnlyControls] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(new Set());

  // Estado da busca de usuários
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FriendUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ [key: string]: string }>({});

  // Gestão de menu de opções do amigo e confirmação de desamigar/bloquear
  const [allFriendsSearchQuery, setAllFriendsSearchQuery] = useState("");
  const [activeMenuFriendId, setActiveMenuFriendId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: "remove" | "block";
    friendId: string;
    friendshipId?: string;
    name: string;
  } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab, isOpen]);

  // Bloqueia scroll do body quando aberto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      if (isAuthenticated) fetchFriends();
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen, isAuthenticated, fetchFriends]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Busca de usuários debounced
  useEffect(() => {
    if (!searchQuery.trim() || !isAuthenticated) {
      setSearchResults([]);
      return;
    }

    let isCancelled = false;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchUsers(searchQuery);
      if (!isCancelled) {
        setSearchResults(results);
        setIsSearching(false);
      }
    }, 300);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, isAuthenticated, searchUsers]);

  // Lista ordenada alfabeticamente para a aba "Todos"
  const sortedAllFriends = React.useMemo(() => {
    return [...friends].sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
  }, [friends]);

  const filteredAllFriends = React.useMemo(() => {
    if (!allFriendsSearchQuery.trim()) return sortedAllFriends;
    const q = allFriendsSearchQuery.toLowerCase();
    return sortedAllFriends.filter(
      (f: any) => (f.name || "").toLowerCase().includes(q) || (f.email || "").toLowerCase().includes(q)
    );
  }, [sortedAllFriends, allFriendsSearchQuery]);

  const copyInviteLink = (code: string, slug?: string) => {
    const targetSlug = slug || selectedMovieForRoom.slug;
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    navigator.clipboard.writeText(`${origin}/watch/${targetSlug}?mode=room&room=${code}`);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handleSendInviteToFriend = (friendUserId: string) => {
    inviteToParty(friendUserId);

    setInvitedUserIds((prev) => new Set(prev).add(friendUserId));
    setTimeout(() => {
      setInvitedUserIds((prev) => {
        const next = new Set(prev);
        next.delete(friendUserId);
        return next;
      });
    }, 4000);
  };

  const handleAddFriend = async (targetUserId: string) => {
    setActionFeedback((prev) => ({ ...prev, [targetUserId]: "Enviando..." }));
    const res = await sendFriendRequest(targetUserId);
    setActionFeedback((prev) => ({
      ...prev,
      [targetUserId]: res.success ? "Solicitação enviada!" : (res.message || "Erro"),
    }));
  };

  const handleAccept = async (friendshipId: string) => {
    setActionFeedback((prev) => ({ ...prev, [friendshipId]: "Aceitando..." }));
    await acceptFriendRequest(friendshipId);
    setActionFeedback((prev) => {
      const next = { ...prev };
      delete next[friendshipId];
      return next;
    });
  };

  const handleDecline = async (friendshipId: string) => {
    setActionFeedback((prev) => ({ ...prev, [friendshipId]: "Recusando..." }));
    await declineFriendRequest(friendshipId);
    setActionFeedback((prev) => {
      const next = { ...prev };
      delete next[friendshipId];
      return next;
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setIsConfirming(true);
    try {
      if (confirmAction.type === "remove") {
        if (confirmAction.friendshipId) {
          await removeFriend(confirmAction.friendshipId);
        }
      } else if (confirmAction.type === "block") {
        await blockUser(confirmAction.friendId);
      }
      setConfirmAction(null);
      setActiveMenuFriendId(null);
    } finally {
      setIsConfirming(false);
    }
  };

  const newGeneratedRoomCode = `sala-${selectedMovieForRoom.slug}-${Math.random().toString(36).substring(2, 6)}`;

  const handleLaunchRoom = async (
    targetRoomId: string,
    targetSlug: string,
    sourceType: "LOCAL_FILE" | "CATALOG_DEMO",
    mediaTitle?: string,
    extraQuery?: string
  ) => {
    setIsLaunchingRoom(true);
    try {
      const apiBase = getApiBaseUrl();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      };
      await fetch(`${apiBase}/api/rooms`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          roomId: targetRoomId,
          mediaId: targetSlug,
          sourceType,
          mediaTitle: mediaTitle || (sourceType === "LOCAL_FILE" ? "Ficheiro Local (Syncplay)" : undefined),
        }),
      });
    } catch (e) {
      console.warn("[SocialDrawer] Não foi possível pré-registrar a sala via API:", e);
    } finally {
      setIsLaunchingRoom(false);
      onClose();
      const query = extraQuery ? `&${extraQuery}` : "";
      router.push(`/watch/${targetSlug}?mode=room&room=${targetRoomId}${query}`);
    }
  };

  if (!mounted || !isOpen) return null;

  return (
    <div className="select-none">
      {/* Backdrop */}
      <div
        className="fixed inset-0 h-screen w-screen bg-black/75 backdrop-blur-sm z-[9998] transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 bottom-0 h-screen w-full sm:w-[440px] max-w-[92vw] z-[9999] bg-[#141414] border-l border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 ease-out"
        role="dialog"
        aria-modal="true"
        aria-label="Watch Together Hub"
      >
        {/* Cabeçalho */}
        <div className="flex-none p-5 border-b border-white/10 flex items-center justify-between bg-[#1a1a1a]">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-[#E50914]/20 border border-[#E50914]/40 flex items-center justify-center">
              <Users className="w-5 h-5 text-[#38bdf8]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Watch Together Hub</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#38bdf8]/20 text-[#38bdf8] font-bold border border-[#38bdf8]/30">
                  SÍNCRO
                </span>
              </h2>
              <p className="text-xs text-neutral-400">Presença ao vivo e gestão de amizades</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Fechar Hub"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Abas Principais */}
        <div className="flex-none flex border-b border-white/10 bg-[#161616] px-4 pt-2">
          <button
            onClick={() => setActiveTab("friends")}
            className={`flex-1 pb-3 text-xs font-semibold border-b-2 transition-all flex items-center justify-center space-x-1.5 cursor-pointer relative ${
              activeTab === "friends"
                ? "border-[#38bdf8] text-white"
                : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Amigos</span>
            {unreadRequestsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-[#E50914] text-white text-[10px] font-black rounded-full animate-pulse">
                {unreadRequestsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("rooms")}
            className={`flex-1 pb-3 text-xs font-semibold border-b-2 transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === "rooms"
                ? "border-[#38bdf8] text-white"
                : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-[#00d26a]" />
            <span>Salas ({activeRooms.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("create")}
            className={`flex-1 pb-3 text-xs font-semibold border-b-2 transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === "create"
                ? "border-[#E50914] text-white"
                : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Plus className="w-3.5 h-3.5 text-[#E50914]" />
            <span>Criar Sala</span>
          </button>
        </div>

        {/* Corpo com Rolagem */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent">
          {/* ================= ABA 1: AMIGOS & AMIZADES ================= */}
          {activeTab === "friends" && (
            <div className="space-y-4">
              {/* Diálogo de Confirmação Inline */}
              {confirmAction && (
                <div className="p-4 rounded-xl bg-[#2a1717] border border-red-500/30 text-white space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center flex-none">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-white">
                        {confirmAction.type === "remove" ? "Desfazer Amizade" : "Bloquear Usuário"}
                      </h4>
                      <p className="text-[11px] text-neutral-300 mt-0.5 leading-relaxed">
                        {confirmAction.type === "remove"
                          ? `Tem certeza de que deseja remover ${confirmAction.name} da sua lista de amigos?`
                          : `Tem certeza de que deseja bloquear ${confirmAction.name}? Vocês não poderão mais ver a presença nem interagir um com o outro.`}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2 pt-1">
                    <button
                      onClick={() => setConfirmAction(null)}
                      disabled={isConfirming}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-300 text-xs font-semibold cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleConfirmAction}
                      disabled={isConfirming}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                    >
                      {isConfirming && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                      <span>{confirmAction.type === "remove" ? "Remover" : "Bloquear"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Sub-abas de Amigos: 4 Abas (Online, Todos, Pedidos, Adicionar) */}
              <div className="grid grid-cols-4 p-1 bg-[#202020] rounded-xl text-xs gap-1">
                <button
                  onClick={() => {
                    setFriendSubTab("online");
                    setActiveMenuFriendId(null);
                  }}
                  className={`py-1.5 rounded-lg font-medium transition-all cursor-pointer text-center ${
                    friendSubTab === "online" ? "bg-[#2d2d2d] text-white shadow font-semibold" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Online ({onlineUsers.length})
                </button>

                <button
                  onClick={() => {
                    setFriendSubTab("all");
                    setActiveMenuFriendId(null);
                  }}
                  className={`py-1.5 rounded-lg font-medium transition-all cursor-pointer text-center ${
                    friendSubTab === "all" ? "bg-[#2d2d2d] text-white shadow font-semibold" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Todos ({friends.length})
                </button>

                <button
                  onClick={() => {
                    setFriendSubTab("requests");
                    setActiveMenuFriendId(null);
                  }}
                  className={`py-1.5 rounded-lg font-medium transition-all cursor-pointer text-center relative ${
                    friendSubTab === "requests" ? "bg-[#2d2d2d] text-white shadow font-semibold" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <span>Pedidos</span>
                  {unreadRequestsCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 bg-[#E50914] text-white text-[10px] font-bold rounded-full">
                      {unreadRequestsCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => {
                    setFriendSubTab("search");
                    setActiveMenuFriendId(null);
                  }}
                  className={`py-1.5 rounded-lg font-medium transition-all cursor-pointer text-center ${
                    friendSubTab === "search" ? "bg-[#2d2d2d] text-white shadow font-semibold" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Adicionar
                </button>
              </div>

              {/* ================= SUB-ABA 1: AMIGOS ONLINE ================= */}
              {friendSubTab === "online" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <span>Amigos ativos em tempo real</span>
                    <span className="text-[#00d26a] flex items-center gap-1 font-medium">
                      <span className="w-2 h-2 rounded-full bg-[#00d26a] animate-pulse" /> {onlineUsers.length} online
                    </span>
                  </div>

                  {onlineUsers.length === 0 ? (
                    <div className="p-8 text-center bg-[#1e1e1e] rounded-2xl border border-white/5 space-y-3">
                      <div className="w-12 h-12 rounded-full bg-[#E50914]/10 border border-[#E50914]/20 flex items-center justify-center mx-auto text-[#E50914]">
                        <Users className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-white">Nenhum amigo online no momento</p>
                        <p className="text-xs text-neutral-400 max-w-xs mx-auto">
                          Seus amigos confirmados aparecerão aqui quando estiverem navegando ou assistindo a um título.
                        </p>
                      </div>
                      <div className="pt-2 flex justify-center gap-2">
                        <button
                          onClick={() => setFriendSubTab("search")}
                          className="px-4 py-2 rounded-xl bg-[#E50914] hover:bg-[#E50914]/85 text-white text-xs font-bold transition-all cursor-pointer"
                        >
                          Buscar Amigos
                        </button>
                        <button
                          onClick={() => setFriendSubTab("all")}
                          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-neutral-200 text-xs font-semibold transition-all cursor-pointer"
                        >
                          Ver Todos ({friends.length})
                        </button>
                      </div>
                    </div>
                  ) : (
                    onlineUsers.map((friend) => (
                      <div
                        key={friend.userId}
                        className="p-3.5 rounded-xl bg-[#1e1e1e] border border-white/5 hover:border-white/15 transition-all space-y-2.5 relative"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="relative">
                              <div
                                className={`w-9 h-9 rounded-full ${friend.avatarColor || "bg-[#E50914]"} text-white font-bold text-xs flex items-center justify-center shadow`}
                              >
                                {friend.initials || friend.userName.substring(0, 2).toUpperCase()}
                              </div>
                              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#00d26a] ring-2 ring-[#1e1e1e]" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-white leading-tight">{friend.userName}</p>
                              <p className="text-[11px] text-neutral-400 font-mono flex items-center gap-1">
                                <span>{friend.device || "Navegador"}</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1.5">
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-[#00d26a]/10 text-[#00d26a] border border-[#00d26a]/30">
                              {friend.status === "watching" ? "Assistindo" : "Online"}
                            </span>

                            {/* Dropdown 3 Pontinhos */}
                            <div className="relative">
                              <button
                                onClick={() =>
                                  setActiveMenuFriendId(activeMenuFriendId === friend.userId ? null : friend.userId)
                                }
                                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                                title="Opções de amizade"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>

                              {activeMenuFriendId === friend.userId && (
                                <div className="absolute right-0 top-8 w-44 bg-[#222222] border border-white/10 rounded-xl shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                                  <button
                                    onClick={() => {
                                      setActiveMenuFriendId(null);
                                      const matchedFriend: any = friends.find((f: any) => f.id === friend.userId);
                                      setConfirmAction({
                                        type: "remove",
                                        friendId: friend.userId,
                                        friendshipId: matchedFriend?.friendshipId,
                                        name: friend.userName,
                                      });
                                    }}
                                    className="w-full px-3 py-2 text-left text-xs text-neutral-300 hover:text-white hover:bg-white/10 flex items-center space-x-2 transition-colors cursor-pointer"
                                  >
                                    <UserMinus className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Desfazer Amizade</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setActiveMenuFriendId(null);
                                      const matchedFriend: any = friends.find((f: any) => f.id === friend.userId);
                                      setConfirmAction({
                                        type: "block",
                                        friendId: friend.userId,
                                        friendshipId: matchedFriend?.friendshipId,
                                        name: friend.userName,
                                      });
                                    }}
                                    className="w-full px-3 py-2 text-left text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center space-x-2 transition-colors cursor-pointer"
                                  >
                                    <Ban className="w-3.5 h-3.5 text-red-500" />
                                    <span>Bloquear Usuário</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {friend.watchingTitle && (
                          <div className="p-2.5 rounded-lg bg-[#282828] border border-white/5 flex items-center justify-between">
                            <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                              <div
                                className="w-10 h-7 rounded bg-cover bg-center flex-none"
                                style={{ backgroundImage: `url('${friend.watchingTitle.bannerUrl}')` }}
                              />
                              <div className="min-w-0">
                                <p className="text-[10px] text-neutral-400 truncate">Assistindo agora:</p>
                                <p className="text-xs font-semibold text-white truncate">
                                  {friend.watchingTitle.name}
                                </p>
                              </div>
                            </div>

                            {friend.roomId ? (
                              <Link
                                href={`/watch/${friend.watchingTitle.slug}?mode=room&room=${friend.roomId}`}
                                onClick={onClose}
                                className="px-2.5 py-1.5 rounded bg-[#E50914] hover:bg-[#E50914]/85 text-white font-bold text-xs flex items-center space-x-1 transition-colors flex-none cursor-pointer"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                <span>Entrar</span>
                              </Link>
                            ) : null}
                          </div>
                        )}

                        <div className="pt-1 flex items-center justify-end">
                          <button
                            onClick={() => handleSendInviteToFriend(friend.userId)}
                            disabled={invitedUserIds.has(friend.userId)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
                              invitedUserIds.has(friend.userId)
                                ? "bg-[#00d26a]/20 text-[#00d26a] border border-[#00d26a]/30"
                                : "bg-white/10 hover:bg-white/20 text-neutral-200"
                            }`}
                          >
                            {invitedUserIds.has(friend.userId) ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Convite de Grupo Enviado!</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5 text-[#E50914]" />
                                <span>Convidar p/ Grupo</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ================= SUB-ABA 2: TODOS OS AMIGOS ================= */}
              {friendSubTab === "all" && (
                <div className="space-y-3">
                  {/* Busca local por nome */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={allFriendsSearchQuery}
                      onChange={(e) => setAllFriendsSearchQuery(e.target.value)}
                      placeholder="Filtrar amigos por nome ou email..."
                      className="w-full pl-9 pr-3 py-2 bg-[#202020] border border-white/10 rounded-xl text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-[#38bdf8]"
                    />
                  </div>

                  {filteredAllFriends.length === 0 ? (
                    <div className="p-8 text-center bg-[#1e1e1e] rounded-2xl border border-white/5 space-y-3">
                      <Users className="w-8 h-8 text-neutral-500 mx-auto" />
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-white">
                          {friends.length === 0 ? "Nenhum amigo adicionado ainda" : "Nenhum amigo encontrado"}
                        </p>
                        <p className="text-xs text-neutral-400 max-w-xs mx-auto">
                          {friends.length === 0
                            ? "Busque outros usuários para compartilhar sessões sincronizadas e criar Watch Parties privadas."
                            : "Tente um termo de busca diferente para localizar seus amigos."}
                        </p>
                      </div>
                      {friends.length === 0 && (
                        <button
                          onClick={() => setFriendSubTab("search")}
                          className="px-4 py-2 rounded-xl bg-[#E50914] hover:bg-[#E50914]/85 text-white text-xs font-bold transition-all cursor-pointer"
                        >
                          Adicionar Amigos
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredAllFriends.map((friend: any) => {
                      const onlinePres = onlineUsers.find((u) => u.userId === friend.id);
                      const isOnline = !!onlinePres;

                      return (
                        <div
                          key={friend.id}
                          className="p-3.5 rounded-xl bg-[#1e1e1e] border border-white/5 hover:border-white/15 transition-all flex items-center justify-between"
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <div className="relative flex-none">
                              <div className="w-9 h-9 rounded-full bg-[#E50914] text-white font-bold text-xs flex items-center justify-center">
                                {(friend.name || "U").substring(0, 2).toUpperCase()}
                              </div>
                              <span
                                className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#1e1e1e] ${
                                  isOnline ? "bg-[#00d26a]" : "bg-neutral-500"
                                }`}
                              />
                            </div>
                            <div className="min-w-0 pr-2">
                              <p className="text-xs font-semibold text-white truncate">{friend.name}</p>
                              <p className="text-[11px] text-neutral-400 truncate">
                                {isOnline
                                  ? onlinePres?.status === "watching" && onlinePres.watchingTitle
                                    ? `Assistindo: ${onlinePres.watchingTitle.name}`
                                    : "Online agora"
                                  : "Offline"}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1.5 flex-none">
                            {isOnline && (
                              <button
                                onClick={() => handleSendInviteToFriend(friend.id)}
                                disabled={invitedUserIds.has(friend.id)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center space-x-1 cursor-pointer transition-all ${
                                  invitedUserIds.has(friend.id)
                                    ? "bg-[#00d26a]/20 text-[#00d26a]"
                                    : "bg-white/10 hover:bg-white/20 text-neutral-200"
                                }`}
                                title="Convidar para Party"
                              >
                                {invitedUserIds.has(friend.id) ? (
                                  <Check className="w-3.5 h-3.5" />
                                ) : (
                                  <Sparkles className="w-3.5 h-3.5 text-[#E50914]" />
                                )}
                                <span className="hidden sm:inline">Party</span>
                              </button>
                            )}

                            {/* Dropdown de Ações */}
                            <div className="relative">
                              <button
                                onClick={() =>
                                  setActiveMenuFriendId(activeMenuFriendId === friend.id ? null : friend.id)
                                }
                                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                                title="Mais opções"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>

                              {activeMenuFriendId === friend.id && (
                                <div className="absolute right-0 top-8 w-44 bg-[#222222] border border-white/10 rounded-xl shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                                  <button
                                    onClick={() => {
                                      setActiveMenuFriendId(null);
                                      setConfirmAction({
                                        type: "remove",
                                        friendId: friend.id,
                                        friendshipId: friend.friendshipId,
                                        name: friend.name,
                                      });
                                    }}
                                    className="w-full px-3 py-2 text-left text-xs text-neutral-300 hover:text-white hover:bg-white/10 flex items-center space-x-2 transition-colors cursor-pointer"
                                  >
                                    <UserMinus className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Desfazer Amizade</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setActiveMenuFriendId(null);
                                      setConfirmAction({
                                        type: "block",
                                        friendId: friend.id,
                                        friendshipId: friend.friendshipId,
                                        name: friend.name,
                                      });
                                    }}
                                    className="w-full px-3 py-2 text-left text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center space-x-2 transition-colors cursor-pointer"
                                  >
                                    <Ban className="w-3.5 h-3.5 text-red-500" />
                                    <span>Bloquear Usuário</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* ================= SUB-ABA 3: PEDIDOS DE AMIZADE ================= */}
              {friendSubTab === "requests" && (
                <div className="space-y-3">
                  {!isAuthenticated ? (
                    <div className="p-6 text-center text-neutral-400 text-xs bg-[#202020] rounded-xl border border-white/5 space-y-3">
                      <p>Faça login para gerenciar suas solicitações de amizade.</p>
                      <Link
                        href="/login"
                        onClick={onClose}
                        className="inline-block px-4 py-2 bg-[#E50914] text-white font-bold rounded-lg text-xs"
                      >
                        Entrar na Conta
                      </Link>
                    </div>
                  ) : pendingRequests.length === 0 ? (
                    <div className="p-8 text-center bg-[#1e1e1e] rounded-2xl border border-white/5 space-y-2">
                      <Clock className="w-8 h-8 text-neutral-500 mx-auto" />
                      <p className="text-sm font-semibold text-white">Nenhum pedido pendente</p>
                      <p className="text-xs text-neutral-400">Você não possui solicitações de amizade pendentes no momento.</p>
                    </div>
                  ) : (
                    pendingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="p-3.5 rounded-xl bg-[#1e1e1e] border border-white/5 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-full bg-[#E50914] text-white font-bold text-xs flex items-center justify-center">
                              {((req.isSender ? req.receiver?.name : req.sender?.name) || "U")
                                .substring(0, 2)
                                .toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-white">
                                {req.isSender ? req.receiver?.name : req.sender?.name}
                              </p>
                              <p className="text-[11px] text-neutral-400">
                                {req.isSender ? "Solicitação enviada" : "Enviou um pedido de amizade"}
                              </p>
                            </div>
                          </div>
                        </div>

                        {!req.isSender ? (
                          <div className="flex items-center justify-end space-x-2 pt-1">
                            <button
                              onClick={() => handleAccept(req.id)}
                              disabled={!!actionFeedback[req.id]}
                              className="px-3 py-1.5 rounded-lg bg-[#00d26a] hover:bg-[#00d26a]/90 text-black font-bold text-xs flex items-center space-x-1 cursor-pointer"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Aceitar</span>
                            </button>
                            <button
                              onClick={() => handleDecline(req.id)}
                              disabled={!!actionFeedback[req.id]}
                              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-300 text-xs flex items-center space-x-1 cursor-pointer"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              <span>Recusar</span>
                            </button>
                          </div>
                        ) : (
                          <p className="text-[11px] text-neutral-500 text-right">Aguardando resposta</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ================= SUB-ABA 4: BUSCAR / ADICIONAR AMIGOS ================= */}
              {friendSubTab === "search" && (
                <div className="space-y-4">
                  {!isAuthenticated ? (
                    <div className="p-6 text-center text-neutral-400 text-xs bg-[#202020] rounded-xl border border-white/5 space-y-3">
                      <p>Faça login para buscar e adicionar outros cinéfilos.</p>
                      <Link
                        href="/login"
                        onClick={onClose}
                        className="inline-block px-4 py-2 bg-[#E50914] text-white font-bold rounded-lg text-xs"
                      >
                        Entrar na Conta
                      </Link>
                    </div>
                  ) : (
                    <>
                      {/* Input de Busca */}
                      <div className="relative">
                        <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Buscar por nome ou e-mail..."
                          className="w-full pl-10 pr-4 py-2.5 bg-[#202020] border border-white/10 rounded-xl text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-[#38bdf8]"
                        />
                        {isSearching && (
                          <Loader2 className="w-4 h-4 text-[#38bdf8] animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
                        )}
                      </div>

                      {/* Resultados da Busca */}
                      <div className="space-y-2">
                        {searchResults.length === 0 && searchQuery.trim() && !isSearching ? (
                          <p className="text-xs text-neutral-500 text-center py-4">Nenhum usuário encontrado.</p>
                        ) : (
                          searchResults.map((user) => (
                            <div
                              key={user.id}
                              className="p-3 rounded-xl bg-[#1e1e1e] border border-white/5 flex items-center justify-between"
                            >
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 rounded-full bg-[#E50914] text-white font-bold text-xs flex items-center justify-center">
                                  {user.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-white">{user.name}</p>
                                  <p className="text-[11px] text-neutral-400 truncate max-w-[170px]">{user.email}</p>
                                </div>
                              </div>

                              {/* Status Contextual */}
                              {user.friendshipStatus === "FRIENDS" ? (
                                <span className="text-[11px] font-semibold text-[#00d26a] flex items-center gap-1 px-2.5 py-1 rounded bg-[#00d26a]/10 border border-[#00d26a]/30">
                                  <Check className="w-3.5 h-3.5" /> Amigos
                                </span>
                              ) : user.friendshipStatus === "PENDING_SENT" ? (
                                <span className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1 px-2.5 py-1 rounded bg-white/5 border border-white/10">
                                  <Clock className="w-3.5 h-3.5" /> Enviado
                                </span>
                              ) : user.friendshipStatus === "PENDING_RECEIVED" ? (
                                <button
                                  onClick={() => handleAccept(user.friendshipId || "")}
                                  className="px-2.5 py-1 bg-[#00d26a] hover:bg-[#00d26a]/90 text-black text-xs font-bold rounded-lg flex items-center space-x-1 cursor-pointer"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  <span>Aceitar</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleAddFriend(user.id)}
                                  disabled={!!actionFeedback[user.id]}
                                  className="px-3 py-1.5 bg-[#E50914] hover:bg-[#E50914]/85 text-white text-xs font-semibold rounded-lg flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                  <span>{actionFeedback[user.id] || "Adicionar"}</span>
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ================= ABA 2: SALAS ATIVAS AO VIVO ================= */}
          {activeTab === "rooms" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>Salas síncronas em execução</span>
                <span className="text-[#38bdf8] font-medium">{activeRooms.length} salas ativas</span>
              </div>

              <div className="space-y-3">
                {activeRooms.map((room) => (
                  <div
                    key={room.code}
                    className="p-3.5 rounded-xl bg-[#1e1e1e] border border-white/5 hover:border-white/15 transition-all space-y-3"
                  >
                    <div className="flex space-x-3">
                      <div
                        className="w-20 h-14 rounded-lg bg-cover bg-center flex-none relative overflow-hidden"
                        style={{ backgroundImage: `url('${room.title.bannerUrl}')` }}
                      >
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <Radio className="w-4 h-4 text-[#00d26a] animate-pulse" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{room.title.name}</p>
                        <p className="text-[11px] text-neutral-400 truncate">Host: {room.hostName}</p>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="text-[10px] text-[#00d26a] font-medium">
                            {room.participantsCount}/{room.maxParticipants} assistindo
                          </span>
                          <span className="text-neutral-600">•</span>
                          <span className="text-[10px] text-neutral-400 truncate">{room.syncQuality}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <button
                        onClick={() => copyInviteLink(room.code, room.title.slug)}
                        className="text-[11px] text-neutral-400 hover:text-white flex items-center space-x-1 cursor-pointer"
                      >
                        {copiedCode === room.code ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#00d26a]" />
                            <span className="text-[#00d26a]">Link Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiar Link</span>
                          </>
                        )}
                      </button>

                      <Link
                        href={`/watch/${room.title.slug}?mode=room&room=${room.code}`}
                        onClick={onClose}
                        className="px-3.5 py-1.5 rounded-lg bg-[#E50914] hover:bg-[#E50914]/85 text-white font-bold text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Entrar na Sala</span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================= ABA 3: CRIAR SALA ================= */}
          {activeTab === "create" && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-gradient-to-r from-[#E50914]/15 to-[#38bdf8]/15 border border-[#E50914]/30">
                <div className="flex items-center space-x-2 text-[#E50914] text-xs font-bold uppercase tracking-wider mb-1">
                  <Sparkles className="w-4 h-4" />
                  <span>Sessão Watch Together</span>
                </div>
                <p className="text-xs text-neutral-300">
                  Crie uma sala instantânea com sincronização NTP autoritativa e convide amigos.
                </p>
              </div>

              {/* Seletor de Modalidade de Conteúdo (UMSA) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider block">
                  Modalidade da Sala (BYOM)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setCreateSourceMode("catalog")}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                      createSourceMode === "catalog"
                        ? "bg-[#E50914] border-[#E50914] text-white shadow-md shadow-[#E50914]/20"
                        : "bg-[#202020] border-white/5 text-neutral-400 hover:text-white"
                    }`}
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>Catálogo Demo</span>
                  </button>
                  <button
                    onClick={() => setCreateSourceMode("local")}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                      createSourceMode === "local"
                        ? "bg-[#E50914] border-[#E50914] text-white shadow-md shadow-[#E50914]/20"
                        : "bg-[#202020] border-white/5 text-neutral-400 hover:text-white"
                    }`}
                  >
                    <FileVideo className="w-3.5 h-3.5" />
                    <span>Ficheiro Local</span>
                  </button>
                </div>
              </div>

              {/* Modo 1: Catálogo */}
              {createSourceMode === "catalog" && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Selecionar Título do Catálogo
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-neutral-700">
                    {CATALOG_DATA.map((movie) => (
                      <div
                        key={movie.id}
                        onClick={() => setSelectedMovieForRoom(movie)}
                        className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center space-x-2 ${
                          selectedMovieForRoom.id === movie.id
                            ? "bg-[#E50914]/20 border-[#E50914] text-white"
                            : "bg-[#202020] border-white/5 text-neutral-400 hover:text-white"
                        }`}
                      >
                        <div
                          className="w-10 h-8 rounded bg-cover bg-center flex-none"
                          style={{ backgroundImage: `url('${movie.bannerUrl}')` }}
                        />
                        <span className="text-xs font-medium truncate">{movie.name}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() =>
                      handleLaunchRoom(
                        newGeneratedRoomCode,
                        selectedMovieForRoom.slug,
                        "CATALOG_DEMO",
                        selectedMovieForRoom.name
                      )
                    }
                    disabled={isLaunchingRoom}
                    className="w-full mt-2 py-3.5 px-4 bg-gradient-to-r from-[#B20710] to-[#E50914] hover:from-[#c20812] hover:to-[#ff2b36] text-white font-bold rounded-xl shadow-lg shadow-[#E50914]/30 transition-all flex items-center justify-center space-x-2 text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>{isLaunchingRoom ? "Criando Sala..." : "Iniciar Sala com Catálogo"}</span>
                  </button>
                </div>
              )}

              {/* Modo 2: Ficheiro Local (Syncplay Web) */}
              {createSourceMode === "local" && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs space-y-1">
                    <p className="font-bold flex items-center space-x-1.5 text-white">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Risco Zero & Privacidade Total</span>
                    </p>
                    <p className="text-[11px] text-neutral-300 leading-relaxed">
                      Você e seus amigos reproduzirão o vídeo diretamente de seus computadores locais. A sala
                      apenas compara o hash amostral criptográfico e sincroniza os tempos milimetricamente.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      const localCode = `sala-local-${Math.random().toString(36).substring(2, 6)}`;
                      handleLaunchRoom(
                        localCode,
                        "arquivo-local",
                        "LOCAL_FILE",
                        "Ficheiro Local (Syncplay)",
                        "source=local"
                      );
                    }}
                    disabled={isLaunchingRoom}
                    className="w-full py-3.5 px-4 bg-gradient-to-r from-[#00d26a] to-[#00b057] hover:from-[#00b057] hover:to-[#009147] text-black font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center space-x-2 text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
                  >
                    <FileVideo className="w-4 h-4" />
                    <span>{isLaunchingRoom ? "Criando Sala..." : "Iniciar Sala (Ficheiro Local)"}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
