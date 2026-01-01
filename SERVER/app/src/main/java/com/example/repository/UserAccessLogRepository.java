package com.example.repository;

import com.example.entity.UserAccessLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;

@Repository
public interface UserAccessLogRepository extends JpaRepository<UserAccessLog, Long> {
    
    /**
     * 지정된 날짜 이전의 로그를 삭제
     */
    @Modifying
    @Query("DELETE FROM UserAccessLog log WHERE log.createdAt < :cutoffDate")
    int deleteOldLogs(@Param("cutoffDate") LocalDateTime cutoffDate);
    
    /**
     * 삭제될 레코드 수 조회 (확인용)
     */
    @Query("SELECT COUNT(log) FROM UserAccessLog log WHERE log.createdAt < :cutoffDate")
    long countOldLogs(@Param("cutoffDate") LocalDateTime cutoffDate);
}

