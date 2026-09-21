import { redisPublisher, redisSubscriber } from "../redis/client";
import { ServerMessage } from "../types";

type RoomBroadcastCallback = (message: ServerMessage) => void;

export class PubSubService {
  private static subscribers: Map<string, Set<RoomBroadcastCallback>> = new Map();
  private static isSubscribedToPattern = false;

  public static init() {
    if (this.isSubscribedToPattern) return;

    redisSubscriber.psubscribe("room:*:events", (err) => {
      if (err) {
        console.error("[PubSub] Erro ao subscrever a pattern de salas:", err);
      } else {
        console.log("[PubSub] Subscrição ativa para 'room:*:events'.");
        this.isSubscribedToPattern = true;
      }
    });

    redisSubscriber.on("pmessage", (_pattern, channel, messageStr) => {
      // Exemplo de canal: room:sala-cinephiles-4k:events
      const parts = channel.split(":");
      if (parts.length >= 3) {
        const roomId = parts[1];
        const callbacks = this.subscribers.get(roomId);
        if (callbacks && callbacks.size > 0) {
          try {
            const message = JSON.parse(messageStr) as ServerMessage;
            for (const cb of callbacks) {
              try {
                cb(message);
              } catch (cbErr) {
                console.error("[PubSub] Erro ao despachar callback local:", cbErr);
              }
            }
          } catch (jsonErr) {
            console.error("[PubSub] Erro ao parsear payload de evento:", jsonErr);
          }
        }
      }
    });
  }

  /**
   * Publica um evento autoritativo no canal Redis da sala
   */
  public static async publishRoomEvent(roomId: string, event: ServerMessage): Promise<void> {
    const channel = `room:${roomId}:events`;
    await redisPublisher.publish(channel, JSON.stringify(event));
  }

  /**
   * Registra um listener local (WebSocket da instância corrente) para receber eventos da sala
   */
  public static subscribeLocal(roomId: string, callback: RoomBroadcastCallback): () => void {
    if (!this.subscribers.has(roomId)) {
      this.subscribers.set(roomId, new Set());
    }
    this.subscribers.get(roomId)!.add(callback);

    // Retorna função de unsubscribe
    return () => {
      const set = this.subscribers.get(roomId);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.subscribers.delete(roomId);
        }
      }
    };
  }
}
