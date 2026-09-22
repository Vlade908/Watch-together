"use client";

import React from "react";
import { CatalogProvider } from "@/context/CatalogContext";
import { Navbar } from "@/components/Navbar";
import { HeroBanner } from "@/components/HeroBanner";
import { ContentRow } from "@/components/ContentRow";
import { TitleModal } from "@/components/TitleModal";
import { FloatingHoverCard } from "@/components/FloatingHoverCard";
import { CATALOG_DATA } from "@/data/mockCatalog";

export default function FilmesPage() {
  const movieTitles = CATALOG_DATA.filter((t) => t.type === "MOVIE");
  const heroTitle = movieTitles[0] || CATALOG_DATA[0];
  const actionMovies = movieTitles.filter((t) => t.genres.includes("Ação") || t.genres.includes("Aventura"));
  const popularMovies = movieTitles.length > 0 ? movieTitles : CATALOG_DATA.slice(0, 6);

  return (
    <CatalogProvider>
      <div className="relative min-h-screen bg-[#141414] text-white overflow-x-clip select-none pb-24">
        <Navbar />
        <HeroBanner title={heroTitle} />
        <div className="relative -mt-28 sm:-mt-36 md:-mt-40 z-30 space-y-6 sm:space-y-10 md:space-y-12">
          <ContentRow
            title="Filmes em Destaque"
            items={popularMovies}
            subtitle="Grandes produções para você assistir agora"
          />
          {actionMovies.length > 0 && (
            <ContentRow
              title="Ação & Aventura"
              items={actionMovies}
            />
          )}
        </div>
        <FloatingHoverCard />
        <TitleModal />
      </div>
    </CatalogProvider>
  );
}
