package com.example.service;

import com.example.entity.Channel;
import com.example.entity.ChannelUser;
import com.example.entity.RaidParticipation;
import com.example.entity.RaidRoom;
import com.example.entity.User;
import com.example.repository.ChannelRepository;
import com.example.repository.ChannelUserRepository;
import com.example.repository.RaidParticipationRepository;
import com.example.repository.RaidRoomRepository;
import com.example.repository.UserRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class RaidRoomService {
    
    private static final Logger logger = LoggerFactory.getLogger(RaidRoomService.class);
    
    @Autowired
    private RaidRoomRepository raidRoomRepository;
    
    @Autowired
    private ChannelRepository channelRepository;
    
    @Autowired
    private ChannelUserRepository channelUserRepository;
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private RaidParticipationRepository raidParticipationRepository;
    
    @Autowired
    private RealtimeBossService realtimeBossService;
    
    @Autowired
    private com.example.service.WebSocketConnectionService webSocketConnectionService;
    
    @Autowired
    private CacheManager cacheManager;
    
    @PersistenceContext
    private EntityManager entityManager;
    
    /**
     * 레이드 방 상세 정보 조회 (캐시 사용)
     * 캐시: 10초간 유지 (실시간 업데이트 필요하므로 짧게)
     */
    @Transactional(readOnly = true)
    @Cacheable(value = "raidRoom", key = "#roomId", unless = "#result == null")
    public Map<String, Object> getRaidRoom(Long roomId) {
        return getRaidRoomInternal(roomId, false);
    }
    
    /**
     * 레이드 방 상세 정보 조회 (캐시 우회)
     * WebSocket 브로드캐스트 시 최신 데이터를 보장하기 위해 사용
     * REQUIRES_NEW: 완전히 새로운 트랜잭션에서 실행하여 영속성 컨텍스트 초기화
     */
    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public Map<String, Object> getRaidRoomWithoutCache(Long roomId) {
        // 영속성 컨텍스트를 clear하여 최신 데이터를 보장
        entityManager.clear();
        return getRaidRoomInternal(roomId, true);
    }
    
    /**
     * 레이드 방 상세 정보 조회 내부 로직 (공통)
     * @param loadChannelsAndUsers true면 EntityGraph로 채널과 채널 유저를 함께 로드 (이동중 표시를 위해)
     */
    private Map<String, Object> getRaidRoomInternal(Long roomId, boolean loadChannelsAndUsers) {
        try {
            Optional<RaidRoom> roomOpt = null;
            if (loadChannelsAndUsers) {
                try {
                    // 채널만 함께 로드 (MultipleBagFetchException 방지)
                    roomOpt = raidRoomRepository.findByIdWithChannels(roomId);
                    if (roomOpt.isPresent()) {
                        RaidRoom room = roomOpt.get();
                        // 각 채널의 채널 유저를 별도로 조회하여 lazy loading 문제 방지
                        try {
                            for (Channel channel : room.getChannels()) {
                                List<ChannelUser> channelUsers = channelUserRepository.findByChannelId(channel.getId());
                                channel.getChannelUsers().clear();
                                channel.getChannelUsers().addAll(channelUsers);
                            }
                            logger.debug("JOIN FETCH로 레이드 방 조회 성공: roomId={}, channels={}", roomId, room.getChannels().size());
                        } catch (Exception e) {
                            logger.warn("채널 유저 조회 실패: roomId={}", roomId, e);
                        }
                    }
                } catch (Exception e) {
                    logger.warn("JOIN FETCH 쿼리 실패, 폴백 시도: roomId={}, error={}", roomId, e.getMessage());
                }
                
                // JOIN FETCH가 실패하거나 결과가 없으면 명시적으로 채널과 채널 유저를 조회
                if (roomOpt == null || roomOpt.isEmpty()) {
                    roomOpt = raidRoomRepository.findById(roomId);
                    if (roomOpt.isPresent()) {
                        RaidRoom room = roomOpt.get();
                        // 명시적으로 채널과 채널 유저를 조회하여 lazy loading 문제 방지
                        try {
                            List<Channel> channels = channelRepository.findByRaidRoomId(roomId);
                            room.getChannels().clear();
                            room.getChannels().addAll(channels);
                            
                            // 각 채널의 채널 유저도 명시적으로 로드
                            for (Channel channel : channels) {
                                List<ChannelUser> channelUsers = channelUserRepository.findByChannelId(channel.getId());
                                channel.getChannelUsers().clear();
                                channel.getChannelUsers().addAll(channelUsers);
                            }
                            logger.debug("명시적 조회로 레이드 방 데이터 로드 성공: roomId={}, channels={}", roomId, channels.size());
                        } catch (Exception e) {
                            logger.error("채널 및 채널 유저 명시적 조회 실패: roomId={}", roomId, e);
                            // 조회 실패해도 기본 데이터는 반환
                        }
                    }
                }
            } else {
                // 일반 조회는 기본 findById 사용
                roomOpt = raidRoomRepository.findById(roomId);
            }
            
            if (roomOpt == null || roomOpt.isEmpty()) {
                logger.warn("레이드 방을 찾을 수 없습니다: roomId={}", roomId);
                return null;
            }
            
            RaidRoom room = roomOpt.get();
            
            Map<String, Object> response = new HashMap<>();
            response.put("id", room.getId());
            
            // 보스 정보 (null 체크)
            if (room.getBoss() != null) {
                Map<String, Object> boss = new HashMap<>();
                boss.put("id", room.getBoss().getId());
                boss.put("name", room.getBoss().getName());
                boss.put("type", room.getBoss().getType() != null ? room.getBoss().getType().name() : "UNKNOWN");
                response.put("boss", boss);
            } else {
                Map<String, Object> boss = new HashMap<>();
                boss.put("id", 0L);
                boss.put("name", "알 수 없음");
                boss.put("type", "UNKNOWN");
                response.put("boss", boss);
            }
            
            // 레이드 날짜
            if (room.getRaidDate() != null) {
                response.put("raidDate", room.getRaidDate().toString());
            } else {
                response.put("raidDate", "");
            }
            
            // 레이드 시간
            if (room.getRaidTime() != null) {
                response.put("raidTime", room.getRaidTime().toString());
            }
            
            // 완료 여부
            response.put("isCompleted", room.getIsCompleted() != null ? room.getIsCompleted() : false);
            if (room.getCompletedAt() != null) {
                response.put("completedAt", room.getCompletedAt().toString());
            }
            
            // 채널 목록 (null 체크 및 정렬)
            List<Map<String, Object>> channels = new java.util.ArrayList<>();
            if (room.getChannels() != null) {
                try {
                    channels = room.getChannels().stream()
                        .filter(channel -> channel != null)
                        .sorted((c1, c2) -> {
                            // channelNumber로 정렬 (null 처리)
                            Integer num1 = c1.getChannelNumber() != null ? c1.getChannelNumber() : 0;
                            Integer num2 = c2.getChannelNumber() != null ? c2.getChannelNumber() : 0;
                            return num1.compareTo(num2);
                        })
                        .map((Channel channel) -> {
                            Map<String, Object> channelData = new HashMap<>();
                            channelData.put("id", channel.getId());
                            channelData.put("channelNumber", channel.getChannelNumber() != null ? channel.getChannelNumber() : 0);
                            channelData.put("isDefeated", channel.getIsDefeated() != null ? channel.getIsDefeated() : false);
                            channelData.put("memo", channel.getMemo() != null ? channel.getMemo() : "");
                            channelData.put("bossHeukColor", channel.getBossHeukColor() != null ? channel.getBossHeukColor() : "");
                            channelData.put("bossJinColor", channel.getBossJinColor() != null ? channel.getBossJinColor() : "");
                            channelData.put("bossMukColor", channel.getBossMukColor() != null ? channel.getBossMukColor() : "");
                            channelData.put("bossGamColor", channel.getBossGamColor() != null ? channel.getBossGamColor() : "");
                            
                            // 채널에 있는 유저들 (null 체크)
                            List<Map<String, Object>> users = new java.util.ArrayList<>();
                            if (channel.getChannelUsers() != null) {
                                try {
                                    users = channel.getChannelUsers().stream()
                                        .filter(cu -> cu != null && cu.getUser() != null)
                                        .map(cu -> {
                                            Map<String, Object> userData = new HashMap<>();
                                            userData.put("userId", cu.getUser().getId());
                                            userData.put("username", cu.getUser().getUsername() != null ? cu.getUser().getUsername() : "");
                                            // displayName과 avatarUrl 추가
                                            userData.put("displayName", cu.getUser().getDisplayName() != null ? cu.getUser().getDisplayName() : "");
                                            userData.put("avatarUrl", cu.getUser().getAvatarUrl() != null ? cu.getUser().getAvatarUrl() : "");
                                            userData.put("guildName", cu.getGuildName() != null ? cu.getGuildName() : "");
                                            userData.put("memberCount", cu.getMemberCount() != null ? cu.getMemberCount() : 0);
                                            userData.put("isMoving", cu.getIsMoving() != null ? cu.getIsMoving() : false);
                                            return userData;
                                        })
                                        .collect(Collectors.toList());
                                } catch (Exception e) {
                                    // 채널 유저 조회 실패 시 빈 리스트 유지
                                }
                            }
                            
                            channelData.put("users", users);
                            return channelData;
                        })
                        .collect(Collectors.toList());
                } catch (Exception e) {
                    // 채널 목록 조회 실패 시 빈 리스트 유지
                }
            }
            
            response.put("channels", channels);
            
            // 현재 접속한 사용자 목록 (WebSocket 연결 추적)
            try {
                List<Map<String, Object>> connectedUsers = webSocketConnectionService.getConnectedUsers(roomId);
                response.put("connectedUsers", connectedUsers);
            } catch (Exception e) {
                logger.warn("접속 사용자 목록 조회 실패: roomId={}", roomId, e);
                response.put("connectedUsers", new java.util.ArrayList<>());
            }
            
            // 참가자 목록 (null 체크)
            List<Map<String, Object>> participants = new java.util.ArrayList<>();
            if (room.getParticipations() != null) {
                try {
                    participants = room.getParticipations().stream()
                        .filter(p -> p != null && p.getUser() != null)
                        .map(p -> {
                            Map<String, Object> participantData = new HashMap<>();
                            participantData.put("userId", p.getUser().getId());
                            participantData.put("username", p.getUser().getUsername() != null ? p.getUser().getUsername() : "");
                            participantData.put("displayName", p.getUser().getDisplayName() != null ? p.getUser().getDisplayName() : "");
                            participantData.put("avatarUrl", p.getUser().getAvatarUrl() != null ? p.getUser().getAvatarUrl() : "");
                            return participantData;
                        })
                        .collect(Collectors.toList());
                } catch (Exception e) {
                    // 참가자 목록 조회 실패 시 빈 리스트 유지
                }
            }
            
            response.put("participants", participants);
            
            return response;
        } catch (Exception e) {
            logger.error("레이드 방 조회 중 예외 발생: roomId={}, loadChannelsAndUsers={}", roomId, loadChannelsAndUsers, e);
            return null;
        }
    }
    
    /**
     * 채널 생성
     * 캐시 무효화는 트랜잭션 커밋 후 RealtimeBossService에서 처리
     */
    @Transactional
    public Map<String, Object> createChannel(Long roomId, Integer channelNumber) {
        Optional<RaidRoom> roomOpt = raidRoomRepository.findById(roomId);
        
        if (roomOpt.isEmpty()) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", "레이드 방을 찾을 수 없습니다");
            return error;
        }
        
        RaidRoom room = roomOpt.get();
        
        // 중복 채널 번호 체크
        Optional<Channel> existingChannel = channelRepository.findByRaidRoomIdAndChannelNumber(roomId, channelNumber);
        if (existingChannel.isPresent()) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", "채널 " + channelNumber + "은(는) 이미 존재합니다.");
            return error;
        }
        
        Channel channel = new Channel();
        channel.setRaidRoom(room);
        channel.setChannelNumber(channelNumber);
        channel.setIsDefeated(false);
        
        channel = channelRepository.save(channel);
        
        // 실시간 브로드캐스트
        realtimeBossService.broadcastRaidRoomUpdate(roomId);
        realtimeBossService.broadcastBossListUpdate(); // 채널 수 변경 반영
        
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("channelId", channel.getId());
        return response;
    }
    
    /**
     * 채널 일괄 생성
     * 캐시 무효화는 트랜잭션 커밋 후 RealtimeBossService에서 처리
     */
    @Transactional
    public Map<String, Object> createChannelsBatch(Long roomId, List<Integer> channelNumbers) {
        Optional<RaidRoom> roomOpt = raidRoomRepository.findById(roomId);
        
        if (roomOpt.isEmpty()) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", "레이드 방을 찾을 수 없습니다");
            return error;
        }
        
        RaidRoom room = roomOpt.get();
        
        // 기존 채널 번호 조회
        List<Channel> existingChannels = channelRepository.findByRaidRoomId(roomId);
        Set<Integer> existingChannelNumbers = existingChannels.stream()
            .map(Channel::getChannelNumber)
            .collect(java.util.stream.Collectors.toSet());
        
        List<Integer> created = new ArrayList<>();
        List<Integer> failed = new ArrayList<>();
        
        for (Integer channelNumber : channelNumbers) {
            // 중복 체크
            if (existingChannelNumbers.contains(channelNumber)) {
                failed.add(channelNumber);
                continue;
            }
            
            try {
                Channel channel = new Channel();
                channel.setRaidRoom(room);
                channel.setChannelNumber(channelNumber);
                channel.setIsDefeated(false);
                
                channelRepository.save(channel);
                created.add(channelNumber);
                existingChannelNumbers.add(channelNumber); // 중복 방지를 위해 추가
            } catch (Exception e) {
                logger.warn("채널 생성 실패: roomId={}, channelNumber={}, error={}", roomId, channelNumber, e.getMessage());
                failed.add(channelNumber);
            }
        }
        
        // 실시간 브로드캐스트
        if (!created.isEmpty()) {
            realtimeBossService.broadcastRaidRoomUpdate(roomId);
            realtimeBossService.broadcastBossListUpdate(); // 채널 수 변경 반영
        }
        
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("created", created);
        response.put("failed", failed);
        response.put("createdCount", created.size());
        response.put("failedCount", failed.size());
        return response;
    }
    
    /**
     * 채널 삭제
     * 캐시 무효화는 트랜잭션 커밋 후 RealtimeBossService에서 처리
     */
    @Transactional
    public Map<String, Object> deleteChannel(Long roomId, Long channelId) {
        Optional<Channel> channelOpt = channelRepository.findById(channelId);
        
        if (channelOpt.isEmpty()) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", "채널을 찾을 수 없습니다");
            return error;
        }
        
        Channel channel = channelOpt.get();
        
        // 방 ID 확인
        if (!channel.getRaidRoom().getId().equals(roomId)) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", "잘못된 레이드 방입니다");
            return error;
        }
        
        // 채널 삭제 (Cascade로 ChannelUser도 자동 삭제됨)
        channelRepository.delete(channel);
        
        // 실시간 브로드캐스트
        realtimeBossService.broadcastRaidRoomUpdate(roomId);
        realtimeBossService.broadcastBossListUpdate(); // 채널 수 변경 반영
        
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "채널이 삭제되었습니다");
        return response;
    }
    
    /**
     * 채널 메모 업데이트
     * 캐시 무효화는 트랜잭션 커밋 후 RealtimeBossService에서 처리
     */
    @Transactional
    public Map<String, Object> updateChannelMemo(Long roomId, Long channelId, String memo) {
        try {
            // raidRoom을 함께 로드하여 lazy loading 문제 방지
            Optional<Channel> channelOpt = channelRepository.findByIdWithRaidRoom(channelId);
            if (channelOpt.isEmpty()) {
                // fallback to regular findById
                channelOpt = channelRepository.findById(channelId);
            }
            
            if (channelOpt.isEmpty()) {
                Map<String, Object> error = new HashMap<>();
                error.put("error", "채널을 찾을 수 없습니다");
                return error;
            }
            
            Channel channel = channelOpt.get();
            
            // 방 ID 확인 (null 체크)
            if (channel.getRaidRoom() == null || !channel.getRaidRoom().getId().equals(roomId)) {
                Map<String, Object> error = new HashMap<>();
                error.put("error", "잘못된 레이드 방입니다");
                return error;
            }
            
            channel.setMemo(memo);
            channelRepository.save(channel);
            
            // 실시간 브로드캐스트
            realtimeBossService.broadcastRaidRoomUpdate(roomId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            return response;
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", "메모 업데이트 중 오류가 발생했습니다: " + e.getMessage());
            return error;
        }
    }
    
    /**
     * 보스 잡혔다 표시 (토글)
     * 동시성 제어: 낙관적 잠금으로 동시 업데이트 방지
     * 캐시 무효화는 트랜잭션 커밋 후 RealtimeBossService에서 처리
     */
    @Transactional
    public Map<String, Object> markDefeated(Long roomId, Long channelId) {
        try {
            // raidRoom을 함께 로드하여 lazy loading 문제 방지
            Optional<Channel> channelOpt = channelRepository.findByIdWithRaidRoom(channelId);
            if (channelOpt.isEmpty()) {
                // fallback to regular findById
                channelOpt = channelRepository.findById(channelId);
            }
            
            if (channelOpt.isEmpty()) {
                Map<String, Object> error = new HashMap<>();
                error.put("error", "채널을 찾을 수 없습니다");
                return error;
            }
            
            Channel channel = channelOpt.get();
            
            // 방 ID 확인 (null 체크)
            if (channel.getRaidRoom() == null || !channel.getRaidRoom().getId().equals(roomId)) {
                Map<String, Object> error = new HashMap<>();
                error.put("error", "잘못된 레이드 방입니다");
                return error;
            }
            
            // 현재 상태를 토글
            Boolean currentStatus = channel.getIsDefeated() != null ? channel.getIsDefeated() : false;
            channel.setIsDefeated(!currentStatus);
            channelRepository.save(channel);
            
            // 실시간 브로드캐스트 (트랜잭션 커밋 후 실행)
            realtimeBossService.broadcastRaidRoomUpdate(roomId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            return response;
        } catch (Exception e) {
            // 예외 처리
            Map<String, Object> error = new HashMap<>();
            error.put("error", "상태 변경 중 오류가 발생했습니다: " + e.getMessage());
            return error;
        }
    }
    
    /**
     * 레이드 방 완료 처리
     * 캐시 무효화 및 브로드캐스트는 트랜잭션 커밋 후 처리
     */
    @Transactional
    public Map<String, Object> completeRaidRoom(Long roomId) {
        Optional<RaidRoom> roomOpt = raidRoomRepository.findById(roomId);
        
        if (roomOpt.isEmpty()) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", "레이드 방을 찾을 수 없습니다");
            return error;
        }
        
        RaidRoom room = roomOpt.get();
        
        if (room.getIsCompleted() != null && room.getIsCompleted()) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", "이미 완료된 레이드입니다");
            return error;
        }
        
        room.setIsCompleted(true);
        room.setCompletedAt(java.time.LocalDateTime.now());
        raidRoomRepository.save(room);
        
        // 참가 기록은 WebSocket 접속 시점에 이미 생성되므로, 완료 시점에는 추가 작업 불필요
        // (한 번이라도 접속했던 모든 사용자의 참가 기록이 이미 저장되어 있음)
        
        // 트랜잭션 커밋 후 캐시 무효화 및 브로드캐스트
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()) {
            org.springframework.transaction.support.TransactionSynchronizationManager
                .registerSynchronization(new org.springframework.transaction.support.TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        // 캐시 무효화
                        evictAllCaches();
                        // 보스 목록 브로드캐스트 (완료된 방은 목록에서 제외됨)
                        realtimeBossService.broadcastBossListUpdate();
                        // 레이드 방 업데이트 브로드캐스트 (완료 상태 반영)
                        realtimeBossService.broadcastRaidRoomUpdate(roomId);
                    }
                });
        } else {
            // 트랜잭션 외부에서 호출된 경우 즉시 실행
            evictAllCaches();
            realtimeBossService.broadcastBossListUpdate();
            realtimeBossService.broadcastRaidRoomUpdate(roomId);
        }
        
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "레이드가 완료되었습니다");
        return response;
    }
    
    /**
     * 레이드 방 삭제
     * 캐시 무효화 및 브로드캐스트는 트랜잭션 커밋 후 처리
     */
    @Transactional
    public Map<String, Object> deleteRaidRoom(Long roomId) {
        Optional<RaidRoom> roomOpt = raidRoomRepository.findById(roomId);
        
        if (roomOpt.isEmpty()) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", "레이드 방을 찾을 수 없습니다");
            return error;
        }
        
        RaidRoom room = roomOpt.get();
        
        // 연관된 채널과 참가자들은 cascade로 자동 삭제됨
        raidRoomRepository.delete(room);
        
        // 트랜잭션 커밋 후 캐시 무효화 및 브로드캐스트
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()) {
            org.springframework.transaction.support.TransactionSynchronizationManager
                .registerSynchronization(new org.springframework.transaction.support.TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        // 캐시 무효화
                        evictAllCaches();
                        // 보스 목록 브로드캐스트
                        realtimeBossService.broadcastBossListUpdate();
                    }
                });
        } else {
            // 트랜잭션 외부에서 호출된 경우 즉시 실행
            evictAllCaches();
            realtimeBossService.broadcastBossListUpdate();
        }
        
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "레이드 방이 삭제되었습니다");
        return response;
    }
    
    /**
     * 모든 관련 캐시 무효화
     */
    private void evictAllCaches() {
        try {
            if (cacheManager != null) {
                var raidRoomCache = cacheManager.getCache("raidRoom");
                if (raidRoomCache != null) {
                    raidRoomCache.clear();
                }
                var todayBossesCache = cacheManager.getCache("todayBosses");
                if (todayBossesCache != null) {
                    todayBossesCache.clear();
                }
            }
        } catch (Exception e) {
            logger.warn("캐시 무효화 실패", e);
        }
    }
    
    /**
     * 채널 보스 색상 업데이트 (용의 경우)
     * 캐시 무효화는 트랜잭션 커밋 후 RealtimeBossService에서 처리
     */
    @Transactional
    public Map<String, Object> updateChannelBossColor(Long roomId, Long channelId, String bossType, String bossColor) {
        Optional<Channel> channelOpt = channelRepository.findById(channelId);
        
        if (channelOpt.isEmpty()) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", "채널을 찾을 수 없습니다");
            return error;
        }
        
        Channel channel = channelOpt.get();
        
        // 방 ID 확인
        if (!channel.getRaidRoom().getId().equals(roomId)) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", "잘못된 레이드 방입니다");
            return error;
        }
        
        // 보스 타입에 따라 해당 필드 업데이트
        // 빈 문자열이나 null이면 색상 제거 (회색 선택 시)
        String colorToSet = (bossColor == null || bossColor.trim().isEmpty()) ? null : bossColor;
        
        // 회색(gray) 색상은 null로 처리 (색상 제거)
        if ("gray".equals(bossColor)) {
            colorToSet = null;
        }
        
        // 색상 검증 (회색은 null로 처리되므로 제외)
        if (colorToSet != null && !colorToSet.equals("green") && !colorToSet.equals("yellow") 
            && !colorToSet.equals("orange") && !colorToSet.equals("red")) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", "지원하지 않는 색상입니다");
            return error;
        }
        
        switch (bossType) {
            case "흑":
                channel.setBossHeukColor(colorToSet);
                break;
            case "진":
                channel.setBossJinColor(colorToSet);
                break;
            case "묵":
                channel.setBossMukColor(colorToSet);
                break;
            case "감":
                channel.setBossGamColor(colorToSet);
                break;
            default:
                Map<String, Object> error = new HashMap<>();
                error.put("error", "잘못된 보스 타입입니다");
                return error;
        }
        
        channelRepository.save(channel);
        
        // 실시간 브로드캐스트
        realtimeBossService.broadcastRaidRoomUpdate(roomId);
        
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        return response;
    }
    
    /**
     * 채널 선택/해제 (이동중 표시)
     * 동시성 제어: 낙관적 잠금으로 동시 업데이트 방지
     * 캐시 무효화는 트랜잭션 커밋 후 RealtimeBossService에서 처리
     */
    @Transactional
    public Map<String, Object> toggleChannelSelection(Long roomId, Long channelId, Long userId) {
        try {
            Optional<Channel> channelOpt = channelRepository.findById(channelId);
            
            if (channelOpt.isEmpty()) {
                Map<String, Object> error = new HashMap<>();
                error.put("error", "채널을 찾을 수 없습니다");
                return error;
            }
            
            Channel channel = channelOpt.get();
            
            // 방 ID 확인
            if (!channel.getRaidRoom().getId().equals(roomId)) {
                Map<String, Object> error = new HashMap<>();
                error.put("error", "잘못된 레이드 방입니다");
                return error;
            }
            
            // 사용자 확인
            Optional<User> userOpt = userRepository.findById(userId);
            if (userOpt.isEmpty()) {
                Map<String, Object> error = new HashMap<>();
                error.put("error", "사용자를 찾을 수 없습니다");
                return error;
            }
            
            User user = userOpt.get();
            
            // 기존 선택 확인
            Optional<ChannelUser> existingOpt = channelUserRepository.findByChannelIdAndUserId(channelId, userId);
            
            if (existingOpt.isPresent()) {
                // 이미 선택되어 있으면 해제 (다른 채널에서도 제거)
                List<ChannelUser> userChannels = channelUserRepository.findByUserIdAndRoomId(userId, roomId);
                channelUserRepository.deleteAll(userChannels);
            } else {
                // 다른 채널에서 제거
                List<ChannelUser> userChannels = channelUserRepository.findByUserIdAndRoomId(userId, roomId);
                channelUserRepository.deleteAll(userChannels);
                
                // 새로 선택
                ChannelUser channelUser = new ChannelUser();
                channelUser.setChannel(channel);
                channelUser.setUser(user);
                channelUser.setIsMoving(true);
                channelUserRepository.save(channelUser);
            }
            
            // 전체 데이터 브로드캐스트 (이동중 표시가 다른 사용자에게도 즉시 반영되도록)
            realtimeBossService.broadcastRaidRoomUpdate(roomId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            return response;
        } catch (Exception e) {
            // 예외 처리
            Map<String, Object> error = new HashMap<>();
            error.put("error", "채널 선택 중 오류가 발생했습니다: " + e.getMessage());
            return error;
        }
    }
    
    /**
     * 사용자의 이동중 상태 제거 (레이드 방 나갈 때)
     */
    @Transactional
    public Map<String, Object> clearUserMovingStatus(Long roomId, Long userId) {
        try {
            // 해당 레이드 방의 모든 채널에서 사용자의 이동중 상태 제거
            List<ChannelUser> userChannels = channelUserRepository.findByUserIdAndRoomId(userId, roomId);
            if (!userChannels.isEmpty()) {
                channelUserRepository.deleteAll(userChannels);
                logger.info("사용자 이동중 상태 제거: userId={}, roomId={}, removedCount={}", userId, roomId, userChannels.size());
                
                // 실시간 브로드캐스트
                realtimeBossService.broadcastRaidRoomUpdate(roomId);
            }
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            return response;
        } catch (Exception e) {
            logger.error("사용자 이동중 상태 제거 중 오류: userId={}, roomId={}", userId, roomId, e);
            Map<String, Object> error = new HashMap<>();
            error.put("error", "이동중 상태 제거 중 오류가 발생했습니다: " + e.getMessage());
            return error;
        }
    }
    
    /**
     * 완료된 레이드 방 목록 조회
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getCompletedRooms() {
        try {
            List<RaidRoom> completedRooms = raidRoomRepository.findCompletedRooms();
            
            List<Map<String, Object>> rooms = completedRooms.stream()
                .filter(room -> room.getBoss() != null)
                .map(room -> {
                    Map<String, Object> roomData = new HashMap<>();
                    roomData.put("id", room.getId());
                    roomData.put("bossName", room.getBoss().getName());
                    roomData.put("bossType", room.getBoss().getType() != null ? room.getBoss().getType().name() : "UNKNOWN");
                    roomData.put("raidDate", room.getRaidDate() != null ? room.getRaidDate().toString() : "");
                    roomData.put("raidTime", room.getRaidTime() != null ? room.getRaidTime().toString() : "");
                    roomData.put("completedAt", room.getCompletedAt() != null ? room.getCompletedAt().toString() : "");
                    roomData.put("channelCount", room.getChannels() != null ? room.getChannels().size() : 0);
                    return roomData;
                })
                .collect(Collectors.toList());
            
            Map<String, Object> response = new HashMap<>();
            response.put("rooms", rooms);
            return response;
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("rooms", new java.util.ArrayList<>());
            return response;
        }
    }
    
    /**
     * 레이드 참석/참석 취소 토글
     */
    @Transactional
    public Map<String, Object> toggleParticipation(Long roomId, Long userId) {
        try {
            // 레이드 방 확인
            Optional<RaidRoom> roomOpt = raidRoomRepository.findById(roomId);
            if (roomOpt.isEmpty()) {
                Map<String, Object> error = new HashMap<>();
                error.put("error", "레이드 방을 찾을 수 없습니다");
                return error;
            }
            
            RaidRoom room = roomOpt.get();
            
            // 완료된 레이드는 참석 불가
            if (room.getIsCompleted() != null && room.getIsCompleted()) {
                Map<String, Object> error = new HashMap<>();
                error.put("error", "완료된 레이드는 참석할 수 없습니다");
                return error;
            }
            
            // 사용자 확인
            Optional<User> userOpt = userRepository.findById(userId);
            if (userOpt.isEmpty()) {
                Map<String, Object> error = new HashMap<>();
                error.put("error", "사용자를 찾을 수 없습니다");
                return error;
            }
            
            // 기존 참가 기록 확인
            Optional<RaidParticipation> existingParticipation = 
                raidParticipationRepository.findByUserIdAndRaidRoomId(userId, roomId);
            
            boolean isParticipating;
            if (existingParticipation.isPresent()) {
                // 참석 취소
                raidParticipationRepository.delete(existingParticipation.get());
                isParticipating = false;
                logger.info("레이드 참석 취소: userId={}, roomId={}", userId, roomId);
            } else {
                // 참석 등록
                RaidParticipation participation = new RaidParticipation();
                participation.setUser(userOpt.get());
                participation.setRaidRoom(room);
                raidParticipationRepository.save(participation);
                isParticipating = true;
                logger.info("레이드 참석 등록: userId={}, roomId={}", userId, roomId);
            }
            
            // 실시간 브로드캐스트 (참석 명단 업데이트)
            realtimeBossService.broadcastRaidRoomUpdate(roomId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("isParticipating", isParticipating);
            return response;
        } catch (Exception e) {
            logger.error("레이드 참석 토글 중 오류: userId={}, roomId={}", userId, roomId, e);
            Map<String, Object> error = new HashMap<>();
            error.put("error", "참석 처리 중 오류가 발생했습니다: " + e.getMessage());
            return error;
        }
    }
}

