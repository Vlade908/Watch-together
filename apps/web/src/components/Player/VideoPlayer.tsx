"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  ArrowLeft,
  RotateCcw,
  RotateCw,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useWatchTogetherRoom } from "@/hooks/useWatchTogetherRoom";
import { SyncHUD } from "./SyncHUD";

interface VideoPlayerProps {
  manifestUrl: string;
  titleName: string;
  episodeName?: string;
  isWatchTogether?: boolean;
  roomId?: string;
  userId?: string;
  userName?: string;
  onTimeUpdate?: (currentTime: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onSeek?: (newTime: number) => void;
}

export function VideoPlayer({
  manifestUrl,
  titleName,
  episodeName,
  isWatchTogether = false,
  roomId = "sala-cinephiles-4k",
  userId,
  userName,
  onTimeUpdate,
  onPlay,
  onPause,
  onSeek,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const shakaPlayerRef = useRef<any>(null);

  // Hook de Sincronização em Tempo Real (Watch Together)
  const {
    isConnected,
    isSyncing,
    driftMs,
    driftZone,
    appliedSpeed,
    members,
    sendPlay,
    sendPause,
    sendSeek,
  } = useWatchTogetherRoom({
    roomId,
    userId,
    userName,
    videoRef,
    enabled: isWatchTogether,
  });

  // Estados de Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Controles & UI
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [availableResolutions, setAvailableResolutions] = useState<{ id: number; height: number }[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<number | "auto">("auto");

  // Hover Seek
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Inicializa o Shaka Player
  useEffect(() => {
    let isMounted = true;

    async function initShaka() {
      if (!videoRef.current) return;

      try {
        const shakaModule: any = await import("shaka-player/dist/shaka-player.compiled.js");
        const shaka = shakaModule.default || shakaModule;
        shaka.polyfill.installAll();

        if (!shaka.Player.isBrowserSupported()) {
          console.error("Navegador não suporta Shaka Player!");
          return;
        }

        const player = new shaka.Player(videoRef.current);
        shakaPlayerRef.current = player;

        // Configuração de ABR e resiliência de buffer
        player.configure({
          streaming: {
            rebufferingGoal: 2,
            bufferingGoal: 10,
          },
          abr: {
            enabled: true,
          },
        });

        player.addEventListener("error", (event: any) => {
          console.error("Erro no Shaka Player:", event.detail);
        });

        // Carrega o manifesto HLS / DASH
        await player.load(manifestUrl);

        if (!isMounted) return;

        // Lê faixas disponíveis para o seletor de resolução
        const tracks = player.getVariantTracks();
        const uniqueHeights = Array.from(
          new Set(tracks.map((t: any) => t.height).filter(Boolean))
        ) as number[];
        
        const resolutions = uniqueHeights
          .sort((a, b) => b - a)
          .map((height) => {
            const track = tracks.find((t: any) => t.height === height);
            return { id: track.id, height };
          });

        setAvailableResolutions(resolutions);
        setIsLoading(false);
      } catch (err) {
        console.error("Falha ao inicializar o player:", err);
        setIsLoading(false);
      }
    }

    initShaka();

    return () => {
      isMounted = false;
      if (shakaPlayerRef.current) {
        shakaPlayerRef.current.destroy();
      }
    };
  }, [manifestUrl]);

  // 2. Event Listeners do Elemento <video>
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      onPlay?.();
    };

    const handlePause = () => {
      setIsPlaying(false);
      onPause?.();
    };

    const handleWaiting = () => setIsLoading(true);
    const handlePlaying = () => setIsLoading(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
    };
  }, [onPlay, onPause, onTimeUpdate]);

  // 3. Atalhos de Teclado (Acessibilidade e Usabilidade Cinematográfica)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;

      const video = videoRef.current;
      if (!video) return;

