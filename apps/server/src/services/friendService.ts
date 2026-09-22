import { prisma } from "@watch-together/database";
import { PresenceService } from "./presenceService";

export class FriendService {
  /**
   * Envia uma solicitação de amizade por ID ou Email
   * Trata atomicamente condição de corrida (solicitação recíproca prévia)
   */
  public static async sendRequest(
    senderId: string,
    target: { targetUserId?: string; targetEmail?: string }
  ) {
    let receiverId = target.targetUserId;

    if (!receiverId && target.targetEmail) {
      const normalizedEmail = target.targetEmail.toLowerCase().trim();
      const targetUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });

      if (!targetUser) {
        const error: any = new Error("Usuário destinatário não encontrado.");
        error.statusCode = 404;
        throw error;
      }
      receiverId = targetUser.id;
    }

    if (!receiverId) {
      const error: any = new Error("Identificador do usuário alvo é obrigatório.");
      error.statusCode = 400;
      throw error;
    }

    // 1. Bloqueio de auto-solicitação
    if (senderId === receiverId) {
      const error: any = new Error("Você não pode adicionar a si mesmo.");
      error.statusCode = 400;
      throw error;
    }

    // Busca dados do solicitante para envio da notificação
    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });

    if (!sender) {
      const error: any = new Error("Usuário solicitante não encontrado.");
      error.statusCode = 404;
      throw error;
    }

    // 2. Verifica se já existe relação em qualquer direção
    const existingDirect = await prisma.friendship.findUnique({
      where: {
        senderId_receiverId: {
          senderId,
          receiverId,
        },
      },
    });

    if (existingDirect) {
      if (existingDirect.status === "BLOCKED") {
        const error: any = new Error("Não é possível enviar solicitação para este usuário.");
        error.statusCode = 403;
        throw error;
      }
      if (existingDirect.status === "ACCEPTED") {
        const error: any = new Error("Vocês já são amigos.");
        error.statusCode = 409;
        throw error;
      }
      if (existingDirect.status === "PENDING") {
        const error: any = new Error("Solicitação de amizade já enviada e pendente.");
        error.statusCode = 409;
        throw error;
      }
      // Se foi recusada anteriormente, reabre como pendente
      const updated = await prisma.friendship.update({
        where: { id: existingDirect.id },
        data: { status: "PENDING" },
      });

      await PresenceService.sendFriendNotification(receiverId, {
        type: "friend_request_received",
        friendshipId: updated.id,
        fromUser: {
          userId: sender.id,
          name: sender.name,
          email: sender.email,
          avatarUrl: sender.avatarUrl,
        },
        timestamp: Date.now(),
      });

      return { status: "PENDING", friendship: updated };
    }

    // 3. Verifica solicitação inversa pendente (Condição de corrida recíproca)
    const reverseRequest = await prisma.friendship.findUnique({
      where: {
        senderId_receiverId: {
          senderId: receiverId,
          receiverId: senderId,
        },
      },
    });

    if (reverseRequest) {
      if (reverseRequest.status === "BLOCKED") {
        const error: any = new Error("Não é possível enviar solicitação para este usuário.");
        error.statusCode = 403;
        throw error;
      }
      if (reverseRequest.status === "PENDING") {
        // Ambas as partes solicitaram -> Aceita atomicamente!
        const accepted = await prisma.friendship.update({
          where: { id: reverseRequest.id },
          data: { status: "ACCEPTED" },
        });

        // Notifica ambos via Redis
        await PresenceService.sendFriendNotification(receiverId, {
          type: "friend_request_accepted",
          friendshipId: accepted.id,
          fromUser: {
            userId: sender.id,
            name: sender.name,
            email: sender.email,
            avatarUrl: sender.avatarUrl,
          },
          timestamp: Date.now(),
        });

        return { status: "ACCEPTED", message: "Amizade estabelecida mutuamente!", friendship: accepted };
      }
      if (reverseRequest.status === "ACCEPTED") {
        const error: any = new Error("Vocês já são amigos.");
        error.statusCode = 409;
        throw error;
      }
    }

    // 4. Cria nova solicitação pendente
    const friendship = await prisma.friendship.create({
      data: {
        senderId,
        receiverId,
        status: "PENDING",
      },
    });

    // 5. Publica evento no canal Redis em tempo real
    await PresenceService.sendFriendNotification(receiverId, {
      type: "friend_request_received",
      friendshipId: friendship.id,
      fromUser: {
        userId: sender.id,
        name: sender.name,
        email: sender.email,
        avatarUrl: sender.avatarUrl,
      },
      timestamp: Date.now(),
    });

    return { status: "PENDING", friendship };
  }

  /**
   * Aceita uma solicitação de amizade pendente
   */
  public static async acceptRequest(userId: string, friendshipId: string) {
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
      include: {
        receiver: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    if (!friendship) {
      const error: any = new Error("Solicitação de amizade não encontrada.");
      error.statusCode = 404;
      throw error;
    }

    // Apenas o destinatário da solicitação pode aceitá-la
    if (friendship.receiverId !== userId) {
      const error: any = new Error("Você não tem autorização para aceitar esta solicitação.");
      error.statusCode = 403;
      throw error;
    }

    const updated = await prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: "ACCEPTED" },
    });

    // Notifica o solicitante original via Redis
    await PresenceService.sendFriendNotification(friendship.senderId, {
      type: "friend_request_accepted",
      friendshipId: updated.id,
      fromUser: {
        userId: friendship.receiver.id,
        name: friendship.receiver.name,
        email: friendship.receiver.email,
        avatarUrl: friendship.receiver.avatarUrl,
      },
      timestamp: Date.now(),
    });

    return updated;
  }

  /**
   * Recusa ou remove uma amizade
   */
  public static async declineOrRemove(userId: string, friendshipId: string) {
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      const error: any = new Error("Relação de amizade não encontrada.");
      error.statusCode = 404;
      throw error;
    }

    if (friendship.senderId !== userId && friendship.receiverId !== userId) {
      const error: any = new Error("Você não tem permissão para alterar esta relação.");
      error.statusCode = 403;
      throw error;
    }

    await prisma.friendship.delete({
      where: { id: friendshipId },
    });

    const otherUserId = friendship.senderId === userId ? friendship.receiverId : friendship.senderId;
    await PresenceService.sendFriendNotification(otherUserId, {
      type: "friend_removed",
      friendshipId,
      fromUser: {
        userId,
        name: "Usuário",
        email: "",
      },
      timestamp: Date.now(),
    });

    return { status: "REMOVED" };
  }

  /**
   * Remove vínculo de amizade (por friendshipId ou targetUserId)
   */
  public static async removeFriend(userId: string, target: { friendshipId?: string; targetUserId?: string }) {
    let friendship;
    if (target.friendshipId) {
      friendship = await prisma.friendship.findUnique({
        where: { id: target.friendshipId },
      });
    } else if (target.targetUserId) {
      friendship = await prisma.friendship.findFirst({
        where: {
          status: "ACCEPTED",
          OR: [
            { senderId: userId, receiverId: target.targetUserId },
            { senderId: target.targetUserId, receiverId: userId },
          ],
        },
      });
    }

    if (!friendship) {
      const error: any = new Error("Relação de amizade não encontrada.");
      error.statusCode = 404;
      throw error;
    }

    if (friendship.senderId !== userId && friendship.receiverId !== userId) {
      const error: any = new Error("Você não tem permissão para remover esta amizade.");
      error.statusCode = 403;
      throw error;
    }

    await prisma.friendship.delete({
      where: { id: friendship.id },
    });

    const otherUserId = friendship.senderId === userId ? friendship.receiverId : friendship.senderId;
    await PresenceService.sendFriendNotification(otherUserId, {
      type: "friend_removed",
      friendshipId: friendship.id,
      fromUser: {
        userId,
        name: "Usuário",
        email: "",
      },
      timestamp: Date.now(),
    });

    return { status: "REMOVED" };
  }

  /**
   * Bloqueia um usuário (muda relação para BLOCKED com senderId sendo quem bloqueou)
   */
  public static async blockUser(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      const error: any = new Error("Você não pode bloquear a si mesmo.");
      error.statusCode = 400;
      throw error;
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!targetUser) {
      const error: any = new Error("Usuário destinatário não encontrado.");
      error.statusCode = 404;
      throw error;
    }

    // Busca se já existe relação em qualquer direção
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId: targetUserId },
          { senderId: targetUserId, receiverId: userId },
        ],
      },
    });

    let blockedRecord;
    if (existing) {
      blockedRecord = await prisma.friendship.update({
        where: { id: existing.id },
        data: {
          senderId: userId,
          receiverId: targetUserId,
          status: "BLOCKED",
        },
      });
    } else {
      blockedRecord = await prisma.friendship.create({
        data: {
          senderId: userId,
          receiverId: targetUserId,
          status: "BLOCKED",
        },
      });
    }

    // Notifica o outro usuário via Redis para desvincular em tempo real
    await PresenceService.sendFriendNotification(targetUserId, {
      type: "friend_blocked",
      friendshipId: blockedRecord.id,
      fromUser: {
        userId,
        name: "Usuário",
        email: "",
      },
      timestamp: Date.now(),
    });

    return { status: "BLOCKED", friendship: blockedRecord };
  }

  /**
   * Retorna os IDs de todos os amigos com status ACCEPTED do usuário
   */
  public static async getFriendUserIds(userId: string): Promise<string[]> {
    const relations = await prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      select: { senderId: true, receiverId: true },
    });
    return relations.map((r) => (r.senderId === userId ? r.receiverId : r.senderId));
  }

  /**
   * Lista todos os amigos aceitos e solicitações pendentes do usuário
   */
  public static async listFriendsAndRequests(userId: string) {
    // 1. Amigos aceitos (Bidirecional)
    const acceptedRelations = await prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: {
        sender: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        receiver: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const friends = acceptedRelations.map((rel) => {
      const friendData = rel.senderId === userId ? rel.receiver : rel.sender;
      return {
        friendshipId: rel.id,
        ...friendData,
        since: rel.updatedAt,
      };
    });

    // 2. Solicitações pendentes recebidas
    const receivedRequests = await prisma.friendship.findMany({
      where: {
        receiverId: userId,
        status: "PENDING",
      },
      include: {
        sender: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 3. Solicitações pendentes enviadas
    const sentRequests = await prisma.friendship.findMany({
      where: {
        senderId: userId,
        status: "PENDING",
      },
      include: {
        receiver: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      friends,
      receivedRequests: receivedRequests.map((r) => ({
        friendshipId: r.id,
        from: r.sender,
        createdAt: r.createdAt,
      })),
      sentRequests: sentRequests.map((r) => ({
        friendshipId: r.id,
        to: r.receiver,
        createdAt: r.createdAt,
      })),
    };
  }

  /**
   * Busca usuários por nome ou email (excluindo o usuário autenticado e bloqueados)
   * e indica o status de amizade atual
   */
  public static async searchUsers(userId: string, query: string) {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    // Exclui usuários envolvidos em relações BLOCKED
    const blockedRelations = await prisma.friendship.findMany({
      where: {
        status: "BLOCKED",
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      select: { senderId: true, receiverId: true },
    });
    const blockedUserIds = blockedRelations.map((r) =>
      r.senderId === userId ? r.receiverId : r.senderId
    );
    const excludedIds = [userId, ...blockedUserIds];

    const users = await prisma.user.findMany({
      where: {
        id: { notIn: excludedIds },
        OR: [
          { name: { contains: cleanQuery, mode: "insensitive" } },
          { email: { contains: cleanQuery, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
      },
      take: 10,
    });

    // Anexa o status de relacionamento com cada usuário encontrado
    const userIds = users.map((u) => u.id);
    const existingRelations = await prisma.friendship.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: { in: userIds } },
          { senderId: { in: userIds }, receiverId: userId },
        ],
      },
    });

    return users.map((u) => {
      const relation = existingRelations.find(
        (r) =>
          (r.senderId === userId && r.receiverId === u.id) ||
          (r.senderId === u.id && r.receiverId === userId)
      );

      let friendshipStatus: "NONE" | "FRIENDS" | "PENDING_SENT" | "PENDING_RECEIVED" = "NONE";
      if (relation) {
        if (relation.status === "ACCEPTED") {
          friendshipStatus = "FRIENDS";
        } else if (relation.status === "PENDING") {
          friendshipStatus = relation.senderId === userId ? "PENDING_SENT" : "PENDING_RECEIVED";
        }
      }

      return {
        ...u,
        friendshipStatus,
        friendshipId: relation?.id,
      };
    });
  }
}
