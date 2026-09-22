import { WebSocket } from "ws";
import { FastifyRequest } from "fastify";
import { RoomService } from "../services/roomService";
import { PubSubService } from "../services/pubsubService";
import { PresenceService } from "../services/presenceService";
import { ClientMessage, ServerMessage, RoomMember, MediaSourceType } from "../types";

export function handleRoomWebSocket(
  socket: WebSocket,
  req: FastifyRequest<{ Params: { roomId: string }; Querystring: { token?: string } }>
) {
  const { roomId } = req.params;
  const clientIp = req.ip || "unknown";
  const origin = (req.headers.origin as string) || "direct";
  const timestamp = new Date().toISOString();

  console.log(`[${timestamp}] [WS /ws/rooms/${roomId}] Nova conexão recebida de ${clientIp} (Origin: ${origin})`);

  let currentMember: RoomMember | null = null;
  let isAlive = true;

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
      const parsed = JSON.parse(data.toString()) as ClientMessage;

      switch (parsed.type) {
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

        // 2. Entrada do Usuário na Sala
        case "join_room": {
          const memberUserId = authenticatedUser?.id || parsed.userId;
          const memberUserName = authenticatedUser?.name || parsed.userName;

          const isLocalRoom =
            parsed.initialSourceType === "LOCAL_FILE" ||
            roomId.includes("local") ||
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
          const activeTitleName =
            state.sourceType === "LOCAL_FILE"
              ? state.mediaTitle || "Ficheiro Local (Syncplay)"
              : state.mediaId === "interestelar-alem-do-horizonte"
              ? "Interestelar: Além do Horizonte"
              : state.mediaId;

          const activeBannerUrl =
            state.sourceType === "LOCAL_FILE"
              ? "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1200&auto=format&fit=crop"
              : "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&auto=format&fit=crop";

          await PresenceService.registerActiveRoom({
            roomId,
            mediaId: state.mediaId,
            titleName: activeTitleName,
            bannerUrl: activeBannerUrl,
            slug: state.mediaId,
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

          const updatedState = await RoomService.updateRoomMediaSource(
            roomId,
            parsed.sourceType,
            parsed.contentFingerprint,
            parsed.mediaTitle,
            parsed.directUrl
          );

          await PubSubService.publishRoomEvent(roomId, {
            type: "source_updated",
            state: updatedState,
            directUrl: parsed.directUrl,
            triggeredBy: { userId: currentMember.userId, userName: currentMember.userName },
          });

          // Atualiza o título da sala no PresenceService para refletir na Central de Atividades e no Social
          const members = await RoomService.getMembers(roomId);
          const activeTitleName =
            updatedState.mediaTitle ||
            (updatedState.sourceType === "LOCAL_FILE"
              ? "Ficheiro Local (Syncplay)"
              : updatedState.mediaId === "interestelar-alem-do-horizonte"
              ? "Interestelar: Além do Horizonte"
              : updatedState.mediaId);

          const activeBannerUrl =
            updatedState.sourceType === "LOCAL_FILE"
              ? "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1200&auto=format&fit=crop"
              : "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&auto=format&fit=crop";

          await PresenceService.registerActiveRoom({
            roomId,
            mediaId: updatedState.mediaId,
            titleName: activeTitleName,
            bannerUrl: activeBannerUrl,
            slug: updatedState.mediaId,
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

        // 7. Chat da Sala
        case "chat_message": {
          if (!currentMember) return;
          await PubSubService.publishRoomEvent(roomId, {
            type: "chat_broadcast",
            id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            text: parsed.text,
            senderId: currentMember.userId,
            senderName: parsed.senderName || currentMember.userName,
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
