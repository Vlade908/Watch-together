"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  X,
  Play,
  Plus,
  Check,
  ThumbsUp,
  Users,
  Volume2,
  VolumeX,
  ChevronDown,
} from "lucide-react";
import { useCatalog } from "@/context/CatalogContext";
import { CATALOG_DATA, CatalogTitle } from "@/data/mockCatalog";

export function TitleModal() {
  const { selectedTitle, closeTitleDetails, isInMyList, toggleMyList, isMutedGlobal, toggleGlobalMute } = useCatalog();
  const [isLiked, setIsLiked] = useState(false);
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState(1);
  const modalContentRef = useRef<HTMLDivElement>(null);

  // Fecha o modal ao pressionar a tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeTitleDetails();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeTitleDetails]);

  if (!selectedTitle) return null;

  const inList = isInMyList(selectedTitle.id);
  const currentSeason = selectedTitle.seasons?.find(
    (s) => s.seasonNumber === selectedSeasonNumber
  ) || selectedTitle.seasons?.[0];

  // Títulos semelhantes sugeridos
  const similarTitles: CatalogTitle[] = selectedTitle.similarTitles
    ? (selectedTitle.similarTitles
        .map((id) => CATALOG_DATA.find((t) => t.id === id))
        .filter(Boolean) as CatalogTitle[])
    : CATALOG_DATA.filter((t) => t.id !== selectedTitle.id).slice(0, 3);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex justify-center py-6 sm:py-10 px-2 sm:px-4 animate-in fade-in duration-200">
      {/* Backdrop click para fechar */}
      <div className="fixed inset-0" onClick={closeTitleDetails} />

      {/* Conteúdo Central do Modal */}
      <div
        ref={modalContentRef}
        className="relative w-full max-w-4xl bg-[#181818] rounded-lg overflow-hidden netflix-modal-shadow z-10 my-auto text-white select-none animate-in zoom-in-95 duration-300"
      >
        {/* Botão Fechar no Canto Superior Direito */}
        <button
          onClick={closeTitleDetails}
          aria-label="Fechar detalhes"
          className="absolute top-4 right-4 z-40 w-9 h-9 rounded-full bg-[#181818]/80 hover:bg-[#242424] border border-white/20 text-white flex items-center justify-center transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 1. Cabeçalho com Banner ou Trailer */}
        <div className="relative aspect-video w-full overflow-hidden bg-black">
          {selectedTitle.previewVideoUrl ? (
            <video
              src={selectedTitle.previewVideoUrl}
              poster={selectedTitle.bannerUrl}
              autoPlay
              muted={isMutedGlobal}
              loop
              playsInline
              crossOrigin="anonymous"
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src={selectedTitle.bannerUrl}
              alt={selectedTitle.name}
              className="w-full h-full object-cover"
            />
          )}

          {/* Vinheta Inferior que funde o vídeo com o corpo do modal */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-transparent to-transparent opacity-95" />

          {/* Informações e Botões Sobrepostos na Base do Banner */}
          <div className="absolute bottom-6 left-6 sm:left-10 right-6 sm:right-10 flex items-end justify-between">
            <div className="space-y-3 max-w-lg">
              <h1 className="text-2xl sm:text-4xl font-black text-white drop-shadow-lg tracking-tight">
                {selectedTitle.name}
              </h1>

              {/* Botões de Ação */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Assistir */}
                <Link
                  href={`/watch/${selectedTitle.slug}`}
                  className="flex items-center space-x-2 px-6 py-2.5 rounded bg-white text-black font-bold hover:bg-white/80 active:scale-95 transition-all shadow"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>Assistir</span>
                </Link>

                {/* Watch Together */}
                <Link
                  href={`/watch/${selectedTitle.slug}?mode=room`}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded bg-[#E50914] text-white font-bold hover:bg-[#b80710] active:scale-95 transition-all shadow shadow-[#E50914]/30"
                >
                  <Users className="w-4 h-4" />
                  <span>Watch Together</span>
                </Link>

                {/* Minha Lista */}
                <button
                  onClick={() => toggleMyList(selectedTitle.id)}
                  className="w-10 h-10 rounded-full border border-white/40 bg-[#242424]/60 hover:border-white text-white flex items-center justify-center transition-all"
                  title={inList ? "Remover da Lista" : "Adicionar à Lista"}
                >
                  {inList ? <Check className="w-5 h-5 text-green-400" /> : <Plus className="w-5 h-5" />}
                </button>

                {/* Like */}
                <button
                  onClick={() => setIsLiked(!isLiked)}
                  className={`w-10 h-10 rounded-full border border-white/40 bg-[#242424]/60 text-white flex items-center justify-center transition-all ${
                    isLiked ? "border-white bg-white text-black" : "hover:border-white"
                  }`}
                  title="Gostei"
                >
                  <ThumbsUp className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Botão de Som Mute/Unmute */}
            <button
              onClick={toggleGlobalMute}
              className="w-10 h-10 rounded-full border border-white/40 bg-black/60 hover:bg-white/10 text-white flex items-center justify-center transition-all flex-none"
            >
              {isMutedGlobal ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* 2. Corpo do Modal (Metadados e Sinopse em 2 Colunas) */}
        <div className="p-6 sm:p-10 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-10">
            {/* Coluna Esquerda: Tags, Progresso, Sinopse Completa */}
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center space-x-3 text-sm font-semibold">
                <span className="text-[#46d369] font-bold">
                  {selectedTitle.matchPercentage}% relevante
                </span>
                <span className="text-neutral-300">{selectedTitle.releaseYear}</span>
                <span className="border border-neutral-500 text-white px-1.5 py-0.5 rounded-xs text-xs">
                  {selectedTitle.ageRating}+
                </span>
                <span className="text-neutral-300">
                  {selectedTitle.durationMinutes
                    ? `${Math.floor(selectedTitle.durationMinutes / 60)}h ${selectedTitle.durationMinutes % 60}m`
                    : `${selectedTitle.totalSeasons} Temporadas`}
                </span>
                <span className="border border-white/30 text-neutral-200 text-xs px-1 rounded-xs">
                  Ultra HD 4K
                </span>
                <span className="border border-white/30 text-neutral-200 text-xs px-1 rounded-xs">
                  5.1
                </span>
              </div>

              {/* Sinopse Longa */}
              <p className="text-base text-neutral-200 leading-relaxed">
                {selectedTitle.longSynopsis || selectedTitle.synopsis}
              </p>
            </div>

            {/* Coluna Direita: Elenco, Gêneros e Clima */}
            <div className="space-y-3 text-xs sm:text-sm text-neutral-400">
              <div>
                <span className="text-neutral-500">Elenco: </span>
                <span className="text-neutral-200">{selectedTitle.cast.join(", ")}</span>
              </div>
              <div>
                <span className="text-neutral-500">Gêneros: </span>
                <span className="text-neutral-200">{selectedTitle.genres.join(", ")}</span>
              </div>
              <div>
                <span className="text-neutral-500">Cenas e momentos: </span>
                <span className="text-neutral-200">{selectedTitle.moods.join(", ")}</span>
              </div>
              <div>
                <span className="text-neutral-500">Direção: </span>
                <span className="text-neutral-200">{selectedTitle.director}</span>
              </div>
            </div>
          </div>

          {/* 3. Se for Série: Seletor de Temporadas e Grade de Episódios */}
          {selectedTitle.type === "SERIES" && selectedTitle.seasons && (
            <div className="space-y-4 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <h2 className="text-xl sm:text-2xl font-bold text-white">Episódios</h2>
                {selectedTitle.seasons.length > 1 && (
                  <div className="relative">
                    <select
                      value={selectedSeasonNumber}
                      onChange={(e) => setSelectedSeasonNumber(Number(e.target.value))}
                      className="bg-[#242424] text-white text-sm font-semibold px-4 py-2 rounded border border-white/20 appearance-none pr-8 cursor-pointer focus:outline-none"
                    >
                      {selectedTitle.seasons.map((season) => (
                        <option key={season.seasonNumber} value={season.seasonNumber}>
                          {season.name} ({season.episodes.length} episódios)
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-white absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                )}
              </div>

              {/* Lista de Episódios */}
              <div className="space-y-3">
                {currentSeason?.episodes.map((ep) => (
                  <Link
                    key={ep.id}
                    href={`/watch/${selectedTitle.slug}`}
                    className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 p-3 rounded-lg hover:bg-white/5 transition-colors border-b border-white/5 group"
                  >
                    <span className="text-lg font-bold text-neutral-400 w-6 flex-none">
                      {ep.episodeNumber}
                    </span>

                    {/* Thumbnail com botão de play no hover */}
                    <div className="relative w-36 sm:w-44 aspect-video rounded overflow-hidden flex-none bg-[#242424]">
                      <img
                        src={ep.thumbnailUrl}
                        alt={ep.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-8 h-8 text-white fill-current" />
                      </div>
                      <span className="absolute bottom-1 right-1 px-1 rounded bg-black/80 text-[10px] text-white">
                        {ep.durationMinutes}m
                      </span>
                    </div>

                    {/* Detalhes do Episódio */}
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white group-hover:text-[#E50914] transition-colors">
                          {ep.title}
                        </h3>
                      </div>
                      <p className="text-xs text-neutral-400 line-clamp-2">
                        {ep.synopsis}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 4. Títulos Semelhantes */}
          <div className="space-y-4 pt-6 border-t border-white/10">
            <h2 className="text-xl sm:text-2xl font-bold text-white">Títulos semelhantes</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {similarTitles.map((item) => (
                <div
                  key={item.id}
                  className="bg-[#242424] rounded overflow-hidden flex flex-col group cursor-pointer"
                  onClick={() => {
                    closeTitleDetails();
                    setTimeout(() => {
                      const { openTitleDetails } = useCatalog();
                      openTitleDetails(item.id);
                    }, 100);
                  }}
                >
                  <div className="relative aspect-video w-full overflow-hidden">
                    <img
                      src={item.bannerUrl}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <span className="absolute top-2 right-2 text-xs font-bold text-[#46d369] bg-black/70 px-1.5 py-0.5 rounded">
                      {item.matchPercentage}%
                    </span>
                  </div>
                  <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white truncate">{item.name}</span>
                        <span className="text-[10px] border border-neutral-500 px-1 text-neutral-300">
                          {item.ageRating}+
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 line-clamp-3">
                        {item.synopsis}
                      </p>
                    </div>
                    <div className="pt-2 flex items-center justify-between border-t border-white/10 text-[11px] text-neutral-400">
                      <span>{item.releaseYear}</span>
                      <Link
                        href={`/watch/${item.slug}`}
                        className="p-1.5 rounded-full bg-white text-black hover:bg-neutral-200"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 5. Sobre o Título */}
          <div className="space-y-2 pt-6 border-t border-white/10 text-xs text-neutral-400">
            <h2 className="text-base font-bold text-white pb-1">
              Sobre {selectedTitle.name}
            </h2>
            <p>
              <span className="text-neutral-500">Direção:</span> {selectedTitle.director}
            </p>
            <p>
              <span className="text-neutral-500">Elenco:</span> {selectedTitle.cast.join(", ")}
            </p>
            <p>
              <span className="text-neutral-500">Gêneros:</span> {selectedTitle.genres.join(", ")}
            </p>
            <p>
              <span className="text-neutral-500">Classificação indicativa:</span> {selectedTitle.ageRating}+ (Conteúdo recomendado para maiores de {selectedTitle.ageRating} anos).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
