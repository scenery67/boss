// 공통 타입 정의

export interface User {
  id: string | number;
  username: string;
  displayName?: string;
  role?: string;
  avatarUrl?: string;
  isGuest?: boolean;
}

export interface Boss {
  id: number;
  name: string;
  description?: string;
  type?: string;
  rooms: Room[];
}

export interface Room {
  id: number;
  channelCount: number;
  raidTime?: string;
  raidDate?: string;
  createdAt?: string;
  bossName?: string;
  bossType?: string;
  isCompleted?: boolean;
}

export interface Channel {
  id: number;
  channelNumber: number;
  isDefeated: boolean;
  memo?: string;
  bossHeukColor?: string;
  bossJinColor?: string;
  bossMukColor?: string;
  bossGamColor?: string;
  users: ChannelUser[];
}

export interface ChannelUser {
  userId: number;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  isMoving: boolean;
}

export interface Participant {
  userId: number;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface RaidRoomData {
  id?: number;
  boss: {
    id?: number;
    name: string;
    type?: string;
  };
  raidDate: string;
  raidTime?: string;
  isCompleted?: boolean;
  channels: Channel[];
  participants?: Participant[];
  connectedUsers?: Participant[]; // 현재 접속한 사용자 목록
}

export interface ApiResponse<T = any> {
  success?: boolean;
  error?: string;
  message?: string;
  data?: T;
}

export interface BossListResponse {
  bosses: Boss[];
}

export interface RaidRoomResponse extends RaidRoomData {
  success?: boolean;
  error?: string;
}

