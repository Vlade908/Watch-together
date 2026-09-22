export type PlaybackStatus = "PLAYING" | "PAUSED";
export type MediaSourceType = "LOCAL_FILE" | "DIRECT_URL" | "CATALOG_DEMO";

export interface RoomState {
  roomId: string;
  mediaId: string;
  status: PlaybackStatus;
  referenceMediaTime: number; // segundos
  referenceWallTime: number;  // timestamp ms do servidor
  hostId: string;
  hostName?: string;
  playbackSpeed: number;
  updatedAt: number;
  sourceType?: MediaSourceType;
  contentFingerprint?: string; // hash amostral SHA-256 opaco
  mediaTitle?: string;
  directUrl?: string;
}

export interface RoomMember {
  userId: string;
  userName: string;
  avatarUrl?: string;
  isHost: boolean;
  joinedAt: number;
}

export type ClientMessage =
  | { type: "sync_clock"; clientSendTime: number }
  | {
      type: "join_room";
      roomId: string;
      userId: string;
      userName: string;
      isHost?: boolean;
      initialSourceType?: MediaSourceType;
      mediaTitle?: string;
    }
  | { type: "leave_room"; roomId: string; userId: string }
  | { type: "room_play"; mediaTime: number }
  | { type: "room_pause"; mediaTime: number }
  | { type: "room_seek"; mediaTime: number }
  | {
      type: "set_media_source";
      sourceType: MediaSourceType;
      contentFingerprint?: string;
      mediaTitle?: string;
      directUrl?: string;
    }
  | { type: "sync_request" }
  | { type: "chat_message"; text: string; senderName: string }
  | { type: "ping" };

export type ServerMessage =
  | { type: "pong"; timestamp: number }
  | {
      type: "clock_pong";
      clientSendTime: number;
      serverReceiveTime: number;
      serverSendTime: number;
    }
  | {
      type: "room_state";
      state: RoomState;
      currentMediaTime: number;
      members: RoomMember[];
    }
  | {
      type: "playback_update";
      action: "PLAY" | "PAUSE" | "SEEK";
      state: RoomState;
      triggeredBy: { userId: string; userName: string };
    }
  | {
      type: "source_updated";
      state: RoomState;
      directUrl?: string;
      triggeredBy: { userId: string; userName: string };
    }
  | {
      type: "member_joined";
      member: RoomMember;
      membersCount: number;
    }
  | {
      type: "member_left";
      userId: string;
      membersCount: number;
    }
  | {
      type: "chat_broadcast";
      id: string;
      text: string;
      senderId: string;
      senderName: string;
      timestamp: number;
    }
  | {
      type: "error";
      code?: string;
      message: string;
    };
