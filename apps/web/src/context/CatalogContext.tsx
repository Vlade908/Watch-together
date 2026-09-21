"use client";

import React, { createContext, useContext, useState } from "react";
import { CatalogTitle, CATALOG_DATA } from "@/data/mockCatalog";

export interface HoveredCardInfo {
  title: CatalogTitle;
  rect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  isFirstInRow: boolean;
  isLastInRow: boolean;
}

interface CatalogContextType {
  selectedTitle: CatalogTitle | null;
  openTitleDetails: (titleIdOrSlug: string) => void;
  closeTitleDetails: () => void;
  isMutedGlobal: boolean;
  toggleGlobalMute: () => void;
  myList: string[];
  toggleMyList: (titleId: string) => void;
  isInMyList: (titleId: string) => boolean;
  hoveredCard: HoveredCardInfo | null;
  setHoveredCard: (info: HoveredCardInfo | null) => void;
}

const CatalogContext = createContext<CatalogContextType | undefined>(undefined);

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [selectedTitle, setSelectedTitle] = useState<CatalogTitle | null>(null);
  const [isMutedGlobal, setIsMutedGlobal] = useState(true);
  const [myList, setMyList] = useState<string[]>(["interstellar-1"]);
  const [hoveredCard, setHoveredCard] = useState<HoveredCardInfo | null>(null);

  const openTitleDetails = (titleIdOrSlug: string) => {
    // Fecha hover card ao abrir modal
    setHoveredCard(null);
    const found = CATALOG_DATA.find(
      (t) => t.id === titleIdOrSlug || t.slug === titleIdOrSlug
    );
    if (found) {
      setSelectedTitle(found);
      document.body.style.overflow = "hidden";
    }
  };

  const closeTitleDetails = () => {
    setSelectedTitle(null);
    document.body.style.overflow = "auto";
  };

  const toggleGlobalMute = () => {
    setIsMutedGlobal((prev) => !prev);
  };

  const toggleMyList = (titleId: string) => {
    setMyList((prev) =>
      prev.includes(titleId) ? prev.filter((id) => id !== titleId) : [...prev, titleId]
    );
  };

  const isInMyList = (titleId: string) => myList.includes(titleId);

  return (
    <CatalogContext.Provider
      value={{
        selectedTitle,
        openTitleDetails,
        closeTitleDetails,
        isMutedGlobal,
        toggleGlobalMute,
        myList,
        toggleMyList,
        isInMyList,
        hoveredCard,
        setHoveredCard,
      }}
    >
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) {
    throw new Error("useCatalog deve ser usado dentro de um CatalogProvider");
  }
  return context;
}
