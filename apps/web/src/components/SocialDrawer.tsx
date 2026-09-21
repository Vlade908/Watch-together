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
} from "lucide-react";
import { CATALOG_DATA, CatalogTitle } from "@/data/mockCatalog";
import { useSocial } from "@/context/SocialContext";
import { useAuth } from "@/context/AuthContext";
import { FriendUser } from "@/types/social";

interface SocialDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "friends" | "rooms" | "create";
}

export function SocialDrawer({ isOpen, onClose, defaultTab = "friends" }: SocialDrawerProps) {
  const {
    onlineUsers,
    activeRooms,
    sendInvite,
    currentUser,
    friends,
    pendingRequests,
    unreadRequestsCount,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    searchUsers,
    fetchFriends,
    inviteToParty,
    currentParty,
  } = useSocial();

  const { isAuthenticated } = useAuth();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"friends" | "rooms" | "create">(defaultTab);
  const [friendSubTab, setFriendSubTab] = useState<"online" | "requests" | "search">("online");

  const [selectedMovieForRoom, setSelectedMovieForRoom] = useState<CatalogTitle>(CATALOG_DATA[0]);
  const [roomType, setRoomType] = useState<"friends" | "public">("friends");
  const [hostOnlyControls, setHostOnlyControls] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(new Set());

  // Estado da busca de usuários
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FriendUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ [key: string]: string }>({});

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

  if (!mounted || !isOpen) return null;

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

  const newGeneratedRoomCode = `sala-${selectedMovieForRoom.slug}-${Math.random().toString(36).substring(2, 6)}`;

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
              {/* Sub-abas de Amigos */}
              <div className="flex p-1 bg-[#202020] rounded-xl text-xs">
                <button
                  onClick={() => setFriendSubTab("online")}
                  className={`flex-1 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                    friendSubTab === "online" ? "bg-[#2d2d2d] text-white shadow" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Conectados ({onlineUsers.length})
                </button>
                <button
                  onClick={() => setFriendSubTab("requests")}
                  className={`flex-1 py-1.5 rounded-lg font-medium transition-all cursor-pointer relative ${
                    friendSubTab === "requests" ? "bg-[#2d2d2d] text-white shadow" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Pedidos
                  {unreadRequestsCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 bg-[#E50914] text-white text-[10px] font-bold rounded-full">
                      {unreadRequestsCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setFriendSubTab("search")}
                  className={`flex-1 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                    friendSubTab === "search" ? "bg-[#2d2d2d] text-white shadow" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Adicionar
                </button>
              </div>

              {/* Sub-aba 1: Amigos Online */}
              {friendSubTab === "online" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <span>Membros ativos em tempo real</span>
                    <span className="text-[#00d26a] flex items-center gap-1 font-medium">
                      <span className="w-2 h-2 rounded-full bg-[#00d26a] animate-pulse" /> {onlineUsers.length} online
                    </span>
                  </div>

                  {onlineUsers.length === 0 ? (
                    <div className="p-6 text-center text-neutral-400 text-xs bg-[#202020] rounded-xl border border-white/5">
                      Nenhum outro amigo conectado no momento. Convide amigos ou compartilhe o link de uma sala!
                    </div>
                  ) : (
                    onlineUsers.map((friend) => (
                      <div
                        key={friend.userId}
                        className="p-3.5 rounded-xl bg-[#1e1e1e] border border-white/5 hover:border-white/15 transition-all space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="relative">
                              <div
                                className={`w-9 h-9 rounded-full ${friend.avatarColor || "bg-neutral-700"} text-white font-bold text-xs flex items-center justify-center shadow`}
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

                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-[#00d26a]/10 text-[#00d26a] border border-[#00d26a]/30">
                            {friend.status === "watching" ? "Assistindo" : "Online"}
                          </span>
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

              {/* Sub-aba 2: Pedidos de Amizade */}
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
                    <div className="p-6 text-center text-neutral-400 text-xs bg-[#202020] rounded-xl border border-white/5">
                      Nenhuma solicitação de amizade pendente.
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

              {/* Sub-aba 3: Buscar / Adicionar Amigos */}
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
                                  <p className="text-[11px] text-neutral-400 truncate max-w-[180px]">{user.email}</p>
                                </div>
                              </div>

                              <button
                                onClick={() => handleAddFriend(user.id)}
                                disabled={!!actionFeedback[user.id]}
                                className="px-3 py-1.5 bg-[#E50914] hover:bg-[#E50914]/85 text-white text-xs font-semibold rounded-lg flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                                <span>{actionFeedback[user.id] || "Adicionar"}</span>
                              </button>
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

              {/* Seleção do Filme */}
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
              </div>

              {/* Botão de Criação */}
              <Link
                href={`/watch/${selectedMovieForRoom.slug}?mode=room&room=${newGeneratedRoomCode}`}
                onClick={onClose}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-[#B20710] to-[#E50914] hover:from-[#c20812] hover:to-[#ff2b36] text-white font-bold rounded-xl shadow-lg shadow-[#E50914]/30 transition-all flex items-center justify-center space-x-2 text-xs uppercase tracking-wider cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Iniciar Sala Agora</span>
              </Link>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
