import { redisClient, redisPublisher, redisSubscriber } from "../redis/client";
import { UserPresence, RoomSummary, RoomInvite, SocialServerMessage } from "../types";

type SocialBroadcastCallback = (message: SocialServerMessage) => void;
type UserInviteCallback = (invite: RoomInvite) => void;

export class PresenceService {
  private static USERS_KEY = "users:online";
  private static ROOMS_KEY = "rooms:active:summaries";

  private static globalSubscribers: Set<SocialBroadcastCallback> = new Set();
  private static userNotificationSubscribers: Map<string, Set<UserInviteCallback>> = new Map();
  private static isSubscribed = false;

  public static init() {
    if (this.isSubscribed) return;

    // Subscrição para eventos de presença global e notificações de convite
    redisSubscriber.psubscribe("social:presence:events", "user:*:notifications", (err) => {
      if (err) {
        console.error("[PresenceService] Erro ao subscrever aos canais sociais:", err);
      } else {
        console.log("[PresenceService] Subscrição ativa para 'social:presence:events' e 'user:*:notifications'.");
        this.isSubscribed = true;
      }
    });

    redisSubscriber.on("pmessage", (_pattern, channel, messageStr) => {
      try {
        if (channel === "social:presence:events") {
          const message = JSON.parse(messageStr) as SocialServerMessage;
          for (const cb of this.globalSubscribers) {
            try {
              cb(message);
            } catch (err) {
              console.error("[PresenceService] Erro no callback global:", err);
            }
          }
        } else if (channel.startsWith("user:") && channel.endsWith(":notifications")) {
          // Exemplo: user:user-vlad:notifications
          const parts = channel.split(":");
          const userId = parts[1];
          const invite = JSON.parse(messageStr) as RoomInvite;

          const userCallbacks = this.userNotificationSubscribers.get(userId);
          if (userCallbacks) {
            for (const cb of userCallbacks) {
              try {
                cb(invite);
              } catch (err) {
                console.error("[PresenceService] Erro no callback de convite:", err);
              }
            }
          }
        }
      } catch (jsonErr) {
        console.error("[PresenceService] Erro ao processar mensagem PubSub:", jsonErr);
      }
    });
  }

  /**
   * Atualiza ou insere presença de um usuário no Redis
   */
  public static async upsertPresence(user: UserPresence): Promise<void> {
    const data: UserPresence = {
      ...user,
      lastSeen: Date.now(),
    };

    await redisClient.hset(this.USERS_KEY, user.userId, JSON.stringify(data));
    // Expira o conjunto de usuários caso não haja atividade
    await redisClient.expire(this.USERS_KEY, 86400);

    // Emite evento via Pub/Sub
    const event: SocialServerMessage = {
      type: "user_presence_changed",
      user: data,
    };
    await redisPublisher.publish("social:presence:events", JSON.stringify(event));
  }

  /**
   * Remove a presença de um usuário que desconectou
   */
  public static async removePresence(userId: string): Promise<void> {
    await redisClient.hdel(this.USERS_KEY, userId);

    const event: SocialServerMessage = {
      type: "user_went_offline",
      userId,
    };
    await redisPublisher.publish("social:presence:events", JSON.stringify(event));
  }

  /**
   * Obtém todos os usuários conectados no momento
   */
  public static async getAllOnlineUsers(): Promise<UserPresence[]> {
    const raw = await redisClient.hgetall(this.USERS_KEY);
    if (!raw) return [];

    const now = Date.now();
    const users: UserPresence[] = [];

    for (const [key, value] of Object.entries(raw)) {
      try {
        const parsed = JSON.parse(value) as UserPresence;
        // Se a última atividade foi há mais de 1 hora, limpa do hash
        if (now - parsed.lastSeen > 3600 * 1000) {
          await redisClient.hdel(this.USERS_KEY, key);
        } else {
          users.push(parsed);
        }
      } catch {
        await redisClient.hdel(this.USERS_KEY, key);
      }
    }

    return users;
  }

  /**
   * Registra ou atualiza sumário de sala ativa
   */
  public static async registerActiveRoom(room: RoomSummary): Promise<void> {
    await redisClient.hset(this.ROOMS_KEY, room.roomId, JSON.stringify(room));
    await redisClient.expire(this.ROOMS_KEY, 86400);

    const rooms = await this.getActiveRooms();
    const event: SocialServerMessage = {
      type: "active_rooms_update",
      activeRooms: rooms,
    };
    await redisPublisher.publish("social:presence:events", JSON.stringify(event));
  }

  /**
   * Remove uma sala encerrada
   */
  public static async unregisterActiveRoom(roomId: string): Promise<void> {
    await redisClient.hdel(this.ROOMS_KEY, roomId);

    const rooms = await this.getActiveRooms();
    const event: SocialServerMessage = {
      type: "active_rooms_update",
      activeRooms: rooms,
    };
    await redisPublisher.publish("social:presence:events", JSON.stringify(event));
  }

  /**
   * Retorna todas as salas ativas
   */
  public static async getActiveRooms(): Promise<RoomSummary[]> {
    const raw = await redisClient.hgetall(this.ROOMS_KEY);
    if (!raw) return [];
    return Object.values(raw).map((r) => JSON.parse(r) as RoomSummary);
  }

  /**
   * Dispara um convite de sala diretamente para o usuário alvo
   */
  public static async sendInvite(invite: RoomInvite): Promise<void> {
    const channel = `user:${invite.toUserId}:notifications`;
    await redisPublisher.publish(channel, JSON.stringify(invite));
  }

  /**
   * Assinatura local do socket para difusão social
   */
  public static subscribeGlobal(callback: SocialBroadcastCallback): () => void {
    this.globalSubscribers.add(callback);
    return () => {
      this.globalSubscribers.delete(callback);
    };
  }

  /**
   * Assinatura local de notificações direcionadas para um usuário
   */
  public static subscribeUserNotifications(userId: string, callback: UserInviteCallback): () => void {
    if (!this.userNotificationSubscribers.has(userId)) {
      this.userNotificationSubscribers.set(userId, new Set());
    }
    this.userNotificationSubscribers.get(userId)!.add(callback);

    return () => {
      const set = this.userNotificationSubscribers.get(userId);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.userNotificationSubscribers.delete(userId);
        }
      }
    };
  }
}
