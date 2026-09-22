"use client";

import React from "react";
import { CatalogProvider } from "@/context/CatalogContext";
import { Navbar } from "@/components/Navbar";
import { HeroBanner } from "@/components/HeroBanner";
import { ContentRow } from "@/components/ContentRow";
import { TitleModal } from "@/components/TitleModal";
import { FloatingHoverCard } from "@/components/FloatingHoverCard";
import { CATALOG_DATA } from "@/data/mockCatalog";

export default function SeriesPage() {
  const seriesTitles = CATALOG_DATA.filter((t) => t.type === "SERIES" || t.genres.includes("Série"));
  const heroTitle = seriesTitles[0] || CATALOG_DATA[0];
  const dramaSeries = seriesTitles.filter((t) => t.genres.includes("Drama") || t.genres.includes("Ficção Científica"));
  const popularSeries = seriesTitles.length > 0 ? seriesTitles : CATALOG_DATA.slice(0, 6);

  return (
    <CatalogProvider>
      <div className="relative min-h-screen bg-[#141414] text-white overflow-x-clip select-none pb-24">
        <Navbar />
        <HeroBanner title={heroTitle} />
        <div className="relative -mt-28 sm:-mt-36 md:-mt-40 z-30 space-y-6 sm:space-y-10 md:space-y-12">
          <ContentRow
            title="Séries em Alta"
            items={popularSeries}
            subtitle="As séries mais assistidas no momento"
          />
          {dramaSeries.length > 0 && (
            <ContentRow
              title="Dramas & Ficção Científica"
              items={dramaSeries}
            />
          )}
        </div>
        <FloatingHoverCard />
        <TitleModal />
      </div>
    </CatalogProvider>
  );
}
