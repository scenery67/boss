import { apiClient } from './api';
import { cache } from '../utils/cache';
import { BossListResponse, RaidRoomData, ApiResponse } from '../types';

// 캐시 키 생성
const getTodayBossesCacheKey = () => {
  const today = new Date().toISOString().split('T')[0];
  return `todayBosses_${today}`;
};

const getRaidRoomCacheKey = (roomId: number) => `raidRoom_${roomId}`;

export const getTodayBosses = async (forceRefresh: boolean = false): Promise<BossListResponse> => {
  const cacheKey = getTodayBossesCacheKey();
  
  // 강제 새로고침이 아니면 캐시 확인
  if (!forceRefresh) {
    const cached = cache.get<BossListResponse>(cacheKey);
    if (cached) {
      return cached;
    }
  }
  
  // API 호출
  const response = await apiClient.get<BossListResponse>('/api/bosses/today');
  const data = response.data;
  
  // 캐시에 저장 (30초)
  cache.set(cacheKey, data, 30000);
  
  return data;
};

export const getRaidRoom = async (roomId: number, forceRefresh: boolean = false): Promise<RaidRoomData> => {
  const cacheKey = getRaidRoomCacheKey(roomId);
  
  // 강제 새로고침이 아니면 캐시 확인
  if (!forceRefresh) {
    const cached = cache.get<RaidRoomData>(cacheKey);
    if (cached) {
      return cached;
    }
  }
  
  // API 호출
  const response = await apiClient.get<RaidRoomData>(`/api/raid-rooms/${roomId}`);
  const data = response.data;
  
  // 캐시에 저장 (10초 - 실시간 업데이트 필요)
  cache.set(cacheKey, data, 10000);
  
  return data;
};

export const createChannel = async (roomId: number, channelNumber: number): Promise<ApiResponse> => {
  const response = await apiClient.post(`/api/raid-rooms/${roomId}/channels`, {
    channelNumber
  });
  
  // 채널 생성 시 해당 방 캐시 무효화
  cache.delete(getRaidRoomCacheKey(roomId));
  
  return response.data;
};

export const deleteChannel = async (roomId: number, channelId: number): Promise<ApiResponse> => {
  const response = await apiClient.delete(`/api/raid-rooms/${roomId}/channels/${channelId}`);
  
  // 채널 삭제 시 해당 방 캐시 무효화
  cache.delete(getRaidRoomCacheKey(roomId));
  cache.deletePattern('todayBosses.*');
  
  return response.data;
};

export const markDefeated = async (roomId: number, channelId: number): Promise<ApiResponse> => {
  const response = await apiClient.put(`/api/raid-rooms/${roomId}/channels/${channelId}/defeated`);
  
  // 상태 변경 시 해당 방 캐시 무효화
  cache.delete(getRaidRoomCacheKey(roomId));
  
  return response.data;
};

export const createRaidRoom = async (bossType: string, raidDate: string, raidTime: string): Promise<ApiResponse & { roomId?: number }> => {
  const requestBody: any = {
    bossType,
    raidDate
  };
  
  // raidTime이 빈 문자열이 아닐 때만 포함
  if (raidTime && raidTime.trim() !== '') {
    requestBody.raidTime = raidTime;
  }
  
  const response = await apiClient.post('/api/bosses/rooms', requestBody);
  
  // 방 생성 시 오늘의 보스 목록 캐시 완전히 무효화
  cache.delete(getTodayBossesCacheKey());
  // 모든 todayBosses 관련 캐시 삭제 (패턴 매칭)
  cache.deletePattern('todayBosses.*');
  
  return response.data;
};

export const completeRaidRoom = async (roomId: number): Promise<ApiResponse> => {
  const response = await apiClient.put(`/api/raid-rooms/${roomId}/complete`);
  
  // 완료 시 캐시 무효화
  cache.delete(getRaidRoomCacheKey(roomId));
  cache.delete(getTodayBossesCacheKey());
  
  return response.data;
};

export const getCompletedRooms = async (): Promise<{ rooms: Array<{
  id: number;
  bossName: string;
  bossType: string;
  raidDate: string;
  raidTime: string;
  completedAt: string;
  channelCount: number;
}> }> => {
  const response = await apiClient.get('/api/bosses/completed');
  return response.data;
};

export const deleteRaidRoom = async (roomId: number): Promise<ApiResponse> => {
  const response = await apiClient.delete(`/api/raid-rooms/${roomId}`);
  
  // 삭제 시 캐시 무효화
  cache.delete(getRaidRoomCacheKey(roomId));
  cache.deletePattern('todayBosses.*');
  
  return response.data;
};

export const updateChannelMemo = async (roomId: number, channelId: number, memo: string): Promise<ApiResponse> => {
  const response = await apiClient.put(`/api/raid-rooms/${roomId}/channels/${channelId}/memo`, {
    memo
  });
  
  // 메모 업데이트 시 해당 방 캐시 무효화
  cache.delete(getRaidRoomCacheKey(roomId));
  
  return response.data;
};

export const toggleChannelSelection = async (roomId: number, channelId: number, userId: number): Promise<ApiResponse> => {
  const response = await apiClient.put(`/api/raid-rooms/${roomId}/channels/${channelId}/select`, {
    userId
  });
  
  // 채널 선택 시 해당 방 캐시 무효화
  cache.delete(getRaidRoomCacheKey(roomId));
  
  return response.data;
};

export const updateChannelBossColor = async (roomId: number, channelId: number, bossType: string, bossColor: string): Promise<ApiResponse> => {
  const response = await apiClient.put(`/api/raid-rooms/${roomId}/channels/${channelId}/boss-color`, {
    bossType,
    bossColor
  });
  
  // 보스 색상 업데이트 시 해당 방 캐시 무효화
  cache.delete(getRaidRoomCacheKey(roomId));
  
  return response.data;
};

export const toggleParticipation = async (roomId: number, userId: number): Promise<ApiResponse & { isParticipating?: boolean }> => {
  const response = await apiClient.put(`/api/raid-rooms/${roomId}/participate`, {
    userId
  });
  
  // 참석 상태 변경 시 해당 방 캐시 무효화
  cache.delete(getRaidRoomCacheKey(roomId));
  
  return response.data;
};

export const createChannelsBatch = async (roomId: number, channelNumbers: number[]): Promise<ApiResponse & { created?: number[], failed?: number[] }> => {
  const response = await apiClient.post(`/api/raid-rooms/${roomId}/channels/batch`, {
    channelNumbers
  });
  
  // 채널 일괄 생성 시 해당 방 캐시 무효화
  cache.delete(getRaidRoomCacheKey(roomId));
  
  return response.data;
};

// 수화룡 레이드: 수룡/화룡 잡힌 시간 업데이트
export const updateDragonDefeatedTime = async (
  roomId: number, 
  channelId: number, 
  dragonType: 'water' | 'fire', 
  defeatedAt: string
): Promise<ApiResponse> => {
  const response = await apiClient.put(`/api/raid-rooms/${roomId}/channels/${channelId}/dragon-time`, {
    dragonType,
    defeatedAt
  });
  
  // 드래곤 잡힌 시간 업데이트 시 해당 방 캐시 무효화
  cache.delete(getRaidRoomCacheKey(roomId));
  
  return response.data;
};