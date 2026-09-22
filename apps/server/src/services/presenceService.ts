import { redisClient, redisPublisher, redisSubscriber } from "../redis/client";
import { UserPresence, RoomSummary, RoomInvite, SocialServerMessage } from "../types";

type SocialBroadcastCallback = (message: SocialServerMessage) => void;
type UserNotificationCallback = (message: SocialServerMessage) => void;

export class PresenceService {
  private static USERS_KEY = "users:online";
  private static ROOMS_KEY = "rooms:active:summaries";

  private static globalSubscribers: Set<SocialBroadcastCallback> = new Set();
  private static userNotificationSubscribers: Map<string, Set<UserNotificationCallback>> = new Map();
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
          const raw = JSON.parse(messageStr);
          
          let message: SocialServerMessage;
          if (raw.kind === "party_invite") {
            message = { type: "party_invitation", invite: raw.data };
          } else if (raw.kind === "friend_event") {
            message = { type: "friend_notification", notification: raw.data };
          } else if (raw.kind === "room_invite") {
            message = { type: "room_invitation", invite: raw.data };
          } else if (raw.type) {
            message = raw;
          } else {
            message = {
              type: "room_invitation",
              invite: raw as RoomInvite,
            };
          }

          const userCallbacks = this.userNotificationSubscribers.get(userId);
          if (userCallbacks) {
            for (const cb of userCallbacks) {
              try {
                cb(message);
              } catch (err) {
                console.error("[PresenceService] Erro no callback de notificação:", err);
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
   * Notifica a presença ou atualização de um usuário diretamente aos seus amigos aceitos
   */
  public static async notifyFriendsPresence(friendIds: string[], event: SocialServerMessage): Promise<void> {
    if (!friendIds || friendIds.length === 0) return;
    const payload = JSON.stringify(event);
    await Promise.all(
      friendIds.map((friendId) =>
        redisPublisher.publish(`user:${friendId}:notifications`, payload)
      )
    );
  }

  /**
   * Atualiza ou insere presença de um usuário no Redis
   * Notifica estritamente os amigos aceitos via canais privados
   */
  public static async upsertPresence(user: UserPresence, friendIds?: string[]): Promise<void> {
    const data: UserPresence = {
      ...user,
      lastSeen: Date.now(),
    };

    await redisClient.hset(this.USERS_KEY, user.userId, JSON.stringify(data));
    // Expira o conjunto de usuários caso não haja atividade
    await redisClient.expire(this.USERS_KEY, 86400);

    if (friendIds && friendIds.length > 0) {
      const event: SocialServerMessage = {
        type: "user_presence_changed",
        user: data,
      };
      await this.notifyFriendsPresence(friendIds, event);
    }
  }

  /**
   * Remove a presença de um usuário que desconectou
   * Notifica estritamente os amigos aceitos via canais privados
   */
  public static async removePresence(userId: string, friendIds?: string[]): Promise<void> {
    await redisClient.hdel(this.USERS_KEY, userId);

    if (friendIds && friendIds.length > 0) {
      const event: SocialServerMessage = {
        type: "user_went_offline",
        userId,
      };
      await this.notifyFriendsPresence(friendIds, event);
    }
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
    const message: SocialServerMessage = {
      type: "room_invitation",
      invite,
    };
    await redisPublisher.publish(channel, JSON.stringify(message));
  }

  /**
   * Dispara uma notificação de amizade (pedido, aceite) para o usuário alvo via Redis PubSub
   */
  public static async sendFriendNotification(toUserId: string, notification: import("../types").FriendNotification): Promise<void> {
    const channel = `user:${toUserId}:notifications`;
    const message: SocialServerMessage = {
      type: "friend_notification",
      notification,
    };
    await redisPublisher.publish(channel, JSON.stringify(message));
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
  public static subscribeUserNotifications(userId: string, callback: UserNotificationCallback): () => void {
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
