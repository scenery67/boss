package com.example.service;

import com.example.entity.Channel;
import com.example.entity.ChannelUser;
import com.example.entity.RaidRoom;
import com.example.entity.User;
import com.example.repository.ChannelRepository;
import com.example.repository.ChannelUserRepository;
import com.example.repository.RaidRoomRepository;
import com.example.repository.UserRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class RaidRoomService {
    
    @Autowired
    private RaidRoomRepository raidRoomRepository;
    
    @Autowired
    private ChannelRepository channelRepository;
    
    @Autowired
    private ChannelUserRepository channelUserRepository;
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private RealtimeBossService realtimeBossService;
    
    /**
     * 레이드 방 상세 정보 조회
     * 캐시: 10초간 유지 (실시간 업데이트 필요하므로 짧게)
     */
    @Transactional(readOnly = true)
    @Cacheable(value = "raidRoom", key = "#roomId", unless = "#result == null")
    public Map<String, Object> getRaidRoom(Long roomId) {
        try {
            Optional<RaidRoom> roomOpt;
            try {
                roomOpt = raidRoomRepository.findById(roomId);
            } catch (Exception e) {
                return null;
            }
            
            if (roomOpt.isEmpty()) {
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
            
            // 채널 목록 (null 체크)
            List<Map<String, Object>> channels = new java.util.ArrayList<>();
            if (room.getChannels() != null) {
                try {
                    channels = room.getChannels().stream()
                        .filter(channel -> channel != null)
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
            return null;
        }
    }
    
    /**
     * 채널 생성
     * 채널 생성 시 해당 방 캐시 무효화
     */
    @CacheEvict(value = "raidRoom", key = "#roomId")
    public Map<String, Object> createChannel(Long roomId, Integer channelNumber) {
        Optional<RaidRoom> roomOpt = raidRoomRepository.findById(roomId);
        
        if (roomOpt.isEmpty()) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", "레이드 방을 찾을 수 없습니다");
            return error;
        }
        
        RaidRoom room = roomOpt.get();
        
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
     * 채널 삭제
     */
    @CacheEvict(value = "raidRoom", key = "#roomId")
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
     */
    @CacheEvict(value = "raidRoom", key = "#roomId")
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
     * 상태 변경 시 해당 방 캐시 무효화
     * 동시성 제어: 낙관적 잠금으로 동시 업데이트 방지
     */
    @CacheEvict(value = "raidRoom", key = "#roomId")
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
     */
    @CacheEvict(value = {"raidRoom", "todayBosses"}, allEntries = true)
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
        
        // Entity Listener가 PostUpdate 이벤트로 브로드캐스트 처리
        
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "레이드가 완료되었습니다");
        return response;
    }
    
    /**
     * 레이드 방 삭제
     */
    @CacheEvict(value = {"raidRoom", "todayBosses"}, allEntries = true)
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
        
        // Entity Listener가 PostRemove 이벤트로 브로드캐스트 처리
        
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "레이드 방이 삭제되었습니다");
        return response;
    }
    
    /**
     * 채널 보스 색상 업데이트 (용의 경우)
     */
    @CacheEvict(value = "raidRoom", key = "#roomId")
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
        switch (bossType) {
            case "흑":
                channel.setBossHeukColor(bossColor);
                break;
            case "진":
                channel.setBossJinColor(bossColor);
                break;
            case "묵":
                channel.setBossMukColor(bossColor);
                break;
            case "감":
                channel.setBossGamColor(bossColor);
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
     */
    @CacheEvict(value = "raidRoom", key = "#roomId")
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
            
            boolean isSelecting;
            if (existingOpt.isPresent()) {
                // 이미 선택되어 있으면 해제 (다른 채널에서도 제거)
                List<ChannelUser> userChannels = channelUserRepository.findByUserIdAndRoomId(userId, roomId);
                channelUserRepository.deleteAll(userChannels);
                isSelecting = false;
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
                isSelecting = true;
            }
            
            // 최적화: 증분 업데이트만 브로드캐스트 (전체 데이터 조회 없이)
            final boolean finalIsSelecting = isSelecting;
            if (org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()) {
                org.springframework.transaction.support.TransactionSynchronizationManager
                    .registerSynchronization(new org.springframework.transaction.support.TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            realtimeBossService.broadcastChannelSelectionUpdate(roomId, userId, channelId, finalIsSelecting);
                        }
                    });
            } else {
                realtimeBossService.broadcastChannelSelectionUpdate(roomId, userId, channelId, finalIsSelecting);
            }
            
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
}

