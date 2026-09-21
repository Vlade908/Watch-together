"use client";

import React, { useState } from "react";
import { Users, Wifi, WifiOff, Copy, Check, RefreshCw, ShieldCheck, Crown } from "lucide-react";
import { RoomMember } from "../../types/sync";

interface SyncHUDProps {
  roomId: string;
  isConnected: boolean;
  isSyncing: boolean;
  driftMs: number;
  driftZone: 1 | 2 | 3;
  appliedSpeed: number;
  members: RoomMember[];
  onManualSync?: () => void;
}

export function SyncHUD({
  roomId,
  isConnected,
  isSyncing,
  driftMs,
  driftZone,
  appliedSpeed,
  members,
  onManualSync,
}: SyncHUDProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyRoomLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Renderiza a cor e o status do indicador de drift
  const getStatusDetails = () => {
    if (!isConnected) {
      return {
        color: "bg-red-500",
        text: "Desconectado",
        description: "Reconectando ao gateway...",
        icon: <WifiOff className="w-3.5 h-3.5 text-red-400" />,
      };
    }
    if (isSyncing) {
      return {
        color: "bg-yellow-400",
        text: "Sincronizando...",
        description: "Estimando RTT e offset...",
        icon: <RefreshCw className="w-3.5 h-3.5 text-yellow-400 animate-spin" />,
      };
    }
    if (driftZone === 1) {
      return {
        color: "bg-[#00d26a]",
        text: `Sincronizado (${Math.abs(driftMs)}ms)`,
        description: "Zona 1: Tolerância ativa (1.0x)",
        icon: <Wifi className="w-3.5 h-3.5 text-[#00d26a]" />,
      };
    }
    if (driftZone === 2) {
      return {
        color: "bg-[#38bdf8]",
        text: `Compensando (${appliedSpeed}x · ${Math.abs(driftMs)}ms)`,
        description: driftMs < 0 ? "Aceleração suave de captura" : "Desaceleração suave",
        icon: <RefreshCw className="w-3.5 h-3.5 text-[#38bdf8] animate-spin" />,
      };
    }
    return {
      color: "bg-amber-500",
      text: `Hard Seek (${Math.abs(driftMs)}ms)`,
      description: "Zona 3: Reposicionamento autoritativo",
      icon: <RefreshCw className="w-3.5 h-3.5 text-amber-400" />,
    };
  };

  const status = getStatusDetails();

  // Ordena os membros para garantir que o Host fique sempre no topo
  const sortedMembers = React.useMemo(() => {
    return [...members].sort((a, b) => {
      if (a.isHost && !b.isHost) return -1;
      if (!a.isHost && b.isHost) return 1;
      return 0;
    });
  }, [members]);

  return (
    <div className="absolute top-5 right-5 z-40 select-none">
      {/* Botão Pílula Compacto do HUD */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center space-x-2.5 bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/15 hover:border-white/30 px-3.5 py-1.5 rounded-full cursor-pointer transition-all shadow-xl"
      >
        <span className={`w-2 h-2 rounded-full ${status.color} shadow-sm`} />

        <span className="text-xs font-semibold text-white tracking-tight">
          {status.text}
        </span>

        {/* Avatares Empilhados dos Membros da Sala com destaque dourado para o Host */}
        <div className="flex items-center -space-x-1.5 pl-1.5 border-l border-white/20">
          {sortedMembers.slice(0, 3).map((member, idx) => (
            <div
              key={member.userId || idx}
              title={member.isHost ? `${member.userName} (Host)` : member.userName}
              className={`w-5 h-5 rounded-full bg-neutral-700 flex items-center justify-center text-[9px] font-bold text-white shadow-xs ${
                member.isHost
                  ? "ring-2 ring-amber-400 border border-black z-10"
                  : "border border-black"
              }`}
            >
              {member.userName.charAt(0).toUpperCase()}
            </div>
          ))}
          {sortedMembers.length > 3 && (
            <div className="w-5 h-5 rounded-full bg-neutral-800 border border-black flex items-center justify-center text-[8px] font-bold text-neutral-300">
              +{sortedMembers.length - 3}
            </div>
          )}
        </div>
      </div>

      {/* Painel Expandido com Detalhes da Sessão */}
      {isExpanded && (
        <div className="absolute right-0 mt-3 w-80 bg-[#161616]/95 backdrop-blur-xl border border-white/15 rounded-xl shadow-2xl p-4 text-xs space-y-3.5 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-[#38bdf8]" />
              <span className="font-bold text-white text-sm">Watch Together</span>
            </div>
            <span className="text-[10px] uppercase font-bold text-neutral-400 bg-white/10 px-2 py-0.5 rounded">
              Sub-50ms Sync
            </span>
          </div>

          {/* Status de Sincronização */}
          <div className="p-2.5 rounded-lg bg-black/50 border border-white/5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-neutral-300 font-medium">Estado do Relógio:</span>
              <span className="text-white font-bold">{status.text}</span>
            </div>
            <p className="text-[11px] text-neutral-400">{status.description}</p>
          </div>

          {/* Código da Sala e Botão de Copiar Link */}
          <div className="flex items-center justify-between p-2 rounded bg-black/40 border border-white/5">
            <div>
              <span className="text-[10px] text-neutral-400 block">ID da Sala</span>
              <span className="font-mono font-bold text-white text-xs">{roomId}</span>
            </div>
            <button
              onClick={copyRoomLink}
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-medium text-[11px] transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-green-400" />
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copiar Link</span>
                </>
              )}
            </button>
          </div>

          {/* Lista de Pessoas Conectadas com Host no Topo */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-neutral-400 block">
              Pessoas na Sala ({sortedMembers.length})
            </span>
            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
              {sortedMembers.map((member) => (
                <div
                  key={member.userId}
                  className={`flex items-center justify-between p-2 rounded-lg transition-colors ${
                    member.isHost
                      ? "bg-amber-400/10 border border-amber-400/20"
                      : "bg-white/5 border border-transparent hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow flex-none ${
                        member.isHost
                          ? "bg-amber-500 ring-2 ring-amber-400 ring-offset-2 ring-offset-black"
                          : "bg-blue-600"
                      }`}
                    >
                      {member.userName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-white font-medium text-xs truncate">
                      {member.userName}
                    </span>
                  </div>
                  {member.isHost && (
                    <span className="flex items-center space-x-1 text-[10px] text-amber-300 font-bold bg-amber-400/20 px-2 py-0.5 rounded border border-amber-400/30 flex-none shadow-xs">
                      <Crown className="w-3 h-3 fill-current text-amber-400" />
                      <span>Host</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Botão de Sync Manual */}
          {onManualSync && (
            <button
              onClick={onManualSync}
              className="w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Forçar Sincronização Imediata</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
