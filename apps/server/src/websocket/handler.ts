import { WebSocket } from "ws";
import { FastifyRequest } from "fastify";
import { RoomService } from "../services/roomService";
import { PubSubService } from "../services/pubsubService";
import { PresenceService } from "../services/presenceService";
import { ClientMessage, ServerMessage, RoomMember } from "../types";

export function handleRoomWebSocket(socket: WebSocket, req: FastifyRequest<{ Params: { roomId: string } }>) {
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
          const isFirstMember = (await RoomService.getMembers(roomId)).length === 0;
          currentMember = {
            userId: parsed.userId,
            userName: parsed.userName,
            isHost: parsed.isHost !== undefined ? parsed.isHost : isFirstMember,
            joinedAt: Date.now(),
          };

          const members = await RoomService.addMember(roomId, currentMember);
          const state = await RoomService.getOrCreateRoomState(
            roomId,
            "interestelar-alem-do-horizonte",
            currentMember.isHost ? currentMember.userId : "system"
          );

          // Envia o estado atual autoritativo para o novo cliente
          send({
            type: "room_state",
            state,
            currentMediaTime: RoomService.calculateCurrentMediaTime(state),
            members,
          });

          // Notifica os demais membros via Redis Pub/Sub
          await PubSubService.publishRoomEvent(roomId, {
            type: "member_joined",
            member: currentMember,
            membersCount: members.length,
          });

          // Atualiza lista global de salas ativas no Redis
          await PresenceService.registerActiveRoom({
            roomId,
            mediaId: state.mediaId,
            titleName: state.mediaId === "interestelar-alem-do-horizonte" ? "Interestelar: Além do Horizonte" : state.mediaId,
            bannerUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&auto=format&fit=crop",
            slug: state.mediaId,
            hostName: currentMember.userName,
            participantsCount: members.length,
            maxParticipants: 10,
            status: state.status,
            isPrivate: false,
            syncQuality: "Ultra HD (Sub-50ms sync)",
          });
          break;
        }

        // 3. Play Síncrono Autoritativo
        case "room_play": {
          if (!currentMember) return;
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

        // 4. Pause Síncrono Autoritativo
        case "room_pause": {
          if (!currentMember) return;
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

        // 5. Seek Síncrono Autoritativo
        case "room_seek": {
          if (!currentMember) return;
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

        // 6. Solicitação de Sync Manual ou Reconexão
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
          hostName: remaining[0]?.userName || "Host",
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
