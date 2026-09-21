"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Users, X, Play, Plus, Radio, Check, Copy, Sparkles, Send } from "lucide-react";
import { CATALOG_DATA, CatalogTitle } from "@/data/mockCatalog";
import { useSocial } from "@/context/SocialContext";

interface SocialDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "friends" | "rooms" | "create";
}

export function SocialDrawer({ isOpen, onClose, defaultTab = "friends" }: SocialDrawerProps) {
  const { onlineUsers, activeRooms, sendInvite, currentUser } = useSocial();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"friends" | "rooms" | "create">(defaultTab);
  const [selectedMovieForRoom, setSelectedMovieForRoom] = useState<CatalogTitle>(CATALOG_DATA[0]);
  const [roomType, setRoomType] = useState<"friends" | "public">("friends");
  const [hostOnlyControls, setHostOnlyControls] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab, isOpen]);

  // Trava a rolagem da página quando a gaveta estiver aberta
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  const copyInviteLink = (code: string, slug?: string) => {
    const targetSlug = slug || selectedMovieForRoom.slug;
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    navigator.clipboard.writeText(`${origin}/watch/${targetSlug}?mode=room&room=${code}`);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handleSendInviteToFriend = (friendUserId: string) => {
    // Sala de destino padrão ou a sala atual do usuário
    const targetRoomId = currentUser.roomId || `sala-${selectedMovieForRoom.slug}`;
    sendInvite(
      friendUserId,
      targetRoomId,
      selectedMovieForRoom.slug,
      selectedMovieForRoom.name,
      selectedMovieForRoom.bannerUrl
    );

    setInvitedUserIds((prev) => new Set(prev).add(friendUserId));
    setTimeout(() => {
      setInvitedUserIds((prev) => {
        const next = new Set(prev);
        next.delete(friendUserId);
        return next;
      });
    }, 4000);
  };

  // Código aleatório único para a nova sala
  const newGeneratedRoomCode = `sala-${selectedMovieForRoom.slug}-${Math.random().toString(36).substring(2, 6)}`;

  const drawerContent = (
    <div className="select-none">
      {/* 1. Backdrop de fundo escuro fixo na viewport */}
      <div
        className="fixed inset-0 h-screen w-screen bg-black/70 backdrop-blur-sm z-[9998] transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 2. Container da Gaveta Fixo na Viewport (Direita) */}
      <aside
        className="fixed top-0 right-0 bottom-0 h-screen w-full sm:w-[420px] max-w-[90vw] z-[9999] bg-[#181818] border-l border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 ease-out"
        role="dialog"
        aria-modal="true"
        aria-label="Watch Together Hub"
      >
        {/* Cabeçalho Fixo no Topo do Drawer */}
        <div className="flex-none p-5 border-b border-white/10 flex items-center justify-between bg-[#1c1c1c]">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-[#E50914]/20 border border-[#E50914]/30 flex items-center justify-center">
              <Users className="w-4 h-4 text-[#38bdf8]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                <span>Watch Together Hub</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#38bdf8]/20 text-[#38bdf8] font-bold border border-[#38bdf8]/30">
                  LIVE
                </span>
              </h2>
              <p className="text-xs text-neutral-400">Salas em grupo com sincronização sub-segundo</p>
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

        {/* Abas de Navegação Fixas */}
        <div className="flex-none flex border-b border-white/10 bg-[#161616] px-4 pt-2">
          <button
            onClick={() => setActiveTab("friends")}
            className={`flex-1 pb-3 text-xs font-semibold border-b-2 transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === "friends"
                ? "border-[#38bdf8] text-white"
                : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Amigos ({onlineUsers.length})</span>
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
            <span>Salas Ativas ({activeRooms.length})</span>
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

        {/* 3. Corpo com Rolagem Vertical Independente */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent">
          {/* ABA 1: AMIGOS ONLINE */}
          {activeTab === "friends" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>Amigos na sua rede</span>
                <span className="text-[#00d26a] flex items-center gap-1 font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#00d26a] animate-pulse" /> {onlineUsers.length} conectados
                </span>
              </div>

              <div className="space-y-3">
                {onlineUsers.length === 0 ? (
                  <div className="p-6 text-center text-neutral-400 text-xs bg-[#202020] rounded-lg">
                    Nenhum outro amigo conectado no momento. Abra outra aba ou convide amigos para assistir!
                  </div>
                ) : (
                  onlineUsers.map((friend) => (
                    <div
                      key={friend.userId}
                      className="p-3.5 rounded-lg bg-[#202020] border border-white/5 hover:border-white/15 transition-all space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="relative">
                            <div
                              className={`w-9 h-9 rounded-full ${friend.avatarColor || "bg-neutral-700"} text-white font-bold text-xs flex items-center justify-center shadow`}
                            >
                              {friend.initials || "US"}
                            </div>
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#00d26a] ring-2 ring-[#202020]" />
                          </div>

                          <div>
                            <p className="text-sm font-semibold text-white">{friend.userName}</p>
                            <p className="text-[11px] text-neutral-400">{friend.device || "Navegador"}</p>
                          </div>
                        </div>

                        {friend.status === "watching" && friend.watchingTitle ? (
                          <Link
                            href={`/watch/${friend.watchingTitle.slug}?mode=room&room=${friend.roomId || "sala"}`}
                            onClick={onClose}
                            className="px-3 py-1.5 rounded-full bg-[#38bdf8] text-black font-bold text-xs hover:bg-[#38bdf8]/85 flex items-center space-x-1 transition-transform active:scale-95 shadow cursor-pointer"
                          >
                            <Play className="w-3 h-3 fill-current ml-0.5" />
                            <span>Entrar</span>
                          </Link>
                        ) : (
                          <button
                            onClick={() => handleSendInviteToFriend(friend.userId)}
                            disabled={invitedUserIds.has(friend.userId)}
                            className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all active:scale-95 cursor-pointer flex items-center space-x-1 ${
                              invitedUserIds.has(friend.userId)
                                ? "bg-green-500/20 border-green-500/40 text-green-400 cursor-default"
                                : "border-white/30 text-white hover:border-white hover:bg-white/10"
                            }`}
                          >
                            {invitedUserIds.has(friend.userId) ? (
                              <>
                                <Check className="w-3 h-3 text-green-400" />
                                <span>Enviado!</span>
                              </>
                            ) : (
                              <>
                                <Send className="w-3 h-3" />
                                <span>Convidar</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {/* Título que o amigo está assistindo agora */}
                      {friend.status === "watching" && friend.watchingTitle && (
                        <div className="flex items-center space-x-3 p-2 rounded bg-black/50 border border-white/5">
                          <img
                            src={friend.watchingTitle.bannerUrl}
                            alt={friend.watchingTitle.name}
                            className="w-14 aspect-video rounded object-cover flex-none"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] uppercase font-bold text-[#38bdf8] flex items-center gap-1">
                              <Radio className="w-2.5 h-2.5 animate-pulse" /> Assistindo Agora
                            </p>
                            <p className="text-xs font-bold text-white truncate">{friend.watchingTitle.name}</p>
                            <p className="text-[10px] text-neutral-400 font-mono">Sala: {friend.roomId}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ABA 2: SALAS ATIVAS */}
          {activeTab === "rooms" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>Salas abertas da comunidade</span>
                <span className="text-[#38bdf8] font-medium">{activeRooms.length} ativas</span>
              </div>

              <div className="space-y-3.5">
                {activeRooms.map((room) => (
                  <div
                    key={room.code}
                    className="p-4 rounded-xl bg-[#202020] border border-white/10 hover:border-white/20 transition-all space-y-3"
                  >
                    <div className="flex items-start space-x-3">
                      <img
                        src={room.title.bannerUrl}
                        alt={room.title.name}
                        className="w-20 aspect-video rounded-md object-cover flex-none shadow-md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#46d369]">
                            Em Reprodução
                          </span>
                          <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-neutral-300">
                            {room.participantsCount}/{room.maxParticipants} pessoas
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-white truncate mt-0.5">{room.title.name}</h3>
                        <p className="text-[11px] text-neutral-400">Anfitrião: {room.hostName}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
                      <span className="text-[10px] text-neutral-400 font-mono">{room.syncQuality}</span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => copyInviteLink(room.code, room.title.slug)}
                          className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                          title="Copiar link da sala"
                        >
                          {copiedCode === room.code ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>

                        <Link
                          href={`/watch/${room.title.slug}?mode=room&room=${room.code}`}
                          onClick={onClose}
                          className="px-4 py-1.5 rounded-full bg-[#E50914] text-white font-bold text-xs hover:bg-[#E50914]/85 transition-all shadow-md flex items-center space-x-1 cursor-pointer"
                        >
                          <Play className="w-3 h-3 fill-current ml-0.5" />
                          <span>Entrar</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ABA 3: CRIAR NOVA SALA */}
          {activeTab === "create" && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-[#202020] border border-white/10 space-y-3">
                <label className="text-xs font-bold text-white block">1. Selecione o Filme ou Série</label>
                <select
                  value={selectedMovieForRoom.id}
                  onChange={(e) => {
                    const found = CATALOG_DATA.find((t) => t.id === e.target.value);
                    if (found) setSelectedMovieForRoom(found);
                  }}
                  className="w-full bg-black/60 border border-white/20 rounded p-2 text-xs text-white focus:outline-none focus:border-white cursor-pointer"
                >
                  {CATALOG_DATA.map((item) => (
                    <option key={item.id} value={item.id} className="bg-[#181818] text-white">
                      {item.name} ({item.releaseYear} - {item.type === "SERIES" ? `${item.totalSeasons} Temporadas` : "Filme"})
                    </option>
                  ))}
                </select>

                <div className="flex items-center space-x-3 pt-2">
                  <img
                    src={selectedMovieForRoom.bannerUrl}
                    alt={selectedMovieForRoom.name}
                    className="w-20 aspect-video rounded object-cover shadow"
                  />
                  <div>
                    <p className="text-xs font-bold text-white">{selectedMovieForRoom.name}</p>
                    <p className="text-[10px] text-neutral-400 line-clamp-2">{selectedMovieForRoom.synopsis}</p>
                  </div>
                </div>
              </div>

              {/* Configurações de Privacidade */}
              <div className="p-3.5 rounded-lg bg-[#202020] border border-white/10 space-y-2.5 text-xs">
                <label className="font-bold text-white block">2. Visibilidade da Sessão</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRoomType("friends")}
                    className={`p-2.5 rounded text-left border transition-all cursor-pointer ${
                      roomType === "friends"
                        ? "border-[#38bdf8] bg-[#38bdf8]/10 text-white font-bold"
                        : "border-white/10 text-neutral-400 hover:text-white"
                    }`}
                  >
                    <Users className="w-4 h-4 mb-1 text-[#38bdf8]" />
                    <p className="text-xs">Apenas Amigos</p>
                    <p className="text-[10px] font-normal text-neutral-400">Acesso por convite</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRoomType("public")}
                    className={`p-2.5 rounded text-left border transition-all cursor-pointer ${
                      roomType === "public"
                        ? "border-[#00d26a] bg-[#00d26a]/10 text-white font-bold"
                        : "border-white/10 text-neutral-400 hover:text-white"
                    }`}
                  >
                    <Radio className="w-4 h-4 mb-1 text-[#00d26a]" />
                    <p className="text-xs">Sala Aberta</p>
                    <p className="text-[10px] font-normal text-neutral-400">Visível no hub</p>
                  </button>
                </div>
              </div>

              {/* Controle de Reprodução */}
              <div className="p-3.5 rounded-lg bg-[#202020] border border-white/10 space-y-2.5 text-xs">
                <label className="font-bold text-white block">3. Permissões de Reprodução</label>
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hostOnlyControls}
                    onChange={(e) => setHostOnlyControls(e.target.checked)}
                    className="rounded bg-black border-white/40 text-[#E50914] focus:ring-0 cursor-pointer"
                  />
                  <div>
                    <p className="text-white font-medium">Apenas o Anfitrião pode pausar/avançar</p>
                    <p className="text-[10px] text-neutral-400">Evita pausas acidentais por convidados</p>
                  </div>
                </label>
              </div>

              {/* Botão de Criação */}
              <div className="pt-2">
                <Link
                  href={`/watch/${selectedMovieForRoom.slug}?mode=room&room=${newGeneratedRoomCode}&created=true`}
                  onClick={onClose}
                  className="w-full py-3 rounded-lg bg-[#E50914] hover:bg-[#E50914]/85 text-white font-bold text-sm shadow-xl flex items-center justify-center space-x-2 transition-transform active:scale-98 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Iniciar Sala de Reprodução</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );

  return createPortal(drawerContent, document.body);
}
