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

export default function BombandoPage() {
  const top10Titles = CATALOG_DATA.filter((t) => t.isTop10);
  const heroTitle = top10Titles[0] || CATALOG_DATA[0];
  const trendingNow = CATALOG_DATA.slice().reverse();

  return (
    <CatalogProvider>
      <div className="relative min-h-screen bg-[#141414] text-white overflow-x-clip select-none pb-24">
        <Navbar />
        <HeroBanner title={heroTitle} />
        <div className="relative -mt-28 sm:-mt-36 md:-mt-40 z-30 space-y-6 sm:space-y-10 md:space-y-12">
          <Top10Row
            title="Bombando no Brasil Hoje"
            items={top10Titles}
          />
          <ContentRow
            title="Novidades no Watch Together"
            items={trendingNow}
            subtitle="Títulos recém-adicionados que estão dando o que falar"
          />
        </div>
        <FloatingHoverCard />
        <TitleModal />
      </div>
    </CatalogProvider>
  );
}
