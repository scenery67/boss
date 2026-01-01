package com.example.controller;

import com.example.service.BossService;
import com.example.util.ResponseUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/bosses")
@CrossOrigin(origins = "*")
public class BossController {
    
    @Autowired
    private BossService bossService;
    
    // 오늘의 보스 목록 조회
    @GetMapping("/today")
    public ResponseEntity<Map<String, Object>> getTodayBosses() {
        try {
            Map<String, Object> response = bossService.getTodayBosses();
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", "보스 목록 조회 중 오류가 발생했습니다: " + e.getMessage());
            error.put("bosses", new java.util.ArrayList<>());
            return ResponseEntity.status(500).body(error);
        }
    }
    
    // 보스 방 생성
    @PostMapping("/rooms")
    public ResponseEntity<Map<String, Object>> createRaidRoom(@RequestBody Map<String, Object> request) {
        try {
            String bossType = (String) request.get("bossType");
            String dateStr = (String) request.get("raidDate");
            String timeStr = (String) request.get("raidTime");
            
            if (bossType == null || bossType.isEmpty()) {
                return ResponseUtil.badRequest("보스 종류를 선택해주세요");
            }
            
            if (dateStr == null || dateStr.isEmpty()) {
                return ResponseUtil.badRequest("레이드 날짜를 선택해주세요");
            }
            
            LocalDate raidDate = LocalDate.parse(dateStr);
            LocalTime raidTime = null;
            
            // 수화룡 레이드는 시간이 선택사항
            if (timeStr != null && !timeStr.isEmpty()) {
                raidTime = LocalTime.parse(timeStr);
            }
            
            Map<String, Object> response = bossService.createRaidRoom(bossType, raidDate, raidTime);
            return ResponseUtil.fromServiceResponse(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", "방 생성 중 오류가 발생했습니다: " + e.getMessage());
            error.put("details", e.getClass().getSimpleName());
            return ResponseEntity.status(500).body(error);
        }
    }
    
    // 완료된 레이드 방 목록 조회
    @GetMapping("/completed")
    public ResponseEntity<Map<String, Object>> getCompletedRooms() {
        try {
            Map<String, Object> response = bossService.getCompletedRooms();
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", "완료된 레이드 조회 중 오류가 발생했습니다: " + e.getMessage());
            error.put("rooms", new java.util.ArrayList<>());
            return ResponseEntity.status(500).body(error);
        }
    }
}

