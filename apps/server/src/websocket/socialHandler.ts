import { WebSocket } from "ws";
import { FastifyRequest } from "fastify";
import { PresenceService } from "../services/presenceService";
import { FriendService } from "../services/friendService";
import { PartyService } from "../services/partyService";
import { UserPresence, SocialClientMessage, SocialServerMessage, RoomInvite } from "../types";
import { SocketRateLimiter } from "./socketRateLimiter";

export function handleSocialWebSocket(
  socket: WebSocket,
  req: FastifyRequest<{ Querystring: { userId?: string; userName?: string; token?: string } }>
) {
  const clientIp = req.ip || "unknown";
  const origin = (req.headers.origin as string) || "direct";
  const timestamp = new Date().toISOString();

  console.log(`[${timestamp}] [WS /ws/social] Nova conexão recebida de ${clientIp} (Origin: ${origin})`);

  // VULN-03: Limitador de taxa em memória por conexão WebSocket (máximo 25 eventos por segundo)
  const rateLimiter = new SocketRateLimiter(25, 1000);

  let authUserId = "";
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
    // VULN-01: Garante imutabilidade e integridade estrita do ID autenticado pelo token JWT
    currentUser = {
      ...user,
      userId: authUserId,
      userName: String(user.userName || "Usuário").slice(0, 60),
    };

    // Recupera a lista de amigos aceitos para presença estritamente privada
    const friendUserIds = await FriendService.getFriendUserIds(currentUser.userId);

    // Notifica presença apenas aos amigos aceitos
    await PresenceService.upsertPresence(currentUser, friendUserIds);

    // Assina canal de notificações privadas deste usuário (convites de sala, amizades, convites de party e presença de amigos)
    if (unsubscribeNotifications) unsubscribeNotifications();
    unsubscribeNotifications = PresenceService.subscribeUserNotifications(currentUser.userId, async (msg: SocialServerMessage) => {
      send(msg);
      // Se for notificação de atualização de party, atualiza a subscrição
      if (msg.type === "party_updated") {
        setupPartySubscription(msg.party.id);
      }
    });

    // Envia snapshot seguro (apenas amigos online, salas ativas e party)
    const [allOnlineUsers, activeRooms, currentParty] = await Promise.all([
      PresenceService.getAllOnlineUsers(),
      PresenceService.getActiveRooms(),
      PartyService.getUserParty(currentUser.userId),
    ]);

    // Filtra estritamente para incluir apenas amigos aceitos no snapshot
    const friendOnlineUsers = allOnlineUsers.filter((u) => friendUserIds.includes(u.userId));

    if (currentParty) {
      setupPartySubscription(currentParty.id);
    }

    send({
      type: "social_snapshot",
      onlineUsers: friendOnlineUsers,
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
    authUserId = String(decoded.sub);

    setupUser({
      userId: authUserId,
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
      // VULN-03: Prevenção contra flooding e ataques de negação de serviço
      if (!rateLimiter.consume()) {
        send({ type: "error", message: "Taxa de eventos sociais excedida. Aguarde um instante." });
        return;
      }

      const parsed = JSON.parse(data.toString()) as SocialClientMessage;

      switch (parsed.type) {
        // 1. Identificação do usuário na conexão (VULN-01: Proteção contra impersonation)
        case "social_identify": {
          if (!parsed.user) break;
          await setupUser({
            ...parsed.user,
            userId: authUserId, // Imutável, ancorado no JWT
          });
          break;
        }

        // 2. Atualização de status de presença
        case "social_update_presence": {
          if (!currentUser) return;
          const safeWatchingTitle = parsed.watchingTitle
            ? {
                id: String(parsed.watchingTitle.id || "").slice(0, 100),
                name: String(parsed.watchingTitle.name || "").slice(0, 150),
                slug: String(parsed.watchingTitle.slug || "").slice(0, 100),
                bannerUrl: String(parsed.watchingTitle.bannerUrl || "").slice(0, 500),
              }
            : undefined;

          const updatedUser: UserPresence = {
            ...currentUser,
            userId: authUserId, // Imutável
            status: parsed.status,
            watchingTitle: safeWatchingTitle,
            roomId: parsed.roomId ? String(parsed.roomId).slice(0, 100) : undefined,
            lastSeen: Date.now(),
          };
          currentUser = updatedUser;
          const friendUserIds = await FriendService.getFriendUserIds(currentUser.userId);
          await PresenceService.upsertPresence(updatedUser, friendUserIds);
          break;
        }

        // 3. Convite direto para Sala Watch Together
        case "send_invite": {
          if (!currentUser) return;
          const invite: RoomInvite = {
            inviteId: `inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            fromUser: {
              userId: authUserId, // VULN-01: Garante que o remetente é o usuário autenticado
              userName: currentUser.userName,
              avatarColor: currentUser.avatarColor,
              initials: currentUser.initials,
            },
            toUserId: String(parsed.toUserId || "").slice(0, 100),
            roomId: String(parsed.roomId || "").slice(0, 100),
            movieSlug: String(parsed.movieSlug || "").slice(0, 100),
            movieTitle: String(parsed.movieTitle || "").slice(0, 150),
            bannerUrl: parsed.bannerUrl ? String(parsed.bannerUrl).slice(0, 500) : undefined,
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
      const friendUserIds = await FriendService.getFriendUserIds(currentUser.userId);
      await PresenceService.removePresence(currentUser.userId, friendUserIds);
    }
  });
}
