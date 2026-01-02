package com.example.service;

import com.example.entity.User;
import com.example.entity.UserAccessLog;
import com.example.repository.UserRepository;
import com.example.repository.UserAccessLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WebSocket 연결 추적 및 레이드 방별 접속 사용자 관리 서비스
 */
@Service
public class WebSocketConnectionService {
    
    private static final Logger logger = LoggerFactory.getLogger(WebSocketConnectionService.class);
    
    @Autowired
    private SimpMessagingTemplate messagingTemplate;
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private UserAccessLogRepository userAccessLogRepository;
    
    // 레이드 방별 접속 세션 목록 (roomId -> Set<sessionId>)
    private final Map<Long, Set<String>> roomSessions = new ConcurrentHashMap<>();
    
    // 세션별 사용자 정보 (sessionId -> userId)
    private final Map<String, Long> sessionUsers = new ConcurrentHashMap<>();
    
    // 세션별 레이드 방 정보 (sessionId -> roomId)
    private final Map<String, Long> sessionRooms = new ConcurrentHashMap<>();
    
    /**
     * 사용자가 레이드 방에 접속
     * 접속 시점에 참가 기록을 생성 (한 번이라도 접속했던 사용자 추적)
     */
    public void onUserConnect(String sessionId, Long userId, Long roomId) {
        try {
            // 기존 접속이 있으면 먼저 해제 (같은 세션이 다른 방에 접속한 경우)
            onUserDisconnect(sessionId);
            
            sessionUsers.put(sessionId, userId);
            sessionRooms.put(sessionId, roomId);
            
            // 세션 기반으로 접속 추적 (같은 userId라도 다른 세션이면 별도로 추적)
            roomSessions.computeIfAbsent(roomId, k -> ConcurrentHashMap.newKeySet()).add(sessionId);
            
            // 사용자 정보 조회하여 로그에 사용자 이름 포함
            String username = "알 수 없음";
            try {
                Optional<User> userOpt = userRepository.findById(userId);
                if (userOpt.isPresent()) {
                    User user = userOpt.get();
                    username = user.getDisplayName() != null && !user.getDisplayName().isEmpty() 
                        ? user.getDisplayName() 
                        : (user.getUsername() != null ? user.getUsername() : "알 수 없음");
                }
            } catch (Exception e) {
                logger.warn("사용자 정보 조회 실패: userId={}", userId, e);
            }
            
            logger.info("[수화룡 레이드] 사용자 접속 - 사용자: {} (userId={}), 방: roomId={}, 세션: sessionId={}", 
                username, userId, roomId, sessionId);
            
            // DB에 접속 로그 저장 (비동기)
            saveAccessLog(userId, roomId, UserAccessLog.AccessAction.CONNECT, sessionId);
            
            // 접속 사용자 목록 브로드캐스트
            broadcastConnectedUsers(roomId);
        } catch (Exception e) {
            logger.error("사용자 접속 처리 중 오류: sessionId={}, userId={}, roomId={}", sessionId, userId, roomId, e);
        }
    }
    
    /**
     * 사용자가 레이드 방에서 접속 해제
     */
    public void onUserDisconnect(String sessionId) {
        try {
            Long userId = sessionUsers.remove(sessionId);
            Long roomId = sessionRooms.remove(sessionId);
            
            if (roomId != null) {
                Set<String> sessions = roomSessions.get(roomId);
                if (sessions != null) {
                    sessions.remove(sessionId);
                    if (sessions.isEmpty()) {
                        roomSessions.remove(roomId);
                    }
                }
                
                // 사용자 정보 조회하여 로그에 사용자 이름 포함
                String username = "알 수 없음";
                if (userId != null) {
                    try {
                        Optional<User> userOpt = userRepository.findById(userId);
                        if (userOpt.isPresent()) {
                            User user = userOpt.get();
                            username = user.getDisplayName() != null && !user.getDisplayName().isEmpty() 
                                ? user.getDisplayName() 
                                : (user.getUsername() != null ? user.getUsername() : "알 수 없음");
                        }
                    } catch (Exception e) {
                        logger.warn("사용자 정보 조회 실패: userId={}", userId, e);
                    }
                }
                
                logger.info("[수화룡 레이드] 사용자 접속 해제 - 사용자: {} (userId={}), 방: roomId={}, 세션: sessionId={}", 
                    username, userId, roomId, sessionId);
                
                // 사용자가 레이드 방을 나갈 때 이동중 상태 제거
                if (userId != null) {
                    // DB에 해제 로그 저장 (비동기)
                    saveAccessLog(userId, roomId, UserAccessLog.AccessAction.DISCONNECT, sessionId);
                    // 이동중 상태 제거도 비동기로 처리 (DB 연결 문제 시 블로킹 방지)
                    clearUserMovingStatusAsync(roomId, userId);
                }
                
                // 접속 사용자 목록 브로드캐스트
                broadcastConnectedUsers(roomId);
            }
        } catch (Exception e) {
            logger.error("사용자 접속 해제 처리 중 오류: sessionId={}", sessionId, e);
        }
    }
    
