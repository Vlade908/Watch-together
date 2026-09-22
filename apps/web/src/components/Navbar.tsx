"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Search, Bell, Users, ChevronDown, X, Film, LogOut, Settings, User } from "lucide-react";
import { SocialDrawer } from "./SocialDrawer";
import { useSocial } from "@/context/SocialContext";
import { useAuth } from "@/context/AuthContext";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isSocialDrawerOpen, setIsSocialDrawerOpen] = useState(false);
  const [socialDrawerTab, setSocialDrawerTab] = useState<"friends" | "rooms" | "create">("friends");

  const {
    currentUser,
    onlineUsers,
    invitations,
    unreadInvitesCount,
    latestInviteToast,
    acceptInvite,
    dismissInvite,
    markAllInvitesAsRead,
    dismissToast,
  } = useSocial();

  const { user: authUser, isAuthenticated, logout } = useAuth();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);

  // Formata tempo relativo em português
  const formatTimeAgo = (timestamp: number) => {
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 60) return "Agora mesmo";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Há ${diffMin} min`;
    const diffHours = Math.floor(diffMin / 60);
    return `Há ${diffHours} h`;
  };

  // Detecta rolagem para alterar transparência da navbar
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 25);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Foco no input de busca ao abrir
  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  // Fechar menus ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
      if (notifMenuRef.current && !notifMenuRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      {/* Toast flutuante de convite recebido em tempo real */}
      {latestInviteToast && (
        <aside
          aria-label="Notificação de convite"
          className="fixed top-20 right-4 sm:right-8 z-[10000] max-w-sm w-full bg-[#1e1e1e] border border-[#38bdf8]/40 shadow-2xl rounded-xl p-4 flex items-start space-x-3 animate-in slide-in-from-top-4 duration-300 backdrop-blur-md"
        >
          <div className="w-10 h-10 rounded-full bg-[#38bdf8]/20 border border-[#38bdf8]/40 flex items-center justify-center flex-none">
            <Users className="w-5 h-5 text-[#38bdf8]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[#38bdf8] uppercase tracking-wider">Convite Watch Together</p>
            <p className="text-xs font-semibold text-white truncate">
              {latestInviteToast.fromUser.userName} convidou você!
            </p>
            <p className="text-[11px] text-neutral-300 truncate">
              {latestInviteToast.movieTitle}
            </p>
            <div className="flex items-center space-x-2 mt-2">
              <button
                onClick={() => acceptInvite(latestInviteToast)}
                className="px-3 py-1 rounded bg-[#E50914] hover:bg-[#E50914]/85 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Entrar na Sala
              </button>
              <button
                onClick={dismissToast}
                className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-neutral-300 text-xs transition-colors cursor-pointer"
              >
                Depois
              </button>
            </div>
          </div>
          <button
            onClick={dismissToast}
            className="text-neutral-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </aside>
      )}

      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-500 ease-in-out ${
          isScrolled
            ? "bg-[#141414]/95 backdrop-blur-md shadow-xl border-b border-white/5"
            : "bg-gradient-to-b from-black/80 via-black/40 to-transparent"
        }`}
      >
        <div className="max-w-[1720px] mx-auto px-4 sm:px-8 md:px-12 h-16 sm:h-18 flex items-center justify-between">
          {/* Esquerda: Logo & Menus */}
          <div className="flex items-center space-x-4 lg:space-x-8">
            {/* Logo Estilizado Netflix Grade */}
            <Link href="/" className="flex items-center space-x-1.5 focus:outline-none">
              <span className="text-2xl sm:text-3xl font-black tracking-tighter text-[#E50914] select-none hover:opacity-95 transition-opacity">
                POBREFLIX
              </span>
              <span className="hidden sm:inline-block text-[10px] uppercase font-extrabold tracking-widest px-1.5 py-0.5 rounded bg-[#E50914]/20 text-[#E50914] border border-[#E50914]/40 ml-1">
                Together
              </span>
            </Link>

            {/* Navegação Desktop */}
            <nav className="hidden md:flex items-center space-x-5 text-sm font-normal text-[#e5e5e5]">
              <Link
                href="/"
                className="text-white font-bold transition-colors hover:text-white"
              >
                Início
              </Link>
              <Link href="/series" prefetch={false} className="text-[#b3b3b3] hover:text-[#e5e5e5] transition-colors">
                Séries
              </Link>
              <Link href="/filmes" prefetch={false} className="text-[#b3b3b3] hover:text-[#e5e5e5] transition-colors">
                Filmes
              </Link>
              <Link href="/bombando" prefetch={false} className="text-[#b3b3b3] hover:text-[#e5e5e5] transition-colors">
                Bombando
              </Link>
              <Link href="/minha-lista" prefetch={false} className="text-[#b3b3b3] hover:text-[#e5e5e5] transition-colors">
                Minha Lista
              </Link>
              <button
                onClick={() => {
                  setSocialDrawerTab("rooms");
                  setIsSocialDrawerOpen(true);
                }}
                className="flex items-center space-x-1.5 text-[#e5e5e5] hover:text-white font-semibold transition-colors group cursor-pointer"
              >
                <Users className="w-4 h-4 text-[#38bdf8] group-hover:scale-110 transition-transform" />
                <span>Watch Together</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#00d26a]" title="Salas ativas disponíveis" />
              </button>
            </nav>
          </div>

          {/* Direita: Busca, Notificações & Perfil */}
          <div className="flex items-center space-x-4 sm:space-x-6 text-white text-sm">
            {/* Busca Expansível */}
            <div className="relative flex items-center">
              {isSearchOpen ? (
                <div className="flex items-center bg-black/90 border border-white/80 rounded-sm px-2.5 py-1 transition-all duration-300 w-48 sm:w-64">
                  <Search className="w-4 h-4 text-white/70 flex-none mr-2" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Títulos, gêneros, amigos..."
                    className="bg-transparent text-white text-xs w-full focus:outline-none placeholder:text-neutral-500"
                  />
                  {searchQuery ? (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="text-neutral-400 hover:text-white p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsSearchOpen(false)}
                      className="text-neutral-400 hover:text-white p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setIsSearchOpen(true)}
                  aria-label="Buscar títulos"
                  className="hover:text-neutral-300 transition-colors p-1"
                >
                  <Search className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Social / Amigos Online Badge Interativo com Dados Reais */}
            <button
              onClick={() => {
                setSocialDrawerTab("friends");
                setIsSocialDrawerOpen(true);
              }}
              className="hidden lg:flex items-center space-x-2 text-xs text-neutral-300 hover:text-white bg-[#242424]/80 hover:bg-[#2e2e2e] px-2.5 py-1 rounded border border-white/10 hover:border-white/25 transition-all cursor-pointer"
              title="Ver amigos conectados e salas em tempo real"
            >
              <span className="w-2 h-2 rounded-full bg-[#00d26a] animate-pulse" />
              <span className="font-medium">
                {onlineUsers.length} {onlineUsers.length === 1 ? "amigo online" : "amigos online"}
              </span>
            </button>

            {/* Sino de Notificações com Dropdown & Badge Dinâmico */}
            <div className="relative" ref={notifMenuRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                aria-label="Notificações"
                className="relative hover:text-neutral-300 transition-colors p-1 cursor-pointer"
              >
                <Bell className="w-5 h-5" />
                {unreadInvitesCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#E50914] text-[10px] font-bold flex items-center justify-center text-white shadow">
                    {unreadInvitesCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-[#181818] border border-white/15 rounded-lg shadow-2xl p-3 z-50 text-xs space-y-2.5 animate-in fade-in zoom-in-95 duration-200">
                  <div className="text-white font-bold pb-2 border-b border-white/10 flex justify-between items-center">
                    <span className="flex items-center gap-1.5">
                      <span>Notificações & Convites</span>
                      {unreadInvitesCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded bg-[#E50914]/30 text-[#ff4c57] text-[10px] font-bold">
                          {unreadInvitesCount} novas
                        </span>
                      )}
                    </span>
                    <button
                      onClick={markAllInvitesAsRead}
                      className="text-[11px] text-neutral-400 hover:text-white cursor-pointer transition-colors"
                    >
                      Marcar lidas
                    </button>
                  </div>

                  {invitations.length === 0 ? (
                    <div className="p-4 text-center text-neutral-400 text-xs">
                      Nenhuma notificação no momento.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
                      {invitations.map((invite) => (
                        <div
                          key={invite.inviteId}
                          className={`p-3 rounded-lg border transition-all ${
                            !invite.read
                              ? "bg-white/10 border-[#38bdf8]/40"
                              : "bg-white/5 border-transparent hover:bg-white/10"
                          }`}
                        >
                          <div className="flex items-start space-x-3">
                            <div className="w-8 h-8 rounded-full bg-[#E50914]/20 border border-[#E50914]/30 flex items-center justify-center flex-none font-bold text-xs text-[#38bdf8]">
                              {invite.fromUser.initials || "WT"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-semibold truncate">
                                {invite.fromUser.userName} convidou você
                              </p>
                              <p className="text-neutral-300 text-[11px] truncate">
                                "{invite.movieTitle}"
                              </p>
                              <span className="text-[10px] text-neutral-400 block mt-0.5">
                                {formatTimeAgo(invite.timestamp)}
                              </span>

                              <div className="flex items-center space-x-2 mt-2">
                                <button
                                  onClick={() => {
                                    setShowNotifications(false);
                                    acceptInvite(invite);
                                  }}
                                  className="px-3 py-1 rounded bg-[#E50914] hover:bg-[#E50914]/85 text-white font-bold text-xs transition-colors cursor-pointer"
                                >
                                  Entrar na Sala
                                </button>
                                <button
                                  onClick={() => dismissInvite(invite.inviteId)}
                                  className="px-2 py-1 text-neutral-400 hover:text-neutral-200 text-xs cursor-pointer"
                                >
                                  Dispensar
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Menu de Perfil / Avatar ou Botão de Login */}
            {isAuthenticated && authUser ? (
              <div className="relative" ref={profileMenuRef}>
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="flex items-center space-x-1.5 focus:outline-none group cursor-pointer"
                >
                  <div className="w-8 h-8 rounded bg-[#e50914] flex items-center justify-center text-white font-black text-xs shadow">
                    {(authUser.name || "U").substring(0, 2).toUpperCase()}
                  </div>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-neutral-400 group-hover:text-white transition-transform duration-300 ${
                      showProfileMenu ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {showProfileMenu && (
                  <div className="absolute right-0 mt-3 w-56 bg-[#181818] border border-white/15 rounded shadow-2xl py-2 z-50 text-xs space-y-1 animate-in fade-in zoom-in-95 duration-200">
                    <div className="px-4 py-2 border-b border-white/10">
                      <p className="text-white font-bold">{authUser.name}</p>
                      <p className="text-neutral-400 text-[11px] truncate">{authUser.email}</p>
                    </div>

                    <div className="px-2 py-1">
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          setSocialDrawerTab("friends");
                          setIsSocialDrawerOpen(true);
                        }}
                        className="w-full flex items-center space-x-2.5 px-3 py-2 rounded text-neutral-300 hover:text-white hover:bg-white/10 transition-colors text-left cursor-pointer"
                      >
                        <Users className="w-4 h-4 text-[#38bdf8]" />
                        <span>Amigos & Salas</span>
                      </button>
                    </div>

                    <div className="border-t border-white/10 pt-1 px-2">
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          logout();
                        }}
                        className="w-full flex items-center space-x-2.5 px-3 py-2 rounded text-[#E50914] hover:bg-[#E50914]/10 transition-colors text-left font-semibold cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sair da Conta</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Link
                  href="/login"
                  className="px-4 py-1.5 rounded-md bg-[#E50914] hover:bg-[#E50914]/90 text-white font-bold text-xs shadow-md shadow-[#E50914]/30 transition-all duration-200 cursor-pointer"
                >
                  Entrar
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Hub Interativo Watch Together: Amigos Conectados, Salas Ao Vivo & Criador de Sessão */}
        <SocialDrawer
          isOpen={isSocialDrawerOpen}
          onClose={() => setIsSocialDrawerOpen(false)}
          defaultTab={socialDrawerTab}
        />
      </header>
    </>
  );
}