      switch (e.code) {
        case "Space":
        case "KeyK":
          e.preventDefault();
          togglePlay();
          break;
        case "KeyJ":
        case "ArrowLeft":
          e.preventDefault();
          seekDelta(-10);
          break;
        case "KeyL":
        case "ArrowRight":
          e.preventDefault();
          seekDelta(10);
          break;
        case "KeyF":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "KeyM":
          e.preventDefault();
          toggleMute();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, isMuted, isFullscreen]);

  // 4. Auto-Hide dos Controles
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 2800);
  }, [isPlaying]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      if (isWatchTogether) {
        sendPlay(video.currentTime);
      } else {
        video.play().catch(() => {});
      }
    } else {
      if (isWatchTogether) {
        sendPause(video.currentTime);
      } else {
        video.pause();
      }
    }
  };

  const seekDelta = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const target = Math.max(0, Math.min(video.currentTime + seconds, duration));
    if (isWatchTogether) {
      sendSeek(target);
    } else {
      video.currentTime = target;
    }
    onSeek?.(target);
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const target = pos * duration;
    if (isWatchTogether) {
      sendSeek(target);
    } else {
      video.currentTime = target;
    }
    onSeek?.(target);
  };

  const handleProgressBarHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    setHoverPosition(pos * 100);
    setHoverTime(pos * duration);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const video = videoRef.current;
    if (!video) return;
    video.volume = val;
    setVolume(val);
    setIsMuted(val === 0);
  };

  const toggleFullscreen = () => {
    const container = playerContainerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  const handleResolutionChange = (resId: number | "auto") => {
    const player = shakaPlayerRef.current;
    if (!player) return;

    if (resId === "auto") {
      player.configure({ abr: { enabled: true } });
      setSelectedTrack("auto");
    } else {
      player.configure({ abr: { enabled: false } });
      const tracks = player.getVariantTracks();
      const chosenTrack = tracks.find((t: any) => t.id === resId);
      if (chosenTrack) {
        player.selectVariantTrack(chosenTrack, true);
        setSelectedTrack(resId);
      }
    }
    setShowSettings(false);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={playerContainerRef}
      onMouseMove={handleMouseMove}
      className="relative w-full h-screen bg-black overflow-hidden flex items-center justify-center select-none group"
    >
      {/* Vídeo HTML5 acoplado ao Shaka Player */}
      <video
        ref={videoRef}
        onClick={togglePlay}
        className="w-full h-full object-contain cursor-pointer"
        playsInline
      />

      {/* Spinner de Buffering / Loading */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
          <div className="w-14 h-14 border-4 border-white/20 border-t-[#e50914] rounded-full animate-spin" />
        </div>
      )}

      {/* Top Header Bar com Voltar e Título */}
      <div
        className={`absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/90 via-black/40 to-transparent flex items-center justify-between transition-opacity duration-300 z-30 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center space-x-4">
          <Link
            href="/"
            className="p-2 rounded-full bg-black/40 hover:bg-white/10 text-white backdrop-blur-md transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              {titleName}
            </h1>
            {episodeName && (
              <p className="text-xs text-[#9ba1b0]">{episodeName}</p>
            )}
          </div>
        </div>

        {/* HUD Interativo de Sincronização Watch Together com Telemetria de Drift */}
        {isWatchTogether && (
          <SyncHUD
            roomId={roomId}
            isConnected={isConnected}
            isSyncing={isSyncing}
            driftMs={driftMs}
            driftZone={driftZone}
            appliedSpeed={appliedSpeed}
            members={members}
          />
        )}
      </div>

      {/* Controles de Playback Inferiores */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/95 via-black/60 to-transparent flex flex-col space-y-3 transition-opacity duration-300 z-30 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Timeline / Barra de Progresso com Hover Thumbnail */}
        <div
          onClick={handleProgressBarClick}
          onMouseMove={handleProgressBarHover}
          onMouseLeave={() => {
            setHoverPosition(null);
            setHoverTime(null);
          }}
          className="relative w-full h-1.5 hover:h-2.5 bg-white/20 rounded-full cursor-pointer transition-all flex items-center"
        >
          {/* Barra Preenchida */}
          <div
            className="h-full bg-[#e50914] rounded-full relative"
            style={{ width: `${progressPercent}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-[#e50914] rounded-full shadow scale-0 group-hover:scale-100 transition-transform" />
          </div>

          {/* Tooltip de Hover */}
          {hoverPosition !== null && hoverTime !== null && (
            <div
              className="absolute -top-10 -translate-x-1/2 px-2 py-1 rounded bg-[#121318] border border-[#262833] text-[11px] font-semibold text-white shadow-xl pointer-events-none"
              style={{ left: `${hoverPosition}%` }}
            >
              {formatTime(hoverTime)}
            </div>
          )}
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center justify-between">
          {/* Lado Esquerdo: Play, Recuo/Avanço 10s, Volume, Tempo */}
          <div className="flex items-center space-x-4">
            <button
              onClick={togglePlay}
              aria-label={isPlaying ? "Pausar" : "Reproduzir"}
              className="text-white hover:text-[#e50914] transition-colors"
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 fill-current" />
              ) : (
                <Play className="w-6 h-6 fill-current" />
              )}
            </button>

            <button
              onClick={() => seekDelta(-10)}
              title="Voltar 10s (J)"
              className="text-white hover:text-neutral-300 transition-colors"
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            <button
              onClick={() => seekDelta(10)}
              title="Avançar 10s (L)"
              className="text-white hover:text-neutral-300 transition-colors"
            >
              <RotateCw className="w-5 h-5" />
            </button>

            {/* Controle de Volume */}
            <div className="flex items-center space-x-2 group/vol">
              <button onClick={toggleMute} className="text-white hover:text-neutral-300">
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 accent-[#e50914] cursor-pointer"
              />
            </div>

            {/* Timestamp */}
            <div className="text-xs font-medium text-[#9ba1b0]">
              <span className="text-white">{formatTime(currentTime)}</span> / {formatTime(duration)}
            </div>
          </div>

          {/* Lado Direito: Seletor de Resolução / ABR & Fullscreen */}
          <div className="flex items-center space-x-4 relative">
            {/* Menu de Configuração / Resolução */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              title="Qualidade do Vídeo (ABR)"
              className="text-white hover:text-neutral-300 transition-colors p-1"
            >
              <Settings className="w-5 h-5" />
            </button>

            {showSettings && (
              <div className="absolute right-10 bottom-8 bg-[#121318] border border-[#262833] rounded-lg shadow-2xl p-2 w-36 text-xs space-y-1 z-40">
                <div className="text-[#9ba1b0] px-2 py-1 font-bold border-b border-[#262833]">
                  Qualidade (ABR)
                </div>
                <button
                  onClick={() => handleResolutionChange("auto")}
                  className={`w-full text-left px-2 py-1.5 rounded transition-colors ${
                    selectedTrack === "auto"
                      ? "bg-[#e50914] text-white font-bold"
                      : "text-[#9ba1b0] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  Automática (ABR)
                </button>
                {availableResolutions.map((res) => (
                  <button
                    key={res.id}
                    onClick={() => handleResolutionChange(res.id)}
                    className={`w-full text-left px-2 py-1.5 rounded transition-colors ${
                      selectedTrack === res.id
                        ? "bg-[#e50914] text-white font-bold"
                        : "text-[#9ba1b0] hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {res.height}p HD
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Sair da tela cheia (F)" : "Tela cheia (F)"}
              className="text-white hover:text-neutral-300 transition-colors"
            >
              {isFullscreen ? (
                <Minimize className="w-5 h-5" />
              ) : (
                <Maximize className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
