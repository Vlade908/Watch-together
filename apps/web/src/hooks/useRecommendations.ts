"use client";

import { useEffect, useState, useCallback } from "react";
import { CatalogTitle, CATALOG_DATA } from "../data/mockCatalog";

export interface RecommendedTitle extends CatalogTitle {
  matchReason?: string;
}

export function useRecommendations(userId?: string) {
  const [recommendations, setRecommendations] = useState<RecommendedTitle[]>(() => {
    return CATALOG_DATA.slice().reverse();
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  const fetchRecommendations = useCallback(async () => {
    try {
      setIsLoading(true);
      let apiBase = process.env.NEXT_PUBLIC_API_URL;
      if (!apiBase && typeof window !== "undefined") {
        apiBase = `${window.location.protocol}//${window.location.hostname || "localhost"}:54321`;
      }
      if (!apiBase) {
        apiBase = "http://localhost:54321";
      }

      const queryUserId = userId || "usuario@watchtogether.com";
      const res = await fetch(`${apiBase}/api/recommendations?userId=${encodeURIComponent(queryUserId)}&limit=8`);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data && Array.isArray(data.titles) && data.titles.length > 0) {
        // Encontra ou mescla dados ricos do catálogo local para cada recomendação
        const merged: RecommendedTitle[] = data.titles.map((rec: any) => {
          const localMatch = CATALOG_DATA.find((item) => item.slug === rec.slug);
          return {
            id: rec.id,
            slug: rec.slug,
            name: rec.name,
            synopsis: rec.synopsis,
            longSynopsis: localMatch?.longSynopsis || rec.synopsis,
            releaseYear: rec.releaseYear,
            ageRating: localMatch?.ageRating || "14",
            durationMinutes: localMatch?.durationMinutes || 120,
            type: rec.type || "MOVIE",
            bannerUrl: rec.bannerUrl || localMatch?.bannerUrl || "",
            posterUrl: rec.posterUrl || localMatch?.posterUrl || "",
            previewVideoUrl: localMatch?.previewVideoUrl,
            matchPercentage: rec.matchPercentage || 85,
            genres: rec.genres && rec.genres.length > 0 ? rec.genres : (localMatch?.genres || ["Ficção Científica"]),
            cast: localMatch?.cast || [],
            director: localMatch?.director || "Direção Aclamada",
            moods: localMatch?.moods || ["Empolgante"],
            friendsWatchedCount: rec.friendsWatchedCount || 0,
            matchReason: rec.matchReason || "Recomendado por afinidade temática",
          };
        });

        setRecommendations(merged);
        setIsLive(true);
      }
    } catch (err) {
      // Fallback gracioso silencioso para catálogo local
      console.warn("[useRecommendations] Backend offline ou indisponível, usando catálogo padrão.");
      setIsLive(false);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  return {
    recommendations,
    isLoading,
    isLive,
    refetch: fetchRecommendations,
  };
}
