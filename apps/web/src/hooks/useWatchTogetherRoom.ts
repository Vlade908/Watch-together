"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { RoomState, RoomMember, ServerMessage, ClientMessage } from "../types/sync";
import { ClockSyncEngine, DriftController, DriftEvaluationResult } from "../services/syncEngine";

interface UseWatchTogetherRoomOptions {
  roomId: string;
  userId?: string;
  userName?: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled?: boolean;
}

export function useWatchTogetherRoom({
  roomId,
  userId,
  userName = "Você",
  videoRef,
  enabled = true,
}: UseWatchTogetherRoomOptions) {
  // Garante que userId e userName sejam estáticos durante a sessão para evitar re-render loops
  const [stableUserId] = useState<string>(
    () => userId || `user-${Math.random().toString(36).substring(2, 8)}`
  );
  const [stableUserName] = useState<string>(() => userName || "Você");

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

  // Determina a URL do WebSocket com fallback dinâmico robusto na porta 54321
  const resolveWsUrl = useCallback((room: string, attempt = 0) => {
    let base = process.env.NEXT_PUBLIC_WS_URL;
    if (!base && typeof window !== "undefined") {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      let host = window.location.hostname || "localhost";
      // Em caso de falha de DNS local de IPv6, alterna entre localhost e 127.0.0.1 nas tentativas
      if (attempt % 2 === 1 && (host === "localhost" || host === "127.0.0.1")) {
        host = host === "localhost" ? "127.0.0.1" : "localhost";
      }
      base = `${protocol}//${host}:54321`;
    }
    if (!base) {
      base = attempt % 2 === 1 ? "ws://127.0.0.1:54321" : "ws://localhost:54321";
    }
    return `${base}/ws/rooms/${encodeURIComponent(room)}`;
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

          // Entra na sala com credenciais estáveis do usuário
          ws.send(
            JSON.stringify({
              type: "join_room",
              roomId,
              userId: stableUserId,
              userName: stableUserName,
            })
          );
        };

        ws.onmessage = (event) => {
          if (isUnmounted) return;
          try {
            const message = JSON.parse(event.data) as ServerMessage;

            switch (message.type) {
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

                // Alinha o vídeo local com o estado inicial
                if (videoRef.current) {
                  isLocalActionRef.current = true;
                  videoRef.current.currentTime = message.currentMediaTime;
                  if (message.state.status === "PLAYING") {
                    videoRef.current.play().catch(() => {});
                  } else {
                    videoRef.current.pause();
                  }
                  setTimeout(() => {
                    isLocalActionRef.current = false;
                  }, 300);
                }
                break;
              }

              case "playback_update": {
                setRoomState(message.state);

                // Aplica a ação recebida da sala se não foi disparada localmente
                if (videoRef.current && !isLocalActionRef.current) {
                  const authoritativeTime = clockSyncRef.current.calculateAuthoritativeMediaTime(message.state);
                  isLocalActionRef.current = true;

                  if (message.action === "PLAY") {
                    videoRef.current.currentTime = authoritativeTime;
                    videoRef.current.play().catch(() => {});
                  } else if (message.action === "PAUSE") {
                    videoRef.current.currentTime = message.state.referenceMediaTime;
                    videoRef.current.pause();
                  } else if (message.action === "SEEK") {
                    videoRef.current.currentTime = authoritativeTime;
                  }

                  setTimeout(() => {
                    isLocalActionRef.current = false;
                  }, 300);
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
  }, [roomId, stableUserId, stableUserName, enabled, resolveWsUrl, videoRef]);

  // 2. Loop do Controlador de Drift em 3 Zonas (Executado a cada 500ms)
  useEffect(() => {
    if (!enabled || !isConnected || !roomState || !videoRef.current) return;

    const driftInterval = setInterval(() => {
      const video = videoRef.current;
      if (!video || isLocalActionRef.current) return;

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
  }, [enabled, isConnected, roomState, videoRef]);

  // 3. Métodos públicos de disparo
  const sendPlay = useCallback(
    (mediaTime?: number) => {
      if (!videoRef.current) return;
      const time = mediaTime !== undefined ? mediaTime : videoRef.current.currentTime;
      isLocalActionRef.current = true;
      send({ type: "room_play", mediaTime: time });
      setTimeout(() => {
        isLocalActionRef.current = false;
      }, 300);
    },
    [send, videoRef]
  );

  const sendPause = useCallback(
    (mediaTime?: number) => {
      if (!videoRef.current) return;
      const time = mediaTime !== undefined ? mediaTime : videoRef.current.currentTime;
      isLocalActionRef.current = true;
      send({ type: "room_pause", mediaTime: time });
      setTimeout(() => {
        isLocalActionRef.current = false;
      }, 300);
    },
    [send, videoRef]
  );

  const sendSeek = useCallback(
    (targetTime: number) => {
      isLocalActionRef.current = true;
      send({ type: "room_seek", mediaTime: targetTime });
      setTimeout(() => {
        isLocalActionRef.current = false;
      }, 300);
    },
    [send]
  );

  const sendChatMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      send({ type: "chat_message", text: text.trim(), senderName: stableUserName });
    },
    [send, stableUserName]
  );

  return {
    isConnected,
    isSyncing,
    roomState,
    members,
    driftMs,
    driftZone,
    appliedSpeed,
    chatMessages,
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
