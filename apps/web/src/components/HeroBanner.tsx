"use client";

import React, { useRef, useEffect, useState } from "react";
import Link from "next/link";
import { Play, Info, Volume2, VolumeX } from "lucide-react";
import { CatalogTitle } from "@/data/mockCatalog";
import { useCatalog } from "@/context/CatalogContext";

interface HeroBannerProps {
  title: CatalogTitle;
}

export function HeroBanner({ title }: HeroBannerProps) {
  const { openTitleDetails, isMutedGlobal, toggleGlobalMute } = useCatalog();
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsVideoLoaded(true))
          .catch(() => setIsVideoLoaded(false));
      }
    }
  }, []);

  return (
    <div className="relative w-full h-[85vh] min-h-[640px] max-h-[960px] overflow-hidden select-none bg-[#141414]">
      {/* 1. Mídia de Fundo: Iluminação Dramática com Personagem/Arte à Direita */}
      <div className="absolute inset-0 w-full h-full">
        {/* Imagem de Alta Resolução Base */}
        <img
          src={title.bannerUrl}
          alt={title.name}
          className="w-full h-full object-cover object-[center_25%] sm:object-[center_20%] scale-100 transition-transform duration-1000"
        />

        {/* Trailer em Vídeo de Fundo */}
        {title.previewVideoUrl && (
          <video
            ref={videoRef}
            src={title.previewVideoUrl}
            poster={title.bannerUrl}
            autoPlay
            muted={isMutedGlobal}
            loop
            playsInline
            crossOrigin="anonymous"
            onPlaying={() => setIsVideoLoaded(true)}
            onError={() => setIsVideoLoaded(false)}
            className={`absolute inset-0 w-full h-full object-cover object-[center_20%] transition-opacity duration-1000 ${
              isVideoLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
        )}

        {/* Vinheta Lateral à Esquerda Forte (Garante legibilidade absoluta no lado esquerdo) */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/75 sm:via-[#141414]/50 to-transparent w-full sm:w-[65%]" />

        {/* Vinheta Inferior Profunda (Fusão contínua com as fileiras) */}
        <div className="absolute inset-0 hero-vignette-bottom" />
      </div>

      {/* 2. Conteúdo Ancorado à Esquerda (~38% da tela) */}
      <div className="relative max-w-[1720px] mx-auto px-4 sm:px-8 md:px-12 h-full flex flex-col justify-end pb-36 sm:pb-48 md:pb-52 z-20">
        <div className="w-full sm:w-[50%] lg:w-[38%] min-w-[320px] max-w-[560px] space-y-3.5">
          {/* 1. Selo Superior Oficial: Logo N + S É R I E ou F I L M E */}
          <div className="flex items-center space-x-2">
            <span className="text-[#E50914] font-black text-xl tracking-tighter drop-shadow">N</span>
            <span className="tracking-[0.35em] text-xs font-bold text-white/80 uppercase">
              {title.type === "SERIES" ? "S É R I E" : "F I L M E"}
            </span>
          </div>

          {/* 2. Logotipo do Título em Destaque (Impactante, Caixa Alta) */}
          <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black uppercase tracking-tight text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)] leading-[0.95]">
            {title.name}
          </h1>

          {/* 3. Linha de Metadados: Match Verde, Ano, Duração e Badges 4K/HDR/5.1 */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs sm:text-sm font-semibold text-[#a3a3a3]">
            <span className="text-[#46d369] font-bold">{title.matchPercentage}% relevante</span>
            <span>{title.releaseYear}</span>
            <span className="border border-[#808080] text-white px-1.5 py-0.2 rounded-xs text-[10px]">
              {title.ageRating}+
            </span>
            <span>
              {title.durationMinutes
                ? `${Math.floor(title.durationMinutes / 60)}h ${title.durationMinutes % 60}m`
                : `${title.totalSeasons} Temporadas`}
            </span>
            <span className="border border-white/30 text-white/90 text-[10px] px-1.5 py-0.2 rounded-xs">
              4K Ultra HD
            </span>
            <span className="border border-white/30 text-white/90 text-[10px] px-1.5 py-0.2 rounded-xs">
              5.1
            </span>
            <span className="border border-white/30 text-white/90 text-[10px] px-1.5 py-0.2 rounded-xs">
              HDR
            </span>
          </div>

          {/* 4. Sinopse Concisa Limitada a 3 Linhas */}
          <p className="text-sm sm:text-base text-white/90 leading-relaxed drop-shadow-md line-clamp-3 font-normal max-w-xl">
            {title.synopsis}
          </p>

          {/* 5. Apenas 2 Botões de Ação Oficiais: "Assistir" e "Mais informações" */}
          <div className="flex items-center space-x-3 pt-2">
            {/* Assistir */}
            <Link
              href={`/watch/${title.slug}`}
              className="flex items-center space-x-2.5 px-6 sm:px-8 py-2.5 sm:py-3 rounded bg-white text-black font-bold text-sm sm:text-base hover:bg-white/80 active:scale-95 transition-all shadow-xl select-none"
            >
              <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
              <span>Assistir</span>
            </Link>

            {/* Mais Informações */}
            <button
              onClick={() => openTitleDetails(title.id)}
              className="flex items-center space-x-2.5 px-6 sm:px-8 py-2.5 sm:py-3 rounded bg-white/30 hover:bg-white/20 backdrop-blur-sm text-white font-bold text-sm sm:text-base transition-all active:scale-95 shadow-xl select-none"
            >
              <Info className="w-5 h-5 sm:w-6 sm:h-6" />
              <span>Mais informações</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Canto Inferior Direito: Controle de Som e Faixa de Classificação */}
      <div className="absolute right-0 bottom-36 sm:bottom-48 flex items-center space-x-3 z-30 select-none">
        {/* Botão de Som */}
        <button
          onClick={toggleGlobalMute}
          aria-label={isMutedGlobal ? "Desmutar som" : "Mutar som"}
          className="w-10 h-10 rounded-full border border-white/40 bg-black/40 hover:bg-white/10 text-white backdrop-blur-sm flex items-center justify-center transition-all mr-2"
        >
          {isMutedGlobal ? (
            <VolumeX className="w-5 h-5 text-white/90" />
          ) : (
            <Volume2 className="w-5 h-5 text-white/90" />
          )}
        </button>

        {/* Faixa Vertical Indicativa Netflix */}
        <div className="bg-black/60 border-l-3 border-[#dcdcdc] text-white text-xs sm:text-sm font-semibold pl-3 pr-6 py-1 backdrop-blur-xs flex items-center">
          <span>{title.ageRating}+</span>
        </div>
      </div>
    </div>
  );
}
