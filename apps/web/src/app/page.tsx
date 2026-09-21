"use client";

import React from "react";
import { CatalogProvider } from "@/context/CatalogContext";
import { Navbar } from "@/components/Navbar";
import { HeroBanner } from "@/components/HeroBanner";
import { ContentRow } from "@/components/ContentRow";
import { Top10Row } from "@/components/Top10Row";
import { TitleModal } from "@/components/TitleModal";
import { FloatingHoverCard } from "@/components/FloatingHoverCard";
import { CATALOG_DATA } from "@/data/mockCatalog";
import { useRecommendations } from "@/hooks/useRecommendations";
import { useSocial } from "@/context/SocialContext";

export default function HomePage() {
  const heroTitle = CATALOG_DATA[0];
  const { currentUser } = useSocial();
  const { recommendations, isLive } = useRecommendations(currentUser?.userId);

  // Filtros categóricos para as fileiras
  const popularTitles = CATALOG_DATA.slice(0, 8);
  const continueWatching = CATALOG_DATA.filter((t) => t.progressPercentage && t.progressPercentage > 0);
  const watchTogetherTrends = CATALOG_DATA.filter((t) => t.friendsWatchedCount && t.friendsWatchedCount > 0);
  const top10Titles = CATALOG_DATA.filter((t) => t.isTop10);
  const sciFiSeries = CATALOG_DATA.filter((t) => t.type === "SERIES" || t.genres.includes("Ficção Científica"));

  return (
    <CatalogProvider>
      <div className="relative min-h-screen bg-[#141414] text-white overflow-x-clip select-none pb-24">
        {/* Barra de Navegação Superior */}
        <Navbar />

        {/* Hero Billboard Imersivo (Ancorado ~38% à esquerda, iluminação dramática) */}
        <HeroBanner title={heroTitle} />

        {/* Fileiras de Conteúdo Cinematográfico: Sobrepondo a base do Hero em -mt-36 a -mt-40 */}
        <div className="relative -mt-28 sm:-mt-36 md:-mt-40 z-30 space-y-6 sm:space-y-10 md:space-y-12">
          {/* 1. Populares na Netflix (Primeira Fileira com Fusão Perfeita) */}
          <ContentRow
            title="Populares na Netflix"
            items={popularTitles}
          />

          {/* 2. Top 10 em Filmes e Séries no Brasil Hoje (Números Gigantes 1 a 10) */}
          <Top10Row
            title="Top 10 em filmes e séries no Brasil hoje"
            items={top10Titles}
          />

          {/* 3. Continuar Assistindo como Vlad */}
          {continueWatching.length > 0 && (
            <ContentRow
              title="Continuar assistindo como Vlad"
              items={continueWatching}
              subtitle="Retome exatamente de onde parou"
            />
          )}

          {/* 4. Em Alta na Sua Rede (Watch Together) */}
          <ContentRow
            title="Em alta na sua rede de amigos (Watch Together)"
            items={watchTogetherTrends}
            subtitle="Títulos mais assistidos em conjunto esta semana"
          />

          {/* 5. Séries Aclamadas & Sci-Fi */}
          <ContentRow
            title="Séries aclamadas pela crítica & ficção científica"
            items={sciFiSeries}
          />

          {/* 6. Recomendações Personalizadas (Motor Híbrido pgvector + Social) */}
          <ContentRow
            title={
              <div className="flex items-center space-x-2.5">
                <span>Recomendados para você</span>
                {isLive && (
                  <span className="text-[10px] tracking-wider uppercase font-semibold px-2 py-0.5 rounded-full bg-[#e50914]/20 text-[#e50914] border border-[#e50914]/30">
                    IA Semântica & Social
                  </span>
                )}
              </div>
            }
            items={recommendations}
            subtitle={
              isLive
                ? "Títulos ranqueados com base no seu histórico e nos gostos dos seus amigos"
                : "Títulos que combinam com o que você e seus amigos assistiram recentemente"
            }
          />
        </div>

        {/* Card Elevado Flutuante com Zero Clipping (Renderizado via Portal) */}
        <FloatingHoverCard />

        {/* Modal de Detalhes Completo da Netflix */}
        <TitleModal />

        {/* Rodapé Oficial Estilo Netflix */}
        <footer className="mt-28 border-t border-white/10 max-w-[1200px] mx-auto px-6 pt-12 pb-16 text-xs text-neutral-500 space-y-5">
          <div className="flex items-center space-x-4 text-neutral-400">
            <span>Dúvidas? Ligue 0800 591 2876</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
            <a href="#" className="hover:underline">Perguntas frequentes</a>
            <a href="#" className="hover:underline">Central de Ajuda</a>
            <a href="#" className="hover:underline">Conta</a>
            <a href="#" className="hover:underline">Media Center</a>
            <a href="#" className="hover:underline">Relações com investidores</a>
            <a href="#" className="hover:underline">Carreiras</a>
            <a href="#" className="hover:underline">Resgatar cartão pré-pago</a>
            <a href="#" className="hover:underline">Formas de assistir</a>
            <a href="#" className="hover:underline">Termos de Uso</a>
            <a href="#" className="hover:underline">Privacidade</a>
            <a href="#" className="hover:underline">Preferências de cookies</a>
            <a href="#" className="hover:underline">Informações corporativas</a>
          </div>

          <div className="pt-2 text-[10px] text-neutral-600">
            &copy; 1997-{new Date().getFullYear()} Netflix Together, Inc. Arquitetura de reprodução adaptativa de alta fidelidade.
          </div>
        </footer>
      </div>
    </CatalogProvider>
  );
}
