import { redisClient, redisSubscriber } from "../redis/client";
import { PartySession, PartyMember, PartyInvite, SocialServerMessage } from "../types";
import { PresenceService } from "./presenceService";

const PARTY_TTL_SECONDS = 86400; // 24 horas

export class PartyService {
  private static localPartyListeners: Map<string, Set<(message: SocialServerMessage) => void>> = new Map();
  private static isSubscribedToParties = false;

  /**
   * Inicializa subscrição de canais de party no Redis
   */
  public static init() {
    if (this.isSubscribedToParties) return;

    redisSubscriber.psubscribe("party:*:events", (err) => {
      if (err) {
        console.error("[PartyService] Falha ao assinar 'party:*:events':", err);
      } else {
        console.log("[PartyService] Subscrição ativa para 'party:*:events'.");
        this.isSubscribedToParties = true;
      }
    });

    redisSubscriber.on("pmessage", (pattern, channel, messageStr) => {
      if (pattern === "party:*:events") {
        try {
          const match = channel.match(/^party:(.+):events$/);
          if (!match) return;
          const partyId = match[1];
          const payload = JSON.parse(messageStr) as SocialServerMessage;

          const listeners = this.localPartyListeners.get(partyId);
          if (listeners) {
            listeners.forEach((callback) => {
              try {
                callback(payload);
              } catch (cbErr) {
                console.error(`[PartyService] Erro ao disparar listener local da party ${partyId}:`, cbErr);
              }
            });
          }
        } catch (parseErr) {
          console.error("[PartyService] Erro ao processar mensagem do Redis Party:", parseErr);
        }
      }
    });
  }

