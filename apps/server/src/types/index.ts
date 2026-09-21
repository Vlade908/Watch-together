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
    }
  | {
      type: "party_create";
    }
  | {
      type: "party_invite";
      targetUserId: string;
    }
  | {
      type: "party_accept_invite";
      partyId: string;
    }
  | {
      type: "party_decline_invite";
      partyId: string;
    }
  | {
      type: "party_leave";
    }
  | {
      type: "party_start_media";
      slug: string;
      title: string;
      roomId: string;
    }
  | {
      type: "party_get_snapshot";
    };

export interface PartyMember {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  role: "HOST" | "MEMBER";
  joinedAt: number;
}

export interface PartySession {
  id: string;
  hostId: string;
  hostName: string;
  members: PartyMember[];
  activeMedia?: {
    slug: string;
    title: string;
    roomId: string;
  } | null;
  createdAt: number;
  updatedAt: number;
}

export interface PartyInvite {
  partyId: string;
  hostUser: {
    userId: string;
    name: string;
    avatarUrl?: string | null;
  };
  toUserId: string;
  timestamp: number;
}

export interface FriendNotification {
  type: "friend_request_received" | "friend_request_accepted" | "friend_removed";
  friendshipId: string;
  fromUser: {
    userId: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
  };
  timestamp: number;
}

export type SocialNotificationPayload =
  | { kind: "room_invite"; data: RoomInvite }
  | { kind: "friend_event"; data: FriendNotification }
  | { kind: "party_invite"; data: PartyInvite };

// Mensagens Servidor -> Cliente (Canal Social Global e Party)
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
      type: "friend_notification";
      notification: FriendNotification;
    }
  | {
      type: "party_snapshot";
      party: PartySession | null;
    }
  | {
      type: "party_invitation";
      invite: PartyInvite;
    }
  | {
      type: "party_updated";
      party: PartySession;
    }
  | {
      type: "party_disbanded";
      partyId: string;
      reason?: string;
    }
  | {
      type: "party_navigate";
      partyId: string;
      slug: string;
      title: string;
      roomId: string;
      hostName: string;
    }
  | {
      type: "error";
      message: string;
    };

