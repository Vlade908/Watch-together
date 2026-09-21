"use client";

import React, { useState, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { Users, Crown, LogOut, Plus, Sparkles, X, ChevronUp, ChevronDown } from "lucide-react";
import { useSocial } from "@/context/SocialContext";
import { useAuth } from "@/context/AuthContext";

interface PartyHUDProps {
  onOpenSocialDrawer?: () => void;
}

export function PartyHUD({ onOpenSocialDrawer }: PartyHUDProps) {
  const {
    currentParty,
    isPartyHost,
    leaveParty,
    latestPartyInviteToast,
    acceptPartyInvite,
    declinePartyInvite,
    dismissPartyToast,
  } = useSocial();

  const { isAuthenticated } = useAuth();
  const pathname = usePathname();
  const isWatchPage = pathname?.startsWith("/watch");

  const [isMinimized, setIsMinimized] = useState(false);
  const [playerControlsVisible, setPlayerControlsVisible] = useState(true);

  // Escuta evento de visibilidade dos controles nativos do VideoPlayer
  useEffect(() => {
    if (!isWatchPage) {
      setPlayerControlsVisible(true);
      return;
    }

    const handleControlsChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ visible: boolean }>;
      if (typeof customEvent.detail?.visible === "boolean") {
        setPlayerControlsVisible(customEvent.detail.visible);
      }
    };

    window.addEventListener("watch-controls-visible", handleControlsChange);
    return () => {
      window.removeEventListener("watch-controls-visible", handleControlsChange);
    };
  }, [isWatchPage]);

  // Garante que o Host seja sempre renderizado na primeira posição (topo da lista)
  const sortedMembers = useMemo(() => {
    if (!currentParty) return [];
    return [...currentParty.members].sort((a, b) => {
      const aIsHost = a.role === "HOST" || a.userId === currentParty.hostId;
      const bIsHost = b.role === "HOST" || b.userId === currentParty.hostId;
      if (aIsHost && !bIsHost) return -1;
      if (!aIsHost && bIsHost) return 1;
      return a.joinedAt - b.joinedAt;
    });
  }, [currentParty]);

  // Oculta completamente o PartyHUD na rota /watch para evitar duplicação com o SyncHUD do player
  if (!isAuthenticated || isWatchPage) return null;

  return (
    <>
      {/* Toast flutuante de convite para Watch Party Lobby */}
      {latestPartyInviteToast && (
        <aside
          aria-label="Convite para Grupo Watch Together"
          className="fixed top-20 right-4 sm:right-8 z-[10001] max-w-sm w-full bg-[#181818]/95 border border-[#E50914]/50 shadow-2xl shadow-black/80 rounded-2xl p-4 flex items-start space-x-3.5 animate-in slide-in-from-top-4 duration-300 backdrop-blur-xl select-none"
        >
          <div className="w-10 h-10 rounded-xl bg-[#E50914]/20 border border-[#E50914]/40 flex items-center justify-center flex-none text-[#E50914]">
            <Sparkles className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-[#E50914]">
                Convite de Grupo
              </span>
              <button
                onClick={dismissPartyToast}
                className="text-neutral-500 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs font-bold text-white truncate mt-0.5">
              {latestPartyInviteToast.hostUser.name} convidou você!
            </p>
            <p className="text-[11px] text-neutral-300 mt-0.5">
              Junte-se ao lobby para assistir filmes juntos em tempo real.
            </p>

            <div className="flex items-center space-x-2 mt-3">
              <button
                onClick={() => acceptPartyInvite(latestPartyInviteToast)}
                className="px-3.5 py-1.5 rounded-lg bg-[#E50914] hover:bg-[#E50914]/85 text-white font-bold text-xs transition-colors cursor-pointer shadow-md shadow-[#E50914]/30"
              >
                Entrar no Grupo
              </button>
              <button
                onClick={() => declinePartyInvite(latestPartyInviteToast.partyId)}
                className="px-2.5 py-1.5 text-neutral-400 hover:text-neutral-200 text-xs transition-colors cursor-pointer"
              >
                Recusar
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Floating Lobby Bar (PartyHUD) */}
      {currentParty && (
        <aside
          aria-label="Barra do Grupo Watch Party"
          className={`fixed bottom-5 right-5 z-[9990] transition-all duration-300 ease-out select-none ${
            isMinimized ? "w-auto" : "w-full max-w-sm"
          } ${
            isWatchPage && !playerControlsVisible
              ? "opacity-0 pointer-events-none translate-y-2"
              : "opacity-100 pointer-events-auto translate-y-0"
          }`}
        >
          <div className="bg-[#141414]/90 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden ring-1 ring-[#E50914]/30">
            {/* Header do HUD */}
            <div className="px-4 py-3 bg-[#1e1e1e]/80 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#B20710] to-[#E50914] flex items-center justify-center text-white flex-none shadow-md">
                  <Users className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#00d26a] animate-pulse flex-none" />
                    <h3 className="text-xs font-bold text-white truncate">
                      {isPartyHost ? "Seu Grupo (Líder)" : `Grupo de ${currentParty.hostName}`}
                    </h3>
                  </div>
                  <p className="text-[10px] text-neutral-400 truncate">
                    {currentParty.members.length} {currentParty.members.length === 1 ? "membro" : "membros"} conectados
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="w-6 h-6 rounded-md hover:bg-white/10 text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  title={isMinimized ? "Expandir" : "Minimizar"}
                >
                  {isMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={leaveParty}
                  className="w-6 h-6 rounded-md hover:bg-red-500/20 text-red-400 hover:text-red-300 flex items-center justify-center transition-colors cursor-pointer"
                  title="Sair do Grupo"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Corpo do HUD Expandido */}
            {!isMinimized && (
              <div className="p-3.5 space-y-3">
                {/* Lista de Membros com Host sempre no topo e contorno dourado */}
                <div className="space-y-1.5 max-h-36 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-700">
                  {sortedMembers.map((member) => {
                    const isHost = member.role === "HOST" || member.userId === currentParty.hostId;
                    return (
                      <div
                        key={member.userId}
                        className={`flex items-center justify-between p-2 rounded-xl transition-colors ${
                          isHost
                            ? "bg-amber-400/10 border border-amber-400/20"
                            : "bg-[#202020]/60 border border-white/5"
                        } text-xs`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <div className="relative flex-none">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black ${
                                isHost
                                  ? "bg-amber-500 text-black ring-2 ring-amber-400 ring-offset-2 ring-offset-[#141414]"
                                  : "bg-[#E50914] text-white"
                              }`}
                            >
                              {member.name.substring(0, 2).toUpperCase()}
                            </div>
                            {isHost && (
                              <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-amber-400 flex items-center justify-center text-black shadow">
                                <Crown className="w-2.5 h-2.5 fill-current" />
                              </div>
                            )}
                          </div>
                          <span className="text-white font-medium truncate">{member.name}</span>
                        </div>

                        {isHost ? (
                          <span className="flex items-center space-x-1 text-[9px] font-bold px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 flex-none shadow-xs">
                            <Crown className="w-2.5 h-2.5 fill-current" />
                            <span>Host</span>
                          </span>
                        ) : (
                          <span className="text-[9px] text-[#00d26a] font-medium flex-none">Conectado</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Status / Ação do Host */}
                <div className="p-2.5 rounded-xl bg-gradient-to-r from-[#E50914]/10 to-transparent border border-[#E50914]/20 text-[11px] text-neutral-300 flex items-start space-x-2">
                  <Sparkles className="w-4 h-4 text-[#E50914] flex-none mt-0.5" />
                  <div>
                    {isPartyHost ? (
                      <p>
                        <strong className="text-white">Follow-the-Host ativo:</strong> Escolha qualquer filme no catálogo e dê Play para iniciar a reprodução sincronizada para todos.
                      </p>
                    ) : (
                      <p>
                        Você está acompanhando o Líder <strong className="text-white">{currentParty.hostName}</strong>. Quando ele der Play em um filme, você será levado junto automaticamente.
                      </p>
                    )}
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="flex items-center space-x-2 pt-1">
                  {onOpenSocialDrawer && (
                    <button
                      onClick={onOpenSocialDrawer}
                      className="flex-1 py-1.5 px-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg flex items-center justify-center space-x-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Convidar Amigos</span>
                    </button>
                  )}
                  <button
                    onClick={leaveParty}
                    className="py-1.5 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Sair
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
