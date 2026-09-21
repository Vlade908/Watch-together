export type PlaybackStatus = "PLAYING" | "PAUSED";

export interface RoomState {
  roomId: string;
  mediaId: string;
  status: PlaybackStatus;
  referenceMediaTime: number; // segundos no vídeo
  referenceWallTime: number;  // timestamp do servidor em milissegundos
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

// -------------------------------------------------------------
// Tipos de Presença Social & Convites (Fase 3)
// -------------------------------------------------------------

export interface UserWatchingInfo {
  id: string;
  name: string;
  slug: string;
  bannerUrl: string;
}

export interface UserPresence {
  userId: string;
  userName: string;
  avatarColor: string;
  initials: string;
  status: "watching" | "idle" | "in_lobby";
  watchingTitle?: UserWatchingInfo;
  roomId?: string;
  device?: string;
  lastSeen: number;
}

export interface RoomSummary {
  roomId: string;
  mediaId: string;
  titleName: string;
  bannerUrl: string;
  slug: string;
  hostName: string;
  participantsCount: number;
  maxParticipants: number;
  status: PlaybackStatus;
  isPrivate: boolean;
  syncQuality?: string;
}

export interface RoomInvite {
  inviteId: string;
  fromUser: {
    userId: string;
    userName: string;
    avatarColor?: string;
    initials?: string;
  };
  toUserId: string;
  roomId: string;
  movieSlug: string;
  movieTitle: string;
  bannerUrl?: string;
  timestamp: number;
}

// Mensagens Cliente -> Servidor (Sala de Reprodução)
export type ClientMessage =
  | { type: "sync_clock"; clientSendTime: number }
  | { type: "join_room"; roomId: string; userId: string; userName: string; isHost?: boolean }
  | { type: "leave_room"; roomId: string; userId: string }
  | { type: "room_play"; mediaTime: number }
  | { type: "room_pause"; mediaTime: number }
  | { type: "room_seek"; mediaTime: number }
  | { type: "sync_request" }
  | { type: "chat_message"; text: string; senderName: string };

// Mensagens Servidor -> Cliente (Sala de Reprodução)
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

// Mensagens Cliente -> Servidor (Canal Social Global)
export type SocialClientMessage =
  | {
      type: "social_identify";
      user: UserPresence;
    }
  | {
      type: "social_update_presence";
      status: "watching" | "idle" | "in_lobby";
      watchingTitle?: UserWatchingInfo;
      roomId?: string;
    }
  | {
      type: "send_invite";
      toUserId: string;
      roomId: string;
      movieSlug: string;
      movieTitle: string;
      bannerUrl?: string;
    }
  | {
      type: "get_social_snapshot";
    };

// Mensagens Servidor -> Cliente (Canal Social Global)
export type SocialServerMessage =
  | {
      type: "social_snapshot";
      onlineUsers: UserPresence[];
      activeRooms: RoomSummary[];
    }
  | {
      type: "user_presence_changed";
      user: UserPresence;
    }
  | {
      type: "user_went_offline";
      userId: string;
    }
  | {
      type: "active_rooms_update";
      activeRooms: RoomSummary[];
    }
  | {
      type: "room_invitation";
      invite: RoomInvite;
    }
  | {
      type: "error";
      message: string;
    };

