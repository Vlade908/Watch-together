import { redisClient } from "../redis/client";
import { RoomState, RoomMember, PlaybackStatus } from "../types";

export class RoomService {
  private static getRoomKey(roomId: string): string {
    return `room:${roomId}:state`;
  }

  private static getMembersKey(roomId: string): string {
    return `room:${roomId}:members`;
  }

  /**
   * Calcula o timestamp de mídia autoritativo no milissegundo exato solicitado
   */
  public static calculateCurrentMediaTime(state: RoomState, atWallTimeMs: number = Date.now()): number {
    if (state.status === "PAUSED") {
      return state.referenceMediaTime;
    }
    const elapsedSeconds = (atWallTimeMs - state.referenceWallTime) / 1000;
    return Math.max(0, state.referenceMediaTime + elapsedSeconds * state.playbackSpeed);
  }

  /**
   * Obtém o estado atual da sala do Redis, ou cria o estado inicial autoritativo caso não exista
   */
  public static async getOrCreateRoomState(
    roomId: string,
    defaultMediaId: string = "interestelar-alem-do-horizonte",
    hostId: string = "system"
  ): Promise<RoomState> {
    const key = this.getRoomKey(roomId);
    const data = await redisClient.hgetall(key);

    if (data && data.roomId) {
      return {
        roomId: data.roomId,
        mediaId: data.mediaId,
        status: data.status as PlaybackStatus,
        referenceMediaTime: parseFloat(data.referenceMediaTime || "0"),
        referenceWallTime: parseInt(data.referenceWallTime || "0", 10),
        hostId: data.hostId,
        playbackSpeed: parseFloat(data.playbackSpeed || "1.0"),
        updatedAt: parseInt(data.updatedAt || "0", 10),
      };
    }

    // Cria o estado inicial
    const now = Date.now();
    const initialState: RoomState = {
      roomId,
      mediaId: defaultMediaId,
      status: "PAUSED",
      referenceMediaTime: 0,
      referenceWallTime: now,
      hostId,
      playbackSpeed: 1.0,
      updatedAt: now,
    };

    await redisClient.hset(key, {
      roomId: initialState.roomId,
      mediaId: initialState.mediaId,
      status: initialState.status,
      referenceMediaTime: initialState.referenceMediaTime.toString(),
      referenceWallTime: initialState.referenceWallTime.toString(),
      hostId: initialState.hostId,
      playbackSpeed: initialState.playbackSpeed.toString(),
      updatedAt: initialState.updatedAt.toString(),
    });

    // Define TTL de 24 horas de inatividade para expiração da sala
    await redisClient.expire(key, 86400);

    return initialState;
  }

  /**
   * Aplica ações atômicas de reprodução no Redis Hash
   */
  public static async updatePlaybackState(
    roomId: string,
    action: "PLAY" | "PAUSE" | "SEEK",
    mediaTime: number,
    _userId: string
  ): Promise<RoomState> {
    const key = this.getRoomKey(roomId);
    const current = await this.getOrCreateRoomState(roomId);
    const now = Date.now();

    let newStatus: PlaybackStatus = current.status;
    let newMediaTime = mediaTime;

    if (action === "PLAY") {
      newStatus = "PLAYING";
      newMediaTime = mediaTime;
    } else if (action === "PAUSE") {
      newStatus = "PAUSED";
      newMediaTime = mediaTime;
    } else if (action === "SEEK") {
      newMediaTime = mediaTime;
      // Mantém o status anterior (se estava PLAYING continua PLAYING a partir do novo ponto)
    }

    const updatedState: RoomState = {
      ...current,
      status: newStatus,
      referenceMediaTime: newMediaTime,
      referenceWallTime: now,
      updatedAt: now,
    };

    await redisClient.hset(key, {
      status: updatedState.status,
      referenceMediaTime: updatedState.referenceMediaTime.toString(),
      referenceWallTime: updatedState.referenceWallTime.toString(),
      updatedAt: updatedState.updatedAt.toString(),
    });

    await redisClient.expire(key, 86400);

    return updatedState;
  }

  /**
   * Adiciona membro à sala no Redis
   */
  public static async addMember(roomId: string, member: RoomMember): Promise<RoomMember[]> {
    const key = this.getMembersKey(roomId);
    await redisClient.hset(key, member.userId, JSON.stringify(member));
    await redisClient.expire(key, 86400);
    return this.getMembers(roomId);
  }

  /**
   * Remove membro da sala no Redis
   */
  public static async removeMember(roomId: string, userId: string): Promise<RoomMember[]> {
    const key = this.getMembersKey(roomId);
    await redisClient.hdel(key, userId);
    return this.getMembers(roomId);
  }

  /**
   * Retorna todos os membros ativos na sala
   */
  public static async getMembers(roomId: string): Promise<RoomMember[]> {
    const key = this.getMembersKey(roomId);
    const raw = await redisClient.hgetall(key);
    if (!raw) return [];
    return Object.values(raw).map((m) => JSON.parse(m) as RoomMember);
  }
}
