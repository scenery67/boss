package com.example.repository;

import com.example.entity.RaidRoom;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface RaidRoomRepository extends JpaRepository<RaidRoom, Long> {
    List<RaidRoom> findByRaidDate(LocalDate date);
    
    // 오늘 이후의 모든 레이드 방 조회
    @Query("SELECT r FROM RaidRoom r WHERE r.raidDate >= :date ORDER BY r.raidDate ASC, r.raidTime ASC")
    List<RaidRoom> findByRaidDateGreaterThanEqual(@Param("date") LocalDate date);
    
    @Query("SELECT r FROM RaidRoom r WHERE r.raidDate = :date AND r.boss.id = :bossId")
    Optional<RaidRoom> findByRaidDateAndBossId(@Param("date") LocalDate date, @Param("bossId") Long bossId);
    
    // 완료되지 않은 방 조회
    @Query("SELECT r FROM RaidRoom r WHERE r.raidDate = :date AND r.boss.id = :bossId AND (r.isCompleted = false OR r.isCompleted IS NULL)")
    List<RaidRoom> findActiveByRaidDateAndBossId(@Param("date") LocalDate date, @Param("bossId") Long bossId);
    
    // 완료된 방 조회
    @Query("SELECT r FROM RaidRoom r WHERE r.isCompleted = true ORDER BY r.completedAt DESC")
    List<RaidRoom> findCompletedRooms();
    
    // 채널만 함께 로드 (MultipleBagFetchException 방지를 위해 channelUsers는 별도 조회)
    // Hibernate는 여러 @OneToMany 컬렉션을 동시에 JOIN FETCH할 수 없음
    @Query("SELECT DISTINCT r FROM RaidRoom r " +
           "LEFT JOIN FETCH r.channels c " +
           "WHERE r.id = :roomId")
    Optional<RaidRoom> findByIdWithChannels(@Param("roomId") Long roomId);
    
    // 수화룡 레이드 방 찾기 (날짜 무관, 완료되지 않은 것만)
    @Query("SELECT r FROM RaidRoom r " +
           "WHERE r.boss.type = :bossType " +
           "AND (r.isCompleted = false OR r.isCompleted IS NULL) " +
           "ORDER BY r.createdAt ASC")
    List<RaidRoom> findActiveByBossType(@Param("bossType") com.example.entity.BossType bossType);
}

