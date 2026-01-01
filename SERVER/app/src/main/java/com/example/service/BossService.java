package com.example.service;

import com.example.entity.Boss;
import com.example.entity.BossType;
import com.example.entity.RaidRoom;
import com.example.repository.BossRepository;
import com.example.repository.RaidRoomRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class BossService {
    
    @Autowired
    private BossRepository bossRepository;
    
    @Autowired
    private RaidRoomRepository raidRoomRepository;
    
    @Autowired
    private RaidRoomService raidRoomService;
    
    @Autowired
    private RealtimeBossService realtimeBossService;
    
    @Autowired
    private CacheManager cacheManager;
    
    /**
     * 오늘 이후의 모든 보스 레이드 목록 조회
     * 이벤트 기반 캐싱: DB 변경 시에만 재조회, 그 외에는 캐시 사용
     */
    @Transactional(readOnly = true)
    @Cacheable(value = "todayBosses", key = "#root.method.name + '_' + T(java.time.LocalDate).now().toString()")
    public Map<String, Object> getTodayBosses() {
        try {
            LocalDate today = LocalDate.now();
            List<RaidRoom> upcomingRooms;
            
            try {
                // 오늘 이후의 모든 레이드 방 조회
                upcomingRooms = raidRoomRepository.findByRaidDateGreaterThanEqual(today);
            } catch (Exception e) {
                // 오류 발생 시 빈 리스트 반환
                upcomingRooms = new java.util.ArrayList<>();
            }
            
            // 방이 없으면 빈 리스트 반환
            if (upcomingRooms == null || upcomingRooms.isEmpty()) {
                Map<String, Object> response = new HashMap<>();
                response.put("bosses", new java.util.ArrayList<>());
                return response;
            }
            
            // 보스별로 그룹화 (null 체크 추가, 완료되지 않은 것만)
            Map<Boss, List<RaidRoom>> bossRooms = upcomingRooms.stream()
                .filter(room -> room.getBoss() != null)
                .filter(room -> room.getIsCompleted() == null || !room.getIsCompleted())
                .collect(Collectors.groupingBy(RaidRoom::getBoss));
            
            List<Map<String, Object>> bosses = bossRooms.entrySet().stream()
                .map(entry -> {
                    Boss boss = entry.getKey();
                    List<RaidRoom> rooms = entry.getValue();
                    
                    Map<String, Object> bossData = new HashMap<>();
                    bossData.put("id", boss.getId());
                    bossData.put("name", boss.getName());
                    bossData.put("type", boss.getType().name());
                    // 정렬을 위한 우선순위 (DRAGON이 항상 위에)
                    bossData.put("sortOrder", boss.getType() == BossType.DRAGON ? 0 : 1);
                    
                    List<Map<String, Object>> roomList = rooms.stream().map(room -> {
                        Map<String, Object> roomData = new HashMap<>();
                        roomData.put("id", room.getId());
                        roomData.put("channelCount", room.getChannels() != null ? room.getChannels().size() : 0);
                        
                        // raidTime 처리
                        LocalTime raidTime = room.getRaidTime();
                        String raidTimeStr = raidTime != null ? raidTime.toString() : "";
                        roomData.put("raidTime", raidTimeStr);
                        
                        // raidDate 추가
                        LocalDate raidDate = room.getRaidDate();
                        roomData.put("raidDate", raidDate != null ? raidDate.toString() : "");
                        
                        roomData.put("createdAt", room.getCreatedAt() != null ? room.getCreatedAt().toString() : null);
                        roomData.put("bossName", boss.getName());
                        roomData.put("bossType", boss.getType() != null ? boss.getType().name() : "UNKNOWN");
                        return roomData;
                    }).collect(Collectors.toList());
                    
                    bossData.put("rooms", roomList);
                    return bossData;
                })
                .sorted((b1, b2) -> {
                    // DRAGON을 항상 위에 (sortOrder 기준 정렬)
                    Integer order1 = (Integer) b1.get("sortOrder");
                    Integer order2 = (Integer) b2.get("sortOrder");
                    return order1.compareTo(order2);
                })
                .collect(Collectors.toList());
            
            Map<String, Object> response = new HashMap<>();
            response.put("bosses", bosses);
            return response;
        } catch (Exception e) {
            // 오류 발생 시 빈 리스트 반환
            Map<String, Object> response = new HashMap<>();
            response.put("bosses", new java.util.ArrayList<>());
            return response;
        }
    }
    
    /**
     * 보스 레이드 방 생성
     * 캐시 무효화 및 브로드캐스트는 트랜잭션 커밋 후 처리
     */
    @Transactional
    public Map<String, Object> createRaidRoom(String bossTypeStr, LocalDate raidDate, LocalTime raidTime) {
        try {
            // BossType enum 변환
            BossType bossType;
            try {
                bossType = BossType.valueOf(bossTypeStr.toUpperCase());
            } catch (IllegalArgumentException e) {
                Map<String, Object> error = new HashMap<>();
                error.put("error", "잘못된 보스 종류입니다. (DRAGON 또는 SKELETON_KING)");
                return error;
            }
            
            // 해당 타입의 보스 찾기 (없으면 자동 생성)
            List<Boss> bosses = bossRepository.findByType(bossType);
            final Boss boss;
            
            try {
                if (bosses.isEmpty()) {
                    // 보스가 없으면 자동 생성
                    Boss newBoss = new Boss();
                    newBoss.setType(bossType);
                    
                    // 보스 이름 설정
                    if (bossType == BossType.DRAGON) {
                        newBoss.setName("용");
                        newBoss.setDescription("강력한 용 보스");
                    } else if (bossType == BossType.SKELETON_KING) {
                        newBoss.setName("해골왕");
                        newBoss.setDescription("무시무시한 해골왕 보스");
                    } else if (bossType == BossType.DRAGON_WATER_FIRE) {
                        newBoss.setName("수화룡");
                        newBoss.setDescription("수룡과 화룡이 함께 젠되는 레이드");
                    }
                    
                    boss = bossRepository.save(newBoss);
                } else {
                    boss = bosses.get(0); // 첫 번째 보스 사용 (같은 타입의 보스가 여러 개일 경우)
                }
            } catch (Exception e) {
                Map<String, Object> error = new HashMap<>();
                error.put("error", "보스 생성/조회 중 오류가 발생했습니다: " + e.getMessage());
                return error;
            }
            
            // 수화룡 레이드는 날짜/시간과 관계없이 하나만 존재
            if (bossType == BossType.DRAGON_WATER_FIRE) {
                List<RaidRoom> existingWaterFireRooms = raidRoomRepository.findActiveByBossType(bossType);
                if (!existingWaterFireRooms.isEmpty()) {
                    // 기존 수화룡 레이드 방이 있으면 그 방 반환
                    RaidRoom existingRoom = existingWaterFireRooms.get(0);
                    Map<String, Object> response = new HashMap<>();
                    response.put("success", true);
                    response.put("roomId", existingRoom.getId());
                    response.put("bossId", boss.getId());
                    response.put("bossName", boss.getName());
                    response.put("bossType", boss.getType().name());
                    response.put("raidDate", existingRoom.getRaidDate() != null ? existingRoom.getRaidDate().toString() : "");
                    response.put("raidTime", existingRoom.getRaidTime() != null ? existingRoom.getRaidTime().toString() : null);
                    response.put("channelCount", existingRoom.getChannels() != null ? existingRoom.getChannels().size() : 0);
                    response.put("message", "기존 수화룡 레이드 방을 사용합니다");
                    return response;
                }
            } else {
                // 다른 보스 타입은 기존 로직 사용
                // 같은 날짜, 같은 시간, 같은 보스의 방이 이미 있는지 확인
                List<RaidRoom> existingRooms = raidRoomRepository.findByRaidDate(raidDate);
                Optional<RaidRoom> duplicateRoom = existingRooms.stream()
                    .filter(room -> room.getBoss() != null && room.getBoss().getId().equals(boss.getId()))
                    .filter(room -> {
                        // 시간이 둘 다 null이면 같은 것으로 간주
                        if (raidTime == null && room.getRaidTime() == null) {
                            return true;
                        }
                        // 둘 다 null이 아니면 시간 비교
                        if (raidTime != null && room.getRaidTime() != null) {
                            return room.getRaidTime().equals(raidTime);
                        }
                        // 하나만 null이면 다른 것으로 간주
                        return false;
                    })
                    .findFirst();
                
                if (duplicateRoom.isPresent()) {
                    Map<String, Object> error = new HashMap<>();
                    error.put("error", "해당 날짜와 시간에 이미 레이드 방이 생성되어 있습니다");
                    return error;
                }
                
                // 같은 종류의 레이드 방이 3개 이상인지 확인 (완료되지 않은 것만 카운트)
                List<RaidRoom> activeRooms = raidRoomRepository.findActiveByRaidDateAndBossId(raidDate, boss.getId());
                if (activeRooms.size() >= 3) {
                    Map<String, Object> error = new HashMap<>();
                    error.put("error", "같은 종류의 레이드는 최대 3개까지만 생성할 수 있습니다. 완료된 레이드를 정리해주세요.");
                    return error;
                }
            }
            
            // 새 레이드 방 생성
            try {
                RaidRoom room = new RaidRoom();
                room.setBoss(boss);
                room.setRaidDate(raidDate);
                room.setRaidTime(raidTime);
                
                room = raidRoomRepository.save(room);
                
                // 트랜잭션 커밋 후 캐시 무효화 및 브로드캐스트
                if (org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()) {
                    org.springframework.transaction.support.TransactionSynchronizationManager
                        .registerSynchronization(new org.springframework.transaction.support.TransactionSynchronization() {
                            @Override
                            public void afterCommit() {
                                // 캐시 무효화
                                evictTodayBossesCache();
                                // 보스 목록 브로드캐스트
                                realtimeBossService.broadcastBossListUpdate();
                            }
                        });
                } else {
                    // 트랜잭션 외부에서 호출된 경우 즉시 실행
                    evictTodayBossesCache();
                    realtimeBossService.broadcastBossListUpdate();
                }
                
                Map<String, Object> response = new HashMap<>();
                response.put("success", true);
                response.put("roomId", room.getId());
                response.put("bossId", boss.getId());
                response.put("bossName", boss.getName());
                response.put("bossType", boss.getType().name());
                response.put("raidDate", room.getRaidDate().toString());
                response.put("raidTime", room.getRaidTime() != null ? room.getRaidTime().toString() : null);
                response.put("channelCount", 0);
                
                return response;
            } catch (Exception e) {
                Map<String, Object> error = new HashMap<>();
                error.put("error", "레이드 방 생성 중 오류가 발생했습니다: " + e.getMessage());
                return error;
            }
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", "방 생성 중 예상치 못한 오류가 발생했습니다: " + e.getMessage());
            return error;
        }
    }
    
    /**
     * todayBosses 캐시 무효화
     */
    private void evictTodayBossesCache() {
        try {
            if (cacheManager != null) {
                var todayBossesCache = cacheManager.getCache("todayBosses");
                if (todayBossesCache != null) {
                    todayBossesCache.clear();
                }
            }
        } catch (Exception e) {
            // 캐시 무효화 실패는 무시
        }
    }
    
    /**
     * 완료된 레이드 방 목록 조회
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getCompletedRooms() {
        return raidRoomService.getCompletedRooms();
    }
}

