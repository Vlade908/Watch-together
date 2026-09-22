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
  FileVideo,
  Sparkles,
  AlertTriangle,
  X,
  Popcorn,
  Clock,
  Lock,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWatchTogetherRoom } from "@/hooks/useWatchTogetherRoom";
import { MediaSourceType } from "@/types/sync";
import { getApiBaseUrl } from "@/context/AuthContext";
import { SyncHUD } from "./SyncHUD";
import { SourceSelectorModal } from "./SourceSelectorModal";
import {
  IMediaSourceDriver,
  LocalFileDriver,
  DirectUrlDriver,
  CatalogDemoDriver,
  isAdaptiveStreamUrl,
  isShakaLoadInterrupted,
  isShakaNetworkError,
  isShaka404Error,
} from "@/services/mediaDrivers";
import { extractCleanMediaTitle } from "@/services/mediaFingerprint";

interface VideoPlayerProps {
  manifestUrl: string;
  titleName: string;
  episodeName?: string;
  isWatchTogether?: boolean;
  roomId?: string;
  userId?: string;
  userName?: string;
  initialSourceType?: MediaSourceType;
  onMediaTitleChange?: (title: string) => void;
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
  initialSourceType,
  onMediaTitleChange,
  onTimeUpdate,
  onPlay,
  onPause,
  onSeek,
}: VideoPlayerProps) {
  const router = useRouter();
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
    isHost,
    roomState,
    sourceType,
    contentFingerprint,
    mediaTitle,
    remoteDirectUrl,
    localFingerprint,
    localFile,
    hashMatchStatus,
    changeMediaSource,
    registerLocalFile,
    sendPlay,
    sendPause,
    sendSeek,
  } = useWatchTogetherRoom({
    roomId,
    userId,
    userName,
    videoRef,
    enabled: isWatchTogether,
    initialSourceType,
    mediaTitle: titleName,
  });

  // Estados de Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferedPercentage, setBufferedPercentage] = useState(0);
  const [isProxyLoading, setIsProxyLoading] = useState(false);

  // Estados de UMSA & Modal de Seleção de Fontes
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const currentDriverRef = useRef<IMediaSourceDriver | null>(null);
  const loadSequenceRef = useRef<number>(0);

  // Prioriza URL remota direta caso a sala possua directUrl válida configurada
  const hasRemoteDirectUrl = Boolean(remoteDirectUrl && !remoteDirectUrl.startsWith("blob:"));
  const effectiveSourceType: MediaSourceType = hasRemoteDirectUrl
    ? "DIRECT_URL"
    : (sourceType || initialSourceType || "CATALOG_DEMO");

  // Título e subtítulo dinâmicos da mídia em exibição
  const displayTitle =
    mediaTitle ||
    (effectiveSourceType === "LOCAL_FILE" && localFile
      ? extractCleanMediaTitle(localFile.name)
      : titleName);

  const displaySubtitle =
    effectiveSourceType === "LOCAL_FILE"
      ? "Ficheiro Local (Zero Buffer / Syncplay)"
      : effectiveSourceType === "DIRECT_URL"
      ? "Transmissão Remota via URL Direta"
      : episodeName || "Catálogo de Demonstração (HLS ABR)";

  // Notifica componente pai sobre o título ativo e sincroniza aba do navegador
  useEffect(() => {
    if (displayTitle) {
      if (onMediaTitleChange) {
        onMediaTitleChange(displayTitle);
      }
      if (typeof document !== "undefined") {
        document.title = `${displayTitle} — Watch Together`;
      }
    }
  }, [displayTitle, onMediaTitleChange]);

  // Identificação do anfitrião e estado de espera para convidados
  const hostMember = members.find((m) => m.isHost);
  const hostDisplayName = hostMember?.userName || roomState?.hostName || "o Anfitrião";

  // O Convidado está em espera caso a sala ainda não possua mídia definida pelo Host.
  // Nota: No modo LOCAL_FILE, o participante NÃO fica preso no estado de espera genérico,
  // mas sim visualiza a tela orientativa específica para selecionar seu arquivo local correspondente.
  const isWaitingForHostMedia =
    isWatchTogether &&
    !isHost &&
    effectiveSourceType !== "LOCAL_FILE" &&
    ((effectiveSourceType === "DIRECT_URL" && !remoteDirectUrl) ||
      !roomState?.sourceType);

  const handleShakaError = useCallback((error: any) => {
    // 1. Silencia completamente o Shaka Error 7000 (LOAD_INTERRUPTED)
    // Ocorre quando um load() é cancelado por outro load() mais recente ou por desmontagem do componente
    if (isShakaLoadInterrupted(error)) {
      console.debug("[VideoPlayer] Operação load() do Shaka interrompida/cancelada (código 7000).");
      return;
    }

    const category = error?.category;
    const code = error?.code;
    const msg = error?.message || (typeof error === "string" ? error : "");

    // 2. Intercepta falhas no Proxy de Streaming (Erro Upstream 502/504 ou UPSTREAM_UNAVAILABLE)
    if (
      remoteDirectUrl?.includes("/api/proxy/") ||
      msg.includes("UPSTREAM") ||
      (code === 1002 && remoteDirectUrl?.includes("/api/proxy/"))
    ) {
      console.warn("[VideoPlayer] Erro upstream via proxy:", msg || error);
      setPlaybackError(
        "Não foi possível carregar via proxy: o link remoto expirou ou não respondeu (Erro Upstream)."
      );
      setIsLoading(false);
      setIsBuffering(false);

      if (shakaPlayerRef.current) {
        try {
          if (typeof shakaPlayerRef.current.detach === "function") {
            shakaPlayerRef.current.detach().catch(() => {});
          } else {
            shakaPlayerRef.current.unload().catch(() => {});
          }
        } catch {}
      }
      if (videoRef.current) {
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
      }
      return;
    }

    // 3. Intercepta especificamente HTTP 404 (Link expirado ou inexistente)
    if (isShaka404Error(error)) {
      console.warn("[VideoPlayer] Link de vídeo inexistente ou expirado (HTTP 404):", msg || error);
      setPlaybackError(
        "O link do vídeo expirou ou não foi encontrado no servidor de origem (Erro 404)."
      );
      setIsLoading(false);
      setIsBuffering(false);

      if (shakaPlayerRef.current) {
        try {
          if (typeof shakaPlayerRef.current.detach === "function") {
            shakaPlayerRef.current.detach().catch(() => {});
          } else {
            shakaPlayerRef.current.unload().catch(() => {});
          }
        } catch {}
      }
      if (videoRef.current) {
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
      }
      return;
    }

    // 4. Intercepta Shaka Error 1002 (BAD_HTTP_STATUS / CORS / 403) ou erro de rede (categoria 1)
    if (code === 1002 || category === 1 || isShakaNetworkError(error)) {
      console.warn("[VideoPlayer] Falha de conexão ao stream (Shaka Error 1002 / HTTP Inválido / CORS):", msg || error);
      setPlaybackError(
        "Não foi possível carregar o vídeo. O servidor de origem bloqueia reprodução externa (CORS) ou o link expirou."
      );
      setIsLoading(false);
      setIsBuffering(false);

      // Limpa buffer de reprodução de forma segura para evitar loops de recarga
      if (shakaPlayerRef.current) {
        try {
          if (typeof shakaPlayerRef.current.detach === "function") {
            shakaPlayerRef.current.detach().catch(() => {});
          } else {
            shakaPlayerRef.current.unload().catch(() => {});
          }
        } catch {}
      }
      if (videoRef.current) {
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
      }
      return;
    }

    if (code === 1001) {
      setPlaybackError("Protocolo ou formato de URL não suportado pelo player.");
    } else {
      console.error("[VideoPlayer] Erro interceptado do Shaka Player:", error);
      setPlaybackError(`Erro no player (${code || "desconhecido"}): ${msg || "Falha ao decodificar stream."}`);
    }
  }, [remoteDirectUrl]);

  // Tentativa segura de streaming via Proxy do Servidor com verificação de conectividade upstream
  const handleTryProxy = async () => {
    if (!remoteDirectUrl || isProxyLoading) return;
    setIsProxyLoading(true);
    setPlaybackError(null);
    setIsLoading(true);

    const apiBase = getApiBaseUrl();
    const proxiedUrl = `${apiBase}/api/proxy/manifest?url=${encodeURIComponent(remoteDirectUrl)}`;

    try {
      // Timeout de segurança de 10s para sondar o stream proxy antes da vinculação
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const probeRes = await fetch(proxiedUrl, {
        signal: controller.signal,
        headers: { Accept: "*/*" },
      });
      clearTimeout(timeoutId);

      if (!probeRes.ok) {
        let errorDetail = "";
        try {
          const errJson = await probeRes.json();
          errorDetail = errJson.message || errJson.details || errJson.error || "";
        } catch {}
        throw new Error(errorDetail || `HTTP ${probeRes.status}`);
      }

      // Conexão ao proxy validada com sucesso! Aplica a URL na sala
      if (isHost) {
        changeMediaSource("DIRECT_URL", {
          directUrl: proxiedUrl,
          mediaTitle: displayTitle,
        });
      } else {
        loadSequenceRef.current++;
      }
    } catch (err: any) {
      console.warn("[VideoPlayer] Falha ao conectar via Proxy do Servidor:", err);
      setPlaybackError(
        "Não foi possível carregar via proxy: o link remoto expirou ou não respondeu (Erro Upstream)."
      );
      setIsLoading(false);
      setIsBuffering(false);
    } finally {
      setIsProxyLoading(false);
    }
  };

  // Controle de abertura do modal de seleção de arquivo local:
  // Para o Host: abre imediatamente para que ele escolha o arquivo
  // Para o Convidado: abre APENAS após o Host ter enviado o arquivo (contentFingerprint presente)
  useEffect(() => {
    if (!isWatchTogether) return;

    if (isWaitingForHostMedia) {
      setIsSourceModalOpen(false);
      return;
    }

    if (effectiveSourceType === "LOCAL_FILE" && !localFile) {
      if (isHost) {
        setIsSourceModalOpen(true);
      } else if (contentFingerprint) {
        // Convidado só abre o seletor após o Host ter fornecido o fingerprint de referência
        setIsSourceModalOpen(true);
      }
    }
  }, [isWatchTogether, isHost, isWaitingForHostMedia, effectiveSourceType, localFile, contentFingerprint]);

  // Se a fonte for DIRECT_URL ou CATALOG_DEMO, garante que o modal feche (especialmente para o convidado)
  useEffect(() => {
    if (isWatchTogether) {
      if (effectiveSourceType === "DIRECT_URL" && remoteDirectUrl) {
        setIsSourceModalOpen(false);
      }
      if (!isHost && effectiveSourceType !== "LOCAL_FILE") {
        setIsSourceModalOpen(false);
      }
      if (isWaitingForHostMedia) {
        setIsSourceModalOpen(false);
      }
    }
  }, [isWatchTogether, isHost, isWaitingForHostMedia, effectiveSourceType, remoteDirectUrl]);

  // Controles & UI
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [availableResolutions, setAvailableResolutions] = useState<{ id: number; height: number }[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<number | "auto">("auto");

  // Hover Seek
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Inicializa o Driver de Mídia Adequado (UMSA) com Proteção de Concorrência
  useEffect(() => {
    let isMounted = true;
    const currentSeq = ++loadSequenceRef.current;

    async function getOrInitShakaPlayer(): Promise<any> {
      if (shakaPlayerRef.current) {
        const player = shakaPlayerRef.current;
        if (!player.getMediaElement() && videoRef.current) {
          try {
            await player.attach(videoRef.current);
          } catch (attachErr) {
            console.warn("[VideoPlayer] Erro ao re-anexar Shaka Player:", attachErr);
          }
        }
        return player;
      }
      if (!videoRef.current) return null;

      try {
        const shakaModule: any = await import("shaka-player/dist/shaka-player.compiled.js");
        const shaka = shakaModule.default || shakaModule;
        shaka.polyfill.installAll();

        if (!shaka.Player.isBrowserSupported()) {
          console.error("[VideoPlayer] Navegador não suporta Shaka Player!");
          return null;
        }

        const player = new shaka.Player();
        await player.attach(videoRef.current);
        shakaPlayerRef.current = player;

        player.configure({
          streaming: {
            rebufferingGoal: 2, // Segundos necessários antes de retomar a reprodução após starving
            bufferingGoal: 30, // Janela inteligente de buffer ahead de 30s (Padrão Netflix) para absorver oscilações
            bufferBehind: 15, // Buffer de 15s retido atrás para retrocessos curtos sem re-download
            segmentPrefetchLimit: 2, // Pré-busca concorrente de segmentos à frente
            stallEnabled: true,
            stallThreshold: 1,
            retryParameters: {
              maxAttempts: 1, // Evita loop infinito de tentativas de rede em caso de falha de CORS ou 404
            },
          },
          manifest: {
            retryParameters: {
              maxAttempts: 1, // Limita tentativas no manifesto para evitar loop
            },
          },
          abr: {
            enabled: true,
            defaultBandwidthEstimate: 2000000,
            switchInterval: 8,
          },
        });

        // Escuta eventos de buffering do Shaka Player (MSE)
        player.addEventListener("buffering", (event: any) => {
          if (!videoRef.current?.paused) {
            setIsBuffering(Boolean(event.buffering));
          } else {
            setIsBuffering(false);
          }
        });

        player.addEventListener("error", (event: any) => {
          handleShakaError(event.detail);
        });

        return player;
      } catch (err) {
        console.error("[VideoPlayer] Falha ao inicializar Shaka Player:", err);
        return null;
      }
    }

    async function setupSourceDriver() {
      if (!videoRef.current) return;

      // Limpa driver anterior caso exista
      if (currentDriverRef.current) {
        await currentDriverRef.current.detach().catch(() => {});
        currentDriverRef.current = null;
      }

      // Caso 1: Modo Ficheiro Local (Syncplay Web)
      if (isWatchTogether && effectiveSourceType === "LOCAL_FILE") {
        setPlaybackError(null);
        setAvailableResolutions([]);
        if (shakaPlayerRef.current) {
          try {
            if (typeof shakaPlayerRef.current.detach === "function") {
              await shakaPlayerRef.current.detach();
            } else {
              await shakaPlayerRef.current.unload();
            }
          } catch {}
        }

        if (localFile) {
          setIsLoading(true);
          try {
            const driver = new LocalFileDriver(localFile);
            await driver.initialize();
            if (!isMounted || currentSeq !== loadSequenceRef.current) return;
            await driver.attach(videoRef.current, shakaPlayerRef.current);
            if (isMounted && currentSeq === loadSequenceRef.current) {
              currentDriverRef.current = driver;
              setIsLoading(false);
            }
          } catch (err: any) {
            if (isShakaLoadInterrupted(err)) return;
            if (!isMounted || currentSeq !== loadSequenceRef.current) return;
            console.error("[VideoPlayer] Falha ao carregar driver de arquivo local:", err);
            setIsLoading(false);
          }
        } else {
          // Arquivo local pendente de seleção: NUNCA carrega Shaka ou Demo e NUNCA atribui blob/src vazio!
          if (videoRef.current) {
            videoRef.current.removeAttribute("src");
            videoRef.current.load();
          }
          setIsLoading(false);
          setDuration(0);
          setCurrentTime(0);
          setBufferedPercentage(0);
        }
        return;
      }

      // Caso 2: Modo URL Direta / Nuvem Pessoal
      if (isWatchTogether && effectiveSourceType === "DIRECT_URL") {
        const targetUrl =
          remoteDirectUrl ||
          (manifestUrl && !manifestUrl.includes("stream.mux.com") ? manifestUrl : "");

        if (targetUrl) {
          // Proteção contra URLs blob: originadas de outras máquinas
          if (targetUrl.startsWith("blob:") && !localFile) {
            console.warn("[VideoPlayer] URL blob: remota detectada. Bloqueando carregamento no Shaka Player.");
            setPlaybackError(
              "O anfitrião selecionou um arquivo local ('blob:'). Arquivos locais devem ser carregados individualmente por cada participante em seu próprio computador (modo Syncplay) ou enviados via catálogo."
            );
            setIsLoading(false);
            setIsBuffering(false);
            return;
          }

          setIsLoading(true);
          setPlaybackError(null);
          try {
            const isAdaptive = isAdaptiveStreamUrl(targetUrl);
            let shaka = null;
            if (isAdaptive) {
              shaka = await getOrInitShakaPlayer();
              if (!isMounted || currentSeq !== loadSequenceRef.current) return;
            } else {
              // Arquivo progressivo direto (.mp4, .webm, .ogv)
              // Descarrega e desanexa completamente o Shaka Player para que os listeners internos
              // não interceptem os eventos nativos nem colidam com ORB (Shaka Error 3016)
              if (shakaPlayerRef.current) {
                try {
                  if (typeof shakaPlayerRef.current.detach === "function") {
                    await shakaPlayerRef.current.detach();
                  } else {
                    await shakaPlayerRef.current.unload();
                  }
                } catch {}
              }
              setAvailableResolutions([]);
            }

            const driver = new DirectUrlDriver(targetUrl, mediaTitle);
            await driver.attach(videoRef.current, shaka);

            if (!isMounted || currentSeq !== loadSequenceRef.current) return;

            currentDriverRef.current = driver;

            // Se for HLS/DASH via Shaka Player, extrai faixas de resolução
            if (shaka && isAdaptive) {
              try {
                const tracks = shaka.getVariantTracks();
                const uniqueHeights = Array.from(
                  new Set(tracks.map((t: any) => t.height).filter(Boolean))
                ) as number[];

                const resolutions = uniqueHeights
                  .sort((b, a) => a - b)
                  .map((height) => {
                    const track = tracks.find((t: any) => t.height === height);
                    return { id: track.id, height };
                  });

                setAvailableResolutions(resolutions);
              } catch {}
            }

            setIsLoading(false);
          } catch (err: any) {
            if (isShakaLoadInterrupted(err)) {
              console.debug("[VideoPlayer] Carregamento de URL direta cancelado/interrompido (código 7000).");
              return;
            }
            if (!isMounted || currentSeq !== loadSequenceRef.current) return;

            setIsLoading(false);
            handleShakaError(err);
          }
        } else {
          // Convidado aguardando o host fornecer a URL direta
          if (shakaPlayerRef.current) {
            try {
              if (typeof shakaPlayerRef.current.detach === "function") {
                await shakaPlayerRef.current.detach();
              } else {
                await shakaPlayerRef.current.unload();
              }
            } catch {}
          }
          setAvailableResolutions([]);
          if (videoRef.current) {
            videoRef.current.removeAttribute("src");
            videoRef.current.load();
          }
          setIsLoading(true);
        }
        return;
      }

      // Caso 3: Modo Catálogo Demo / HLS Padrão
      const targetManifest = manifestUrl;
      if (!targetManifest || typeof targetManifest !== "string" || !targetManifest.trim()) {
        if (shakaPlayerRef.current) {
          try {
            if (typeof shakaPlayerRef.current.detach === "function") {
              await shakaPlayerRef.current.detach();
            } else {
              await shakaPlayerRef.current.unload();
            }
          } catch {}
        }
        setAvailableResolutions([]);
        setIsLoading(false);
        return;
      }

      if (targetManifest.startsWith("blob:") && !localFile) {
        setPlaybackError(
          "Arquivos locais ('blob:') não podem ser carregados via URL de rede. Cada participante deve selecionar seu próprio arquivo local (modo Syncplay) ou o anfitrião deve utilizar um título do catálogo."
        );
        setIsLoading(false);
        setIsBuffering(false);
        return;
      }

      setPlaybackError(null);
      try {
        const player = await getOrInitShakaPlayer();
        if (!player || !isMounted || currentSeq !== loadSequenceRef.current) {
          setIsLoading(false);
          return;
        }

        // Limpa src nativo para evitar conflito com MSE
        if (videoRef.current) {
          videoRef.current.removeAttribute("src");
          videoRef.current.load();
        }

        await player.load(targetManifest);

        if (!isMounted || currentSeq !== loadSequenceRef.current) return;

        const tracks = player.getVariantTracks();
        const uniqueHeights = Array.from(
          new Set(tracks.map((t: any) => t.height).filter(Boolean))
        ) as number[];

        const resolutions = uniqueHeights
          .sort((b, a) => a - b)
          .map((height) => {
            const track = tracks.find((t: any) => t.height === height);
            return { id: track.id, height };
          });

        setAvailableResolutions(resolutions);
        setIsLoading(false);
      } catch (err: any) {
        if (isShakaLoadInterrupted(err)) {
          console.debug("[VideoPlayer] Carregamento do Catálogo Demo cancelado/interrompido (código 7000).");
          return;
        }
        if (!isMounted || currentSeq !== loadSequenceRef.current) return;

        console.error("[VideoPlayer] Falha ao inicializar Shaka Player no Catálogo Demo:", err);
        setIsLoading(false);
        handleShakaError(err);
      }
    }

    setupSourceDriver();

    return () => {
      isMounted = false;
      loadSequenceRef.current++;
      if (currentDriverRef.current) {
        currentDriverRef.current.detach().catch(() => {});
      }
    };
  }, [
    manifestUrl,
    isWatchTogether,
    sourceType,
    effectiveSourceType,
    localFile,
    remoteDirectUrl,
    mediaTitle,
    handleShakaError,
  ]);

  // Destruição do Shaka Player na desmontagem do componente
  useEffect(() => {
    return () => {
      if (shakaPlayerRef.current) {
        try {
          shakaPlayerRef.current.destroy().catch(() => {});
        } catch {}
        shakaPlayerRef.current = null;
      }
    };
  }, []);

  // 2. Event Listeners do Elemento <video>
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const calculateBuffered = () => {
      const video = videoRef.current;
      if (!video || !video.duration || video.buffered.length === 0) {
        setBufferedPercentage(0);
        return;
      }
      const current = video.currentTime;
      let end = 0;
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= current && current <= video.buffered.end(i)) {
          end = video.buffered.end(i);
          break;
        }
      }
      // Fallback se estiver no início e current ainda não entrou no range
      if (end === 0 && video.buffered.length > 0) {
        end = video.buffered.end(video.buffered.length - 1);
      }
      const pct = Math.min(100, Math.max(0, (end / video.duration) * 100));
      setBufferedPercentage(pct);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      calculateBuffered();
      onTimeUpdate?.(video.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
      calculateBuffered();
    };

    const handleProgress = () => {
      calculateBuffered();
    };

    const handlePlay = () => {
      setIsPlaying(true);
      onPlay?.();
    };

    const handlePause = () => {
      setIsPlaying(false);
      setIsBuffering(false);
      setIsLoading(false);
      onPause?.();
    };

    const handleWaiting = () => {
      // Se o vídeo estiver pausado, o evento waiting nunca deve ativar o spinner de buffering
      if (!video.paused) {
        setIsBuffering(true);
      }
    };

    const handlePlaying = () => {
      setIsBuffering(false);
      setIsLoading(false);
    };

    const handleCanPlay = () => {
      setIsBuffering(false);
      setIsLoading(false);
    };

    const handleSeeking = () => {
      // Apenas marca buffering se o vídeo estiver em reprodução ativa
      if (!video.paused) {
        setIsBuffering(true);
      }
      calculateBuffered();
    };

    const handleSeeked = () => {
      setIsBuffering(false);
      if (video.paused) {
        setIsLoading(false);
      }
      calculateBuffered();
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("progress", handleProgress);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("seeking", handleSeeking);
    video.addEventListener("seeked", handleSeeked);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("progress", handleProgress);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("seeking", handleSeeking);
      video.removeEventListener("seeked", handleSeeked);
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

  // Notifica componentes acoplados (como HUD de Party) sobre visibilidade dos controles
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("watch-controls-visible", { detail: { visible: showControls } })
      );
    }
  }, [showControls]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isWatchTogether && !isHost) {
      return;
    }

    if (video.paused) {
      if (isWatchTogether) {
        sendPlay(video.currentTime);
      } else {
        video.play().catch(() => {});
      }
    } else {
      setIsBuffering(false);
      setIsLoading(false);
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
    if (isWatchTogether && !isHost) return;

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
    if (isWatchTogether && !isHost) return;

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

  // Estado explícito de pausa: se o vídeo está deliberadamente pausado, o spinner central de loading é forçado a false
  const isPaused = !isPlaying || (videoRef.current ? videoRef.current.paused : true);
  const isInitialLoading = isLoading && duration === 0 && (!videoRef.current || videoRef.current.readyState < 2);
  const showSpinner = isInitialLoading || (isBuffering && !isPaused);

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

      {/* Spinner de Buffering / Loading (Estritamente desabilitado durante pausa) */}
      {showSpinner && (
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
              {displayTitle}
            </h1>
            <p className="text-xs text-[#9ba1b0]">{displaySubtitle}</p>
          </div>
        </div>

        {/* HUD Interativo de Sincronização Watch Together com Telemetria de Drift & UMSA */}
        {isWatchTogether && (
          <SyncHUD
            roomId={roomId}
            isConnected={isConnected}
            isSyncing={isSyncing}
            driftMs={driftMs}
            driftZone={driftZone}
            appliedSpeed={appliedSpeed}
            members={members}
            sourceType={sourceType}
            hashMatchStatus={hashMatchStatus}
            mediaTitle={displayTitle}
            isHost={isHost}
            onOpenSourceModal={() => setIsSourceModalOpen(true)}
          />
        )}
      </div>

      {/* Banner de Erro de Reprodução / CORS */}
      {playbackError && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[92%] animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto">
          <div className="bg-[#181112]/95 border border-red-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-md flex items-start space-x-3.5 text-red-200">
            <div className="p-2 rounded-xl bg-red-500/20 text-red-400 flex-none mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-2 flex-1 text-xs">
              <div className="flex items-center justify-between">
                <p className="font-bold text-white text-sm">Falha no Carregamento da Mídia</p>
                <button
                  onClick={() => setPlaybackError(null)}
                  className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-neutral-300 leading-relaxed">{playbackError}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {isHost && (
                  <button
                    onClick={() => {
                      setPlaybackError(null);
                      setIsSourceModalOpen(true);
                    }}
                    className="py-1.5 px-3 rounded-lg bg-[#E50914] hover:bg-[#ff2b36] text-white font-semibold text-[11px] transition-colors cursor-pointer shadow-md shadow-[#E50914]/20 flex items-center space-x-1.5"
                  >
                    <span>Tentar outra URL</span>
                  </button>
                )}
                {!playbackError.includes("404") &&
                  !playbackError.includes("Upstream") &&
                  playbackError.includes("CORS") &&
                  effectiveSourceType === "DIRECT_URL" &&
                  remoteDirectUrl &&
                  !remoteDirectUrl.includes("/api/proxy/manifest") && (
                    <button
                      onClick={handleTryProxy}
                      disabled={isProxyLoading}
                      className="py-1.5 px-3 rounded-lg bg-blue-600/80 hover:bg-blue-600 disabled:opacity-60 text-white font-semibold text-[11px] transition-colors cursor-pointer flex items-center space-x-1.5"
                    >
                      {isProxyLoading ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Conectando ao Proxy...</span>
                        </>
                      ) : (
                        <span>Tentar via Proxy do Servidor</span>
                      )}
                    </button>
                  )}
                <Link
                  href="/"
                  className="py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-200 hover:text-white font-medium text-[11px] transition-colors cursor-pointer flex items-center space-x-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                  <span>Voltar ao Catálogo</span>
                </Link>
                {!playbackError.includes("404") && (
                  <button
                    onClick={() => {
                      setPlaybackError(null);
                      setIsLoading(true);
                      loadSequenceRef.current++;
                    }}
                    className="py-1.5 px-3 rounded-lg bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white font-medium text-[11px] transition-colors cursor-pointer"
                  >
                    Tentar Novamente
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
          title={isWatchTogether && !isHost ? "A reprodução é controlada pelo Anfitrião" : undefined}
          className={`relative w-full h-1.5 hover:h-2.5 bg-white/20 rounded-full transition-all flex items-center ${
            isWatchTogether && !isHost ? "cursor-not-allowed opacity-90" : "cursor-pointer"
          }`}
        >
          {/* Barra de Buffer (Estilo YouTube/Netflix) */}
          <div
            className="absolute left-0 top-0 h-full bg-white/40 rounded-full transition-all duration-200 pointer-events-none"
            style={{ width: `${bufferedPercentage}%` }}
          />

          {/* Barra Preenchida / Progresso Atual (Played) */}
          <div
            className="h-full bg-[#e50914] rounded-full relative z-10 transition-all duration-75"
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
              disabled={isWatchTogether && !isHost}
              aria-label={isPlaying ? "Pausar" : "Reproduzir"}
              title={
                isWatchTogether && !isHost
                  ? "Reprodução controlada pelo Anfitrião"
                  : isPlaying
                  ? "Pausar"
                  : "Reproduzir"
              }
              className={`transition-colors flex items-center gap-1.5 ${
                isWatchTogether && !isHost
                  ? "text-neutral-400 cursor-not-allowed"
                  : "text-white hover:text-[#e50914]"
              }`}
            >
              {isWatchTogether && !isHost ? (
                <Lock className="w-4 h-4 text-neutral-400" />
              ) : isPlaying ? (
                <Pause className="w-6 h-6 fill-current" />
              ) : (
                <Play className="w-6 h-6 fill-current" />
              )}
            </button>

            <button
              onClick={() => seekDelta(-10)}
              disabled={isWatchTogether && !isHost}
              title={isWatchTogether && !isHost ? "Controlado pelo Anfitrião" : "Voltar 10s (J)"}
              className={`transition-colors ${
                isWatchTogether && !isHost
                  ? "text-neutral-500 cursor-not-allowed"
                  : "text-white hover:text-neutral-300"
              }`}
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            <button
              onClick={() => seekDelta(10)}
              disabled={isWatchTogether && !isHost}
              title={isWatchTogether && !isHost ? "Controlado pelo Anfitrião" : "Avançar 10s (L)"}
              className={`transition-colors ${
                isWatchTogether && !isHost
                  ? "text-neutral-500 cursor-not-allowed"
                  : "text-white hover:text-neutral-300"
              }`}
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
              className="text-white hover:text-neutral-300 transition-colors cursor-pointer"
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

      {/* Overlay de Sala em Espera para Convidados */}
      {isWaitingForHostMedia && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-6 animate-in fade-in duration-300 pointer-events-auto">
          <div className="max-w-md w-full bg-[#141414] border border-white/10 rounded-3xl p-8 text-center space-y-6 shadow-2xl relative overflow-hidden">
            {/* Glow decorativo de fundo */}
            <div className="absolute -top-20 -left-20 w-40 h-40 bg-[#E50914]/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-[#E50914]/15 rounded-full blur-3xl pointer-events-none" />

            <div className="relative">
              <div className="w-18 h-18 mx-auto rounded-2xl bg-gradient-to-tr from-[#E50914]/20 to-[#E50914]/10 border border-[#E50914]/30 flex items-center justify-center shadow-lg shadow-[#E50914]/20">
                <Popcorn className="w-9 h-9 text-[#E50914] animate-bounce" />
              </div>
            </div>

            <div className="space-y-2 relative">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#E50914]/15 border border-[#E50914]/30 text-[#ff4d58] text-[11px] font-bold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-[#E50914] animate-ping" />
                <span>Sala em Espera</span>
              </span>

              <h3 className="text-lg font-bold text-white tracking-tight pt-1">
                Aguardando o anfitrião ({hostDisplayName}) iniciar a transmissão...
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed max-w-sm mx-auto">
                Relaxe e prepare a pipoca! Assim que <strong className="text-white">{hostDisplayName}</strong> escolher o conteúdo, a sua tela será sincronizada automaticamente.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center space-x-2 text-neutral-500 text-xs">
              <Clock className="w-4 h-4 animate-spin" />
              <span>Sincronia Cristian&apos;s Algorithm em standby</span>
            </div>
          </div>
        </div>
      )}

      {/* Overlay para Modo Ficheiro Local quando o arquivo não está carregado */}
      {isWatchTogether && effectiveSourceType === "LOCAL_FILE" && !localFile && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-in fade-in">
          <div className="max-w-md w-full bg-[#161616] border border-white/15 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#E50914]/20 text-[#E50914] flex items-center justify-center">
              <FileVideo className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-white tracking-tight">
                Sessão em Modo Ficheiro Local (Syncplay)
              </h3>
              <p className="text-xs text-neutral-300 leading-relaxed">
                {isHost
                  ? "Selecione o arquivo de vídeo (.mp4, .webm) no seu computador para iniciar a reprodução da sala com fidelidade nativa e zero tráfego no servidor."
                  : "O host está compartilhando um arquivo local. Para sincronizar via Syncplay, selecione a mesma cópia do arquivo no seu computador."}
              </p>
            </div>
            <button
              onClick={() => setIsSourceModalOpen(true)}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#B20710] to-[#E50914] hover:from-[#c20812] hover:to-[#ff2b36] text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-[#E50914]/30 flex items-center justify-center space-x-2 cursor-pointer"
            >
              <FileVideo className="w-4 h-4" />
              <span>{isHost ? "Selecionar Meu Arquivo Local" : "Selecionar Arquivo Local"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal de Seleção de Fonte de Mídia (UMSA / BYOM) */}
      <SourceSelectorModal
        isOpen={isSourceModalOpen && !isWaitingForHostMedia}
        onClose={() => setIsSourceModalOpen(false)}
        isHost={isHost}
        currentSourceType={effectiveSourceType}
        expectedFingerprint={contentFingerprint}
        remoteDirectUrl={remoteDirectUrl || undefined}
        currentMediaTitle={displayTitle}
        onSelectLocalFile={(file, fingerprint, customTitle) => {
          registerLocalFile(file, fingerprint);
          if (isHost) {
            changeMediaSource("LOCAL_FILE", {
              contentFingerprint: fingerprint,
              mediaTitle: customTitle || extractCleanMediaTitle(file.name),
            });
            if (typeof window !== "undefined" && !window.location.pathname.includes("/watch/arquivo-local")) {
              const roomQuery = roomId ? `?mode=room&room=${encodeURIComponent(roomId)}` : "";
              router.push(`/watch/arquivo-local${roomQuery}`);
            }
          }
        }}
        onSelectDirectUrl={(url, title) => {
          if (isHost) {
            changeMediaSource("DIRECT_URL", {
              directUrl: url,
              mediaTitle: title || extractCleanMediaTitle(url),
            });
            if (typeof window !== "undefined" && window.location.pathname.includes("/watch/arquivo-local")) {
              const roomQuery = roomId ? `?mode=room&room=${encodeURIComponent(roomId)}` : "";
              router.push(`/watch/direto${roomQuery}`);
            }
          }
        }}
        onSelectCatalogDemo={() => {
          if (isHost) {
            changeMediaSource("CATALOG_DEMO", {
              mediaTitle: titleName,
            });
          }
        }}
      />
    </div>
  );
}
