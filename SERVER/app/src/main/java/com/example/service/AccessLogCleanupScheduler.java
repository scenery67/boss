package com.example.service;

import com.example.repository.UserAccessLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 접속 로그 정리 스케줄러
 * 3개월 이상 된 접속 로그를 자동으로 삭제
 */
@Component
public class AccessLogCleanupScheduler {
    
    private static final Logger logger = LoggerFactory.getLogger(AccessLogCleanupScheduler.class);
    
    @Autowired
    private UserAccessLogRepository userAccessLogRepository;
    
    /**
     * 매일 새벽 3시에 실행하여 3개월 이상 된 로그 삭제
     * cron 표현식: 초 분 시 일 월 요일
     * 0 0 3 * * ? = 매일 03:00:00
     */
    @Scheduled(cron = "0 0 3 * * ?")
    @Transactional
    public void cleanupOldLogs() {
        try {
            // 3개월 전 날짜 계산
            LocalDateTime cutoffDate = LocalDateTime.now().minusMonths(3);
            
            // 삭제될 레코드 수 확인
            long countToDelete = userAccessLogRepository.countOldLogs(cutoffDate);
            
            if (countToDelete > 0) {
                // 오래된 로그 삭제
                int deletedCount = userAccessLogRepository.deleteOldLogs(cutoffDate);
                logger.info("[접속 로그 정리] {}개의 오래된 로그 삭제 완료 (기준일: {})", deletedCount, cutoffDate);
            } else {
                logger.debug("[접속 로그 정리] 삭제할 로그가 없습니다 (기준일: {})", cutoffDate);
            }
        } catch (Exception e) {
            logger.error("[접속 로그 정리] 오래된 로그 삭제 중 오류 발생", e);
        }
    }
}

