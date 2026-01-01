package com.example.config;

import com.example.entity.Boss;
import com.example.entity.BossType;
import com.example.entity.RaidRoom;
import com.example.repository.BossRepository;
import com.example.repository.RaidRoomRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

/**
 * 애플리케이션 시작 시 수화룡 레이드 방을 자동으로 생성하는 초기화 컴포넌트
 */
@Component
public class WaterFireDragonInitializer implements ApplicationRunner {
    
    private static final Logger logger = LoggerFactory.getLogger(WaterFireDragonInitializer.class);
    
    @Autowired
    private BossRepository bossRepository;
    
    @Autowired
    private RaidRoomRepository raidRoomRepository;
    
    @PersistenceContext
    private EntityManager entityManager;
    
    @Override
    @Transactional
    public void run(ApplicationArguments args) throws Exception {
        try {
            // 데이터베이스 CHECK 제약 조건 수정 (DRAGON_WATER_FIRE 타입 허용)
            updateBossTypeConstraint();
            
            // 수화룡 보스 찾기 또는 생성
            Boss waterFireBoss = findOrCreateWaterFireBoss();
            
            // 수화룡 레이드 방이 이미 있는지 확인
            List<RaidRoom> existingRooms = raidRoomRepository.findActiveByBossType(BossType.DRAGON_WATER_FIRE);
            
            if (existingRooms.isEmpty()) {
                // 수화룡 레이드 방이 없으면 생성
                RaidRoom room = new RaidRoom();
                room.setBoss(waterFireBoss);
                room.setRaidDate(LocalDate.now()); // 오늘 날짜로 설정
                room.setRaidTime(null); // 시간은 없음
                room.setIsCompleted(false);
                
                room = raidRoomRepository.save(room);
                logger.info("수화룡 레이드 방이 자동으로 생성되었습니다. roomId={}", room.getId());
            } else {
                logger.info("수화룡 레이드 방이 이미 존재합니다. roomId={}", existingRooms.get(0).getId());
            }
        } catch (Exception e) {
            logger.error("수화룡 레이드 방 초기화 중 오류가 발생했습니다.", e);
            // 초기화 실패해도 애플리케이션은 계속 실행되도록 함
        }
    }
    
    private void updateBossTypeConstraint() {
        try {
            // 기존 CHECK 제약 조건 삭제 시도
            try {
                entityManager.createNativeQuery(
                    "ALTER TABLE bosses DROP CONSTRAINT IF EXISTS bosses_type_check"
                ).executeUpdate();
                logger.info("기존 bosses_type_check 제약 조건 삭제 완료");
            } catch (Exception e) {
                logger.debug("기존 제약 조건 삭제 실패 (이미 없거나 다른 이름일 수 있음): {}", e.getMessage());
            }
            
            // 새로운 CHECK 제약 조건 추가 (DRAGON_WATER_FIRE 포함)
            try {
                entityManager.createNativeQuery(
                    "ALTER TABLE bosses ADD CONSTRAINT bosses_type_check " +
                    "CHECK (type IN ('SKELETON_KING', 'DRAGON', 'DRAGON_WATER_FIRE'))"
                ).executeUpdate();
                logger.info("새로운 bosses_type_check 제약 조건 추가 완료 (DRAGON_WATER_FIRE 포함)");
            } catch (Exception e) {
                logger.debug("제약 조건 추가 실패 (이미 존재할 수 있음): {}", e.getMessage());
            }
        } catch (Exception e) {
            logger.warn("제약 조건 업데이트 중 오류 발생 (계속 진행): {}", e.getMessage());
            // 제약 조건 업데이트 실패해도 계속 진행
        }
    }
    
    private Boss findOrCreateWaterFireBoss() {
        List<Boss> bosses = bossRepository.findByType(BossType.DRAGON_WATER_FIRE);
        
        if (bosses.isEmpty()) {
            // 보스가 없으면 생성
            Boss newBoss = new Boss();
            newBoss.setType(BossType.DRAGON_WATER_FIRE);
            newBoss.setName("수화룡");
            newBoss.setDescription("수룡과 화룡이 함께 젠되는 레이드");
            return bossRepository.save(newBoss);
        } else {
            return bosses.get(0);
        }
    }
}

