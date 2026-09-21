"use client";

import React, { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CatalogTitle } from "@/data/mockCatalog";
import { TitleCard } from "./TitleCard";

interface ContentRowProps {
  title: React.ReactNode;
  items: CatalogTitle[];
  subtitle?: string;
}

export function ContentRow({ title, items, subtitle }: ContentRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

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
      // Rola exatamente 1 página visível
      const scrollDistance = clientWidth * 0.85;
      const targetScroll =
        direction === "left" ? scrollLeft - scrollDistance : scrollLeft + scrollDistance;

      rowRef.current.scrollTo({
        left: targetScroll,
        behavior: "smooth",
      });

      setTimeout(checkScrollability, 350);
    }
  };

  return (
    <section className="relative my-4 sm:my-6 max-w-[1720px] mx-auto group/row relative z-10 hover:z-20">
      {/* Cabeçalho da Linha */}
      <div className="flex items-baseline justify-between mb-1.5 sm:mb-2 px-4 sm:px-8 md:px-12">
        <h2 className="text-base sm:text-lg md:text-xl font-bold tracking-tight text-[#e5e5e5] hover:text-white transition-colors cursor-pointer group-hover/row:text-white">
          {title}
        </h2>
        {subtitle && (
          <span className="hidden sm:inline-block text-xs font-medium text-neutral-400">
            {subtitle}
          </span>
        )}
      </div>

      {/* Container Relativo do Slider com Degradês e Alças de Navegação */}
      <div className="relative">
        {/* Degradê / Fade Lateral Esquerdo */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-8 sm:w-16 bg-gradient-to-r from-[#141414] to-transparent z-20 pointer-events-none" />
        )}

        {/* Alça Vertical de Navegação Esquerda (Altura Total dos Cards) */}
        {canScrollLeft && (
          <button
            onClick={() => handleScroll("left")}
            aria-label="Rolar para esquerda"
            className="absolute left-0 top-0 bottom-0 z-30 w-10 sm:w-14 bg-black/40 hover:bg-black/80 backdrop-blur-[2px] text-white flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-all duration-200 rounded-r select-none cursor-pointer"
          >
            <ChevronLeft className="w-8 h-8 text-white/90 hover:scale-125 transition-transform duration-200" />
          </button>
        )}

        {/* Slider de Cards Estável e Sem Hacks de Margem Negativa */}
        <div
          ref={rowRef}
          onScroll={checkScrollability}
          className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2 px-4 sm:px-8 md:px-12 scroll-smooth"
        >
          {items.map((item, index) => (
            <TitleCard
              key={item.id}
              title={item}
              isFirstInRow={index % 6 === 0}
              isLastInRow={(index + 1) % 6 === 0}
            />
          ))}
        </div>

        {/* Degradê / Fade Lateral Direito */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-8 sm:w-16 bg-gradient-to-l from-[#141414] to-transparent z-20 pointer-events-none" />
        )}

        {/* Alça Vertical de Navegação Direita (Altura Total dos Cards) */}
        {canScrollRight && (
          <button
            onClick={() => handleScroll("right")}
            aria-label="Rolar para direita"
            className="absolute right-0 top-0 bottom-0 z-30 w-10 sm:w-14 bg-black/40 hover:bg-black/80 backdrop-blur-[2px] text-white flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-all duration-200 rounded-l select-none cursor-pointer"
          >
            <ChevronRight className="w-8 h-8 text-white/90 hover:scale-125 transition-transform duration-200" />
          </button>
        )}
      </div>
    </section>
  );
}
