"use client";

import React, { useRef } from "react";
import { Users } from "lucide-react";
import { CatalogTitle } from "@/data/mockCatalog";
import { useCatalog } from "@/context/CatalogContext";

interface TitleCardProps {
  title: CatalogTitle;
  isFirstInRow?: boolean;
  isLastInRow?: boolean;
}

export function TitleCard({ title, isFirstInRow, isLastInRow }: TitleCardProps) {
  const { openTitleDetails, setHoveredCard } = useCatalog();
  const cardRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    // Debounce suave de 280ms para evitar disparo acidental na passagem rápida do cursor
    hoverTimerRef.current = setTimeout(() => {
      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect();
        setHoveredCard({
          title,
          rect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          },
          isFirstInRow: !!isFirstInRow,
          isLastInRow: !!isLastInRow,
        });
      }
    }, 280);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  // Cancela o timeout pendente de expansão caso ocorra scroll ou desmontagem
  React.useEffect(() => {
    const handleScroll = () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    window.addEventListener("wheel", handleScroll, { passive: true });

    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      window.removeEventListener("scroll", handleScroll, { capture: true });
      window.removeEventListener("wheel", handleScroll);
    };
  }, []);

  return (
    <div
      ref={cardRef}
      className="relative flex-none w-[calc((100%-8px)/2)] sm:w-[calc((100%-16px)/3)] md:w-[calc((100%-24px)/4)] lg:w-[calc((100%-40px)/6)] aspect-video select-none group/card cursor-pointer"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => openTitleDetails(title.id)}
    >
      {/* Card Estático na Fileira com visual refinado */}
      <div className="relative w-full h-full rounded-sm overflow-hidden bg-[#181818] shadow-md transition-transform duration-200 group-hover/card:brightness-105">
        {/* Imagem de Alta Resolução */}
        <img
          src={title.bannerUrl}
          alt={title.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />

        {/* Ícone N Vermelho Oficial Netflix */}
        <div className="absolute top-1.5 left-2 z-10 flex items-center justify-center font-black text-sm text-[#E50914] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] select-none">
          N
        </div>

        {/* Gradiente de Fusão na Base da Mídia */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent opacity-90" />

        {/* Nome do Título na Base */}
        <div className="absolute bottom-2 left-2.5 right-2.5 z-10">
          <span
            className="font-black uppercase tracking-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] text-[11px] sm:text-xs leading-tight line-clamp-1"
            style={{
              fontFamily: "'Trebuchet MS', 'Arial Black', sans-serif",
            }}
          >
            {title.name}
          </span>
        </div>

        {/* Barra de Progresso quando parcialmente assistido */}
        {title.progressPercentage !== undefined && title.progressPercentage > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-700 z-20">
            <div
              className="h-full bg-[#E50914]"
              style={{ width: `${title.progressPercentage}%` }}
            />
          </div>
        )}

        {/* Badge Social de Amigos */}
        {title.friendsWatchedCount && title.friendsWatchedCount > 0 && (
          <div className="absolute top-1.5 right-2 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-xs text-[9px] font-semibold text-[#38bdf8] flex items-center space-x-1 z-10">
            <Users className="w-2.5 h-2.5" />
            <span>{title.friendsWatchedCount}</span>
          </div>
        )}
      </div>
    </div>
  );
}
