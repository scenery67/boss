package com.example.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "channels")
public class Channel {
    
    /**
     * 동시성 제어를 위한 버전 필드 (낙관적 잠금)
     * 동시 업데이트 시 OptimisticLockException 발생하여 데이터 일관성 보장
     * 
     * 주의: 기존 데이터에 version 컬럼이 없거나 null인 경우를 위해 일시적으로 비활성화
     * 데이터 마이그레이션 후 다시 활성화 필요
     */
    // @Version
    // @Column(name = "version", nullable = true, columnDefinition = "BIGINT DEFAULT 0")
    // private Long version;
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @ManyToOne
    @JoinColumn(name = "raid_room_id")
    private RaidRoom raidRoom;
    
    private Integer channelNumber; // 게임 채널 번호
    
    private Boolean isDefeated = false; // 보스 잡혔는지 여부
    
    @Column(name = "memo", length = 500)
    private String memo; // 채널 메모
    
    @Column(name = "boss_heuk_color", length = 20)
    private String bossHeukColor; // 흑 보스 색상: "green", "yellow", "orange", "red"
    
    @Column(name = "boss_jin_color", length = 20)
    private String bossJinColor; // 진 보스 색상
    
    @Column(name = "boss_muk_color", length = 20)
    private String bossMukColor; // 묵 보스 색상
    
    @Column(name = "boss_gam_color", length = 20)
    private String bossGamColor; // 감 보스 색상
    
    // 수화룡 레이드용 필드
    @Column(name = "water_dragon_defeated_at")
    private LocalDateTime waterDragonDefeatedAt; // 수룡 잡힌 시간
    
    @Column(name = "fire_dragon_defeated_at")
    private LocalDateTime fireDragonDefeatedAt; // 화룡 잡힌 시간
    
    // 채널에 있는 유저들 (이동중 포함)
    @OneToMany(mappedBy = "channel", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ChannelUser> channelUsers = new ArrayList<>();
    
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }
    
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
    
    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    
    public RaidRoom getRaidRoom() { return raidRoom; }
    public void setRaidRoom(RaidRoom raidRoom) { this.raidRoom = raidRoom; }
    
    public Integer getChannelNumber() { return channelNumber; }
    public void setChannelNumber(Integer channelNumber) { this.channelNumber = channelNumber; }
    
    public Boolean getIsDefeated() { return isDefeated; }
    public void setIsDefeated(Boolean isDefeated) { this.isDefeated = isDefeated; }
    
    public List<ChannelUser> getChannelUsers() { return channelUsers; }
    public void setChannelUsers(List<ChannelUser> channelUsers) { this.channelUsers = channelUsers; }
    
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    
    public String getMemo() { return memo; }
    public void setMemo(String memo) { this.memo = memo; }
    
    public String getBossHeukColor() { return bossHeukColor; }
    public void setBossHeukColor(String bossHeukColor) { this.bossHeukColor = bossHeukColor; }
    
    public String getBossJinColor() { return bossJinColor; }
    public void setBossJinColor(String bossJinColor) { this.bossJinColor = bossJinColor; }
    
    public String getBossMukColor() { return bossMukColor; }
    public void setBossMukColor(String bossMukColor) { this.bossMukColor = bossMukColor; }
    
    public String getBossGamColor() { return bossGamColor; }
    public void setBossGamColor(String bossGamColor) { this.bossGamColor = bossGamColor; }
    
    public LocalDateTime getWaterDragonDefeatedAt() { return waterDragonDefeatedAt; }
    public void setWaterDragonDefeatedAt(LocalDateTime waterDragonDefeatedAt) { this.waterDragonDefeatedAt = waterDragonDefeatedAt; }
    
    public LocalDateTime getFireDragonDefeatedAt() { return fireDragonDefeatedAt; }
    public void setFireDragonDefeatedAt(LocalDateTime fireDragonDefeatedAt) { this.fireDragonDefeatedAt = fireDragonDefeatedAt; }
    
    // public Long getVersion() { return version; }
    // public void setVersion(Long version) { this.version = version; }
}