    /**
     * 레이드 방의 접속 사용자 목록 조회
     * 세션 기반으로 추적하여 같은 userId라도 다른 세션이면 별도로 표시
     */
    public List<Map<String, Object>> getConnectedUsers(Long roomId) {
        Set<String> sessionIds = roomSessions.getOrDefault(roomId, Collections.emptySet());
        List<Map<String, Object>> users = new ArrayList<>();
        Set<Long> addedUserIds = new HashSet<>(); // 중복 제거용 (같은 userId는 한 번만 표시)
        
        for (String sessionId : sessionIds) {
            try {
                Long userId = sessionUsers.get(sessionId);
                if (userId != null && !addedUserIds.contains(userId)) {
                    Optional<User> userOpt = userRepository.findById(userId);
                    if (userOpt.isPresent()) {
                        User user = userOpt.get();
                        Map<String, Object> userData = new HashMap<>();
                        userData.put("userId", user.getId());
                        userData.put("username", user.getUsername() != null ? user.getUsername() : "");
                        userData.put("displayName", user.getDisplayName() != null ? user.getDisplayName() : "");
                        userData.put("avatarUrl", user.getAvatarUrl() != null ? user.getAvatarUrl() : "");
                        users.add(userData);
                        addedUserIds.add(userId);
                    }
                }
            } catch (Exception e) {
                logger.warn("사용자 정보 조회 실패: sessionId={}", sessionId, e);
            }
        }
        
        return users;
    }
    
    /**
     * 레이드 방의 접속 사용자 ID 목록 조회 (중복 제거)
     */
    public Set<Long> getConnectedUserIds(Long roomId) {
        Set<String> sessionIds = roomSessions.getOrDefault(roomId, Collections.emptySet());
        Set<Long> userIds = new HashSet<>();
        
        for (String sessionId : sessionIds) {
            Long userId = sessionUsers.get(sessionId);
            if (userId != null) {
                userIds.add(userId);
            }
        }
        
        return userIds;
    }
    
    /**
     * 접속 사용자 목록 브로드캐스트
     */
    private void broadcastConnectedUsers(Long roomId) {
        try {
            List<Map<String, Object>> connectedUsers = getConnectedUsers(roomId);
            Map<String, Object> message = new HashMap<>();
            message.put("type", "connected_users");
            message.put("users", connectedUsers);
            message.put("_timestamp", System.currentTimeMillis());
            
            messagingTemplate.convertAndSend("/topic/raid-room/" + roomId + "/users", message);
            logger.debug("접속 사용자 목록 브로드캐스트: roomId={}, users={}", roomId, connectedUsers.size());
        } catch (Exception e) {
            logger.error("접속 사용자 목록 브로드캐스트 중 오류: roomId={}", roomId, e);
        }
    }
    
    /**
     * 접속/해제 로그를 DB에 저장 (비동기 처리)
     */
    @Async
    public void saveAccessLog(Long userId, Long roomId, UserAccessLog.AccessAction action, String sessionId) {
        if (userId == null || roomId == null) {
            logger.warn("접속 로그 저장 실패: userId 또는 roomId가 null입니다. userId={}, roomId={}", userId, roomId);
            return;
        }
        
        try {
            Optional<User> userOpt = userRepository.findById(userId);
            if (userOpt.isEmpty()) {
                logger.warn("접속 로그 저장 실패: 사용자를 찾을 수 없음 userId={}", userId);
                return;
            }
            
            UserAccessLog log = new UserAccessLog();
            log.setUser(userOpt.get());
            log.setRoomId(roomId);
            log.setAction(action);
            log.setSessionId(sessionId);
            
            userAccessLogRepository.save(log);
            logger.debug("접속 로그 저장 완료: userId={}, roomId={}, action={}", userId, roomId, action);
        } catch (Exception e) {
            logger.error("접속 로그 저장 중 오류: userId={}, roomId={}, action={}", userId, roomId, action, e);
        }
    }
    
    /**
     * 사용자의 이동중 상태 제거 (비동기 처리, DB 연결 문제 시 블로킹 방지)
     */
    @Async
    public void clearUserMovingStatusAsync(Long roomId, Long userId) {
        if (roomId == null || userId == null) {
            return;
        }
        
        try {
            // 순환 참조 방지를 위해 ApplicationContextProvider 사용
            com.example.service.RaidRoomService raidRoomService = com.example.config.ApplicationContextProvider
                .getApplicationContext()
                .getBean(com.example.service.RaidRoomService.class);
            raidRoomService.clearUserMovingStatus(roomId, userId);
            logger.debug("사용자 이동중 상태 제거 완료: userId={}, roomId={}", userId, roomId);
        } catch (org.springframework.transaction.CannotCreateTransactionException e) {
            // DB 연결 문제는 경고만 로그 (치명적이지 않음)
            logger.warn("사용자 이동중 상태 제거 실패 (DB 연결 불가): userId={}, roomId={}", userId, roomId);
        } catch (Exception e) {
            logger.warn("사용자 이동중 상태 제거 실패: userId={}, roomId={}", userId, roomId, e);
        }
    }
}

