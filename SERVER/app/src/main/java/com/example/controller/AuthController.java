package com.example.controller;

import com.example.service.AuthService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {
    
    private static final Logger logger = LoggerFactory.getLogger(AuthController.class);
    
    @Autowired
    private AuthService authService;
    
    // 헬스 체크
    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health(jakarta.servlet.http.HttpServletRequest request) {
        // 요청 정보 추출
        String clientIp = getClientIpAddress(request);
        String userAgent = request.getHeader("User-Agent");
        String referer = request.getHeader("Referer");
        String origin = request.getHeader("Origin");
        
        logger.info("Health check request received - IP: {}, User-Agent: {}, Origin: {}, Referer: {}", 
                    clientIp, userAgent, origin, referer);
        
        Map<String, Object> response = new HashMap<>();
        response.put("status", "ok");
        response.put("message", "서버가 정상적으로 실행 중입니다");
        return ResponseEntity.ok(response);
    }
    
    // 클라이언트 IP 주소 추출 (프록시/로드밸런서 고려)
    private String getClientIpAddress(jakarta.servlet.http.HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("Proxy-Client-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("WL-Proxy-Client-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        // X-Forwarded-For는 여러 IP가 있을 수 있으므로 첫 번째 IP만 사용
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip;
    }
    
    // 닉네임으로 로그인 (게스트 사용자, DB에 저장하여 채널 선택 등 기능 사용 가능)
    @PostMapping("/guest")
    public ResponseEntity<Map<String, Object>> guestLogin(@RequestBody Map<String, String> request, 
                                                           jakarta.servlet.http.HttpServletRequest httpRequest) {
        try {
            String nickname = request != null ? request.get("nickname") : null;
            
            if (nickname == null || nickname.trim().isEmpty()) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("error", "닉네임을 입력해주세요");
                return ResponseEntity.badRequest().body(errorResponse);
            }
            
            Map<String, Object> response = authService.guestLogin(nickname, httpRequest);
            
            if (response.containsKey("error")) {
                return ResponseEntity.badRequest().body(response);
            }
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("error", "서버 오류: " + e.getMessage());
            return ResponseEntity.status(500).body(errorResponse);
        }
    }
    
    // Discord OAuth 시작 (리다이렉트)
    @GetMapping("/discord")
    public ResponseEntity<Void> discordAuth() {
        String redirectUrl = authService.getDiscordAuthUrl();
        return ResponseEntity.status(302)
            .header("Location", redirectUrl)
            .build();
    }
    
    // Discord OAuth 콜백
    @GetMapping("/discord/callback")
    public ResponseEntity<Void> discordCallback(@RequestParam(required = false) String code, 
                                                 @RequestParam(required = false) String error,
                                                 @RequestParam(required = false) String error_description,
                                                 jakarta.servlet.http.HttpServletRequest request,
                                                 jakarta.servlet.http.HttpServletResponse response) {
        try {
            if (error != null) {
                // OAuth 오류 처리
                String errorMsg = error;
                if (error_description != null) {
                    errorMsg += ": " + error_description;
                }
                response.sendRedirect("http://localhost:5000/login?error=" + URLEncoder.encode(errorMsg, StandardCharsets.UTF_8));
                return ResponseEntity.status(302).build();
            }
            
            if (code == null || code.isEmpty()) {
                response.sendRedirect("http://localhost:5000/login?error=no_code");
                return ResponseEntity.status(302).build();
            }
            
            Map<String, Object> authResult = authService.discordLogin(code, request);
            
            if (authResult.containsKey("error")) {
                response.sendRedirect("http://localhost:5000/login?error=" + authResult.get("error"));
                return ResponseEntity.status(302).build();
            }
            
            // 성공 시 프론트엔드로 리다이렉트 (세션 쿠키 포함)
            response.sendRedirect("http://localhost:5000/?discord_success=true");
            return ResponseEntity.status(302).build();
        } catch (Exception e) {
            try {
                response.sendRedirect("http://localhost:5000/login?error=server_error");
            } catch (Exception ex) {
                ex.printStackTrace();
            }
            return ResponseEntity.status(302).build();
        }
    }
    
    // 현재 사용자 정보 조회
    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> getCurrentUser(jakarta.servlet.http.HttpServletRequest request) {
        Map<String, Object> response = authService.getCurrentUser(request);
        return ResponseEntity.ok(response);
    }
}

