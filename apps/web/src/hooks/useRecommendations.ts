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
      let apiBase = "";
      if (typeof window !== "undefined") {
        const protocol = window.location.protocol === "https:" ? "https:" : "http:";
        const host = window.location.hostname || "localhost";
        const envUrl = process.env.NEXT_PUBLIC_API_URL;

        if (envUrl) {
          apiBase = envUrl
            .replace("localhost", host)
            .replace("127.0.0.1", host);
        } else {
          apiBase = `${protocol}//${host}:4000`;
        }
      } else {
        apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
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
