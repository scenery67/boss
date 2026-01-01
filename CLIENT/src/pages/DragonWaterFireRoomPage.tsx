import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRaidRoom, createChannel, deleteChannel, createChannelsBatch, updateDragonDefeatedTime, getTodayBosses, createRaidRoom } from '../services/BossService';
import { User, RaidRoomData, Channel } from '../types';
import { websocketService } from '../services/websocket';
import { createWorker } from 'tesseract.js';

interface DragonWaterFireRoomPageProps {
  user: User;
}

const DragonWaterFireRoomPage: React.FC<DragonWaterFireRoomPageProps> = ({ user }) => {
  const navigate = useNavigate();
  const [roomData, setRoomData] = useState<RaidRoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dragonTimeInput, setDragonTimeInput] = useState<{ channelId: number; dragonType: 'water' | 'fire'; time: string } | null>(null);
  const [respawnTimeInput, setRespawnTimeInput] = useState<{ channelId: number; dragonType: 'water' | 'fire'; time: string } | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(new Set());
  const [waterRespawnMinutes, setWaterRespawnMinutes] = useState<number>(() => {
    const saved = localStorage.getItem('waterRespawnMinutes');
    return saved ? parseInt(saved, 10) : 35;
  });
  const [fireRespawnMinutes, setFireRespawnMinutes] = useState<number>(() => {
    const saved = localStorage.getItem('fireRespawnMinutes');
    return saved ? parseInt(saved, 10) : 45;
  });
  const [showSettings, setShowSettings] = useState(false);
  const wsSubscriptionRef = useRef<(() => void) | null>(null);
  const isAddingChannelRef = useRef<boolean>(false);
  const roomIdRef = useRef<number | null>(null);

  // 수화룡 레이드 방 ID 찾기 또는 생성
  useEffect(() => {
    loadWaterFireDragonRoom();
    return () => {
      if (wsSubscriptionRef.current) {
        wsSubscriptionRef.current();
        wsSubscriptionRef.current = null;
      }
    };
  }, []);

  // 현재 시간 업데이트 (1초마다)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('ko-KR', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false 
      }));
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // ESC 또는 Backspace 키로 뒤로가기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 입력 필드에 포커스가 있으면 기본 동작 허용
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.key === 'Escape') {
        if (showSettings) {
          setShowSettings(false);
        } else {
          navigate('/');
        }
      } else if (e.key === 'Backspace') {
        navigate('/');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, showSettings]);

  // 설정 패널 외부 클릭 시 닫기
  useEffect(() => {
    if (!showSettings) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-settings-panel]') && !target.closest('[data-settings-button]')) {
        setShowSettings(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings]);

  const loadWaterFireDragonRoom = async () => {
    try {
      setLoading(true);
      
      // 1. 보스 목록에서 수화룡 레이드 방 찾기 (날짜 무관)
      const bossesData = await getTodayBosses(true);
      const waterFireBoss = bossesData.bosses.find(boss => boss.type === 'DRAGON_WATER_FIRE');
      
      let roomId: number | null = null;
      
      if (waterFireBoss && waterFireBoss.rooms && waterFireBoss.rooms.length > 0) {
        // 수화룡 레이드 방이 있으면 첫 번째 방 사용 (하나만 존재)
        roomId = waterFireBoss.rooms[0].id;
      } else {
        // 수화룡 레이드 방이 없으면 자동 생성 (날짜는 오늘, 시간은 없음)
        // 백엔드에서 이미 존재하면 기존 방을 반환하므로 안전하게 생성 가능
        const today = new Date().toISOString().split('T')[0];
        const createResult = await createRaidRoom('DRAGON_WATER_FIRE', today, '');
        
        if (createResult.success && createResult.roomId) {
          roomId = createResult.roomId;
        } else {
          // 생성 실패 시 보스 목록 다시 조회 (다른 사용자가 생성했을 수 있음)
          const retryBossesData = await getTodayBosses(true);
          const retryWaterFireBoss = retryBossesData.bosses.find(boss => boss.type === 'DRAGON_WATER_FIRE');
          if (retryWaterFireBoss && retryWaterFireBoss.rooms && retryWaterFireBoss.rooms.length > 0) {
            roomId = retryWaterFireBoss.rooms[0].id;
          } else {
            setError('수화룡 레이드 방을 생성할 수 없습니다: ' + (createResult.error || '알 수 없는 오류'));
            return;
          }
        }
      }
      
      if (roomId) {
        roomIdRef.current = roomId;
        const data = await getRaidRoom(roomId, true);
        if (data && data.boss && data.boss.type === 'DRAGON_WATER_FIRE') {
          setRoomData(data);
          connectWebSocket(roomId);
        } else {
          setError('수화룡 레이드 방 데이터를 불러올 수 없습니다.');
        }
      } else {
        setError('수화룡 레이드 방을 찾거나 생성할 수 없습니다.');
      }
    } catch (err: any) {
      console.error('수화룡 레이드 방 로드 실패:', err);
      const errorMessage = err?.response?.data?.error || err?.message || '알 수 없는 오류';
      const statusCode = err?.response?.status;
      setError(`수화룡 레이드 방을 불러올 수 없습니다: ${errorMessage}${statusCode ? ` (${statusCode})` : ''}`);
    } finally {
      setLoading(false);
    }
  };

  const connectWebSocket = (roomId: number) => {
    if (!user || !user.id) return;

    const sendConnectMessage = () => {
      const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
      if (userId && websocketService.isConnected()) {
        websocketService.send('/app/raid-room/connect', {
          roomId: roomId,
          userId: userId
        });
      }
    };

    if (!websocketService.isConnected()) {
      websocketService.connect();
      let retryCount = 0;
      const maxRetries = 10;
      const checkConnection = setInterval(() => {
        if (websocketService.isConnected()) {
          clearInterval(checkConnection);
          sendConnectMessage();
        } else if (retryCount >= maxRetries) {
          clearInterval(checkConnection);
        }
        retryCount++;
      }, 200);
    } else {
      sendConnectMessage();
    }

    if (wsSubscriptionRef.current) {
      wsSubscriptionRef.current();
    }

    const unsubscribe = websocketService.subscribe(`/topic/raid-room/${roomId}`, (data: RaidRoomData | any) => {
      if (data && data.channels) {
        data.channels = data.channels
          .map((ch: any) => ({
            ...ch,
            memo: ch.memo || ''
          }))
          .sort((a: any, b: any) => {
            const numA = a.channelNumber || 0;
            const numB = b.channelNumber || 0;
            return numA - numB;
          });
      }
      
      if (data.connectedUsers) {
        setRoomData(data);
      } else {
        setRoomData((prevData) => ({
          ...data,
          connectedUsers: prevData?.connectedUsers || []
        }));
      }
    });

    wsSubscriptionRef.current = unsubscribe;
  };

  // 수룡 재젠 시간 계산
  const getWaterDragonRespawnTime = useCallback((defeatedAt: string | undefined): Date | null => {
    if (!defeatedAt) return null;
    const defeated = new Date(defeatedAt);
    const respawn = new Date(defeated.getTime() + waterRespawnMinutes * 60 * 1000);
    return respawn;
  }, [waterRespawnMinutes]);

  // 화룡 재젠 시간 계산
  const getFireDragonRespawnTime = useCallback((defeatedAt: string | undefined): Date | null => {
    if (!defeatedAt) return null;
    const defeated = new Date(defeatedAt);
    const respawn = new Date(defeated.getTime() + fireRespawnMinutes * 60 * 1000);
    return respawn;
  }, [fireRespawnMinutes]);

  // 남은 시간 계산 (분 단위)
  const getRemainingMinutes = useCallback((respawnTime: Date | null): number | null => {
    if (!respawnTime) return null;
    const now = new Date();
    const diff = respawnTime.getTime() - now.getTime();
    return Math.floor(diff / (1000 * 60));
  }, []);

  // 젠 상태별 채널 분류 (useMemo 내부에서 직접 계산)

  const processImageFromClipboard = async (file: File) => {
    if (!roomIdRef.current || !roomData) return;

    try {
      // Tesseract.js로 OCR 수행
      const worker = await createWorker('eng');
      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();

      // 4자리 숫자 패턴 추출 (채널 번호)
      const channelNumberPattern = /\b\d{4}\b/g;
      const matches = text.match(channelNumberPattern);
      
      if (!matches || matches.length === 0) {
        alert('이미지에서 채널 번호를 찾을 수 없습니다.');
        return;
      }

      // 중복 제거 및 숫자로 변환
      const channelNumbers = Array.from(new Set(matches.map(m => parseInt(m, 10))))
        .filter(num => num >= 1000 && num <= 9999) // 유효한 채널 번호 범위
        .sort((a, b) => a - b);

      if (channelNumbers.length === 0) {
        alert('유효한 채널 번호를 찾을 수 없습니다.');
        return;
      }

      // 이미 존재하는 채널 번호 필터링
      const existingChannelNumbers = roomData.channels.map(ch => ch.channelNumber);
      const newChannelNumbers = channelNumbers.filter(num => !existingChannelNumbers.includes(num));

      if (newChannelNumbers.length === 0) {
        alert('모든 채널 번호가 이미 존재합니다.');
        return;
      }

      // 확인 메시지
      const confirmMessage = `다음 ${newChannelNumbers.length}개의 채널을 생성하시겠습니까?\n${newChannelNumbers.join(', ')}`;
      if (!window.confirm(confirmMessage)) return;

      // 일괄 생성
      const result = await createChannelsBatch(roomIdRef.current, newChannelNumbers);
      
      if (result.success) {
        alert(`${result.created?.length || newChannelNumbers.length}개의 채널이 생성되었습니다.`);
        // 웹소켓을 통해 자동으로 업데이트됨
        await loadWaterFireDragonRoom();
      } else {
        alert(result.error || '채널 생성에 실패했습니다.');
      }
    } catch (err) {
      console.error('이미지 인식 실패:', err);
      alert('이미지 인식 중 오류가 발생했습니다.');
    }
  };

  const handleAddChannel = async () => {
    // 중복 요청 방지
    if (isAddingChannelRef.current) {
      return;
    }

    if (!roomIdRef.current || !roomData) return;

    // 커스텀 입력 다이얼로그 생성
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      z-index: 10000;
      min-width: 400px;
      max-width: 600px;
    `;
    
    // 제목
    const title = document.createElement('h3');
    title.textContent = '채널 추가';
    title.style.cssText = 'margin: 0 0 15px 0; font-size: 18px; font-weight: bold; color: #333;';
    
    // 설명 텍스트
    const description = document.createElement('div');
    description.innerHTML = `
      <div style="margin-bottom: 15px; line-height: 1.6;">
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #555;">
          <strong>채널을 추가하는 방법은 두 가지입니다:</strong>
        </p>
        <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #666;">
          <li style="margin-bottom: 5px;"><strong>개별 추가:</strong> 아래 입력창에 채널 번호를 직접 입력하세요</li>
          <li style="margin-bottom: 5px;"><strong>이미지 붙여넣기:</strong> 스크린샷을 클립보드에 복사한 후 <strong>Ctrl+V</strong>를 눌러 붙여넣으세요</li>
        </ul>
      </div>
    `;
    
    // 예시 이미지 섹션
    const exampleImageContainer = document.createElement('div');
    exampleImageContainer.style.cssText = 'margin-bottom: 15px; text-align: center; padding: 10px; background: #f5f5f5; border-radius: 4px;';
    
    const exampleImageLabel = document.createElement('div');
    exampleImageLabel.textContent = '📷 예시 이미지 (이런 형태의 스크린샷을 붙여넣으세요)';
    exampleImageLabel.style.cssText = 'font-size: 12px; color: #666; margin-bottom: 8px; font-weight: 500;';
    
    const exampleImage = document.createElement('img');
    // Vite의 base URL을 사용하여 이미지 경로 설정
    exampleImage.src = `${import.meta.env.BASE_URL}channel-example.png`;
    exampleImage.alt = '채널 목록 예시';
    exampleImage.style.cssText = 'max-width: 100%; max-height: 250px; border: 1px solid #ddd; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);';
    exampleImage.onerror = () => {
      // 이미지가 없으면 예시 이미지 컨테이너 숨기기
      exampleImageContainer.style.display = 'none';
    };
    
    exampleImageContainer.appendChild(exampleImageLabel);
    exampleImageContainer.appendChild(exampleImage);
    
    // 입력 필드 라벨
    const inputLabel = document.createElement('label');
    inputLabel.textContent = '채널 번호 입력:';
    inputLabel.style.cssText = 'display: block; margin-bottom: 5px; font-size: 13px; font-weight: 500; color: #333;';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '예: 1126 또는 Ctrl+V로 이미지 붙여넣기';
    input.style.cssText = 'width: 100%; padding: 10px; margin-bottom: 10px; box-sizing: border-box; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;';
    
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end;';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '취소';
    cancelBtn.style.cssText = 'padding: 8px 16px; cursor: pointer;';
    
    const okBtn = document.createElement('button');
    okBtn.textContent = '확인';
    okBtn.style.cssText = 'padding: 8px 16px; cursor: pointer;';
    
    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(okBtn);
    
    dialog.appendChild(title);
    dialog.appendChild(description);
    dialog.appendChild(exampleImageContainer);
    dialog.appendChild(inputLabel);
    dialog.appendChild(input);
    dialog.appendChild(buttonContainer);
    
    document.body.appendChild(dialog);
    
    // 다이얼로그가 DOM에 추가된 후 입력 필드에 포커스
    setTimeout(() => {
      input.focus();
    }, 0);
    
    // 배경 오버레이
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 9999;
    `;
    document.body.appendChild(overlay);
    
    let isCleanedUp = false;
    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      try {
        if (dialog && dialog.parentNode === document.body) {
          document.body.removeChild(dialog);
        }
        if (overlay && overlay.parentNode === document.body) {
          document.body.removeChild(overlay);
        }
      } catch (err) {
        // 이미 제거되었거나 없는 경우 무시
      }
    };
    
    // Ctrl+V 이벤트 핸들러
    const handlePaste = async (e: ClipboardEvent) => {
      e.preventDefault();
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            cleanup();
            // 이벤트 리스너 제거
            input.removeEventListener('paste', handlePaste);
            document.removeEventListener('paste', handlePaste);
            document.removeEventListener('keydown', handleDialogKeyDown);
            await processImageFromClipboard(file);
            return;
          }
        }
      }
    };
    
    const handleDialogKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
        input.removeEventListener('paste', handlePaste);
        document.removeEventListener('paste', handlePaste);
        document.removeEventListener('keydown', handleDialogKeyDown);
      }
    };
    
    // 붙여넣기 이벤트 리스너 추가
    input.addEventListener('paste', handlePaste);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('keydown', handleDialogKeyDown);
    
    cancelBtn.onclick = () => {
      cleanup();
      input.removeEventListener('paste', handlePaste);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('keydown', handleDialogKeyDown);
    };
    
    okBtn.onclick = async () => {
      const channelNumber = input.value.trim();
      if (!channelNumber) {
        alert('채널 번호를 입력해주세요.');
        return;
      }
      
      cleanup();
      input.removeEventListener('paste', handlePaste);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('keydown', handleDialogKeyDown);
      
      // 기존 로직으로 채널 생성
      const channelNum = parseInt(channelNumber);
      if (isNaN(channelNum)) {
        alert('올바른 채널 번호를 입력하세요.');
        return;
      }

      const existingChannel = roomData.channels.find(ch => ch.channelNumber === channelNum);
      if (existingChannel) {
        alert(`채널 ${channelNum}은(는) 이미 존재합니다.`);
        return;
      }

      isAddingChannelRef.current = true;

      try {
        const result = await createChannel(roomIdRef.current!, channelNum);
        if (result.success) {
          await loadWaterFireDragonRoom();
        } else {
          alert(result.error || '채널 생성에 실패했습니다.');
        }
      } catch (err: any) {
        alert(err.response?.data?.error || '채널 생성에 실패했습니다.');
      } finally {
        isAddingChannelRef.current = false;
      }
    };
    
    // Enter 키로 확인
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        okBtn.click();
      }
    };
  };

  const handleDragonTimeClick = async (channelId: number, dragonType: 'water' | 'fire') => {
    if (!roomIdRef.current || !roomData) return;
    const channel = roomData.channels.find(ch => ch.id === channelId);
    if (!channel) return;
    
    // 클릭 시 바로 현재 시간으로 저장 (로컬 시간대 고려)
    try {
      const now = new Date();
      // 로컬 시간대를 고려하여 ISO 형식 문자열 생성 (Z 없이)
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const isoString = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
      
      await updateDragonDefeatedTime(roomIdRef.current, channelId, dragonType, isoString);
      // WebSocket이 최신 상태를 브로드캐스트하므로 별도 동기화 불필요
    } catch (err: any) {
      // 에러 상세 정보 확인
      const errorMessage = err.response?.data?.error || err.message || '시간 업데이트에 실패했습니다.';
      // 타임아웃 에러는 조용히 처리
      if (!errorMessage.includes('timeout') && !errorMessage.includes('ECONNABORTED')) {
        alert(`시간 업데이트 실패: ${errorMessage}`);
      }
    }
  };

  const handleDragonTime5MinutesAgo = async (channelId: number, dragonType: 'water' | 'fire') => {
    if (!roomIdRef.current || !roomData) return;
    const channel = roomData.channels.find(ch => ch.id === channelId);
    if (!channel) return;
    
    // 현재 시간에서 5분을 뺀 시간으로 저장 (로컬 시간대 고려)
    try {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      // 로컬 시간대를 고려하여 ISO 형식 문자열 생성 (Z 없이)
      const year = fiveMinutesAgo.getFullYear();
      const month = String(fiveMinutesAgo.getMonth() + 1).padStart(2, '0');
      const day = String(fiveMinutesAgo.getDate()).padStart(2, '0');
      const hours = String(fiveMinutesAgo.getHours()).padStart(2, '0');
      const minutes = String(fiveMinutesAgo.getMinutes()).padStart(2, '0');
      const seconds = String(fiveMinutesAgo.getSeconds()).padStart(2, '0');
      const isoString = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
      
      await updateDragonDefeatedTime(roomIdRef.current, channelId, dragonType, isoString);
      // WebSocket이 최신 상태를 브로드캐스트하므로 별도 동기화 불필요
    } catch (err: any) {
      // 에러 상세 정보 확인
      const errorMessage = err.response?.data?.error || err.message || '시간 업데이트에 실패했습니다.';
      // 타임아웃 에러는 조용히 처리
      if (!errorMessage.includes('timeout') && !errorMessage.includes('ECONNABORTED')) {
        alert(`시간 업데이트 실패: ${errorMessage}`);
      }
    }
  };



  const handleDragonTimeInputSave = async (channelId: number, dragonType: 'water' | 'fire', inputTimeValue?: string) => {
    if (!roomIdRef.current || !roomData) return;
    
    const channel = roomData.channels.find(ch => ch.id === channelId);
    if (!channel) return;
    
    // 시간 입력 필드의 현재 값 가져오기
    let inputTime: string | null = inputTimeValue || null;
    
    // 1. 파라미터로 전달된 값이 있으면 사용
    if (!inputTime && dragonTimeInput?.channelId === channelId && dragonTimeInput?.dragonType === dragonType) {
      inputTime = dragonTimeInput.time;
    }
    
    // 2. inputTime이 없으면 채널의 저장된 시간 사용
    if (!inputTime) {
      const savedTime = channel[dragonType === 'water' ? 'waterDragonDefeatedAt' : 'fireDragonDefeatedAt'];
      if (savedTime) {
        const date = new Date(savedTime);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        inputTime = `${hours}:${minutes}`;
      }
    }
    
    // 3. 그래도 없으면 현재 시간 사용
    if (!inputTime) {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      inputTime = `${hours}:${minutes}`;
    }
    
    if (!inputTime || !inputTime.match(/^\d{2}:\d{2}$/)) {
      alert('올바른 시간 형식(HH:MM)을 입력해주세요.');
      return;
    }
    
    try {
      // 오늘 날짜 + 입력한 시간으로 ISO 형식 문자열 생성 (로컬 시간대 고려)
      const now = new Date();
      const [hours, minutes] = inputTime.split(':').map(Number);
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hoursStr = String(hours).padStart(2, '0');
      const minutesStr = String(minutes).padStart(2, '0');
      const isoString = `${year}-${month}-${day}T${hoursStr}:${minutesStr}:00`;
      
      await updateDragonDefeatedTime(roomIdRef.current, channelId, dragonType, isoString);
      // WebSocket이 최신 상태를 브로드캐스트하므로 별도 동기화 불필요
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || '시간 업데이트에 실패했습니다.';
      if (!errorMessage.includes('timeout') && !errorMessage.includes('ECONNABORTED')) {
        alert(`시간 업데이트 실패: ${errorMessage}`);
      }
    }
  };

  const handleRespawnTimeInputSave = async (channelId: number, dragonType: 'water' | 'fire', inputTimeValue?: string) => {
    if (!roomIdRef.current || !roomData) return;
    
    const channel = roomData.channels.find(ch => ch.id === channelId);
    if (!channel) return;
    
    // 시간 입력 필드의 현재 값 가져오기
    let inputTime: string | null = inputTimeValue || null;
    
    // 1. 파라미터로 전달된 값이 있으면 사용
    if (!inputTime && respawnTimeInput?.channelId === channelId && respawnTimeInput?.dragonType === dragonType) {
      inputTime = respawnTimeInput.time;
    }
    
    if (!inputTime || !inputTime.match(/^\d{2}:\d{2}$/)) {
      alert('올바른 시간 형식(HH:MM)을 입력해주세요.');
      return;
    }
    
    try {
      // 젠 예상 시간에서 35분(수룡) 또는 45분(화룡)을 빼서 잡힌 시간 계산
      const [hours, minutes] = inputTime.split(':').map(Number);
      const respawnDate = new Date();
      respawnDate.setHours(hours, minutes, 0, 0);
      
      // 오늘 날짜로 설정
      const today = new Date();
      respawnDate.setFullYear(today.getFullYear(), today.getMonth(), today.getDate());
      
      // 잡힌 시간 계산 (젠 예상 시간 - 리스폰 시간)
      const respawnMinutes = dragonType === 'water' ? waterRespawnMinutes : fireRespawnMinutes;
      const defeatedDate = new Date(respawnDate.getTime() - respawnMinutes * 60 * 1000);
      
      // ISO 형식 문자열 생성 (로컬 시간대 고려)
      const year = defeatedDate.getFullYear();
      const month = String(defeatedDate.getMonth() + 1).padStart(2, '0');
      const day = String(defeatedDate.getDate()).padStart(2, '0');
      const defeatedHours = String(defeatedDate.getHours()).padStart(2, '0');
      const defeatedMinutes = String(defeatedDate.getMinutes()).padStart(2, '0');
      const defeatedSeconds = String(defeatedDate.getSeconds()).padStart(2, '0');
      const defeatedAtStr = `${year}-${month}-${day}T${defeatedHours}:${defeatedMinutes}:${defeatedSeconds}`;
      
      await updateDragonDefeatedTime(roomIdRef.current, channelId, dragonType, defeatedAtStr);
      
      setRespawnTimeInput(null);
      // 웹소켓을 통해 자동으로 업데이트됨
      await loadWaterFireDragonRoom();
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || error?.message || '젠 예상 시간 업데이트에 실패했습니다.';
      if (!error?.code || error.code !== 'ECONNABORTED') {
        alert(`젠 예상 시간 업데이트 실패: ${errorMessage}`);
      }
    }
  };

  const handleResetChannelTimes = async (channelId: number) => {
    if (!roomIdRef.current || !roomData) return;
    
    const channel = roomData.channels.find(ch => ch.id === channelId);
    if (!channel) return;
    
    if (!window.confirm(`채널 ${channel.channelNumber}의 수룡/화룡 잡힌 시간을 모두 초기화하시겠습니까?`)) {
      return;
    }
    
    try {
      // 수룡과 화룡 시간을 모두 null로 설정
      await Promise.all([
        updateDragonDefeatedTime(roomIdRef.current, channelId, 'water', ''),
        updateDragonDefeatedTime(roomIdRef.current, channelId, 'fire', '')
      ]);
      
      // 웹소켓을 통해 자동으로 업데이트됨
      await loadWaterFireDragonRoom();
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || error?.message || '채널 정보 초기화에 실패했습니다.';
      if (!error?.code || error.code !== 'ECONNABORTED') {
        alert(`채널 정보 초기화 실패: ${errorMessage}`);
      }
    }
  };

  const handleResetDragonTime = async (channelId: number, dragonType: 'water' | 'fire') => {
    if (!roomIdRef.current || !roomData) return;
    
    const channel = roomData.channels.find(ch => ch.id === channelId);
    if (!channel) return;
    
    const dragonName = dragonType === 'water' ? '수룡' : '화룡';
    if (!window.confirm(`채널 ${channel.channelNumber}의 ${dragonName} 잡힌 시간을 초기화하시겠습니까?`)) {
      return;
    }
    
    try {
      await updateDragonDefeatedTime(roomIdRef.current, channelId, dragonType, '');
      // 웹소켓을 통해 자동으로 업데이트됨
      await loadWaterFireDragonRoom();
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || error?.message || `${dragonName} 정보 초기화에 실패했습니다.`;
      if (!error?.code || error.code !== 'ECONNABORTED') {
        alert(`${dragonName} 정보 초기화 실패: ${errorMessage}`);
      }
    }
  };

  const handleToggleChannelSelection = (channelId: number) => {
    setSelectedChannels(prev => {
      const newSet = new Set(prev);
      if (newSet.has(channelId)) {
        newSet.delete(channelId);
      } else {
        newSet.add(channelId);
      }
      return newSet;
    });
  };

  const handleSelectAllChannels = () => {
    if (!roomData) return;
    
    if (selectedChannels.size === roomData.channels.length) {
      // 모두 선택되어 있으면 모두 해제
      setSelectedChannels(new Set());
    } else {
      // 모두 선택
      const allChannelIds = new Set(roomData.channels.map(ch => ch.id));
      setSelectedChannels(allChannelIds);
    }
  };

  const handleDeleteSelectedChannels = async () => {
    if (!roomIdRef.current || !roomData) {
      alert('삭제할 채널을 선택해주세요.');
      return;
    }

    if (selectedChannels.size === 0) {
      alert('삭제할 채널을 선택해주세요.');
      return;
    }

    const selectedChannelNumbers = Array.from(selectedChannels)
      .map(id => {
        const channel = roomData.channels.find(c => c.id === id);
        return channel ? channel.channelNumber : null;
      })
      .filter(num => num !== null) as number[];

    if (!window.confirm(`선택한 ${selectedChannels.size}개의 채널(${selectedChannelNumbers.join(', ')})을(를) 삭제하시겠습니까?`)) {
      return;
    }

    try {
      // 선택된 모든 채널 삭제
      const deletePromises = Array.from(selectedChannels).map(channelId => 
        deleteChannel(roomIdRef.current!, channelId)
      );
      await Promise.all(deletePromises);
      
      // 즉시 로컬 상태 업데이트
      setRoomData({
        ...roomData,
        channels: roomData.channels.filter(c => !selectedChannels.has(c.id))
      });
      
      // 선택 초기화
      setSelectedChannels(new Set());
      
      // WebSocket이 최신 상태를 브로드캐스트하므로 별도 동기화 불필요
    } catch (err: any) {
      // 에러 발생 시 조용히 처리 (WebSocket이 최신 상태를 전송)
      const errorMessage = err.response?.data?.error || '채널 삭제에 실패했습니다.';
      if (!errorMessage.includes('timeout') && !errorMessage.includes('ECONNABORTED')) {
        alert(errorMessage);
      }
    }
  };

  if (loading) {
    return <div>로딩 중...</div>;
  }

  if (error || !roomData) {
    return <div style={{ color: 'red' }}>{error || '방 정보를 불러올 수 없습니다.'}</div>;
  }

  // roomData와 currentTime이 변경될 때마다 상태 재계산
  const respawnStatusChannels = useMemo(() => {
    if (!roomData) return { now: [], soon: [], waiting: [], done: [] };
    
    const now: Array<{ channel: Channel; dragonType: 'water' | 'fire'; respawnTime: Date; remaining: number }> = [];
    const soon: Array<{ channel: Channel; dragonType: 'water' | 'fire'; respawnTime: Date; remaining: number }> = [];
    const waiting: Array<{ channel: Channel; dragonType: 'water' | 'fire'; respawnTime: Date; remaining: number }> = [];
    const done: Array<{ channel: Channel; dragonType: 'water' | 'fire'; respawnTime: Date; remaining: number }> = [];
    
    roomData.channels.forEach(channel => {
      const waterRespawn = getWaterDragonRespawnTime(channel.waterDragonDefeatedAt);
      const fireRespawn = getFireDragonRespawnTime(channel.fireDragonDefeatedAt);
      
      if (waterRespawn && channel.waterDragonDefeatedAt) {
        const remaining = getRemainingMinutes(waterRespawn);
        if (remaining !== null) {
          const item = { channel, dragonType: 'water' as const, respawnTime: waterRespawn, remaining };
          if (remaining >= -5 && remaining <= 5) {
            now.push(item);
          } else if (remaining > 5 && remaining <= 10) {
            soon.push(item);
          } else if (remaining > 10) {
            waiting.push(item);
          } else {
            done.push(item);
          }
        }
      }
      
      if (fireRespawn && channel.fireDragonDefeatedAt) {
        const remaining = getRemainingMinutes(fireRespawn);
        if (remaining !== null) {
          const item = { channel, dragonType: 'fire' as const, respawnTime: fireRespawn, remaining };
          if (remaining >= -5 && remaining <= 5) {
            now.push(item);
          } else if (remaining > 5 && remaining <= 10) {
            soon.push(item);
          } else if (remaining > 10) {
            waiting.push(item);
          } else {
            done.push(item);
          }
        }
      }
    });
    
    // 각 그룹 내에서 재젠 시간 순으로 정렬
    const sortByTime = (a: typeof now[0], b: typeof now[0]) => a.respawnTime.getTime() - b.respawnTime.getTime();
    now.sort(sortByTime);
    soon.sort(sortByTime);
    waiting.sort(sortByTime);
    done.sort(sortByTime);
    
    return { now, soon, waiting, done };
  }, [roomData, currentTime, getWaterDragonRespawnTime, getFireDragonRespawnTime, getRemainingMinutes]);

  return (
    <div className="raid-room-container">
      <div className="header">
        <div className="header-left" style={{ flex: 1, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '15px' }}>
          <button className="btn-back" onClick={() => navigate('/')}>
            ← 뒤로
          </button>
          <h1 style={{ fontSize: '18px', color: '#666', margin: 0, fontWeight: 'normal' }}>수화룡 레이드</h1>
        </div>
        <div className="header-title" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px', color: '#666' }}>현재 시간</span>
          {currentTime && (
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#333' }}>
              {currentTime}
            </div>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingRight: '20px', position: 'relative' }}>
          <button
            data-settings-button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            ⚙️ 설정
          </button>
          {showSettings && (
            <div
              data-settings-panel
              style={{
                position: 'absolute',
                top: '100%',
                right: '0',
                marginTop: '8px',
                background: 'white',
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '16px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                zIndex: 1000,
                minWidth: '250px'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ marginBottom: '12px', fontWeight: 'bold', fontSize: '16px' }}>젠 시간 설정</div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#333' }}>
                  수룡 젠 시간 (분)
                </label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={waterRespawnMinutes}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (!isNaN(value) && value > 0) {
                      setWaterRespawnMinutes(value);
                      localStorage.setItem('waterRespawnMinutes', value.toString());
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '14px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#333' }}>
                  화룡 젠 시간 (분)
                </label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={fireRespawnMinutes}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (!isNaN(value) && value > 0) {
                      setFireRespawnMinutes(value);
                      localStorage.setItem('fireRespawnMinutes', value.toString());
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '14px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '14px',
                  background: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                닫기
              </button>
            </div>
          )}
        </div>
      </div>
      
      <div className="content">
        {/* 젠 상태별 채널 표시 */}
        {(respawnStatusChannels.now.length > 0 || respawnStatusChannels.soon.length > 0) && (
          <div style={{ marginBottom: '5px' }}>
            {/* 지금 젠됨 (0~5분) */}
            {respawnStatusChannels.now.length > 0 && (
              <div style={{
                background: '#ffebee',
                border: '2px solid #f44336',
                borderRadius: '8px',
                padding: '10px',
                marginBottom: '5px'
              }}>
                <h3 style={{ margin: '0 0 12px 0', color: '#c62828', fontSize: '16px', fontWeight: 'bold' }}>
                  🔴 지금 젠됨! (±5분) <span style={{ fontSize: '14px', fontWeight: 'normal' }}>({respawnStatusChannels.now.length}개)</span>
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {respawnStatusChannels.now.map(({ channel, dragonType, respawnTime, remaining }) => {
                    return (
                      <div key={`${channel.id}-${dragonType}`} style={{
                        background: 'white',
                        padding: '12px 16px',
                        borderRadius: '6px',
                        border: '2px solid #f44336',
                        boxShadow: '0 2px 4px rgba(244, 67, 54, 0.2)',
                        minWidth: '200px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                          <strong style={{ fontSize: '15px' }}>채널 {channel.channelNumber}</strong>
                          <span style={{ marginLeft: '8px', fontSize: '14px' }}>
                            {dragonType === 'water' ? '💧 수룡' : '🔥 화룡'}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                          젠 예상 시간: {respawnTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </div>
                        <div style={{ fontSize: '13px', color: '#c62828', fontWeight: 'bold', marginTop: '4px' }}>
                          젠까지 남은 시간: {remaining}분
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* 곧 젠됨 (5~10분) */}
            {respawnStatusChannels.soon.length > 0 && (
              <div style={{
                background: '#fff3e0',
                border: '2px solid #ff9800',
                borderRadius: '8px',
                padding: '10px',
                marginBottom: '5px'
              }}>
                <h3 style={{ margin: '0 0 12px 0', color: '#e65100', fontSize: '16px', fontWeight: 'bold' }}>
                  🟠 곧 젠됨 (5~10분) <span style={{ fontSize: '14px', fontWeight: 'normal' }}>({respawnStatusChannels.soon.length}개)</span>
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {respawnStatusChannels.soon.map(({ channel, dragonType, respawnTime, remaining }) => {
                    return (
                      <div key={`${channel.id}-${dragonType}`} style={{
                        background: 'white',
                        padding: '12px 16px',
                        borderRadius: '6px',
                        border: '2px solid #ff9800',
                        boxShadow: '0 2px 4px rgba(255, 152, 0, 0.2)',
                        minWidth: '200px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                          <strong style={{ fontSize: '15px' }}>채널 {channel.channelNumber}</strong>
                          <span style={{ marginLeft: '8px', fontSize: '14px' }}>
                            {dragonType === 'water' ? '💧 수룡' : '🔥 화룡'}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                          젠 예상 시간: {respawnTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </div>
                        <div style={{ fontSize: '13px', color: '#e65100', fontWeight: 'bold', marginTop: '4px' }}>
                          젠까지 남은 시간: {remaining}분
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        
        <div className="channels-section" style={{ marginTop: '5px' }}>
          <div className="channels-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>채널 목록</h2>
              <button className="btn-add" onClick={handleAddChannel}>
                + 채널 추가
              </button>
            </div>
            <div style={{ fontSize: '11px', color: '#888', lineHeight: '1.4', maxWidth: '500px', padding: '4px 0' }}>
              <span style={{ display: 'inline-block', marginRight: '8px' }}>💡 <strong>사용법:</strong></span>
              <span style={{ display: 'inline-block', marginRight: '6px' }}>방금</span>
              <span style={{ display: 'inline-block', marginRight: '6px' }}>•</span>
              <span style={{ display: 'inline-block', marginRight: '6px' }}>5분 전</span>
              <span style={{ display: 'inline-block', marginRight: '6px' }}>•</span>
              <span style={{ display: 'inline-block', marginRight: '6px' }}>수동(2022=20:22)</span>
              <span style={{ display: 'inline-block', marginRight: '6px' }}>•</span>
              <span style={{ display: 'inline-block' }}>젠 예상시간 수정 가능</span>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {selectedChannels.size > 0 && (
                <span style={{ fontSize: '14px', color: '#666' }}>
                  {selectedChannels.size}개 선택됨
                </span>
              )}
              <button
                onClick={handleSelectAllChannels}
                style={{
                  padding: '6px 12px',
                  fontSize: '13px',
                  background: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                {selectedChannels.size === roomData?.channels.length ? '전체 해제' : '전체 선택'}
              </button>
              <button 
                className="btn-delete" 
                onClick={handleDeleteSelectedChannels}
                style={{ 
                  padding: '8px 16px', 
                  fontSize: '14px', 
                  background: '#dc3545', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '4px', 
                  cursor: 'pointer' 
                }}
              >
                채널 삭제
              </button>
            </div>
          </div>
          <div className="channels-grid">
            {roomData.channels.length === 0 ? (
              <p>채널이 없습니다. 위의 "채널 추가" 버튼을 눌러주세요.</p>
            ) : (
              roomData.channels.map((channel) => {
                return (
                  <div 
                    key={channel.id} 
                    className="channel-card-small"
                    onClick={() => handleToggleChannelSelection(channel.id)}
                    style={{ cursor: 'pointer', border: selectedChannels.has(channel.id) ? '2px solid #2196F3' : '1px solid #ddd' }}
                  >
                    <div className="channel-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="checkbox"
                          checked={selectedChannels.has(channel.id)}
                          onChange={() => handleToggleChannelSelection(channel.id)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', pointerEvents: 'auto' }}
                        />
                        <h3>채널 {channel.channelNumber}</h3>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResetChannelTimes(channel.id);
                        }}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          background: '#f5f5f5',
                          color: '#666',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                        title="채널 정보 초기화"
                      >
                        초기화
                      </button>
                    </div>
                    
                    {/* 수룡 */}
                    <div style={{ marginBottom: '15px', padding: '10px', background: '#f0f8ff', borderRadius: '4px', border: '2px solid #2196F3' }}>
                      <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '14px' }}>💧 수룡</strong>
                        {channel.waterDragonDefeatedAt && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResetDragonTime(channel.id, 'water');
                            }}
                            style={{
                              padding: '3px 6px',
                              fontSize: '10px',
                              background: '#ffebee',
                              color: '#c62828',
                              border: '1px solid #ef5350',
                              borderRadius: '3px',
                              cursor: 'pointer'
                            }}
                            title="수룡 시간 초기화"
                          >
                            리셋
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleDragonTimeClick(channel.id, 'water')}
                          style={{ padding: '5px 10px', fontSize: '12px', background: '#bbdefb', color: '#1565c0', border: '1px solid #64b5f6', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          방금
                        </button>
                        <button
                          onClick={() => handleDragonTime5MinutesAgo(channel.id, 'water')}
                          style={{ padding: '5px 10px', fontSize: '12px', background: '#ffe0b2', color: '#e65100', border: '1px solid #ffb74d', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          5분 전
                        </button>
                        {dragonTimeInput?.channelId === channel.id && dragonTimeInput?.dragonType === 'water' ? (
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                              type="text"
                              placeholder="2022"
                              value={dragonTimeInput.time.replace(':', '')}
                              onChange={(e) => {
                                let value = e.target.value.replace(/\D/g, ''); // 숫자만 허용
                                if (value.length > 4) value = value.slice(0, 4); // 최대 4자리
                                
                                // 4자리 숫자를 HH:MM 형식으로 변환
                                if (value.length === 4) {
                                  const hours = value.slice(0, 2);
                                  const minutes = value.slice(2, 4);
                                  setDragonTimeInput({ channelId: channel.id, dragonType: 'water', time: `${hours}:${minutes}` });
                                } else {
                                  // 입력 중일 때는 그대로 저장 (나중에 포맷팅)
                                  setDragonTimeInput({ channelId: channel.id, dragonType: 'water', time: value });
                                }
                              }}
                              onBlur={(e) => {
                                let value = e.target.value.replace(/\D/g, '');
                                if (value.length === 4) {
                                  const hours = value.slice(0, 2);
                                  const minutes = value.slice(2, 4);
                                  setDragonTimeInput({ channelId: channel.id, dragonType: 'water', time: `${hours}:${minutes}` });
                                } else if (value.length > 0) {
                                  // 4자리가 아니면 현재 시간으로 채움
                                  const now = new Date();
                                  const hours = String(now.getHours()).padStart(2, '0');
                                  const minutes = String(now.getMinutes()).padStart(2, '0');
                                  setDragonTimeInput({ channelId: channel.id, dragonType: 'water', time: `${hours}:${minutes}` });
                                }
                              }}
                              style={{ padding: '4px', fontSize: '12px', width: '60px', border: '1px solid #ccc', borderRadius: '3px', textAlign: 'center' }}
                            />
                            <button
                              onClick={() => {
                                let timeValue = dragonTimeInput.time.replace(/\D/g, '');
                                if (timeValue.length === 4) {
                                  const hours = timeValue.slice(0, 2);
                                  const minutes = timeValue.slice(2, 4);
                                  handleDragonTimeInputSave(channel.id, 'water', `${hours}:${minutes}`);
                                } else {
                                  handleDragonTimeInputSave(channel.id, 'water');
                                }
                              }}
                              style={{ padding: '4px 8px', fontSize: '12px', background: '#c8e6c9', color: '#1b5e20', border: '1px solid #81c784', borderRadius: '3px', cursor: 'pointer' }}
                            >
                              등록
                            </button>
                            <button
                              onClick={() => setDragonTimeInput(null)}
                              style={{ padding: '4px 8px', fontSize: '12px', background: '#e0e0e0', color: '#424242', border: '1px solid #9e9e9e', borderRadius: '3px', cursor: 'pointer' }}
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              const now = new Date();
                              const hours = String(now.getHours()).padStart(2, '0');
                              const minutes = String(now.getMinutes()).padStart(2, '0');
                              setDragonTimeInput({ channelId: channel.id, dragonType: 'water', time: `${hours}:${minutes}` });
                            }}
                            style={{ padding: '5px 10px', fontSize: '12px', background: '#e0e0e0', color: '#424242', border: '1px solid #9e9e9e', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            수동
                          </button>
                        )}
                      </div>
                      {(() => {
                        const waterRespawn = getWaterDragonRespawnTime(channel.waterDragonDefeatedAt);
                        const waterRemaining = getRemainingMinutes(waterRespawn);
                        return channel.waterDragonDefeatedAt ? (
                          <div style={{ fontSize: '13px', color: '#333', marginTop: '5px', minHeight: '70px' }}>
                            <div style={{ marginBottom: '3px' }}>
                              <strong>잡힌 시간:</strong> {new Date(channel.waterDragonDefeatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                            </div>
                            {waterRespawn && (
                              <div style={{ marginBottom: '3px', fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <strong>젠 예상 시간:</strong>
                                {respawnTimeInput?.channelId === channel.id && respawnTimeInput?.dragonType === 'water' ? (
                                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <input
                                      type="text"
                                      placeholder="2022"
                                      value={respawnTimeInput.time.replace(':', '')}
                                      onChange={(e) => {
                                        let value = e.target.value.replace(/\D/g, ''); // 숫자만 허용
                                        if (value.length > 4) value = value.slice(0, 4); // 최대 4자리
                                        
                                        // 4자리 숫자를 HH:MM 형식으로 변환
                                        if (value.length === 4) {
                                          const hours = value.slice(0, 2);
                                          const minutes = value.slice(2, 4);
                                          setRespawnTimeInput({ channelId: channel.id, dragonType: 'water', time: `${hours}:${minutes}` });
                                        } else {
                                          setRespawnTimeInput({ channelId: channel.id, dragonType: 'water', time: value });
                                        }
                                      }}
                                      onBlur={(e) => {
                                        let value = e.target.value.replace(/\D/g, '');
                                        if (value.length === 4) {
                                          const hours = value.slice(0, 2);
                                          const minutes = value.slice(2, 4);
                                          setRespawnTimeInput({ channelId: channel.id, dragonType: 'water', time: `${hours}:${minutes}` });
                                        }
                                      }}
                                      style={{ padding: '3px', fontSize: '11px', width: '50px', border: '1px solid #ccc', borderRadius: '3px', textAlign: 'center' }}
                                    />
                                    <button
                                      onClick={() => {
                                        let timeValue = respawnTimeInput.time.replace(/\D/g, '');
                                        if (timeValue.length === 4) {
                                          const hours = timeValue.slice(0, 2);
                                          const minutes = timeValue.slice(2, 4);
                                          handleRespawnTimeInputSave(channel.id, 'water', `${hours}:${minutes}`);
                                        }
                                      }}
                                      style={{ padding: '3px 6px', fontSize: '11px', background: '#c8e6c9', color: '#1b5e20', border: '1px solid #81c784', borderRadius: '3px', cursor: 'pointer' }}
                                    >
                                      저장
                                    </button>
                                    <button
                                      onClick={() => setRespawnTimeInput(null)}
                                      style={{ padding: '3px 6px', fontSize: '11px', background: '#e0e0e0', color: '#424242', border: '1px solid #9e9e9e', borderRadius: '3px', cursor: 'pointer' }}
                                    >
                                      취소
                                    </button>
                                  </div>
                                ) : (
                                  <span>
                                    {waterRespawn.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const hours = String(waterRespawn.getHours()).padStart(2, '0');
                                        const minutes = String(waterRespawn.getMinutes()).padStart(2, '0');
                                        setRespawnTimeInput({ channelId: channel.id, dragonType: 'water', time: `${hours}:${minutes}` });
                                      }}
                                      style={{ marginLeft: '6px', padding: '2px 6px', fontSize: '10px', background: '#f5f5f5', color: '#666', border: '1px solid #ddd', borderRadius: '3px', cursor: 'pointer' }}
                                    >
                                      수정
                                    </button>
                                  </span>
                                )}
                              </div>
                            )}
                            {waterRespawn && waterRemaining !== null && (
                              <div style={{ 
                                color: waterRemaining <= 5 ? '#dc3545' : waterRemaining <= 10 ? '#ff9800' : '#333',
                                fontWeight: 'bold',
                                fontSize: '14px'
                              }}>
                                <strong>젠까지 남은 시간:</strong> {waterRemaining}분
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ fontSize: '12px', color: '#999', marginTop: '5px', minHeight: '70px', display: 'flex', alignItems: 'center' }}>아직 잡히지 않음</div>
                        );
                      })()}
                    </div>
                    
                    {/* 화룡 */}
                    <div style={{ padding: '10px', background: '#fff5f5', borderRadius: '4px', border: '2px solid #f44336' }}>
                      <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '14px' }}>🔥 화룡</strong>
                        {channel.fireDragonDefeatedAt && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResetDragonTime(channel.id, 'fire');
                            }}
                            style={{
                              padding: '3px 6px',
                              fontSize: '10px',
                              background: '#ffebee',
                              color: '#c62828',
                              border: '1px solid #ef5350',
                              borderRadius: '3px',
                              cursor: 'pointer'
                            }}
                            title="화룡 시간 초기화"
                          >
                            리셋
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleDragonTimeClick(channel.id, 'fire')}
                          style={{ padding: '5px 10px', fontSize: '12px', background: '#bbdefb', color: '#1565c0', border: '1px solid #64b5f6', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          방금
                        </button>
                        <button
                          onClick={() => handleDragonTime5MinutesAgo(channel.id, 'fire')}
                          style={{ padding: '5px 10px', fontSize: '12px', background: '#ffe0b2', color: '#e65100', border: '1px solid #ffb74d', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          5분 전
                        </button>
                        {dragonTimeInput?.channelId === channel.id && dragonTimeInput?.dragonType === 'fire' ? (
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                              type="text"
                              placeholder="2022"
                              value={dragonTimeInput.time.replace(':', '')}
                              onChange={(e) => {
                                let value = e.target.value.replace(/\D/g, ''); // 숫자만 허용
                                if (value.length > 4) value = value.slice(0, 4); // 최대 4자리
                                
                                // 4자리 숫자를 HH:MM 형식으로 변환
                                if (value.length === 4) {
                                  const hours = value.slice(0, 2);
                                  const minutes = value.slice(2, 4);
                                  setDragonTimeInput({ channelId: channel.id, dragonType: 'fire', time: `${hours}:${minutes}` });
                                } else {
                                  setDragonTimeInput({ channelId: channel.id, dragonType: 'fire', time: value });
                                }
                              }}
                              onBlur={(e) => {
                                let value = e.target.value.replace(/\D/g, '');
                                if (value.length === 4) {
                                  const hours = value.slice(0, 2);
                                  const minutes = value.slice(2, 4);
                                  setDragonTimeInput({ channelId: channel.id, dragonType: 'fire', time: `${hours}:${minutes}` });
                                } else if (value.length > 0) {
                                  // 4자리가 아니면 현재 시간으로 채움
                                  const now = new Date();
                                  const hours = String(now.getHours()).padStart(2, '0');
                                  const minutes = String(now.getMinutes()).padStart(2, '0');
                                  setDragonTimeInput({ channelId: channel.id, dragonType: 'fire', time: `${hours}:${minutes}` });
                                }
                              }}
                              style={{ padding: '4px', fontSize: '12px', width: '60px', border: '1px solid #ccc', borderRadius: '3px', textAlign: 'center' }}
                            />
                            <button
                              onClick={() => {
                                let timeValue = dragonTimeInput.time.replace(/\D/g, '');
                                if (timeValue.length === 4) {
                                  const hours = timeValue.slice(0, 2);
                                  const minutes = timeValue.slice(2, 4);
                                  handleDragonTimeInputSave(channel.id, 'fire', `${hours}:${minutes}`);
                                } else {
                                  handleDragonTimeInputSave(channel.id, 'fire');
                                }
                              }}
                              style={{ padding: '4px 8px', fontSize: '12px', background: '#c8e6c9', color: '#1b5e20', border: '1px solid #81c784', borderRadius: '3px', cursor: 'pointer' }}
                            >
                              등록
                            </button>
                            <button
                              onClick={() => setDragonTimeInput(null)}
                              style={{ padding: '4px 8px', fontSize: '12px', background: '#e0e0e0', color: '#424242', border: '1px solid #9e9e9e', borderRadius: '3px', cursor: 'pointer' }}
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              const now = new Date();
                              const hours = String(now.getHours()).padStart(2, '0');
                              const minutes = String(now.getMinutes()).padStart(2, '0');
                              setDragonTimeInput({ channelId: channel.id, dragonType: 'fire', time: `${hours}:${minutes}` });
                            }}
                            style={{ padding: '5px 10px', fontSize: '12px', background: '#e0e0e0', color: '#424242', border: '1px solid #9e9e9e', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            수동
                          </button>
                        )}
                      </div>
                      {(() => {
                        const fireRespawn = getFireDragonRespawnTime(channel.fireDragonDefeatedAt);
                        const fireRemaining = getRemainingMinutes(fireRespawn);
                        return channel.fireDragonDefeatedAt ? (
                          <div style={{ fontSize: '13px', color: '#333', marginTop: '5px', minHeight: '70px' }}>
                            <div style={{ marginBottom: '3px' }}>
                              <strong>잡힌 시간:</strong> {new Date(channel.fireDragonDefeatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                            </div>
                            {fireRespawn && (
                              <div style={{ marginBottom: '3px', fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <strong>젠 예상 시간:</strong>
                                {respawnTimeInput?.channelId === channel.id && respawnTimeInput?.dragonType === 'fire' ? (
                                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <input
                                      type="text"
                                      placeholder="2022"
                                      value={respawnTimeInput.time.replace(':', '')}
                                      onChange={(e) => {
                                        let value = e.target.value.replace(/\D/g, ''); // 숫자만 허용
                                        if (value.length > 4) value = value.slice(0, 4); // 최대 4자리
                                        
                                        // 4자리 숫자를 HH:MM 형식으로 변환
                                        if (value.length === 4) {
                                          const hours = value.slice(0, 2);
                                          const minutes = value.slice(2, 4);
                                          setRespawnTimeInput({ channelId: channel.id, dragonType: 'fire', time: `${hours}:${minutes}` });
                                        } else {
                                          setRespawnTimeInput({ channelId: channel.id, dragonType: 'fire', time: value });
                                        }
                                      }}
                                      onBlur={(e) => {
                                        let value = e.target.value.replace(/\D/g, '');
                                        if (value.length === 4) {
                                          const hours = value.slice(0, 2);
                                          const minutes = value.slice(2, 4);
                                          setRespawnTimeInput({ channelId: channel.id, dragonType: 'fire', time: `${hours}:${minutes}` });
                                        }
                                      }}
                                      style={{ padding: '3px', fontSize: '11px', width: '50px', border: '1px solid #ccc', borderRadius: '3px', textAlign: 'center' }}
                                    />
                                    <button
                                      onClick={() => {
                                        let timeValue = respawnTimeInput.time.replace(/\D/g, '');
                                        if (timeValue.length === 4) {
                                          const hours = timeValue.slice(0, 2);
                                          const minutes = timeValue.slice(2, 4);
                                          handleRespawnTimeInputSave(channel.id, 'fire', `${hours}:${minutes}`);
                                        }
                                      }}
                                      style={{ padding: '3px 6px', fontSize: '11px', background: '#c8e6c9', color: '#1b5e20', border: '1px solid #81c784', borderRadius: '3px', cursor: 'pointer' }}
                                    >
                                      저장
                                    </button>
                                    <button
                                      onClick={() => setRespawnTimeInput(null)}
                                      style={{ padding: '3px 6px', fontSize: '11px', background: '#e0e0e0', color: '#424242', border: '1px solid #9e9e9e', borderRadius: '3px', cursor: 'pointer' }}
                                    >
                                      취소
                                    </button>
                                  </div>
                                ) : (
                                  <span>
                                    {fireRespawn.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const hours = String(fireRespawn.getHours()).padStart(2, '0');
                                        const minutes = String(fireRespawn.getMinutes()).padStart(2, '0');
                                        setRespawnTimeInput({ channelId: channel.id, dragonType: 'fire', time: `${hours}:${minutes}` });
                                      }}
                                      style={{ marginLeft: '6px', padding: '2px 6px', fontSize: '10px', background: '#f5f5f5', color: '#666', border: '1px solid #ddd', borderRadius: '3px', cursor: 'pointer' }}
                                    >
                                      수정
                                    </button>
                                  </span>
                                )}
                              </div>
                            )}
                            {fireRespawn && fireRemaining !== null && (
                              <div style={{ 
                                color: fireRemaining <= 5 ? '#dc3545' : fireRemaining <= 10 ? '#ff9800' : '#333',
                                fontWeight: 'bold',
                                fontSize: '14px'
                              }}>
                                <strong>젠까지 남은 시간:</strong> {fireRemaining}분
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ fontSize: '12px', color: '#999', marginTop: '5px', minHeight: '70px', display: 'flex', alignItems: 'center' }}>아직 잡히지 않음</div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DragonWaterFireRoomPage;

