package com.example.service;

import com.example.config.ApplicationContextProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.context.ApplicationContext;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

/**
 * 실시간 보스 레이드 상태 동기화 서비스
 * 
 * 아키텍처:
 * 1. 서버에서만 주기적으로 DB 조회 (5-10초마다)
 * 2. 변경사항이 있을 때만 WebSocket으로 브로드캐스트
 * 3. 클라이언트는 WebSocket으로만 업데이트를 받음 (폴링 불필요)
 * 4. 주요 이벤트(방 생성, 완료 등)는 즉시 브로드캐스트
 * 
 * 장점:
 * - DB 부하 최소화 (서버 1개만 조회)
 * - 실시간 동기화
 * - 네트워크 트래픽 감소
 */
@Service
public class RealtimeBossService {
    
    @Autowired
    private SimpMessagingTemplate messagingTemplate;
    
    @Autowired
    private CacheManager cacheManager;
    
    // 캐시된 보스 목록 데이터
    private Map<String, Object> cachedBosses = null;
    
    /**
     * BossService를 지연 로딩으로 가져오기 (순환 참조 방지)
     */
    private BossService getBossService() {
        return com.example.config.ApplicationContextProvider
            .getApplicationContext()
            .getBean(BossService.class);
    }
    
    /**
     * RaidRoomService를 지연 로딩으로 가져오기 (순환 참조 방지)
     */
    private RaidRoomService getRaidRoomService() {
        return com.example.config.ApplicationContextProvider
            .getApplicationContext()
            .getBean(RaidRoomService.class);
    }
    
    /**
     * 보스 목록 조회 (캐시 활용)
     * DB 변경 이벤트가 발생하지 않으면 캐시된 데이터 반환
     */
    public Map<String, Object> getBossesWithCache() {
        if (cachedBosses == null) {
            cachedBosses = getBossService().getTodayBosses();
        }
        return cachedBosses;
    }
    
    /**
     * 캐시 무효화
     */
    public void invalidateCache() {
        cachedBosses = null;
    }
    
    /**
     * 특정 레이드 방의 변경사항을 즉시 브로드캐스트
     * (채널 추가, 잡혔다 표시 등)
     * 
     * 최적화: 트랜잭션 커밋 후 브로드캐스트하여 데이터 일관성 보장
     * 동시 업데이트 시 중복 브로드캐스트 방지를 위한 디바운싱 고려 필요
     */
    public void broadcastRaidRoomUpdate(Long roomId) {
        try {
            // 트랜잭션이 커밋된 후에만 브로드캐스트하도록
            // 비동기로 처리하여 트랜잭션 완료 후 실행
            if (org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()) {
                org.springframework.transaction.support.TransactionSynchronizationManager
                    .registerSynchronization(new org.springframework.transaction.support.TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            // 트랜잭션 커밋 후 캐시 무효화 (최신 데이터 보장)
                            evictRaidRoomCache(roomId);
                            executeBroadcast(roomId, "트랜잭션 커밋 후");
                        }
                    });
            } else {
                // 트랜잭션 외부에서 호출된 경우 즉시 캐시 무효화 및 실행
                evictRaidRoomCache(roomId);
                executeBroadcast(roomId, "트랜잭션 외부");
            }
        } catch (Exception e) {
            // 예외 발생 시에도 캐시 무효화 및 브로드캐스트 시도
            evictRaidRoomCache(roomId);
            executeBroadcast(roomId, "예외 처리 중");
        }
    }
    
    /**
     * 레이드 방 캐시 무효화 (트랜잭션 커밋 후 실행)
     */
    private void evictRaidRoomCache(Long roomId) {
        try {
            if (cacheManager != null) {
                var cache = cacheManager.getCache("raidRoom");
                if (cache != null) {
                    cache.evict(roomId);
                }
            }
        } catch (Exception e) {
            // 캐시 무효화 실패는 무시 (로깅만)
        }
    }
    
    /**
     * 채널 선택 변경만 브로드캐스트 (최적화: 전체 데이터 조회 없이)
     */
    public void broadcastChannelSelectionUpdate(Long roomId, Long userId, Long channelId, boolean isSelecting) {
        try {
            Map<String, Object> update = new HashMap<>();
            update.put("type", "channel_selection");
            update.put("userId", userId);
            update.put("channelId", channelId);
            update.put("isSelecting", isSelecting);
            update.put("_timestamp", System.currentTimeMillis());
            
            messagingTemplate.convertAndSend("/topic/raid-room/" + roomId + "/updates", update);
        } catch (Exception e) {
            // 브로드캐스트 실패 시 무시
        }
    }
    
    /**
     * 실제 브로드캐스트 실행 (전체 데이터)
     * 캐시를 우회하여 최신 데이터를 보장
     */
    private void executeBroadcast(Long roomId, String context) {
        try {
            // 캐시를 우회하여 최신 데이터 조회 (트랜잭션 커밋 후이므로 최신 데이터 보장)
            Map<String, Object> roomData = getRaidRoomService().getRaidRoomWithoutCache(roomId);
            if (roomData != null) {
                // 타임스탬프 추가하여 메시지 순서 보장
                roomData.put("_timestamp", System.currentTimeMillis());
                messagingTemplate.convertAndSend("/topic/raid-room/" + roomId, roomData);
            }
        } catch (Exception e) {
            // 브로드캐스트 실패 시 무시
        }
    }
    
    /**
     * 보스 목록 전체 업데이트 브로드캐스트
     * DB 변경 이벤트 발생 시 호출됨
     * 1. 캐시 무효화
     * 2. DB에서 최신 데이터 조회
     * 3. WebSocket으로 브로드캐스트
     */
    public void broadcastBossListUpdate() {
        try {
            ApplicationContext context = ApplicationContextProvider.getApplicationContext();
            if (context == null) {
                return;
            }
            
            // 캐시 무효화
            invalidateCache();
            
            // 최신 데이터 조회 (캐시가 무효화되었으므로 DB에서 조회)
            BossService bossService = getBossService();
            if (bossService == null) {
                return;
            }
            
            Map<String, Object> bosses = bossService.getTodayBosses();
            
            // 캐시 업데이트
            cachedBosses = bosses;
            
            // WebSocket 브로드캐스트
            messagingTemplate.convertAndSend("/topic/bosses/today", bosses);
        } catch (Exception e) {
            // 브로드캐스트 실패 시 무시
        }
    }
}

