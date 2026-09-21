"use client";

import React, { use, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { VideoPlayer } from "@/components/Player/VideoPlayer";
import { useSocial } from "@/context/SocialContext";
import { CATALOG_DATA } from "@/data/mockCatalog";

// Stream de teste HLS VOD oficial com múltiplos bitrates (1080p, 720p, 480p, 360p) para validação imediata
const DEMO_HLS_STREAM = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

interface WatchPageProps {
  params: Promise<{ slug: string }>;
}

export default function WatchPage({ params }: WatchPageProps) {
  const resolvedParams = use(params);
  const searchParams = useSearchParams();
  const { updatePresence } = useSocial();

  const isRoomMode = searchParams.get("mode") === "room";
  const roomParam = searchParams.get("room");
  const effectiveRoomId = roomParam || (isRoomMode ? `room-${resolvedParams.slug}` : undefined);

  // Formata o nome amigável a partir do slug
  const titleFormatted = resolvedParams.slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  // Busca metadados do título do catálogo para enriquecer o card de presença
  const catalogTitle = CATALOG_DATA.find((t) => t.slug === resolvedParams.slug) || {
    id: resolvedParams.slug,
    name: titleFormatted,
    slug: resolvedParams.slug,
    bannerUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&auto=format&fit=crop",
  };

  // Publica presença em tempo real na rede Watch Together
  useEffect(() => {
    updatePresence(
      "watching",
      {
        id: catalogTitle.id,
        name: catalogTitle.name,
        slug: catalogTitle.slug,
        bannerUrl: catalogTitle.bannerUrl,
      },
      effectiveRoomId
    );

    return () => {
      updatePresence("idle");
    };
  }, [catalogTitle, effectiveRoomId, updatePresence]);

  return (
    <main className="w-screen h-screen bg-black overflow-hidden relative">
      <VideoPlayer
        manifestUrl={DEMO_HLS_STREAM}
        titleName={titleFormatted}
        episodeName="Temporada 1: Episódio 1 (4K UHD Multi-bitrate)"
        isWatchTogether={isRoomMode}
        roomId={effectiveRoomId}
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

