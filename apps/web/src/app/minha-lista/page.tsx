"use client";

import React from "react";
import { CatalogProvider } from "@/context/CatalogContext";
import { Navbar } from "@/components/Navbar";
import { ContentRow } from "@/components/ContentRow";
import { TitleModal } from "@/components/TitleModal";
import { FloatingHoverCard } from "@/components/FloatingHoverCard";
import { CATALOG_DATA } from "@/data/mockCatalog";
import { Bookmark } from "lucide-react";

export default function MinhaListaPage() {
  const favoriteTitles = CATALOG_DATA.slice(0, 4);

  return (
    <CatalogProvider>
      <div className="relative min-h-screen bg-[#141414] text-white select-none pb-24">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 sm:pt-32">
          <div className="flex items-center space-x-3 mb-6">
            <Bookmark className="w-6 h-6 text-[#E50914]" />
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Minha Lista</h1>
          </div>
          <div className="space-y-8">
            <ContentRow
              title="Salvos para assistir depois"
              items={favoriteTitles}
              subtitle="Títulos adicionados à sua lista pessoal"
            />
            <ContentRow
              title="Sugeridos com base na sua lista"
              items={CATALOG_DATA.slice(4)}
              subtitle="Recomendações que combinam com as suas preferências"
            />
          </div>
        </div>
        <FloatingHoverCard />
        <TitleModal />
      </div>
    </CatalogProvider>
  );
}
