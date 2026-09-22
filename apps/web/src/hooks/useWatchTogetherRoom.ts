"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { RoomState, RoomMember, ServerMessage, ClientMessage, MediaSourceType } from "../types/sync";
import { ClockSyncEngine, DriftController, DriftEvaluationResult } from "../services/syncEngine";
import { useAuth } from "@/context/AuthContext";
import { getWsBaseUrl } from "@/utils/network";

interface UseWatchTogetherRoomOptions {
  roomId: string;
  userId?: string;
  userName?: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled?: boolean;
  initialSourceType?: MediaSourceType;
  mediaTitle?: string;
}

export function useWatchTogetherRoom({
  roomId,
  userId,
  userName = "Você",
  videoRef,
  enabled = true,
  initialSourceType,
  mediaTitle,
}: UseWatchTogetherRoomOptions) {
  const router = useRouter();
  const { user: authUser } = useAuth();

  const computedInitialSourceType: MediaSourceType = useMemo(() => {
    if (initialSourceType) return initialSourceType;
    if (roomId.includes("arquivo-local")) return "LOCAL_FILE";
    if (roomId.includes("direto") || roomId.includes("url")) return "DIRECT_URL";
    return "CATALOG_DEMO";
  }, [initialSourceType, roomId]);

  // Fallback estável apenas se o usuário não possuir ID autenticado
  const [stableFallbackUserId] = useState<string>(() => `user-${Math.random().toString(36).substring(2, 8)}`);

  // Identidade reativa vinculada ao AuthContext (garante sincronismo com sub do JWT)
  const currentUserId = useMemo(() => {
    if (authUser?.id) return authUser.id;
    if (userId) return userId;
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("watch_together_user");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.id) return parsed.id;
        }
      } catch {}
    }
    return stableFallbackUserId;
  }, [authUser?.id, userId, stableFallbackUserId]);

  const currentUserName = useMemo(() => {
    if (authUser?.name) return authUser.name;
    if (userName && userName !== "Você") return userName;
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("watch_together_user");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.name) return parsed.name;
        }
      } catch {}
    }
    return userName || "Você";
  }, [authUser?.name, userName]);

  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [driftMs, setDriftMs] = useState(0);
  const [driftZone, setDriftZone] = useState<1 | 2 | 3>(1);
  const [appliedSpeed, setAppliedSpeed] = useState(1.0);
  const [chatMessages, setChatMessages] = useState<
    Array<{ id: string; text: string; senderName: string; timestamp: number }>
  >([]);

  // Estados UMSA (Fase 1 - Multi-Fonte & BYOM)
  const [localFingerprint, setLocalFingerprint] = useState<string | null>(null);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [remoteDirectUrl, setRemoteDirectUrl] = useState<string | null>(null);

  // Isolamento de Rota: se a sala alternar entre Ficheiro Local e URL Remota,
  // migra a navegação dos clientes para isolar drivers e evitar requisições a blobs inexistentes
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const currentPath = window.location.pathname;

    const isDirect =
      roomState?.sourceType === "DIRECT_URL" ||
      Boolean(remoteDirectUrl && !remoteDirectUrl.startsWith("blob:")) ||
      Boolean(roomState?.directUrl && !roomState.directUrl.startsWith("blob:"));

    if (isDirect && currentPath.includes("/watch/arquivo-local")) {
      const roomParam = roomId ? `?mode=room&room=${encodeURIComponent(roomId)}` : "";
      console.log(`[Watch Together Room] Migrando rota de /watch/arquivo-local para /watch/direto${roomParam}`);
      router.replace(`/watch/direto${roomParam}`);
    } else if (roomState?.sourceType === "LOCAL_FILE" && !isDirect && currentPath.includes("/watch/direto")) {
      const roomParam = roomId ? `?mode=room&room=${encodeURIComponent(roomId)}` : "";
      console.log(`[Watch Together Room] Migrando rota de /watch/direto para /watch/arquivo-local${roomParam}`);
      router.replace(`/watch/arquivo-local${roomParam}`);
    }
  }, [enabled, roomState?.sourceType, roomState?.directUrl, remoteDirectUrl, roomId, router]);

  const socketRef = useRef<WebSocket | null>(null);
  const clockSyncRef = useRef<ClockSyncEngine>(new ClockSyncEngine());
  const isLocalActionRef = useRef<boolean>(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Envio de mensagens tipadas para o servidor
  const send = useCallback((msg: ClientMessage) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Determina a URL do WebSocket com resolução limpa para produção e rede local (LAN)
  const resolveWsUrl = useCallback((room: string, _attempt = 0) => {
    const base = getWsBaseUrl();
    const storedToken = typeof window !== "undefined" ? localStorage.getItem("watch_together_token") : null;
    const tokenQuery = storedToken ? `?token=${encodeURIComponent(storedToken)}` : "";

    return `${base}/ws/rooms/${encodeURIComponent(room)}${tokenQuery}`;
  }, []);

  // 1. Ciclo de Conexão WebSocket
  useEffect(() => {
    if (!enabled || !roomId) return;

    let isUnmounted = false;
    let attemptCount = 0;

    function connect() {
      if (isUnmounted) return;
      const wsUrl = resolveWsUrl(roomId, attemptCount);
      console.log(`[Watch Together] Conectando à sala: '${roomId}' via ${wsUrl}...`);

      try {
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          if (isUnmounted) return;
          setIsConnected(true);
          attemptCount = 0;
          console.log(`[Watch Together] ✓ Conectado com sucesso à sala '${roomId}'.`);

          // Dispara handshake inicial de sincronização de relógio
          ws.send(JSON.stringify({ type: "sync_clock", clientSendTime: Date.now() }));

          // Entra na sala com credenciais estáveis do usuário autenticado e modalidade inicial
          ws.send(
            JSON.stringify({
              type: "join_room",
              roomId,
              userId: currentUserId,
              userName: currentUserName,
              initialSourceType: computedInitialSourceType,
              mediaTitle,
            })
          );
        };

        ws.onmessage = (event) => {
          if (isUnmounted) return;
          try {
            const message = JSON.parse(event.data) as ServerMessage;

            switch (message.type) {
              case "pong": {
                // Heartbeat mantido com sucesso contra quedas em dados móveis (CGNAT 4G/5G)
                break;
              }

              case "clock_pong": {
                clockSyncRef.current.processClockPong(
                  message.clientSendTime,
                  message.serverReceiveTime,
                  message.serverSendTime
                );
                setIsSyncing(false);
                break;
              }

              case "room_state": {
                setRoomState(message.state);
                setMembers(message.members);
                if (
                  message.state.sourceType === "DIRECT_URL" &&
                  message.state.directUrl &&
                  !message.state.directUrl.startsWith("blob:")
                ) {
                  setRemoteDirectUrl(message.state.directUrl);
                } else if (message.state.sourceType !== "DIRECT_URL") {
                  setRemoteDirectUrl(null);
                }

                // Alinha o vídeo local com o estado inicial apenas se houver fonte válida
                const authoritativeTime =
                  clockSyncRef.current.calculateAuthoritativeMediaTime(message.state) ||
                  message.currentMediaTime;

                if (videoRef.current) {
                  const video = videoRef.current;
                  const isBlobWithoutFile = !localFile && Boolean(video.currentSrc?.startsWith("blob:") || video.src?.startsWith("blob:"));
                  const hasValidSource = Boolean(video.currentSrc && video.currentSrc !== window.location.href && !isBlobWithoutFile);

                  if (hasValidSource) {
                    isLocalActionRef.current = true;
                    video.currentTime = authoritativeTime;
                    if (message.state.status === "PLAYING") {
                      video.play().catch(() => {});
                    } else {
                      video.pause();
                    }
                    setTimeout(() => {
                      isLocalActionRef.current = false;
                    }, 300);
                  }
                }
                break;
              }

              case "playback_update": {
                setRoomState(message.state);

                // Aplica a ação recebida da sala se não foi disparada localmente e houver fonte válida
                if (videoRef.current && !isLocalActionRef.current) {
                  const video = videoRef.current;
                  const isBlobWithoutFile = !localFile && Boolean(video.currentSrc?.startsWith("blob:") || video.src?.startsWith("blob:"));
                  const hasValidSource = Boolean(video.currentSrc && video.currentSrc !== window.location.href && !isBlobWithoutFile);

                  if (hasValidSource) {
                    const authoritativeTime = clockSyncRef.current.calculateAuthoritativeMediaTime(message.state);
                    isLocalActionRef.current = true;

                    if (message.action === "PLAY") {
                      video.currentTime = authoritativeTime;
                      video.play().catch(() => {});
                    } else if (message.action === "PAUSE") {
                      video.currentTime = message.state.referenceMediaTime;
                      video.pause();
                    } else if (message.action === "SEEK") {
                      video.currentTime = authoritativeTime;
                    }

                    setTimeout(() => {
                      isLocalActionRef.current = false;
                    }, 300);
                  }
                }
                break;
              }

              case "source_updated": {
                setRoomState(message.state);
                if (message.state.sourceType === "DIRECT_URL") {
                  const newDirectUrl = message.directUrl || message.state.directUrl;
                  if (newDirectUrl && !newDirectUrl.startsWith("blob:")) {
                    setRemoteDirectUrl(newDirectUrl);
                  } else {
                    setRemoteDirectUrl(null);
                  }
                } else {
                  setRemoteDirectUrl(null);
                }
                break;
              }

              case "member_joined": {
                setMembers((prev) => {
                  const exists = prev.some((m) => m.userId === message.member.userId);
                  return exists ? prev : [...prev, message.member];
                });
                break;
              }

              case "member_left": {
                setMembers((prev) => prev.filter((m) => m.userId !== message.userId));
                break;
              }

              case "chat_broadcast": {
                setChatMessages((prev) => [
                  ...prev.slice(-49), // Mantém no máximo 50 mensagens
                  {
                    id: message.id,
                    text: message.text,
                    senderName: message.senderName,
                    timestamp: message.timestamp,
                  },
                ]);
                break;
              }

              case "error": {
                console.warn("[Watch Together Server Alert]:", message.message);
                break;
              }
            }
          } catch (parseErr) {
            console.error("[Watch Together] Erro ao processar payload:", parseErr);
          }
        };

        ws.onclose = (event) => {
          if (isUnmounted) return;
          setIsConnected(false);
          setIsSyncing(true);
          attemptCount++;
          console.warn(
            `[Watch Together] Conexão WebSocket encerrada (código: ${event.code}, motivo: "${event.reason || "desconexão"}"). Reconectando em 2.5s...`
          );
          reconnectTimeoutRef.current = setTimeout(connect, 2500);
        };

        ws.onerror = (err) => {
          if (isUnmounted) return;
          // Evita console.error para não acionar o interceptor fatal de erros do Next.js 15 em dev
          console.warn(
            `[Watch Together] Aviso de conexão WebSocket (${wsUrl}). O cliente tentará reconectar automaticamente:`,
            err
          );
        };
      } catch (e) {
        if (isUnmounted) return;
        attemptCount++;
        console.warn(`[Watch Together] Falha ao instanciar WebSocket (${wsUrl}):`, e);
        reconnectTimeoutRef.current = setTimeout(connect, 2500);
      }
    }

    connect();

    // Heartbeat periódico (Ping/Pong) a cada 20 segundos para manter a conexão aberta contra CGNAT (4G/5G) e proxies
    const heartbeatInterval = setInterval(() => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 20000);

    // Loop contínuo de sincronização de relógio (NTP) a cada 4 segundos
    const clockInterval = setInterval(() => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({ type: "sync_clock", clientSendTime: Date.now() })
        );
      }
    }, 4000);

    return () => {
      isUnmounted = true;
      clearInterval(heartbeatInterval);
      clearInterval(clockInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        const sock = socketRef.current;
        // Desanexa os event listeners antes de fechar para evitar que eventos abortados
        // do React Strict Mode disparem handlers durante o desmonte
        sock.onopen = null;
        sock.onmessage = null;
        sock.onerror = null;
        sock.onclose = null;
        if (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING) {
          try {
            sock.close();
          } catch {}
        }
        socketRef.current = null;
      }
    };
  }, [roomId, currentUserId, currentUserName, enabled, resolveWsUrl, videoRef, localFile]);

  // 1.1 Sincronização e alinhamento autoritativo quando o player de vídeo estiver pronto
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !roomState || !enabled || !isConnected) return;
    const isBlobWithoutFile = !localFile && Boolean(video.currentSrc?.startsWith("blob:") || video.src?.startsWith("blob:"));
    if (!video.currentSrc || video.currentSrc === window.location.href || isBlobWithoutFile) return;

    const syncInitialVideoState = () => {
      if (isLocalActionRef.current) return;
      const authoritativeTime = clockSyncRef.current.calculateAuthoritativeMediaTime(roomState);
      if (Math.abs(video.currentTime - authoritativeTime) > 0.3) {
        isLocalActionRef.current = true;
        video.currentTime = authoritativeTime;
        setTimeout(() => {
          isLocalActionRef.current = false;
        }, 300);
      }
      if (roomState.status === "PLAYING" && video.paused) {
        video.play().catch(() => {});
      } else if (roomState.status === "PAUSED" && !video.paused) {
        video.pause();
      }
    };

    if (video.readyState >= 1) {
      syncInitialVideoState();
    } else {
      video.addEventListener("loadedmetadata", syncInitialVideoState, { once: true });
      video.addEventListener("canplay", syncInitialVideoState, { once: true });
      return () => {
        video.removeEventListener("loadedmetadata", syncInitialVideoState);
        video.removeEventListener("canplay", syncInitialVideoState);
      };
    }
  }, [roomState, isConnected, enabled, videoRef, localFile]);

  // 2. Loop do Controlador de Drift em 3 Zonas (Executado a cada 500ms)
  useEffect(() => {
    if (!enabled || !isConnected || !roomState || !videoRef.current) return;

    const driftInterval = setInterval(() => {
      const video = videoRef.current;
      if (!video || isLocalActionRef.current) return;
      const isBlobWithoutFile = !localFile && Boolean(video.currentSrc?.startsWith("blob:") || video.src?.startsWith("blob:"));
      if (!video.currentSrc || video.currentSrc === window.location.href || isBlobWithoutFile) return;

      const authoritativeTime = clockSyncRef.current.calculateAuthoritativeMediaTime(roomState);
      const isRoomPlaying = roomState.status === "PLAYING";

      const evaluation: DriftEvaluationResult = DriftController.evaluate(
        video,
        authoritativeTime,
        isRoomPlaying
      );

      setDriftMs(evaluation.driftMs);
      setDriftZone(evaluation.zone);
      setAppliedSpeed(evaluation.appliedSpeed);
    }, 500);

    return () => clearInterval(driftInterval);
  }, [enabled, isConnected, roomState, videoRef, localFile]);

  // Verifica se o usuário atual é o Host da sala comparando com o hostId autoritativo no Redis
  const isHost = useMemo(() => {
    if (!roomState?.hostId || !currentUserId) return false;
    return roomState.hostId === currentUserId;
  }, [roomState?.hostId, currentUserId]);

  // Logs contextuais no console para diagnóstico imediato no navegador
  useEffect(() => {
    if (roomState?.hostId && currentUserId) {
      console.log(
        `[Watch Together Room] Meu ID: ${currentUserId} | Host ID da Sala: ${roomState.hostId} | Sou Host? ${isHost}`
      );
    }
  }, [roomState?.hostId, currentUserId, isHost]);

  // 3. Métodos públicos de disparo com proteção de autoridade do Host
  const sendPlay = useCallback(
    (mediaTime?: number) => {
      if (!isHost) {
        console.warn("[Watch Together Room] Apenas o Host tem permissão para controlar a reprodução.");
        return;
      }
      if (!videoRef.current) return;
      const time = mediaTime !== undefined ? mediaTime : videoRef.current.currentTime;
      isLocalActionRef.current = true;
      send({ type: "room_play", mediaTime: time });
      setTimeout(() => {
        isLocalActionRef.current = false;
      }, 300);
    },
    [send, videoRef, isHost]
  );

  const sendPause = useCallback(
    (mediaTime?: number) => {
      if (!isHost) {
        console.warn("[Watch Together Room] Apenas o Host tem permissão para pausar a reprodução.");
        return;
      }
      if (!videoRef.current) return;
      const time = mediaTime !== undefined ? mediaTime : videoRef.current.currentTime;
      isLocalActionRef.current = true;
      send({ type: "room_pause", mediaTime: time });
      setTimeout(() => {
        isLocalActionRef.current = false;
      }, 300);
    },
    [send, videoRef, isHost]
  );

  const sendSeek = useCallback(
    (targetTime: number) => {
      if (!isHost) {
        console.warn("[Watch Together Room] Apenas o Host tem permissão para avançar ou retroceder.");
        return;
      }
      isLocalActionRef.current = true;
      send({ type: "room_seek", mediaTime: targetTime });
      setTimeout(() => {
        isLocalActionRef.current = false;
      }, 300);
    },
    [send, isHost]
  );

  const sendChatMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      send({ type: "chat_message", text: text.trim(), senderName: currentUserName });
    },
    [send, currentUserName]
  );

  // Status de correspondência de hash do arquivo local (Syncplay Pattern)
  const hashMatchStatus = useMemo((): "MATCH" | "MISMATCH" | "PENDING" | "NOT_APPLICABLE" => {
    if (roomState?.sourceType !== "LOCAL_FILE") {
      return "NOT_APPLICABLE";
    }
    if (!localFingerprint) {
      return "PENDING";
    }
    if (!roomState.contentFingerprint) {
      return "MATCH";
    }
    return localFingerprint === roomState.contentFingerprint ? "MATCH" : "MISMATCH";
  }, [roomState?.sourceType, roomState?.contentFingerprint, localFingerprint]);

  const changeMediaSource = useCallback(
    (
      sourceType: MediaSourceType,
      options?: { contentFingerprint?: string; mediaTitle?: string; directUrl?: string }
    ) => {
      if (!isHost) {
        console.warn("[Watch Together Room] Apenas o Host tem permissão para alterar a fonte de mídia.");
        return;
      }

      // Proteção: Nunca transmite URLs blob: originadas na máquina local para os peers
      let safeDirectUrl = options?.directUrl;
      if (safeDirectUrl?.startsWith("blob:")) {
        console.warn(
          "[Watch Together Room] URLs 'blob:' pertencem exclusivamente ao navegador local e não podem ser transmitidas para outros peers."
        );
        safeDirectUrl = undefined;
      }

      // Atualiza o estado local imediatamente para evitar loops com URLs antigas
      if (sourceType === "DIRECT_URL") {
        setRemoteDirectUrl(safeDirectUrl || null);
        setRoomState((prev) =>
          prev ? { ...prev, sourceType: "DIRECT_URL", directUrl: safeDirectUrl, mediaTitle: options?.mediaTitle } : null
        );
      } else {
        setRemoteDirectUrl(null);
        setRoomState((prev) =>
          prev ? { ...prev, sourceType, directUrl: undefined, mediaTitle: options?.mediaTitle } : null
        );
      }

      send({
        type: "set_media_source",
        sourceType,
        contentFingerprint: options?.contentFingerprint,
        mediaTitle: options?.mediaTitle,
        directUrl: safeDirectUrl,
      });
    },
    [send, isHost]
  );

  const clearMediaSource = useCallback(() => {
    if (!isHost) return;
    setRemoteDirectUrl(null);
    setRoomState((prev) => (prev ? { ...prev, directUrl: undefined } : null));
    send({
      type: "set_media_source",
      sourceType: "DIRECT_URL",
      directUrl: undefined,
      mediaTitle: undefined,
    });
  }, [send, isHost]);

  const registerLocalFile = useCallback((file: File, fingerprint: string) => {
    setLocalFile(file);
    setLocalFingerprint(fingerprint);
  }, []);

  return {
    isConnected,
    isSyncing,
    roomState,
    members,
    isHost,
    driftMs,
    driftZone,
    appliedSpeed,
    chatMessages,
    sourceType: roomState?.sourceType || computedInitialSourceType,
    contentFingerprint: roomState?.contentFingerprint,
    mediaTitle: roomState?.mediaTitle,
    remoteDirectUrl:
      remoteDirectUrl && !remoteDirectUrl.startsWith("blob:")
        ? remoteDirectUrl
        : roomState?.sourceType === "DIRECT_URL" && roomState?.directUrl && !roomState.directUrl.startsWith("blob:")
        ? roomState.directUrl
        : undefined,
    localFingerprint,
    localFile,
    hashMatchStatus,
    changeMediaSource,
    clearMediaSource,
    registerLocalFile,
    sendPlay,
    sendPause,
    sendSeek,
    sendChatMessage,
    authoritativeTime: roomState
      ? clockSyncRef.current.calculateAuthoritativeMediaTime(roomState)
      : 0,
    clockOffset: clockSyncRef.current.getClockOffset(),
  };
}
