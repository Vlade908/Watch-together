export type PlaybackStatus = "PLAYING" | "PAUSED";

export interface RoomState {
  roomId: string;
  mediaId: string;
  status: PlaybackStatus;
  referenceMediaTime: number; // segundos
  referenceWallTime: number;  // timestamp ms do servidor
  hostId: string;
  playbackSpeed: number;
  updatedAt: number;
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
  | { type: "join_room"; roomId: string; userId: string; userName: string; isHost?: boolean }
  | { type: "leave_room"; roomId: string; userId: string }
  | { type: "room_play"; mediaTime: number }
  | { type: "room_pause"; mediaTime: number }
  | { type: "room_seek"; mediaTime: number }
  | { type: "sync_request" }
  | { type: "chat_message"; text: string; senderName: string };

export type ServerMessage =
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
      message: string;
    };
