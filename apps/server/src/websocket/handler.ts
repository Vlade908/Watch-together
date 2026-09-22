import { WebSocket } from "ws";
import { FastifyRequest } from "fastify";
import { RoomService } from "../services/roomService";
import { PubSubService } from "../services/pubsubService";
import { PresenceService } from "../services/presenceService";
import { PartyService } from "../services/partyService";
import { ClientMessage, ServerMessage, RoomMember, MediaSourceType } from "../types";
import { SocketRateLimiter } from "./socketRateLimiter";
import { isValidMediaUrl } from "../utils/urlValidator";

export function handleRoomWebSocket(
  socket: WebSocket,
  req: FastifyRequest<{ Params: { roomId: string }; Querystring: { token?: string } }>
) {
  const { roomId } = req.params;
  const clientIp = req.ip || "unknown";
  const origin = (req.headers.origin as string) || "direct";
  const timestamp = new Date().toISOString();

  console.log(`[${timestamp}] [WS /ws/rooms/${roomId}] Nova conexão recebida de ${clientIp} (Origin: ${origin})`);

  // VULN-03: Limitador de taxa em memória por conexão WebSocket (máximo 30 mensagens por segundo)
  const rateLimiter = new SocketRateLimiter(30, 1000);

  let currentMember: RoomMember | null = null;
  let isAlive = true;

  // Heartbeat do WebSocket para blindagem contra timeouts e quedas 1006 em redes móveis (CGNAT 4G/5G)
  const heartbeatInterval = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.ping();
    }
  }, 20000);

  // Envia mensagem tipada com segurança
  const send = (msg: ServerMessage) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  };

  // Extrai e valida obrigatoriamente a identidade via JWT token
  const token = (req.query as any)?.token;
  let authenticatedUser: { id: string; name: string } | null = null;

  if (!token) {
    console.warn(`[${timestamp}] [WS /ws/rooms/${roomId}] Conexão rejeitada de ${clientIp}: token JWT ausente.`);
    send({ type: "error", message: "Autenticação obrigatória para acessar salas síncronas." });
    socket.close(4001, "Unauthorized");
    return;
  }

  try {
    const decoded: any = (req.server as any).jwt.verify(token);
    if (decoded && decoded.sub) {
      authenticatedUser = { id: decoded.sub, name: decoded.name || "Membro" };
    } else {
      throw new Error("Payload JWT inválido");
    }
  } catch (tokenErr) {
    console.warn(`[${timestamp}] [WS /ws/rooms/${roomId}] Conexão rejeitada de ${clientIp}: token JWT inválido ou expirado.`);
    send({ type: "error", message: "Sessão expirada ou token inválido. Faça login novamente." });
    socket.close(4001, "Unauthorized");
    return;
  }

  // Registra o WebSocket para receber broadcasts do Redis da sala
  const unsubscribe = PubSubService.subscribeLocal(roomId, (msg) => {
    send(msg);
  });

  // Listener explícito de erros no socket
  socket.on("error", (err) => {
    const errTs = new Date().toISOString();
    console.error(`[${errTs}] [WS /ws/rooms/${roomId}] [WS Error]:`, err.message);
  });

  // Heartbeat do socket
  socket.on("pong", () => {
    isAlive = true;
  });

  socket.on("message", async (data: Buffer | string) => {
    try {
      // VULN-03: Prevenção contra flooding e exaustão de CPU/Redis
      if (!rateLimiter.consume()) {
        send({ type: "error", message: "Taxa de comandos excedida. Aguarde um instante." });
        return;
      }

      const parsed = JSON.parse(data.toString()) as ClientMessage;

      switch (parsed.type) {
        // 0. Heartbeat Ping da Sala (blindagem contra timeouts e quedas 1006 em redes móveis CGNAT 4G/5G)
        case "ping": {
          send({ type: "pong", timestamp: Date.now() });
          break;
        }

        // 1. Sincronização de Relógio de Alta Precisão (NTP Cristian's Algorithm)
        case "sync_clock": {
          const serverReceiveTime = Date.now();
          send({
            type: "clock_pong",
            clientSendTime: parsed.clientSendTime,
            serverReceiveTime,
            serverSendTime: Date.now(),
          });
          break;
        }

        // 2. Entrada do Usuário na Sala (VULN-01: Ancoragem de ID no token verificado)
        case "join_room": {
          const memberUserId = authenticatedUser.id; // Imutabilidade estrita de identidade
          const memberUserName = authenticatedUser.name || parsed.userName;

          const isLocalRoom =
            parsed.initialSourceType === "LOCAL_FILE" ||
            roomId.includes("arquivo-local");

          const defaultMediaId = isLocalRoom ? "arquivo-local" : "interestelar-alem-do-horizonte";
          const defaultSourceType: MediaSourceType = isLocalRoom ? "LOCAL_FILE" : "CATALOG_DEMO";
          const defaultMediaTitle = isLocalRoom
            ? parsed.mediaTitle || "Ficheiro Local (Syncplay)"
            : undefined;

          // 1. Obtém ou inicializa o estado da sala ANTES de adicionar membros
          // Se a sala ainda não existir no Redis, este usuário autenticado torna-se o Host autoritativo e imutável
          const state = await RoomService.getOrCreateRoomState(
            roomId,
            defaultMediaId,
            memberUserId,
            defaultSourceType,
            defaultMediaTitle,
            undefined,
            memberUserName
          );

          // 2. Determina se este usuário é o Host comparando com o hostId autoritativo no Redis
          const isThisUserTheHost = Boolean(
            state.hostId &&
            state.hostId !== "system" &&
            state.hostId === memberUserId
          );

          currentMember = {
            userId: memberUserId,
            userName: memberUserName,
            isHost: isThisUserTheHost,
            joinedAt: Date.now(),
          };

          // 3. Registra membro com a flag isHost estritamente alinhada ao estado da sala
          const members = await RoomService.addMember(roomId, currentMember);

          console.log(
            `[WS /ws/rooms/${roomId}] [join_room] Usuário '${memberUserName}' (${memberUserId}) ingressou. Host da sala: '${state.hostId}' | É Host? ${isThisUserTheHost}`
          );

          // 4. Envia o estado atual autoritativo para o novo cliente
          send({
            type: "room_state",
            state,
            currentMediaTime: RoomService.calculateCurrentMediaTime(state),
            members,
          });

          // 5. Notifica os demais membros via Redis Pub/Sub
          await PubSubService.publishRoomEvent(roomId, {
            type: "member_joined",
            member: currentMember,
            membersCount: members.length,
          });

          // 6. Atualiza lista global de salas ativas no Redis
          const isDirect =
            state.sourceType === "DIRECT_URL" ||
            Boolean(state.directUrl && !state.directUrl.startsWith("blob:"));

          const activeMediaSlug =
            isDirect
              ? "direto"
              : state.sourceType === "LOCAL_FILE"
              ? "arquivo-local"
              : state.mediaId;

          const activeTitleName =
            state.mediaTitle ||
            (state.sourceType === "LOCAL_FILE"
              ? "Ficheiro Local (Syncplay)"
              : isDirect
              ? "URL Direta (Transmissão Remota)"
              : state.mediaId === "interestelar-alem-do-horizonte"
              ? "Interestelar: Além do Horizonte"
              : state.mediaId);

          const activeBannerUrl =
            state.sourceType === "LOCAL_FILE"
              ? "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1200&auto=format&fit=crop"
              : "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&auto=format&fit=crop";

          await PresenceService.registerActiveRoom({
            roomId,
            mediaId: activeMediaSlug,
            titleName: activeTitleName,
            bannerUrl: activeBannerUrl,
            slug: activeMediaSlug,
            hostName: state.hostName || currentMember.userName,
            participantsCount: members.length,
            maxParticipants: 10,
            status: state.status,
            isPrivate: false,
            syncQuality: state.sourceType === "LOCAL_FILE" ? "Original Local (0 buffer)" : "Ultra HD (Sub-50ms sync)",
          });
          break;
        }

        // 3. Play Síncrono Autoritativo (Host Only)
        case "room_play": {
          if (!currentMember) return;
          const state = await RoomService.getOrCreateRoomState(roomId);
          const isHost = authenticatedUser?.id && authenticatedUser.id === state.hostId;
          if (!isHost) {
            console.warn(`[WS /ws/rooms/${roomId}] [FORBIDDEN] Convidado ${currentMember.userId} tentou disparar play.`);
            send({
              type: "error",
              code: "FORBIDDEN",
              message: "FORBIDDEN: Apenas o anfitrião (Host) tem permissão para controlar a reprodução da sala.",
            });
            break;
          }

          const updatedState = await RoomService.updatePlaybackState(
            roomId,
            "PLAY",
            parsed.mediaTime,
            currentMember.userId
          );

          await PubSubService.publishRoomEvent(roomId, {
            type: "playback_update",
            action: "PLAY",
            state: updatedState,
            triggeredBy: { userId: currentMember.userId, userName: currentMember.userName },
          });
          break;
        }

        // 4. Pause Síncrono Autoritativo (Host Only)
        case "room_pause": {
          if (!currentMember) return;
          const state = await RoomService.getOrCreateRoomState(roomId);
          const isHost = authenticatedUser?.id && authenticatedUser.id === state.hostId;
          if (!isHost) {
            console.warn(`[WS /ws/rooms/${roomId}] [FORBIDDEN] Convidado ${currentMember.userId} tentou disparar pause.`);
            send({
              type: "error",
              code: "FORBIDDEN",
              message: "FORBIDDEN: Apenas o anfitrião (Host) tem permissão para pausar a reprodução da sala.",
            });
            break;
          }

          const updatedState = await RoomService.updatePlaybackState(
            roomId,
            "PAUSE",
            parsed.mediaTime,
            currentMember.userId
          );

          await PubSubService.publishRoomEvent(roomId, {
            type: "playback_update",
            action: "PAUSE",
            state: updatedState,
            triggeredBy: { userId: currentMember.userId, userName: currentMember.userName },
          });
          break;
        }

        // 5. Seek Síncrono Autoritativo (Host Only)
        case "room_seek": {
          if (!currentMember) return;
          const state = await RoomService.getOrCreateRoomState(roomId);
          const isHost = authenticatedUser?.id && authenticatedUser.id === state.hostId;
          if (!isHost) {
            console.warn(`[WS /ws/rooms/${roomId}] [FORBIDDEN] Convidado ${currentMember.userId} tentou disparar seek.`);
            send({
              type: "error",
              code: "FORBIDDEN",
              message: "FORBIDDEN: Apenas o anfitrião (Host) tem permissão para avançar ou retroceder a reprodução da sala.",
            });
            break;
          }

          const updatedState = await RoomService.updatePlaybackState(
            roomId,
            "SEEK",
            parsed.mediaTime,
            currentMember.userId
          );

          await PubSubService.publishRoomEvent(roomId, {
            type: "playback_update",
            action: "SEEK",
            state: updatedState,
            triggeredBy: { userId: currentMember.userId, userName: currentMember.userName },
          });
          break;
        }

        // 6. Troca de Fonte de Mídia (UMSA / BYOM - Host Only)
        case "set_media_source": {
          if (!currentMember) return;
          const state = await RoomService.getOrCreateRoomState(roomId);
          const isHost = authenticatedUser?.id && authenticatedUser.id === state.hostId;
          if (!isHost) {
            console.warn(`[WS /ws/rooms/${roomId}] [FORBIDDEN] Convidado ${currentMember.userId} tentou alterar a fonte de mídia.`);
            send({
              type: "error",
              code: "FORBIDDEN",
              message: "FORBIDDEN: Apenas o anfitrião (Host) tem permissão para alterar a fonte de mídia da sala.",
            });
            break;
          }

          // VULN-05: Sanitização e validação estrita de protocolo para directUrl
          if (parsed.sourceType === "DIRECT_URL") {
            if (!parsed.directUrl || !isValidMediaUrl(parsed.directUrl)) {
              send({
                type: "error",
                message: "A URL de mídia direta deve usar obrigatoriamente protocolo HTTP ou HTTPS válido.",
              });
              break;
            }
          }

          const safeMediaTitle = parsed.mediaTitle ? String(parsed.mediaTitle).slice(0, 150) : undefined;
          const safeDirectUrl =
            parsed.directUrl && !parsed.directUrl.startsWith("blob:")
              ? String(parsed.directUrl).slice(0, 2048)
              : undefined;

          const updatedState = await RoomService.updateRoomMediaSource(
            roomId,
            parsed.sourceType,
            parsed.contentFingerprint,
            safeMediaTitle,
            safeDirectUrl
          );

          await PubSubService.publishRoomEvent(roomId, {
            type: "source_updated",
            state: updatedState,
            directUrl: safeDirectUrl,
            triggeredBy: { userId: currentMember.userId, userName: currentMember.userName },
          });

          // Atualiza o título da sala no PresenceService para refletir na Central de Atividades e no Social
          const members = await RoomService.getMembers(roomId);
          const activeMediaSlug =
            updatedState.sourceType === "LOCAL_FILE"
              ? "arquivo-local"
              : updatedState.sourceType === "DIRECT_URL"
              ? "direto"
              : updatedState.mediaId;

          const activeTitleName =
            updatedState.mediaTitle ||
            (updatedState.sourceType === "LOCAL_FILE"
              ? "Ficheiro Local (Syncplay)"
              : updatedState.sourceType === "DIRECT_URL"
              ? "URL Direta (Transmissão Remota)"
              : updatedState.mediaId === "interestelar-alem-do-horizonte"
              ? "Interestelar: Além do Horizonte"
              : updatedState.mediaId);

          const activeBannerUrl =
            updatedState.sourceType === "LOCAL_FILE"
              ? "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1200&auto=format&fit=crop"
              : "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&auto=format&fit=crop";

          await PresenceService.registerActiveRoom({
            roomId,
            mediaId: activeMediaSlug,
            titleName: activeTitleName,
            bannerUrl: activeBannerUrl,
            slug: activeMediaSlug,
            hostName: updatedState.hostName || currentMember.userName,
            participantsCount: members.length,
            maxParticipants: 10,
            status: updatedState.status,
            isPrivate: false,
            syncQuality:
              updatedState.sourceType === "LOCAL_FILE"
                ? "Original Local (0 buffer)"
                : "Ultra HD (Sub-50ms sync)",
          });

          // Sincroniza Follow-the-Host na Watch Party ativa caso o anfitrião lidere uma
          try {
            const userParty = await PartyService.getUserParty(currentMember.userId);
            if (userParty && userParty.hostId === currentMember.userId) {
              await PartyService.startMedia(currentMember.userId, {
                slug: activeMediaSlug,
                title: activeTitleName,
                roomId,
              });
            }
          } catch (partyErr: any) {
            console.debug(`[WS /ws/rooms/${roomId}] Sincronização de party no set_media_source ignorada:`, partyErr.message);
          }
          break;
        }

        // 7. Solicitação de Sync Manual ou Reconexão
        case "sync_request": {
          const state = await RoomService.getOrCreateRoomState(roomId);
          const members = await RoomService.getMembers(roomId);
          send({
            type: "room_state",
            state,
            currentMediaTime: RoomService.calculateCurrentMediaTime(state),
            members,
          });
          break;
        }

        // 8. Chat da Sala (VULN-09: Remetente Imutável & VULN-12: Bounds de 1.000 caracteres)
        case "chat_message": {
          if (!currentMember) return;
          const rawText = String(parsed.text || "").trim();
          if (!rawText) return;

          const safeText = rawText.slice(0, 1000);

          await PubSubService.publishRoomEvent(roomId, {
            type: "chat_broadcast",
            id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            text: safeText,
            senderId: currentMember.userId,
            senderName: currentMember.userName, // VULN-09: Imutável do membro autenticado
            timestamp: Date.now(),
          });
          break;
        }
      }
    } catch (err: any) {
      console.error("[WebSocket Handler Error]:", err.message);
      send({ type: "error", message: "Comando inválido ou erro no servidor." });
    }
  });

  // Limpeza na desconexão
  socket.on("close", async (code, reason) => {
    clearInterval(heartbeatInterval);
    const closeTs = new Date().toISOString();
    console.log(`[${closeTs}] [WS /ws/rooms/${roomId}] [WS Close] Código: ${code}, Motivo: ${reason?.toString() || "desconexão normal"}`);
    unsubscribe();
    if (currentMember) {
      const remaining = await RoomService.removeMember(roomId, currentMember.userId);
      await PubSubService.publishRoomEvent(roomId, {
        type: "member_left",
        userId: currentMember.userId,
        membersCount: remaining.length,
      });

      if (remaining.length === 0) {
        await PresenceService.unregisterActiveRoom(roomId);
      } else {
        const state = await RoomService.getOrCreateRoomState(roomId);
        await PresenceService.registerActiveRoom({
          roomId,
          mediaId: state.mediaId,
          titleName: state.mediaId === "interestelar-alem-do-horizonte" ? "Interestelar: Além do Horizonte" : state.mediaId,
          bannerUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&auto=format&fit=crop",
          slug: state.mediaId,
          hostName: state.hostName || remaining[0]?.userName || "Host",
          participantsCount: remaining.length,
          maxParticipants: 10,
          status: state.status,
          isPrivate: false,
          syncQuality: "Ultra HD (Sub-50ms sync)",
        });
      }
    }
  });
}
