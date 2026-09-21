import { WebSocket } from "ws";
import { FastifyRequest } from "fastify";
import { PresenceService } from "../services/presenceService";
import { PartyService } from "../services/partyService";
import { UserPresence, SocialClientMessage, SocialServerMessage, RoomInvite } from "../types";

export function handleSocialWebSocket(
  socket: WebSocket,
  req: FastifyRequest<{ Querystring: { userId?: string; userName?: string; token?: string } }>
) {
  const clientIp = req.ip || "unknown";
  const origin = (req.headers.origin as string) || "direct";
  const timestamp = new Date().toISOString();

  console.log(`[${timestamp}] [WS /ws/social] Nova conexão recebida de ${clientIp} (Origin: ${origin})`);

  let currentUser: UserPresence | null = null;
  let unsubscribeGlobal: (() => void) | null = null;
  let unsubscribeNotifications: (() => void) | null = null;
  let unsubscribeParty: (() => void) | null = null;

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

  const setupPartySubscription = (partyId: string | null) => {
    if (unsubscribeParty) {
      unsubscribeParty();
      unsubscribeParty = null;
    }
    if (partyId) {
      unsubscribeParty = PartyService.subscribeParty(partyId, (msg: SocialServerMessage) => {
        send(msg);
      });
    }
  };

  const setupUser = async (user: UserPresence) => {
    currentUser = user;
    await PresenceService.upsertPresence(currentUser);

    // Assina canal de notificações privadas deste usuário (convites de sala, amizades, convites de party)
    if (unsubscribeNotifications) unsubscribeNotifications();
    unsubscribeNotifications = PresenceService.subscribeUserNotifications(currentUser.userId, async (msg: SocialServerMessage) => {
      send(msg);
      // Se for notificação de atualização de party, atualiza a subscrição
      if (msg.type === "party_updated") {
        setupPartySubscription(msg.party.id);
      }
    });

    // Envia snapshot completo (usuários, salas e party ativa)
    const [onlineUsers, activeRooms, currentParty] = await Promise.all([
      PresenceService.getAllOnlineUsers(),
      PresenceService.getActiveRooms(),
      PartyService.getUserParty(currentUser.userId),
    ]);

    if (currentParty) {
      setupPartySubscription(currentParty.id);
    }

    send({
      type: "social_snapshot",
      onlineUsers,
      activeRooms,
    });

    send({
      type: "party_snapshot",
      party: currentParty,
    });
  };

  // Assina difusão global de presença e salas
  unsubscribeGlobal = PresenceService.subscribeGlobal((msg) => {
    send(msg);
  });

  const token = (req.query as any).token;

  if (!token) {
    console.warn(`[${timestamp}] [WS /ws/social] Conexão rejeitada de ${clientIp}: token JWT ausente.`);
    send({ type: "error", message: "Autenticação obrigatória para presença em tempo real." });
    socket.close(4001, "Unauthorized");
    return;
  }

  try {
    const decoded: any = (req.server as any).jwt.verify(token);
    if (!decoded || !decoded.sub) {
      throw new Error("Token payload inválido");
    }
    setupUser({
      userId: decoded.sub,
      userName: decoded.name || "Você",
      avatarColor: "bg-[#e50914]",
      initials: (decoded.name || "VC").substring(0, 2).toUpperCase(),
      status: "idle",
      device: "Web Browser",
      lastSeen: Date.now(),
    });
  } catch (tokenErr) {
    console.warn(`[${timestamp}] [WS /ws/social] Conexão rejeitada de ${clientIp}: token JWT inválido ou expirado.`);
    send({ type: "error", message: "Token inválido ou expirado." });
    socket.close(4001, "Unauthorized");
    return;
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

        // 2. Atualização de status de presença
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

        // 3. Convite direto para Sala Watch Together
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
          const [onlineUsers, activeRooms, currentParty] = await Promise.all([
            PresenceService.getAllOnlineUsers(),
            PresenceService.getActiveRooms(),
            currentUser ? PartyService.getUserParty(currentUser.userId) : null,
          ]);
          send({
            type: "social_snapshot",
            onlineUsers,
            activeRooms,
          });
          send({
            type: "party_snapshot",
            party: currentParty,
          });
          break;
        }

        // ================= WATCH PARTY LOBBY (GRUPO COLABORATIVO) =================
        case "party_create": {
          if (!currentUser) return;
          const party = await PartyService.createOrGetParty({
            userId: currentUser.userId,
            name: currentUser.userName,
          });
          setupPartySubscription(party.id);
          send({ type: "party_snapshot", party });
          break;
        }

        case "party_invite": {
          if (!currentUser) return;
          const { party } = await PartyService.inviteMember(
            { userId: currentUser.userId, name: currentUser.userName },
            parsed.targetUserId
          );
          setupPartySubscription(party.id);
          send({ type: "party_snapshot", party });
          break;
        }

        case "party_accept_invite": {
          if (!currentUser) return;
          const party = await PartyService.joinParty(parsed.partyId, {
            userId: currentUser.userId,
            name: currentUser.userName,
          });
          setupPartySubscription(party.id);
          send({ type: "party_snapshot", party });
          break;
        }

        case "party_decline_invite": {
          // Opcional: apenas confirma sem alterar o estado
          break;
        }

        case "party_leave": {
          if (!currentUser) return;
          await PartyService.leaveParty(currentUser.userId);
          setupPartySubscription(null);
          send({ type: "party_snapshot", party: null });
          break;
        }

        case "party_start_media": {
          if (!currentUser) return;
          await PartyService.startMedia(currentUser.userId, {
            slug: parsed.slug,
            title: parsed.title,
            roomId: parsed.roomId,
          });
          break;
        }

        case "party_get_snapshot": {
          if (!currentUser) return;
          const party = await PartyService.getUserParty(currentUser.userId);
          if (party) setupPartySubscription(party.id);
          send({ type: "party_snapshot", party });
          break;
        }
      }
    } catch (err: any) {
      console.error("[Social WS Handler Error]:", err.message);
      send({ type: "error", message: err.message || "Erro no processamento da solicitação." });
    }
  });

  socket.on("close", async (code, reason) => {
    const closeTs = new Date().toISOString();
    console.log(`[${closeTs}] [WS /ws/social] [WS Close] Código: ${code}, Motivo: ${reason?.toString() || "desconexão normal"}`);
    if (unsubscribeGlobal) unsubscribeGlobal();
    if (unsubscribeNotifications) unsubscribeNotifications();
    if (unsubscribeParty) unsubscribeParty();

    if (currentUser) {
      await PresenceService.removePresence(currentUser.userId);
    }
  });
}
