import { WebSocket } from "ws";
import { FastifyRequest } from "fastify";
import { PresenceService } from "../services/presenceService";
import { UserPresence, SocialClientMessage, SocialServerMessage, RoomInvite } from "../types";

export function handleSocialWebSocket(
  socket: WebSocket,
  req: FastifyRequest<{ Querystring: { userId?: string; userName?: string } }>
) {
  const clientIp = req.ip || "unknown";
  const origin = (req.headers.origin as string) || "direct";
  const timestamp = new Date().toISOString();

  console.log(`[${timestamp}] [WS /ws/social] Nova conexão recebida de ${clientIp} (Origin: ${origin})`);

  let currentUser: UserPresence | null = null;
  let unsubscribeGlobal: (() => void) | null = null;
  let unsubscribeNotifications: (() => void) | null = null;

  const send = (msg: SocialServerMessage) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  };

  // Listener de erros no socket social
  socket.on("error", (err) => {
    const errTs = new Date().toISOString();
    console.error(`[${errTs}] [WS /ws/social] [WS Error]:`, err.message);
  });

  // Se o query param tiver userId e userName, faz o bootstrap automático
  const queryUserId = req.query.userId;
  const queryUserName = req.query.userName;

  const setupUser = async (user: UserPresence) => {
    currentUser = user;
    await PresenceService.upsertPresence(currentUser);

    // Assina canal de notificações privadas deste usuário
    if (unsubscribeNotifications) unsubscribeNotifications();
    unsubscribeNotifications = PresenceService.subscribeUserNotifications(currentUser.userId, (invite: RoomInvite) => {
      send({
        type: "room_invitation",
        invite,
      });
    });

    // Envia snapshot completo para o cliente
    const [onlineUsers, activeRooms] = await Promise.all([
      PresenceService.getAllOnlineUsers(),
      PresenceService.getActiveRooms(),
    ]);

    send({
      type: "social_snapshot",
      onlineUsers,
      activeRooms,
    });
  };

  // Assina difusão global de presença e salas
  unsubscribeGlobal = PresenceService.subscribeGlobal((msg) => {
    send(msg);
  });

  if (queryUserId) {
    setupUser({
      userId: queryUserId,
      userName: queryUserName || "Você",
      avatarColor: "bg-red-600",
      initials: (queryUserName || "VC").substring(0, 2).toUpperCase(),
      status: "idle",
      device: "Web Browser",
      lastSeen: Date.now(),
    });
  }

  socket.on("message", async (data: Buffer | string) => {
    try {
      const parsed = JSON.parse(data.toString()) as SocialClientMessage;

      switch (parsed.type) {
        // 1. Identificação do usuário na conexão
        case "social_identify": {
          await setupUser(parsed.user);
          break;
        }

        // 2. Atualização de status (ex: começou a assistir um filme ou voltou pra Home)
        case "social_update_presence": {
          if (!currentUser) return;
          currentUser = {
            ...currentUser,
            status: parsed.status,
            watchingTitle: parsed.watchingTitle,
            roomId: parsed.roomId,
            lastSeen: Date.now(),
          };
          await PresenceService.upsertPresence(currentUser);
          break;
        }

        // 3. Envio de Convite para Sala Watch Together
        case "send_invite": {
          if (!currentUser) return;
          const invite: RoomInvite = {
            inviteId: `inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            fromUser: {
              userId: currentUser.userId,
              userName: currentUser.userName,
              avatarColor: currentUser.avatarColor,
              initials: currentUser.initials,
            },
            toUserId: parsed.toUserId,
            roomId: parsed.roomId,
            movieSlug: parsed.movieSlug,
            movieTitle: parsed.movieTitle,
            bannerUrl: parsed.bannerUrl,
            timestamp: Date.now(),
          };

          await PresenceService.sendInvite(invite);
          break;
        }

        // 4. Solicitação de snapshot atualizado
        case "get_social_snapshot": {
          const [onlineUsers, activeRooms] = await Promise.all([
            PresenceService.getAllOnlineUsers(),
            PresenceService.getActiveRooms(),
          ]);
          send({
            type: "social_snapshot",
            onlineUsers,
            activeRooms,
          });
          break;
        }
      }
    } catch (err: any) {
      console.error("[Social WS Handler Error]:", err.message);
      send({ type: "error", message: "Comando social inválido." });
    }
  });

  socket.on("close", async (code, reason) => {
    const closeTs = new Date().toISOString();
    console.log(`[${closeTs}] [WS /ws/social] [WS Close] Código: ${code}, Motivo: ${reason?.toString() || "desconexão normal"}`);
    if (unsubscribeGlobal) unsubscribeGlobal();
    if (unsubscribeNotifications) unsubscribeNotifications();

    if (currentUser) {
      await PresenceService.removePresence(currentUser.userId);
    }
  });
}
