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
