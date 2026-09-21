"use client";

import React, { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play, Plus, Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { CatalogTitle } from "@/data/mockCatalog";
import { useCatalog } from "@/context/CatalogContext";

interface Top10RowProps {
  title: string;
  items: CatalogTitle[];
}

export function Top10Row({ title, items }: Top10RowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const { openTitleDetails, isInMyList, toggleMyList } = useCatalog();

  const checkScrollability = () => {
    if (rowRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
      setCanScrollLeft(scrollLeft > 20);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 20);
    }
  };

  const handleScroll = (direction: "left" | "right") => {
    if (rowRef.current) {
      const { scrollLeft, clientWidth } = rowRef.current;
      const scrollDistance = clientWidth * 0.8;
      const targetScroll =
        direction === "left" ? scrollLeft - scrollDistance : scrollLeft + scrollDistance;

      rowRef.current.scrollTo({
        left: targetScroll,
        behavior: "smooth",
      });

      setTimeout(checkScrollability, 350);
    }
  };

  // Garante exatamente os 10 primeiros títulos ordenados pelo rank ou índice
  const top10List = items
    .slice()
    .sort((a, b) => (a.top10Rank || 99) - (b.top10Rank || 99))
    .slice(0, 10);

  return (
    <section className="relative my-4 sm:my-8 max-w-[1720px] mx-auto group/top10 relative z-10 hover:z-40">
      {/* Cabeçalho da Linha */}
      <div className="flex items-baseline justify-between mb-1 sm:mb-3 px-4 sm:px-8 md:px-12">
        <h2 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-[#e5e5e5] hover:text-white transition-colors cursor-pointer flex items-center gap-2">
          <span>{title}</span>
        </h2>
      </div>

      {/* Container Relativo do Slider com Degradês e Alças de Navegação */}
      <div className="relative">
        {/* Fade Lateral Esquerdo */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-8 sm:w-16 bg-gradient-to-r from-[#141414] to-transparent z-20 pointer-events-none" />
        )}

        {/* Alça Vertical Esquerda Translúcida */}
        {canScrollLeft && (
          <button
            onClick={() => handleScroll("left")}
            aria-label="Rolar para esquerda"
            className="absolute left-0 top-8 bottom-10 z-30 w-10 sm:w-14 bg-black/30 hover:bg-black/75 backdrop-blur-[2px] text-white flex items-center justify-center opacity-0 group-hover/top10:opacity-100 transition-all duration-200 rounded-r select-none cursor-pointer"
          >
            <ChevronLeft className="w-8 h-8 text-white/90 hover:scale-125 transition-transform duration-200" />
          </button>
        )}

        {/* Slider dos 10 Títulos com Números Gigantes */}
        <div
          ref={rowRef}
          onScroll={checkScrollability}
          className="flex items-center space-x-3 sm:space-x-6 overflow-x-auto no-scrollbar pt-6 pb-12 -mt-4 -mb-8 px-4 sm:px-8 md:px-12 scroll-smooth"
        >
          {top10List.map((item, index) => {
            const rank = index + 1;
            const inList = isInMyList(item.id);

            return (
              <div
                key={item.id}
                className="relative flex-none flex items-center cursor-pointer select-none group/card"
                onClick={() => openTitleDetails(item.id)}
              >
                {/* Número Gigante Estilizado da Netflix */}
                <div className="relative flex-none select-none pointer-events-none -mr-4 sm:-mr-7 z-0">
                  <svg
                    viewBox="0 0 100 160"
                    className="h-36 sm:h-48 md:h-56 w-auto overflow-visible drop-shadow-[0_8px_16px_rgba(0,0,0,0.9)]"
                  >
                    {/* Contorno / Stroke Externo */}
                    <text
                      x="50%"
                      y="88%"
                      textAnchor="middle"
                      className="font-black text-9xl tracking-tighter select-none"
                      fill="#141414"
                      stroke="#595959"
                      strokeWidth="5"
                      strokeLinejoin="round"
                      style={{
                        fontFamily: "Impact, 'Arial Black', sans-serif",
                      }}
                    >
                      {rank}
                    </text>
                    {/* Preenchimento Interno Sutil */}
                    <text
                      x="50%"
                      y="88%"
                      textAnchor="middle"
                      className="font-black text-9xl tracking-tighter select-none"
                      fill="#1e1e1e"
                      style={{
                        fontFamily: "Impact, 'Arial Black', sans-serif",
                      }}
                    >
                      {rank}
                    </text>
                  </svg>
                </div>

                {/* Poster Vertical Proporção 2:3 */}
                <div className="relative z-10 w-28 sm:w-36 md:w-44 aspect-[2/3] rounded-sm overflow-hidden bg-[#181818] shadow-2xl border border-white/10 group-hover/card:scale-105 group-hover/card:border-white/40 transition-all duration-300">
                  <img
                    src={item.posterUrl || item.bannerUrl}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />

                  {/* Gradiente Interno */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80 group-hover/card:opacity-30 transition-opacity" />

                  {/* Título Sobreposto */}
                  <div className="absolute bottom-2 left-2 right-2 text-xs font-bold text-white truncate drop-shadow">
                    {item.name}
                  </div>

                  {/* Ações Rápidas no Hover */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/card:opacity-100 transition-opacity flex flex-col justify-between p-2">
                    <div className="flex justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMyList(item.id);
                        }}
                        className="w-7 h-7 rounded-full bg-black/70 border border-white/40 text-white flex items-center justify-center hover:border-white transition-all"
                      >
                        {inList ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Plus className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <Link
                        href={`/watch/${item.slug}`}
                        onClick={(e) => e.stopPropagation()}
                        className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center shadow hover:scale-110 transition-transform"
                      >
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </Link>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openTitleDetails(item.id);
                        }}
                        className="w-8 h-8 rounded-full bg-black/70 border border-white/40 text-white flex items-center justify-center hover:border-white"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Fade Lateral Direito */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-8 sm:w-16 bg-gradient-to-l from-[#141414] to-transparent z-20 pointer-events-none" />
        )}

        {/* Alça Vertical Direita Translúcida */}
        {canScrollRight && (
          <button
            onClick={() => handleScroll("right")}
            aria-label="Rolar para direita"
            className="absolute right-0 top-8 bottom-10 z-30 w-10 sm:w-14 bg-black/30 hover:bg-black/75 backdrop-blur-[2px] text-white flex items-center justify-center opacity-0 group-hover/top10:opacity-100 transition-all duration-200 rounded-l select-none cursor-pointer"
          >
            <ChevronRight className="w-8 h-8 text-white/90 hover:scale-125 transition-transform duration-200" />
          </button>
        )}
      </div>
    </section>
  );
}
