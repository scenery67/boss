// WebSocket 실시간 동기화 서비스 (STOMP + SockJS)

import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { getBackendUrl } from './api';

export interface WebSocketMessage {
  type: string;
  data: any;
}

class WebSocketService {
  private client: Client | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private isConnecting = false;

  /**
   * WebSocket 연결
   */
  connect(): void {
    if (this.isConnecting || (this.client && this.client.connected)) {
      return;
    }

    this.isConnecting = true;
    const backendUrl = getBackendUrl();
    
    // SockJS URL 생성 (프로토콜 제거 후 /ws 추가)
    // http://localhost:8080 -> http://localhost:8080/ws
    // https://boss-ymz0.onrender.com -> https://boss-ymz0.onrender.com/ws
    const wsUrl = `${backendUrl}/ws`;
    
    try {
      this.client = new Client({
        webSocketFactory: () => new SockJS(wsUrl) as any,
        reconnectDelay: this.reconnectDelay,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
        onConnect: () => {
          console.log('WebSocket 연결 성공');
          this.reconnectAttempts = 0;
          this.isConnecting = false;
          
          // 기존 리스너들을 다시 구독
          this.listeners.forEach((callbacks, destination) => {
            callbacks.forEach(callback => {
              const subscription = this.client?.subscribe(destination, (message: IMessage) => {
                this.handleMessage(destination, message);
              });
              // 구독 객체는 나중에 해제할 수 있도록 저장 필요 없음 (리스너로 관리)
            });
          });
        },
        onStompError: (frame) => {
          console.error('STOMP 오류:', frame);
          this.isConnecting = false;
        },
        onWebSocketClose: () => {
          console.log('WebSocket 연결 종료');
          this.isConnecting = false;
          this.attemptReconnect();
        },
        onWebSocketError: (error) => {
          console.error('WebSocket 오류:', error);
          this.isConnecting = false;
          this.attemptReconnect();
        },
      });

      this.client.activate();
    } catch (error) {
      console.error('WebSocket 연결 실패:', error);
      this.isConnecting = false;
      this.attemptReconnect();
    }
  }

  /**
   * 재연결 시도
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`WebSocket 재연결 시도 ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      setTimeout(() => {
        if (!this.client?.connected) {
          this.connect();
        }
      }, this.reconnectDelay);
    } else {
      console.error('WebSocket 재연결 실패 - 최대 시도 횟수 초과');
    }
  }

  /**
   * 메시지 처리
   */
  private handleMessage(destination: string, message: IMessage): void {
    try {
      const data = JSON.parse(message.body);
      const listeners = this.listeners.get(destination);
      if (listeners) {
        listeners.forEach(listener => {
          try {
            listener(data);
          } catch (e) {
            console.error('WebSocket 리스너 실행 오류:', e);
          }
        });
      }
    } catch (e) {
      console.error('WebSocket 메시지 파싱 오류:', e);
    }
  }

  /**
   * 구독
   * @returns 구독 해제 함수
   */
  subscribe(destination: string, callback: (data: any) => void): () => void {
    if (!this.listeners.has(destination)) {
      this.listeners.set(destination, new Set());
    }
    this.listeners.get(destination)!.add(callback);

    // 클라이언트가 연결되어 있으면 즉시 구독
    if (this.client && this.client.connected) {
      this.client.subscribe(destination, (message: IMessage) => {
        this.handleMessage(destination, message);
      });
    } else {
      // 연결되지 않았으면 연결 시도 (onConnect에서 자동으로 구독됨)
      this.connect();
    }

    // 구독 해제 함수 반환
    return () => {
      this.unsubscribe(destination, callback);
    };
  }

  /**
   * 구독 해제
   */
  unsubscribe(destination: string, callback: (data: any) => void): void {
    const listeners = this.listeners.get(destination);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.listeners.delete(destination);
      }
    }
  }

  /**
   * 연결 종료
   */
  disconnect(): void {
    if (this.client) {
      this.client.deactivate();
      this.client = null;
    }
    this.listeners.clear();
    this.isConnecting = false;
  }

  /**
   * 연결 상태 확인
   */
  isConnected(): boolean {
    return this.client?.connected || false;
  }
}

// 싱글톤 인스턴스
export const websocketService = new WebSocketService();
