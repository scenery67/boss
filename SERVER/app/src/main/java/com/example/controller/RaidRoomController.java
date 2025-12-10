package com.example.controller;

import com.example.service.RaidRoomService;
import com.example.util.ResponseUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/raid-rooms")
@CrossOrigin(origins = "*")
public class RaidRoomController {
    
    @Autowired
    private RaidRoomService raidRoomService;
    
    // 보스 방 상세 정보 조회
    @GetMapping("/{roomId}")
    public ResponseEntity<Map<String, Object>> getRaidRoom(@PathVariable Long roomId) {
        try {
            Map<String, Object> response = raidRoomService.getRaidRoom(roomId);
            if (response == null) {
                return ResponseUtil.notFound("레이드 방을 찾을 수 없습니다");
            }
            return ResponseUtil.fromServiceResponse(response);
        } catch (Exception e) {
            return ResponseUtil.internalError("레이드 방 조회 중 오류가 발생했습니다: " + e.getMessage());
        }
    }
    
    // 채널 생성 (수동)
    @PostMapping("/{roomId}/channels")
    public ResponseEntity<Map<String, Object>> createChannel(
            @PathVariable Long roomId,
            @RequestBody Map<String, Object> request) {
        Integer channelNumber = (Integer) request.get("channelNumber");
        
        if (channelNumber == null) {
            return ResponseUtil.badRequest("채널 번호를 입력해주세요");
        }
        
        Map<String, Object> response = raidRoomService.createChannel(roomId, channelNumber);
        return ResponseUtil.fromServiceResponse(response);
    }
    
    // 채널 생성 (이미지 인식)
    @PostMapping("/{roomId}/channels/image")
    public ResponseEntity<Map<String, Object>> createChannelFromImage(
            @PathVariable Long roomId,
            @RequestBody Map<String, String> request) {
        // TODO: 이미지 인식으로 채널 생성
        Map<String, Object> response = new HashMap<>();
        response.put("message", "이미지 인식 채널 생성 구현 예정");
        return ResponseEntity.ok(response);
    }
    
    // 채널 삭제
    @DeleteMapping("/{roomId}/channels/{channelId}")
    public ResponseEntity<Map<String, Object>> deleteChannel(
            @PathVariable Long roomId,
            @PathVariable Long channelId) {
        try {
            Map<String, Object> response = raidRoomService.deleteChannel(roomId, channelId);
            return ResponseUtil.fromServiceResponse(response);
        } catch (Exception e) {
            return ResponseUtil.internalError("채널 삭제 중 오류가 발생했습니다: " + e.getMessage());
        }
    }
    
    // 보스 잡혔다 표시
    @PutMapping("/{roomId}/channels/{channelId}/defeated")
    public ResponseEntity<Map<String, Object>> markDefeated(
            @PathVariable Long roomId,
            @PathVariable Long channelId) {
        try {
            Map<String, Object> response = raidRoomService.markDefeated(roomId, channelId);
            
            if (response.containsKey("error")) {
                return ResponseEntity.badRequest().body(response);
            }
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseUtil.internalError("보스 잡혔다 표시 중 오류가 발생했습니다: " + e.getMessage());
        }
    }
    
    // 채널 메모 업데이트
    @PutMapping("/{roomId}/channels/{channelId}/memo")
    public ResponseEntity<Map<String, Object>> updateChannelMemo(
            @PathVariable Long roomId,
            @PathVariable Long channelId,
            @RequestBody Map<String, Object> request) {
        try {
            String memo = (String) request.get("memo");
            if (memo == null) {
                memo = "";
            }
            
            Map<String, Object> response = raidRoomService.updateChannelMemo(roomId, channelId, memo);
            return ResponseUtil.fromServiceResponse(response);
        } catch (Exception e) {
            return ResponseUtil.internalError("메모 업데이트 중 오류가 발생했습니다: " + e.getMessage());
        }
    }
    
    // 채널 보스 색상 업데이트 (용의 경우)
    @PutMapping("/{roomId}/channels/{channelId}/boss-color")
    public ResponseEntity<Map<String, Object>> updateChannelBossColor(
            @PathVariable Long roomId,
            @PathVariable Long channelId,
            @RequestBody Map<String, Object> request) {
        String bossType = (String) request.get("bossType");
        String bossColor = (String) request.get("bossColor");
        
        if (bossType == null || bossColor == null) {
            return ResponseUtil.badRequest("보스 타입과 색상이 필요합니다");
        }
        
        Map<String, Object> response = raidRoomService.updateChannelBossColor(roomId, channelId, bossType, bossColor);
        return ResponseUtil.fromServiceResponse(response);
    }
    
    // 레이드 방 완료 처리
    @PutMapping("/{roomId}/complete")
    public ResponseEntity<Map<String, Object>> completeRaidRoom(@PathVariable Long roomId) {
        try {
            Map<String, Object> response = raidRoomService.completeRaidRoom(roomId);
            return ResponseUtil.fromServiceResponse(response);
        } catch (Exception e) {
            return ResponseUtil.internalError("레이드 완료 처리 중 오류가 발생했습니다: " + e.getMessage());
        }
    }
    
    // 채널 선택/해제
    @PutMapping("/{roomId}/channels/{channelId}/select")
    public ResponseEntity<Map<String, Object>> toggleChannelSelection(
            @PathVariable Long roomId,
            @PathVariable Long channelId,
            @RequestBody Map<String, Object> request) {
        Long userId = null;
        Object userIdObj = request.get("userId");
        
        if (userIdObj != null) {
            if (userIdObj instanceof Integer) {
                userId = ((Integer) userIdObj).longValue();
            } else if (userIdObj instanceof Long) {
                userId = (Long) userIdObj;
            } else if (userIdObj instanceof Number) {
                userId = ((Number) userIdObj).longValue();
            } else if (userIdObj instanceof String) {
                try {
                    userId = Long.parseLong((String) userIdObj);
                } catch (NumberFormatException e) {
                    // 파싱 실패
                }
            }
        }
        
        if (userId == null) {
            return ResponseUtil.badRequest("사용자 ID가 필요합니다. 받은 값: " + userIdObj);
        }
        
        Map<String, Object> response = raidRoomService.toggleChannelSelection(roomId, channelId, userId);
        return ResponseUtil.fromServiceResponse(response);
    }
    
    // 레이드 방 삭제
    @DeleteMapping("/{roomId}")
    public ResponseEntity<Map<String, Object>> deleteRaidRoom(@PathVariable Long roomId) {
        try {
            Map<String, Object> response = raidRoomService.deleteRaidRoom(roomId);
            return ResponseUtil.fromServiceResponse(response);
        } catch (Exception e) {
            return ResponseUtil.internalError("레이드 방 삭제 중 오류가 발생했습니다: " + e.getMessage());
        }
    }
}

