package com.example.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 사용자 접속/해제 로그 엔티티
 * 수화룡 레이드 방 접속 기록을 저장
 */
@Entity
@Table(name = "user_access_logs", indexes = {
    @Index(name = "idx_user_access_logs_user_id", columnList = "user_id"),
    @Index(name = "idx_user_access_logs_room_id", columnList = "room_id"),
    @Index(name = "idx_user_access_logs_created_at", columnList = "created_at")
})
public class UserAccessLog {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
    
    @Column(name = "room_id", nullable = false)
    private Long roomId;
    
    @Enumerated(EnumType.STRING)
    @Column(name = "action", nullable = false, length = 20)
    private AccessAction action; // CONNECT 또는 DISCONNECT
    
    @Column(name = "session_id", length = 100)
    private String sessionId;
    
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
    
    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    
    public Long getRoomId() { return roomId; }
    public void setRoomId(Long roomId) { this.roomId = roomId; }
    
    public AccessAction getAction() { return action; }
    public void setAction(AccessAction action) { this.action = action; }
    
    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    
    public enum AccessAction {
        CONNECT,
        DISCONNECT
    }
}