  /**
   * Registra listener local para uma party específica
   */
  public static subscribeParty(partyId: string, callback: (msg: SocialServerMessage) => void): () => void {
    if (!this.localPartyListeners.has(partyId)) {
      this.localPartyListeners.set(partyId, new Set());
    }
    this.localPartyListeners.get(partyId)!.add(callback);

    return () => {
      const listeners = this.localPartyListeners.get(partyId);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.localPartyListeners.delete(partyId);
        }
      }
    };
  }

  /**
   * Publica evento para todos os membros da party via Redis Pub/Sub
   */
  public static async publishPartyEvent(partyId: string, event: SocialServerMessage): Promise<void> {
    await redisClient.publish(`party:${partyId}:events`, JSON.stringify(event));
  }

  /**
   * Obtém a sessão de grupo por ID
   */
  public static async getParty(partyId: string): Promise<PartySession | null> {
    const raw = await redisClient.get(`party:${partyId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PartySession;
    } catch {
      return null;
    }
  }

  /**
   * Obtém o grupo atual onde o usuário está
   */
  public static async getUserParty(userId: string): Promise<PartySession | null> {
    const partyId = await redisClient.get(`user:${userId}:party`);
    if (!partyId) return null;
    return this.getParty(partyId);
  }

  /**
   * Cria uma nova party ou retorna a existente se o usuário já for o Host
   */
  public static async createOrGetParty(hostUser: {
    userId: string;
    name: string;
    avatarUrl?: string | null;
  }): Promise<PartySession> {
    const existing = await this.getUserParty(hostUser.userId);
    if (existing && existing.hostId === hostUser.userId) {
      return existing;
    }

    // Se já estiver em outra party como membro comum, sai dela
    if (existing) {
      await this.leaveParty(hostUser.userId);
    }

    const partyId = `party-${Math.random().toString(36).substring(2, 8)}`;
    const now = Date.now();

    const session: PartySession = {
      id: partyId,
      hostId: hostUser.userId,
      hostName: hostUser.name,
      members: [
        {
          userId: hostUser.userId,
          name: hostUser.name,
          avatarUrl: hostUser.avatarUrl,
          role: "HOST",
          joinedAt: now,
        },
      ],
      activeMedia: null,
      createdAt: now,
      updatedAt: now,
    };

    await redisClient.setex(`party:${partyId}`, PARTY_TTL_SECONDS, JSON.stringify(session));
    await redisClient.setex(`user:${hostUser.userId}:party`, PARTY_TTL_SECONDS, partyId);

    await this.publishPartyEvent(partyId, {
      type: "party_updated",
      party: session,
    });

    return session;
  }

  /**
   * Convida um amigo para o grupo
   */
  public static async inviteMember(
    hostUser: { userId: string; name: string; avatarUrl?: string | null },
    targetUserId: string
  ): Promise<{ party: PartySession; invite: PartyInvite }> {
    if (hostUser.userId === targetUserId) {
      throw new Error("Você não pode convidar a si mesmo.");
    }

    const party = await this.createOrGetParty(hostUser);

    const invite: PartyInvite = {
      partyId: party.id,
      hostUser: {
        userId: hostUser.userId,
        name: hostUser.name,
        avatarUrl: hostUser.avatarUrl,
      },
      toUserId: targetUserId,
      timestamp: Date.now(),
    };

    // Publica no canal privado do usuário convidado
    await redisClient.publish(
      `user:${targetUserId}:notifications`,
      JSON.stringify({ kind: "party_invite", data: invite })
    );

    return { party, invite };
  }

  /**
   * Convidado aceita entrar no grupo
   */
  public static async joinParty(
    partyId: string,
    user: { userId: string; name: string; avatarUrl?: string | null }
  ): Promise<PartySession> {
    const existing = await this.getUserParty(user.userId);
    if (existing) {
      if (existing.id === partyId) return existing;
      await this.leaveParty(user.userId);
    }

    const party = await this.getParty(partyId);
    if (!party) {
      throw new Error("O grupo não existe ou foi encerrado.");
    }

    // Se já estiver na lista, apenas retorna
    const isAlreadyMember = party.members.some((m) => m.userId === user.userId);
    if (!isAlreadyMember) {
      party.members.push({
        userId: user.userId,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: "MEMBER",
        joinedAt: Date.now(),
      });
      party.updatedAt = Date.now();

      await redisClient.setex(`party:${partyId}`, PARTY_TTL_SECONDS, JSON.stringify(party));
    }

    await redisClient.setex(`user:${user.userId}:party`, PARTY_TTL_SECONDS, partyId);

    // Notifica todos os membros do grupo
    await this.publishPartyEvent(partyId, {
      type: "party_updated",
      party,
    });

    return party;
  }

  /**
   * Usuário sai do grupo (com promoção de novo Host se necessário)
   */
  public static async leaveParty(userId: string): Promise<{ previousPartyId: string } | null> {
    const partyId = await redisClient.get(`user:${userId}:party`);
    if (!partyId) return null;

    await redisClient.del(`user:${userId}:party`);

    const party = await this.getParty(partyId);
    if (!party) return { previousPartyId: partyId };

    const remainingMembers = party.members.filter((m) => m.userId !== userId);

    if (remainingMembers.length === 0) {
      // Nenhum membro restante -> Destrói o grupo
      await redisClient.del(`party:${partyId}`);
      await this.publishPartyEvent(partyId, {
        type: "party_disbanded",
        partyId,
        reason: "Todos os membros saíram do grupo.",
      });
      return { previousPartyId: partyId };
    }

    // Se o usuário que saiu era o Host, promove o membro mais antigo
    if (party.hostId === userId) {
      remainingMembers.sort((a, b) => a.joinedAt - b.joinedAt);
      remainingMembers[0].role = "HOST";
      party.hostId = remainingMembers[0].userId;
      party.hostName = remainingMembers[0].name;
    }

    party.members = remainingMembers;
    party.updatedAt = Date.now();

    await redisClient.setex(`party:${partyId}`, PARTY_TTL_SECONDS, JSON.stringify(party));

    await this.publishPartyEvent(partyId, {
      type: "party_updated",
      party,
    });

    return { previousPartyId: partyId };
  }

  /**
   * Host inicia a reprodução de um título (Follow-the-Host)
   */
  public static async startMedia(
    hostUserId: string,
    mediaData: { slug: string; title: string; roomId: string }
  ): Promise<{ party: PartySession }> {
    const party = await this.getUserParty(hostUserId);
    if (!party) {
      throw new Error("Você não está em nenhum grupo ativo.");
    }

    if (party.hostId !== hostUserId) {
      throw new Error("Apenas o Líder do Grupo pode iniciar filmes para todos.");
    }

    party.activeMedia = mediaData;
    party.updatedAt = Date.now();

    await redisClient.setex(`party:${party.id}`, PARTY_TTL_SECONDS, JSON.stringify(party));

    // Broadcast para todos os membros navegarem simultaneamente
    await this.publishPartyEvent(party.id, {
      type: "party_navigate",
      partyId: party.id,
      slug: mediaData.slug,
      title: mediaData.title,
      roomId: mediaData.roomId,
      hostName: party.hostName,
    });

    return { party };
  }
}
