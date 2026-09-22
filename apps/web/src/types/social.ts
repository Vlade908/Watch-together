import { CatalogTitle } from "@/data/mockCatalog";

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

export interface ActiveRoom {
  code: string;
  title: CatalogTitle;
  hostName: string;
  participantsCount: number;
  maxParticipants: number;
  syncQuality: string;
  isPrivate: boolean;
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
  status: "PLAYING" | "PAUSED";
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
  read?: boolean;
}

export interface FriendUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  friendshipStatus?: "NONE" | "FRIENDS" | "PENDING_SENT" | "PENDING_RECEIVED";
  friendshipId?: string;
}

export interface FriendshipItem {
  id: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "BLOCKED";
  createdAt: string;
  friend?: FriendUser;
  sender?: FriendUser;
  receiver?: FriendUser;
  isSender?: boolean;
}

export interface FriendNotification {
  type: "friend_request_received" | "friend_request_accepted" | "friend_removed" | "friend_blocked";
  friendshipId: string;
  fromUser: {
    userId: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
  };
  timestamp: number;
}

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
  read?: boolean;
}

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
