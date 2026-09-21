"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Play, Plus, Check, ThumbsUp, Users, ChevronDown, Volume2, VolumeX } from "lucide-react";
import { useCatalog } from "@/context/CatalogContext";

export function FloatingHoverCard() {
  const { hoveredCard, setHoveredCard, openTitleDetails, isInMyList, toggleMyList } = useCatalog();
  const [mounted, setMounted] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (hoveredCard) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsVideoReady(false);
      // Ativa a visibilidade para transição suave de escala
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else {
      setIsVisible(false);
      setIsVideoReady(false);
    }
  }, [hoveredCard]);

  // Reprodução de vídeo com fallback
  useEffect(() => {
    if (hoveredCard && isVisible && videoRef.current) {
      videoRef.current.currentTime = 0;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsVideoReady(true))
          .catch(() => setIsVideoReady(false));
      }
    }
  }, [hoveredCard, isVisible]);

  if (!mounted || !hoveredCard) return null;

  const { title, rect, isFirstInRow, isLastInRow } = hoveredCard;
  const inList = isInMyList(title.id);

  const handleMouseEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setHoveredCard(null);
    }, 180);
  };

  // Ponto de origem do crescimento para evitar sair da viewport nas bordas
  const getTransformOrigin = () => {
    if (isFirstInRow) return "left center";
    if (isLastInRow) return "right center";
    return "center center";
  };

  // Posicionamento absoluto via Portal
  const portalContent = (
    <div
      className="fixed inset-0 pointer-events-none z-[9999]"
      style={{ overflow: "visible" }}
    >
      <div
        className="pointer-events-auto rounded-md overflow-hidden bg-[#181818] shadow-2xl transition-all duration-300 ease-out"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          position: "fixed",
          top: `${rect.top}px`,
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          transformOrigin: getTransformOrigin(),
          transform: isVisible
            ? isFirstInRow
              ? "scale(1.35) translateY(-18%)"
              : isLastInRow
              ? "scale(1.35) translateY(-18%)"
              : "scale(1.35) translateY(-18%)"
            : "scale(1) translateY(0)",
          opacity: isVisible ? 1 : 0,
          boxShadow:
            "0 20px 40px -10px rgba(0,0,0,0.95), 0 10px 20px -5px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.15)",
        }}
      >
        {/* Bloco de Vídeo / Mídia com proporção 16:9 */}
        <div
          className="relative aspect-video w-full overflow-hidden bg-[#181818] cursor-pointer"
          onClick={() => {
            setHoveredCard(null);
            openTitleDetails(title.id);
          }}
        >
          {/* Banner Base de Alta Resolução */}
          <img
            src={title.bannerUrl}
            alt={title.name}
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* Selo N Oficial Netflix */}
          <div className="absolute top-2 left-2.5 z-20 flex items-center justify-center font-black text-sm text-[#E50914] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] select-none">
            N
          </div>

          {/* Vídeo Trailer com transição de opacidade suave */}
          {title.previewVideoUrl && (
            <video
              ref={videoRef}
              src={title.previewVideoUrl}
              poster={title.bannerUrl}
              muted={isMuted}
              loop
              playsInline
              onPlaying={() => setIsVideoReady(true)}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                isVideoReady ? "opacity-100" : "opacity-0"
              }`}
            />
          )}

          {/* Degradê de fusão inferior */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-transparent to-transparent opacity-90" />

          {/* Título sobreposto e botão de som */}
          <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between z-10">
            <span
              className="font-black uppercase tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] text-xs sm:text-sm leading-tight max-w-[80%]"
              style={{
                fontFamily: "'Trebuchet MS', 'Arial Black', sans-serif",
                textShadow: "0 2px 10px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.8)",
              }}
            >
              {title.name}
            </span>

            {title.previewVideoUrl && isVideoReady && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMuted(!isMuted);
                }}
                aria-label={isMuted ? "Ativar som" : "Desativar som"}
                className="w-6 h-6 rounded-full bg-black/70 border border-white/40 text-white flex items-center justify-center hover:bg-black/90 hover:border-white transition-all select-none"
              >
                {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
              </button>
            )}
          </div>
        </div>

        {/* Painel Inferior de Metadados e Controles - Zero corte vertical com padding amplo */}
        <div className="bg-[#181818] px-3.5 pt-3 pb-5 space-y-2.5 select-none">
          {/* Fileira de Ações */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              {/* Botão Play */}
              <Link
                href={`/watch/${title.slug}`}
                onClick={() => setHoveredCard(null)}
                className="w-8 h-8 rounded-full bg-white text-black hover:bg-white/85 flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-md"
                title="Assistir agora"
              >
                <Play className="w-4 h-4 fill-current ml-0.5" />
              </Link>

              {/* Botão Minha Lista */}
              <button
                onClick={() => toggleMyList(title.id)}
                className="w-8 h-8 rounded-full border border-white/40 text-white hover:border-white hover:bg-white/10 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                title={inList ? "Remover da Minha Lista" : "Adicionar à Minha Lista"}
              >
                {inList ? <Check className="w-4 h-4 text-[#46d369]" /> : <Plus className="w-4 h-4" />}
              </button>

              {/* Botão Gostei */}
              <button
                onClick={() => setIsLiked(!isLiked)}
                className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
                  isLiked
                    ? "border-white bg-white text-black"
                    : "border-white/40 text-white hover:border-white hover:bg-white/10"
                }`}
                title="Gostei"
              >
                <ThumbsUp className="w-3.5 h-3.5" />
              </button>

              {/* Botão Watch Together (Sala Compartilhada) */}
              <Link
                href={`/watch/${title.slug}?mode=room`}
                onClick={() => setHoveredCard(null)}
                className="w-8 h-8 rounded-full border border-[#38bdf8]/60 text-[#38bdf8] hover:border-[#38bdf8] hover:bg-[#38bdf8]/15 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                title="Assistir em grupo (Watch Together)"
              >
                <Users className="w-4 h-4" />
              </Link>
            </div>

            {/* Botão Detalhes / Mais Informações */}
            <button
              onClick={() => {
                setHoveredCard(null);
                openTitleDetails(title.id);
              }}
              className="w-8 h-8 rounded-full border border-white/30 text-neutral-300 hover:border-white hover:text-white hover:bg-white/10 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              title="Mais detalhes"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Metadados Oficiais: Match, Faixa Etária, Duração e Selo 4K */}
          <div className="flex items-center space-x-2 text-[11px] font-semibold">
            <span className="text-[#46d369] font-bold">{title.matchPercentage}% relevante</span>
            <span className="border border-neutral-500 text-neutral-200 px-1 py-0.2 text-[9px] rounded-xs">
              {title.ageRating}+
            </span>
            <span className="text-neutral-300">
              {title.durationMinutes
                ? `${Math.floor(title.durationMinutes / 60)}h ${title.durationMinutes % 60}m`
                : `${title.totalSeasons} Temporadas`}
            </span>
            <span className="border border-white/40 text-white text-[8px] font-bold px-1 py-0.2 rounded-xs">
              4K Ultra HD
            </span>
          </div>

          {/* Tags de Gêneros com Separador Bullet */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-300 leading-tight">
            {title.genres.map((genre, idx) => (
              <React.Fragment key={genre}>
                <span className="hover:text-white transition-colors">{genre}</span>
                {idx < title.genres.length - 1 && (
                  <span className="text-neutral-600 font-bold">&bull;</span>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Badge Social de Amigos se houver */}
          {title.friendsWatchedCount && title.friendsWatchedCount > 0 && (
            <div className="pt-0.5 flex items-center space-x-1.5 text-[10px] text-[#38bdf8] font-medium">
              <Users className="w-3 h-3" />
              <span>{title.friendsWatchedCount} amigos assistiram recentemente</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(portalContent, document.body);
}
