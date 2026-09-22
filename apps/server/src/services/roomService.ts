import { redisClient } from "../redis/client";
import { RoomState, RoomMember, PlaybackStatus, MediaSourceType } from "../types";

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
   * Obtém o estado atual da sala do Redis caso exista, ou retorna null
   */
  public static async getRoomState(roomId: string): Promise<RoomState | null> {
    const key = this.getRoomKey(roomId);
    const data = await redisClient.hgetall(key);
    if (!data || !data.roomId) return null;
    return {
      roomId: data.roomId,
      mediaId: data.mediaId,
      status: data.status as PlaybackStatus,
      referenceMediaTime: parseFloat(data.referenceMediaTime || "0"),
      referenceWallTime: parseInt(data.referenceWallTime || "0", 10),
      hostId: data.hostId,
      hostName: data.hostName || undefined,
      playbackSpeed: parseFloat(data.playbackSpeed || "1.0"),
      updatedAt: parseInt(data.updatedAt || "0", 10),
      sourceType: (data.sourceType as MediaSourceType) || "CATALOG_DEMO",
      contentFingerprint: data.contentFingerprint || undefined,
      mediaTitle: data.mediaTitle || undefined,
      directUrl: data.directUrl || undefined,
    };
  }

  /**
   * Cria explicitamente ou reivindica a sala para um Host legítimo antes que convidados ingressem
   */
  public static async createOrClaimRoom(
    roomId: string,
    hostId: string,
    hostName?: string,
    options: {
      mediaId?: string;
      sourceType?: MediaSourceType;
      mediaTitle?: string;
      directUrl?: string;
    } = {}
  ): Promise<RoomState> {
    const key = this.getRoomKey(roomId);
    const existing = await redisClient.hgetall(key);
    if (existing && existing.roomId) {
      if (!existing.hostId || existing.hostId === "system") {
        const patch: Record<string, string> = { hostId };
        if (hostName) patch.hostName = hostName;
        await redisClient.hset(key, patch);
      }
      return this.getOrCreateRoomState(roomId);
    }
    return this.getOrCreateRoomState(
      roomId,
      options.mediaId,
      hostId,
      options.sourceType,
      options.mediaTitle,
      options.directUrl,
      hostName
    );
  }

  /**
   * Obtém o estado atual da sala do Redis, ou cria o estado inicial autoritativo caso não exista
   * O hostId original permanece IMUTÁVEL e protegido contra sequestro de permissão por convidados
   */
  public static async getOrCreateRoomState(
    roomId: string,
    defaultMediaId: string = "interestelar-alem-do-horizonte",
    candidateHostId: string = "system",
    defaultSourceType: MediaSourceType = "CATALOG_DEMO",
    defaultMediaTitle?: string,
    defaultDirectUrl?: string,
    candidateHostName?: string
  ): Promise<RoomState> {
    const key = this.getRoomKey(roomId);
    const data = await redisClient.hgetall(key);

    const isLocalRoom =
      defaultSourceType === "LOCAL_FILE" ||
      roomId.includes("local") ||
      roomId.includes("arquivo-local") ||
      defaultMediaId === "arquivo-local";

    const computedSourceType: MediaSourceType = isLocalRoom ? "LOCAL_FILE" : defaultSourceType;
    const computedMediaId = isLocalRoom ? "arquivo-local" : defaultMediaId;
    const computedMediaTitle = isLocalRoom ? (defaultMediaTitle || "Ficheiro Local (Syncplay)") : defaultMediaTitle;

    if (data && data.roomId) {
      let authoritativeHostId = data.hostId;
      let authoritativeHostName = data.hostName;

      // Se a sala existia mas hostId era "system" ou vazio, e recebemos um hostId legítimo de usuário autenticado, promovemos
      if ((!authoritativeHostId || authoritativeHostId === "system") && candidateHostId && candidateHostId !== "system") {
        authoritativeHostId = candidateHostId;
        authoritativeHostName = candidateHostName || authoritativeHostName;
        const patch: Record<string, string> = { hostId: authoritativeHostId };
        if (authoritativeHostName) patch.hostName = authoritativeHostName;
        await redisClient.hset(key, patch);
      }

      return {
        roomId: data.roomId,
        mediaId: data.mediaId || computedMediaId,
        status: data.status as PlaybackStatus,
        referenceMediaTime: parseFloat(data.referenceMediaTime || "0"),
        referenceWallTime: parseInt(data.referenceWallTime || "0", 10),
        hostId: authoritativeHostId,
        hostName: authoritativeHostName || undefined,
        playbackSpeed: parseFloat(data.playbackSpeed || "1.0"),
        updatedAt: parseInt(data.updatedAt || "0", 10),
        sourceType: (data.sourceType as MediaSourceType) || computedSourceType,
        contentFingerprint: data.contentFingerprint || undefined,
        mediaTitle: data.mediaTitle || computedMediaTitle || undefined,
        directUrl: data.directUrl || undefined,
      };
    }

    // Cria o estado inicial com o hostId recebido
    const now = Date.now();
    const initialState: RoomState = {
      roomId,
      mediaId: computedMediaId,
      status: "PAUSED",
      referenceMediaTime: 0,
      referenceWallTime: now,
      hostId: candidateHostId,
      hostName: candidateHostName,
      playbackSpeed: 1.0,
      updatedAt: now,
      sourceType: computedSourceType,
      mediaTitle: computedMediaTitle,
      directUrl: defaultDirectUrl,
    };

    const payload: Record<string, string> = {
      roomId: initialState.roomId,
      mediaId: initialState.mediaId,
      status: initialState.status,
      referenceMediaTime: initialState.referenceMediaTime.toString(),
      referenceWallTime: initialState.referenceWallTime.toString(),
      hostId: initialState.hostId,
      playbackSpeed: initialState.playbackSpeed.toString(),
      updatedAt: initialState.updatedAt.toString(),
      sourceType: initialState.sourceType || "CATALOG_DEMO",
    };

    if (initialState.hostName) {
      payload.hostName = initialState.hostName;
    }

    if (initialState.mediaTitle) {
      payload.mediaTitle = initialState.mediaTitle;
    }

    if (initialState.directUrl) {
      payload.directUrl = initialState.directUrl;
    }

    await redisClient.hset(key, payload);

    // Define TTL de 24 horas de inatividade para expiração da sala
    await redisClient.expire(key, 86400);

    return initialState;
  }

  /**
   * Atualiza a modalidade de fonte de mídia da sala no Redis (BYOM / UMSA)
   */
  public static async updateRoomMediaSource(
    roomId: string,
    sourceType: MediaSourceType,
    contentFingerprint?: string,
    mediaTitle?: string,
    directUrl?: string
  ): Promise<RoomState> {
    const key = this.getRoomKey(roomId);
    const current = await this.getOrCreateRoomState(roomId);
    const now = Date.now();

    const updatedState: RoomState = {
      ...current,
      sourceType,
      contentFingerprint: contentFingerprint || undefined,
      mediaTitle: mediaTitle || current.mediaTitle,
      directUrl: sourceType === "DIRECT_URL" ? (directUrl || current.directUrl) : undefined,
      status: "PAUSED",
      referenceMediaTime: 0,
      referenceWallTime: now,
      updatedAt: now,
    };

    const payload: Record<string, string> = {
      sourceType: updatedState.sourceType || "CATALOG_DEMO",
      status: updatedState.status,
      referenceMediaTime: "0",
      referenceWallTime: now.toString(),
      updatedAt: now.toString(),
    };

    if (contentFingerprint) {
      payload.contentFingerprint = contentFingerprint;
    } else {
      await redisClient.hdel(key, "contentFingerprint");
    }

    if (mediaTitle) {
      payload.mediaTitle = mediaTitle;
    }

    if (sourceType === "DIRECT_URL" && updatedState.directUrl) {
      payload.directUrl = updatedState.directUrl;
    } else {
      await redisClient.hdel(key, "directUrl");
    }

    await redisClient.hset(key, payload);
    await redisClient.expire(key, 86400);

    return updatedState;
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
    const remainingMembers = await this.getMembers(roomId);

    // Se não restarem membros na sala, encurta o TTL para 1 hora para economizar memória do Redis
    if (remainingMembers.length === 0) {
      await redisClient.expire(key, 3600);
      await redisClient.expire(this.getRoomKey(roomId), 3600);
    }

    return remainingMembers;
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
