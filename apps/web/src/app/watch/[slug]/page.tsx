"use client";

import React, { use, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { VideoPlayer } from "@/components/Player/VideoPlayer";
import { useSocial } from "@/context/SocialContext";
import { useAuth } from "@/context/AuthContext";
import { CATALOG_DATA } from "@/data/mockCatalog";

// Stream de teste HLS VOD oficial com múltiplos bitrates (1080p, 720p, 480p, 360p) para validação imediata
const DEMO_HLS_STREAM = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

interface WatchPageProps {
  params: Promise<{ slug: string }>;
}

export default function WatchPage({ params }: WatchPageProps) {
  const resolvedParams = use(params);
  const searchParams = useSearchParams();
  const { updatePresence, isPartyHost, currentParty, startPartyMedia } = useSocial();
  const { user } = useAuth();

  const isLocalFileMode =
    resolvedParams.slug === "arquivo-local" || searchParams.get("source") === "local";

  const isDirectUrlMode =
    resolvedParams.slug === "direto" || resolvedParams.slug === "url";

  const isRoomMode = searchParams.get("mode") === "room";
  const roomParam = searchParams.get("room");
  const effectiveRoomId = roomParam || (isRoomMode ? `room-${resolvedParams.slug}` : undefined);

  // Formata o nome amigável a partir do slug
  const titleFormatted = React.useMemo(() => {
    if (isLocalFileMode) {
      return "Ficheiro Local (Syncplay)";
    }
    if (isDirectUrlMode) {
      return "URL Direta (Transmissão Remota)";
    }
    return resolvedParams.slug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }, [resolvedParams.slug, isLocalFileMode, isDirectUrlMode]);

  // Busca metadados do título do catálogo para enriquecer o card de presença
  const catalogTitle = React.useMemo(() => {
    if (isLocalFileMode) {
      return {
        id: "arquivo-local",
        name: "Ficheiro Local (Syncplay)",
        slug: "arquivo-local",
        bannerUrl:
          "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1200&auto=format&fit=crop",
      };
    }
    if (isDirectUrlMode) {
      return {
        id: "direto",
        name: "URL Direta (Transmissão Remota)",
        slug: resolvedParams.slug,
        bannerUrl:
          "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&auto=format&fit=crop",
      };
    }
    return (
      CATALOG_DATA.find((t) => t.slug === resolvedParams.slug) || {
        id: resolvedParams.slug,
        name: titleFormatted,
        slug: resolvedParams.slug,
        bannerUrl:
          "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&auto=format&fit=crop",
      }
    );
  }, [resolvedParams.slug, titleFormatted, isLocalFileMode, isDirectUrlMode]);

  const [activeMediaTitle, setActiveMediaTitle] = React.useState<string | null>(null);

  // Sincronização Follow-the-Host: se o usuário for o Host do grupo, emite a navegação para todos os membros
  useEffect(() => {
    if (isPartyHost && currentParty) {
      const room = effectiveRoomId || `sala-${resolvedParams.slug}`;
      const titleToBroadcast = activeMediaTitle || catalogTitle.name;
      // Garante que para transmissões remotas o slug emitido seja sempre "direto", nunca "arquivo-local"
      const targetSlug = isDirectUrlMode ? "direto" : isLocalFileMode ? "arquivo-local" : resolvedParams.slug;
      if (currentParty.activeMedia?.slug !== targetSlug || currentParty.activeMedia?.roomId !== room) {
        startPartyMedia(targetSlug, titleToBroadcast, room);
      }
    }
  }, [isPartyHost, currentParty, resolvedParams.slug, isDirectUrlMode, isLocalFileMode, effectiveRoomId, catalogTitle.name, activeMediaTitle, startPartyMedia]);

  // Publica presença em tempo real na rede Watch Together
  useEffect(() => {
    const finalTitle = activeMediaTitle || catalogTitle.name;
    updatePresence(
      "watching",
      {
        id: catalogTitle.id,
        name: finalTitle,
        slug: catalogTitle.slug,
        bannerUrl: catalogTitle.bannerUrl,
      },
      effectiveRoomId
    );

    return () => {
      updatePresence("idle");
    };
  }, [
    activeMediaTitle,
    catalogTitle.id,
    catalogTitle.name,
    catalogTitle.slug,
    catalogTitle.bannerUrl,
    effectiveRoomId,
    updatePresence,
  ]);

  return (
    <main className="w-screen h-screen bg-black overflow-hidden relative">
      <VideoPlayer
        manifestUrl={isLocalFileMode || isDirectUrlMode ? "" : DEMO_HLS_STREAM}
        titleName={activeMediaTitle || titleFormatted}
        episodeName={
          isLocalFileMode
            ? "Reprodução Local em Alta Fidelidade (Zero Buffer)"
            : isDirectUrlMode
            ? "Transmissão Remota via URL Direta"
            : "Temporada 1: Episódio 1 (4K UHD Multi-bitrate)"
        }
        isWatchTogether={isRoomMode}
        roomId={effectiveRoomId}
        userId={user?.id}
        userName={user?.name}
        initialSourceType={isLocalFileMode ? "LOCAL_FILE" : isDirectUrlMode ? "DIRECT_URL" : "CATALOG_DEMO"}
        onMediaTitleChange={setActiveMediaTitle}
        onPlay={() => console.log("[Player] Play disparado")}
        onPause={() => console.log("[Player] Pause disparado")}
        onSeek={(time) => console.log(`[Player] Seek para ${time.toFixed(1)}s`)}
        onTimeUpdate={(_time) => {
          // Hook de telemetria e sync da sala
        }}
      />
    </main>
  );
}

