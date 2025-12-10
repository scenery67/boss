package com.example.repository;

import com.example.entity.Channel;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ChannelRepository extends JpaRepository<Channel, Long> {
    List<Channel> findByRaidRoomId(Long raidRoomId);
    
    @Query("SELECT c FROM Channel c WHERE c.raidRoom.id = :raidRoomId AND c.channelNumber = :channelNumber")
    Optional<Channel> findByRaidRoomIdAndChannelNumber(@Param("raidRoomId") Long raidRoomId, @Param("channelNumber") Integer channelNumber);
    
    // raidRoom을 함께 로드하여 lazy loading 문제 방지
    @EntityGraph(attributePaths = {"raidRoom"})
    @Query("SELECT c FROM Channel c WHERE c.id = :channelId")
    Optional<Channel> findByIdWithRaidRoom(@Param("channelId") Long channelId);
}

