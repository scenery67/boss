import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getRaidRoom, createChannel, deleteChannel, markDefeated, completeRaidRoom, deleteRaidRoom, updateChannelMemo, toggleChannelSelection, updateChannelBossColor, toggleParticipation, createChannelsBatch } from '../services/BossService';
import { User, RaidRoomData, Channel, Participant } from '../types';
import { websocketService } from '../services/websocket';
import { createWorker } from 'tesseract.js';

interface RaidRoomPageProps {
  user: User;
}

const RaidRoomPage: React.FC<RaidRoomPageProps> = ({ user }) => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [roomData, setRoomData] = useState<RaidRoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingMemo, setEditingMemo] = useState<{ channelId: number; memo: string } | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [selectingBossColor, setSelectingBossColor] = useState<{ channelId: number; bossType: string } | null>(null);
  const [isParticipating, setIsParticipating] = useState<boolean>(false);
  const wsSubscriptionRef = useRef<(() => void) | null>(null);
  const wsUsersSubscriptionRef = useRef<(() => void) | null>(null);
  const websocketTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isAddingChannelRef = useRef<boolean>(false);

  useEffect(() => {
    if (roomId) {
      loadRoomInfo();
      connectWebSocket();
    }

    return () => {
      // 레이드 방 접속 해제 알림
      if (user && user.id && roomId) {
        const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
        if (userId) {
          websocketService.send('/app/raid-room/disconnect', {});
        }
      }
      
      // WebSocket 구독 해제
      if (wsSubscriptionRef.current) {
        wsSubscriptionRef.current();
        wsSubscriptionRef.current = null;
      }
      if (wsUsersSubscriptionRef.current) {
        wsUsersSubscriptionRef.current();
        wsUsersSubscriptionRef.current = null;
      }
    };
  }, [roomId]);

  // ESC 또는 Backspace 키로 뒤로 가기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // input, textarea 등 입력 필드에 포커스가 있으면 무시
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // ESC 키 또는 Backspace 키
      if (e.key === 'Escape' || e.key === 'Backspace') {
        // 완료된 레이드 목록에서 온 경우 완료된 레이드 목록으로 돌아가기
        if ((location.state as any)?.fromCompleted) {
          navigate('/completed');
        } else {
          // 일반 레이드 방 목록에서 온 경우 레이드 방 목록으로 이동
          navigate('/');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [navigate, location]);

  const loadRoomInfo = async (forceRefresh: boolean = false, silent: boolean = false) => {
    if (!roomId) return;

    try {
      if (!silent) {
        setLoading(true);
      }
      const data = await getRaidRoom(parseInt(roomId), forceRefresh);
      
      // 채널 메모 데이터 정규화 (빈 문자열을 null로 변환하지 않음)
      if (data && data.channels) {
        data.channels = data.channels.map((ch: any) => ({
          ...ch,
          memo: ch.memo || ''
        }));
        
        // 현재 사용자가 선택한 채널 찾기
        if (user && user.id && data.channels) {
          const userChannel = data.channels.find((ch: any) => 
            ch.users && ch.users.some((u: any) => u.userId === user.id && u.isMoving === true)
          );
          if (userChannel) {
            setSelectedChannelId(userChannel.id);
          } else if (forceRefresh && !silent) {
            // 강제 새로고침 시에만 선택 해제 (서버에서 제거된 경우)
            setSelectedChannelId(null);
          }
        }
      }
      
      // connectedUsers가 없으면 빈 배열로 초기화
      if (data && !data.connectedUsers) {
        data.connectedUsers = [];
      }
      
      // 현재 사용자의 참석 상태 확인
      if (data && data.participants && user && user.id) {
        const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
        const isParticipating = data.participants.some((p: Participant) => p.userId === userId);
        setIsParticipating(isParticipating);
      }
      
      setRoomData(data);
    } catch (err: any) {
      if (!silent) {
        setError('방 정보를 불러올 수 없습니다.');
      }
      console.error(err);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const connectWebSocket = () => {
    if (!roomId || !user || !user.id) return;

    const sendConnectMessage = () => {
      const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
      if (userId && roomId && websocketService.isConnected()) {
        websocketService.send('/app/raid-room/connect', {
          roomId: parseInt(roomId),
          userId: userId
        });
      }
    };

    // WebSocket 서비스 연결
    if (!websocketService.isConnected()) {
      websocketService.connect();
      // 연결 완료 후 접속 알림을 보내기 위해 약간의 지연
      // WebSocket 연결이 완료될 때까지 여러 번 시도
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
      // 이미 연결되어 있으면 즉시 접속 알림
      sendConnectMessage();
    }

    // 이전 구독 해제
    if (wsSubscriptionRef.current) {
      wsSubscriptionRef.current();
    }

    // 레이드 방 업데이트 구독
    const unsubscribe = websocketService.subscribe(`/topic/raid-room/${roomId}`, (data: RaidRoomData | any) => {
      // 증분 업데이트인 경우 (빠른 반응을 위한 알림)
      if (data.type === 'incremental_update') {
        // 증분 업데이트에 채널 데이터가 있으면 즉시 업데이트 (빠른 반응)
        if (data.channels && Array.isArray(data.channels)) {
          setRoomData((prevData) => {
            if (!prevData) return prevData;
            return {
              ...prevData,
              channels: data.channels,
              participants: data.participants || prevData.participants,
              connectedUsers: data.connectedUsers || prevData.connectedUsers
            };
          });
          console.debug("증분 업데이트로 UI 즉시 업데이트:", roomId);
        }
        // 전체 데이터는 백그라운드에서 올 예정이므로 여기서는 반환
        return;
      }
      
      // 웹소켓 메시지 수신 시 타임아웃 취소 및 채널 추가 플래그 해제
      if (websocketTimeoutRef.current) {
        clearTimeout(websocketTimeoutRef.current);
        websocketTimeoutRef.current = null;
      }
      if (isAddingChannelRef.current) {
        isAddingChannelRef.current = false;
      }
      
      // 서버에서 받은 데이터로 상태 업데이트
      if (data && data.channels) {
        // 채널을 channelNumber로 정렬하여 순서 유지
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
        
        // 현재 사용자가 선택한 채널 찾기
        if (user && user.id && data.channels) {
          const userChannel = data.channels.find((ch: any) => 
            ch.users && ch.users.some((u: any) => u.userId === user.id && u.isMoving === true)
          );
          if (userChannel) {
            setSelectedChannelId(userChannel.id);
          } else {
            // 사용자가 이동중이 아닌 채널에 있으면 선택 해제하지 않음 (로컬 선택 유지)
          }
        }
      }
      // connectedUsers도 함께 업데이트
      
      // 현재 사용자의 참석 상태 확인
      if (data && data.participants && user && user.id) {
        const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
        const isParticipating = data.participants.some((p: Participant) => p.userId === userId);
        setIsParticipating(isParticipating);
      }
      
      if (data.connectedUsers) {
        setRoomData(data);
      } else {
        // connectedUsers가 없으면 기존 데이터 유지하되, 빈 배열로 초기화
        setRoomData((prevData) => ({
          ...data,
          connectedUsers: prevData?.connectedUsers || []
        }));
      }
    });

    wsSubscriptionRef.current = unsubscribe;
    
    // 접속 사용자 목록 구독
    if (wsUsersSubscriptionRef.current) {
      wsUsersSubscriptionRef.current();
    }
    const unsubscribeUsers = websocketService.subscribe(`/topic/raid-room/${roomId}/users`, (data: any) => {
      if (data && data.users) {
        setRoomData((prevData) => {
          if (!prevData) return prevData;
          return {
            ...prevData,
            connectedUsers: data.users
          };
        });
      }
    });
    wsUsersSubscriptionRef.current = unsubscribeUsers;
  };

  const processImageFromClipboard = async (file: File) => {
    if (!roomId || !roomData) return;

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
      const result = await createChannelsBatch(parseInt(roomId), newChannelNumbers);
      
      if (result.success) {
        alert(`${result.created?.length || newChannelNumbers.length}개의 채널이 생성되었습니다.`);
        // 웹소켓을 통해 자동으로 업데이트됨
        setTimeout(() => {
          loadRoomInfo(true, true);
        }, 1000);
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

    if (!roomId || !roomData) return;

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
    input.focus();
    
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
        console.debug('cleanup error (ignored):', err);
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

      // 즉시 로컬 상태 업데이트 (낙관적 업데이트)
      const tempChannelId = Date.now(); // 임시 ID (에러 처리에서도 사용)
      const newChannel: Channel = {
        id: tempChannelId,
        channelNumber: channelNum,
        isDefeated: false,
        memo: '',
        users: []
      };
      setRoomData({
        ...roomData,
        channels: [...roomData.channels, newChannel]
      });

      try {
        const result = await createChannel(parseInt(roomId), channelNum);
        
        if (result.success) {
          // 웹소켓 메시지가 도착하면 서버 데이터로 덮어쓰기됨
          // 타임아웃 안전장치: 웹소켓이 실패하면 API로 폴백 (1초 후)
          if (websocketTimeoutRef.current) {
            clearTimeout(websocketTimeoutRef.current);
          }
          websocketTimeoutRef.current = setTimeout(() => {
            loadRoomInfo(true, true); // silent 모드
            websocketTimeoutRef.current = null;
            isAddingChannelRef.current = false;
          }, 1000); // 1초로 단축
        } else {
          // 실패 시 로컬 상태 롤백
          setRoomData({
            ...roomData,
            channels: roomData.channels.filter(ch => ch.id !== tempChannelId)
          });
          const errorMessage = (result as any)?.error || '채널 생성에 실패했습니다.';
          alert(errorMessage);
          isAddingChannelRef.current = false;
        }
      } catch (err) {
        console.error('채널 생성 실패:', err);
        // 에러 발생 시 로컬 상태 롤백 (임시 채널 제거)
        if (roomData) {
          setRoomData({
            ...roomData,
            channels: roomData.channels.filter(ch => ch.id !== tempChannelId)
          });
        }
        const errorMessage = (err as any)?.response?.data?.error || '채널 생성에 실패했습니다.';
        alert(errorMessage);
        isAddingChannelRef.current = false;
        // 에러 발생 시 최신 데이터로 새로고침
        loadRoomInfo(true, true);
      }
    };
    
    // Enter 키로 확인
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        okBtn.click();
      }
    };
  };

  const handleDeleteChannel = async () => {
    if (!roomId || !selectedChannelId || !roomData) {
      alert('삭제할 채널을 선택해주세요.');
      return;
    }

    if (!window.confirm(`채널 ${roomData.channels.find(c => c.id === selectedChannelId)?.channelNumber}을(를) 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await deleteChannel(parseInt(roomId), selectedChannelId);
      
      // 즉시 로컬 상태 업데이트
      setRoomData({
        ...roomData,
        channels: roomData.channels.filter(c => c.id !== selectedChannelId)
      });
      setSelectedChannelId(null);
      
      // WebSocket이 최신 상태를 브로드캐스트하므로 별도 동기화 불필요
    } catch (err: any) {
      // 에러 발생 시 조용히 처리 (WebSocket이 최신 상태를 전송)
    }
  };

  const handleMarkDefeated = async (channelId: number) => {
    if (!roomId || !roomData) return;

    try {
      // 즉시 로컬 상태 업데이트
      const updatedChannels = roomData.channels.map(ch => 
        ch.id === channelId ? { ...ch, isDefeated: !ch.isDefeated } : ch
      );
      setRoomData({ ...roomData, channels: updatedChannels });
      
      // 백그라운드에서 서버에 저장 (로딩 화면 없이)
      // WebSocket이 최신 상태를 브로드캐스트하므로 별도 동기화 불필요
      markDefeated(parseInt(roomId), channelId)
        .catch(() => {
          // 에러 발생 시 상태 복원 및 조용히 처리
          const updatedChannels = roomData.channels.map(ch => 
            ch.id === channelId ? { ...ch, isDefeated: !ch.isDefeated } : ch
          );
          setRoomData({ ...roomData, channels: updatedChannels });
        });
    } catch (err) {
      console.error('잡혔다 표시 실패:', err);
    }
  };

  const memoTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleMemoClick = (channel: Channel) => {
    if (roomData?.isCompleted) return;
    const memoValue = channel.memo && channel.memo.trim() !== '' ? channel.memo : '';
    setEditingMemo({ channelId: channel.id, memo: memoValue });
    // 다음 렌더링 사이클에서 textarea에 포커스
    setTimeout(() => {
      memoTextareaRef.current?.focus();
    }, 0);
  };

  const handleMemoSave = async (channelId: number) => {
    if (!roomId || !editingMemo || !roomData) return;

    try {
      const memoValue = editingMemo.memo.trim();
      
      // 즉시 로컬 상태 업데이트
      const updatedChannels = roomData.channels.map(ch => 
        ch.id === channelId ? { ...ch, memo: memoValue } : ch
      );
      setRoomData({ ...roomData, channels: updatedChannels });
      setEditingMemo(null);
      
      // 백그라운드에서 서버에 저장 (로딩 화면 없이)
      // WebSocket이 최신 상태를 브로드캐스트하므로 별도 동기화 불필요
      updateChannelMemo(parseInt(roomId), channelId, memoValue)
        .catch(() => {
          // 에러 발생 시 조용히 처리 (WebSocket이 최신 상태를 전송)
        });
    } catch (err) {
      console.error('메모 저장 실패:', err);
      alert('메모 저장에 실패했습니다.');
    }
  };

  const handleMemoCancel = () => {
    setEditingMemo(null);
  };

  // 채널 선택 (로컬 상태만 변경, DB 저장 없음)
  const handleChannelSelect = (channelId: number) => {
    if (roomData?.isCompleted) return;
    
    // 이미 선택된 채널이면 해제
    if (selectedChannelId === channelId) {
      setSelectedChannelId(null);
    } else {
      setSelectedChannelId(channelId);
    }
  };

  // 선택된 채널 완료 처리
  const handleMarkDefeatedSelected = async () => {
    if (!roomId || !selectedChannelId || roomData?.isCompleted) {
      if (!selectedChannelId) {
        alert('먼저 채널을 선택해주세요.');
      }
      return;
    }

    const selectedChannel = roomData?.channels.find(c => c.id === selectedChannelId);
    if (!selectedChannel) {
      return;
    }

    const isAlreadyDefeated = selectedChannel.isDefeated;
    const action = isAlreadyDefeated ? '완료 표시를 해제' : '사냥 완료 처리';
    
    if (!window.confirm(`해당 채널을 ${action}하시겠습니까?`)) {
      return;
    }

    // 기존 함수 재사용
    await handleMarkDefeated(selectedChannelId);
  };

  // 이동중 표시 (DB 저장 및 브로드캐스트)
  const handleSetMoving = async () => {
    if (!roomId || !user || !user.id || !selectedChannelId || roomData?.isCompleted) {
      if (!selectedChannelId) {
        alert('먼저 채널을 선택해주세요.');
      }
      return;
    }

    try {
      // userId를 숫자로 변환
      const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
      
      if (isNaN(userId) || userId <= 0) {
        console.error('유효하지 않은 사용자 ID:', user.id);
        alert('사용자 정보가 올바르지 않습니다. 다시 로그인해주세요.');
        return;
      }
      
      // 서버에 저장 (WebSocket으로 자동 업데이트됨)
      await toggleChannelSelection(parseInt(roomId), selectedChannelId, userId);
    } catch (err: any) {
      // 에러 발생 시 조용히 처리 (WebSocket이 최신 상태를 전송)
    }
  };

  // 이동중 해제
  const handleClearMoving = async () => {
    if (!roomId || !user || !user.id || !selectedChannelId || roomData?.isCompleted) {
      return;
    }

    try {
      const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
      
      if (isNaN(userId) || userId <= 0) {
        return;
      }
      
      // 현재 선택된 채널에서 이동중 해제 (WebSocket으로 자동 업데이트됨)
      await toggleChannelSelection(parseInt(roomId), selectedChannelId, userId);
    } catch (err: any) {
      // 에러 발생 시 조용히 처리 (WebSocket이 최신 상태를 전송)
    }
  };
  
  const getUserDisplayName = (participant: Participant) => {
    return participant.displayName || participant.username || '알 수 없음';
  };

  const handleBossTypeClick = (channelId: number, bossType: string) => {
    if (roomData?.isCompleted) return;
    setSelectingBossColor({ channelId, bossType });
  };

  const handleBossColorSelect = async (channelId: number, bossType: string, color: string) => {
    if (!roomId || !roomData) return;

    try {
      // 회색을 선택하면 색상을 제거 (null 또는 빈 문자열)
      const colorToSave = color === 'gray' ? null : color;
      
      // 즉시 로컬 상태 업데이트
      const updatedChannels = roomData.channels.map(ch => {
        if (ch.id === channelId) {
          const updated = { ...ch };
          switch (bossType) {
            case '흑': updated.bossHeukColor = colorToSave || undefined; break;
            case '진': updated.bossJinColor = colorToSave || undefined; break;
            case '묵': updated.bossMukColor = colorToSave || undefined; break;
            case '감': updated.bossGamColor = colorToSave || undefined; break;
          }
          return updated;
        }
        return ch;
      });
      setRoomData({ ...roomData, channels: updatedChannels });
      setSelectingBossColor(null);
      
      // 백그라운드에서 서버에 저장 (로딩 화면 없이)
      // 회색인 경우 null을 전송
      // WebSocket이 최신 상태를 브로드캐스트하므로 별도 동기화 불필요
      updateChannelBossColor(parseInt(roomId), channelId, bossType, colorToSave || '')
        .catch(() => {
          // 에러 발생 시 조용히 처리 (WebSocket이 최신 상태를 전송)
        });
    } catch (err) {
      console.error('보스 색상 선택 실패:', err);
    }
  };

  const getBossColor = (channel: Channel, bossType: string): string | undefined => {
    switch (bossType) {
      case '흑': return channel.bossHeukColor;
      case '진': return channel.bossJinColor;
      case '묵': return channel.bossMukColor;
      case '감': return channel.bossGamColor;
      default: return undefined;
    }
  };

  const getBossColorClass = (color?: string) => {
    if (!color) return '';
    switch (color) {
      case 'green': return 'boss-color-green';
      case 'yellow': return 'boss-color-yellow';
      case 'orange': return 'boss-color-orange';
      case 'red': return 'boss-color-red';
      case 'gray': return 'boss-color-gray';
      default: return '';
    }
  };

  const handleCompleteRaid = async () => {
    if (!roomId) return;
    
    if (!window.confirm('레이드를 완료하시겠습니까? 완료된 레이드는 수정할 수 없습니다.')) {
      return;
    }

    try {
      await completeRaidRoom(parseInt(roomId));
      await loadRoomInfo(true);
      alert('레이드가 완료되었습니다.');
    } catch (err: any) {
      alert(err.response?.data?.error || '레이드 완료 처리에 실패했습니다.');
      console.error('레이드 완료 실패:', err);
    }
  };

  const handleDeleteRaid = async () => {
    if (!roomId) return;
    
    if (!window.confirm('정말로 이 레이드 방을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      return;
    }

    try {
      await deleteRaidRoom(parseInt(roomId));
      alert('레이드 방이 삭제되었습니다.');
      navigate('/'); // 삭제 후 목록 페이지로 이동
    } catch (err: any) {
      alert(err.response?.data?.error || '레이드 방 삭제에 실패했습니다.');
      console.error('레이드 방 삭제 실패:', err);
    }
  };

  const handleToggleParticipation = async () => {
    if (!roomId || !user || !user.id) return;
    
    if (roomData?.isCompleted) {
      alert('완료된 레이드는 참석할 수 없습니다.');
      return;
    }

    try {
      const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
      const response = await toggleParticipation(parseInt(roomId), userId);
      
      if (response.success) {
        setIsParticipating(response.isParticipating || false);
        // WebSocket을 통해 자동으로 업데이트됨
        await loadRoomInfo(true, true);
      } else {
        alert(response.error || '참석 처리에 실패했습니다.');
      }
    } catch (err: any) {
      alert(err.response?.data?.error || '참석 처리에 실패했습니다.');
      console.error('참석 처리 실패:', err);
    }
  };

  if (loading) {
    return <div>로딩 중...</div>;
  }

  if (error || !roomData) {
    return <div style={{ color: 'red' }}>{error || '방 정보를 불러올 수 없습니다.'}</div>;
  }

  // 보스 타입 한글 변환
  const getBossTypeName = (type?: string) => {
    if (type === 'DRAGON') return '용';
    if (type === 'SKELETON_KING') return '해골왕';
    return roomData.boss.name || '알 수 없음';
  };

  // 날짜 포맷팅
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
  };

  // 시간 포맷팅 (HH:mm)
  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '';
    return timeStr.substring(0, 5); // "HH:mm" 형식
  };

  return (
    <div className="raid-room-container">
      <div className="header">
        <div className="header-left">
          <button className="btn-back" onClick={() => {
            // 완료된 레이드 목록에서 온 경우 완료된 레이드 목록으로 돌아가기
            if ((location.state as any)?.fromCompleted) {
              navigate('/completed');
            } else {
              // 일반 레이드 방 목록에서 온 경우 레이드 방 목록으로 이동
              navigate('/');
            }
          }}>
            ← 뒤로
          </button>
        </div>
        <div className="header-title">
          <h1>{getBossTypeName(roomData.boss.type)} 레이드</h1>
          <div className="raid-info-header">
            <span className="raid-date-header">{formatDate(roomData.raidDate)}</span>
            {roomData.raidTime && (
              <>
                <span className="raid-separator">·</span>
                <span className="raid-time-header">{formatTime(roomData.raidTime)}</span>
              </>
            )}
            {!roomData.raidTime && (
              <>
                <span className="raid-separator">·</span>
                <span className="raid-time-header">시간 미정</span>
              </>
            )}
          </div>
        </div>
        <div className="header-actions">
          {!roomData.isCompleted && (
            <button className="btn-delete" onClick={handleDeleteRaid}>
              레이드 삭제
            </button>
          )}
          {!roomData.isCompleted && (
            <button className="btn-complete" onClick={handleCompleteRaid}>
              레이드 완료
            </button>
          )}
          {roomData.isCompleted && (
            <span className="completed-badge">✓ 완료됨</span>
          )}
        </div>
      </div>
      <div className="content">
        <div className="channels-section">
          <div className="channels-header">
            <div className="channels-header-left">
              <div className="channels-header-title">
                <h2>채널 목록</h2>
                {selectedChannelId && (() => {
                  const selectedChannel = roomData.channels.find(c => c.id === selectedChannelId);
                  return selectedChannel ? (
                    <span className="selected-channel-badge">채널 {selectedChannel.channelNumber} 선택됨</span>
                  ) : null;
                })()}
              </div>
              {roomData.boss.type === 'DRAGON' && (
                <div className="boss-color-legend">
                  <span className="legend-item">
                    <span className="legend-color gray"></span>
                    <span className="legend-text">회색: 정보없음</span>
                  </span>
                  <span className="legend-item">
                    <span className="legend-color green"></span>
                    <span className="legend-text">녹색: 빈방</span>
                  </span>
                  <span className="legend-item">
                    <span className="legend-color yellow"></span>
                    <span className="legend-text">노란색: CCTV 1~2</span>
                  </span>
                  <span className="legend-item">
                    <span className="legend-color orange"></span>
                    <span className="legend-text">주황색: 5명 이상</span>
                  </span>
                  <span className="legend-item">
                    <span className="legend-color red"></span>
                    <span className="legend-text">빨간색: 불가능, 잡힌곳</span>
                  </span>
                </div>
              )}
            </div>
            {!roomData.isCompleted && (
              <div className="channels-header-actions">
                <button className="btn-add" onClick={handleAddChannel}>
                  + 채널 추가
                </button>
                {selectedChannelId && (
                  <>
                    {user && user.id && (
                      <>
                        {roomData.channels.find(c => c.id === selectedChannelId)?.users?.some((u: any) => u.userId === user.id && u.isMoving) ? (
                          <button className="btn-moving-clear-header" onClick={handleClearMoving}>
                            이동중 해제
                          </button>
                        ) : (
                          <button className="btn-moving-set-header" onClick={handleSetMoving}>
                            이동중 표시
                          </button>
                        )}
                      </>
                    )}
                    {(() => {
                      const selectedChannel = roomData.channels.find(c => c.id === selectedChannelId);
                      const isDefeated = selectedChannel?.isDefeated;
                      return (
                        <button 
                          className={`btn-defeated-header ${isDefeated ? 'active' : ''}`} 
                          onClick={handleMarkDefeatedSelected}
                        >
                          {isDefeated ? '✓ 완료됨' : '사냥 완료'}
                        </button>
                      );
                    })()}
                    <button className="btn-channel-delete-header" onClick={handleDeleteChannel}>
                      채널 삭제
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="channels-grid">
            {roomData.channels.length === 0 ? (
              <p>채널이 없습니다.</p>
            ) : (
              roomData.channels.map((channel) => {
                const isSelected = selectedChannelId === channel.id;
                
                return (
                <div 
                  key={channel.id} 
                  className={`channel-card-small ${channel.isDefeated ? 'defeated' : ''} ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    // 메모 편집 중이 아니면 채널 선택
                    if (editingMemo?.channelId !== channel.id) {
                      handleChannelSelect(channel.id);
                    }
                  }}
                >
                  <div className="channel-card-header">
                    <h3>채널 {channel.channelNumber}</h3>
                    {channel.isDefeated && <span className="defeated-badge">✓</span>}
                  </div>
                  {/* 서버에서 저장된 이동중 표시 (현재 접속한 사용자만) */}
                  {channel.users?.filter((u: any) => {
                    // 이동중인지 확인
                    if (!u.isMoving) return false;
                    
                    // 현재 접속한 사용자인지 확인 (userId 타입 변환 고려)
                    const userId = typeof u.userId === 'string' ? parseInt(u.userId, 10) : u.userId;
                    const isConnected = roomData?.connectedUsers?.some((cu: any) => {
                      const cuUserId = typeof cu.userId === 'string' ? parseInt(cu.userId, 10) : cu.userId;
                      return cuUserId === userId;
                    }) ?? false;
                    
                    return isConnected;
                  }).map((u: any) => {
                    const displayName = u.displayName || u.username || '알 수 없음';
                    const isCurrentUser = user && user.id && (typeof user.id === 'string' ? parseInt(user.id, 10) : user.id) === u.userId;
                    return (
                      <div key={u.userId} className={`moving-indicator ${isCurrentUser ? 'current-user' : ''}`}>
                        {displayName} 이동중 {isCurrentUser && '(나)'}
                      </div>
                    );
                  })}
                  {editingMemo?.channelId === channel.id ? (
                    <div className="channel-memo-edit">
                      <textarea
                        ref={memoTextareaRef}
                        value={editingMemo.memo}
                        onChange={(e) => setEditingMemo({ ...editingMemo, memo: e.target.value })}
                        onKeyDown={(e) => {
                          // Enter: 저장, Shift+Enter: 줄바꿈
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleMemoSave(channel.id);
                          }
                        }}
                        placeholder="메모를 입력하세요..."
                        className="memo-textarea"
                        rows={3}
                      />
                      <div className="memo-actions">
                        <button className="btn-memo-save" onClick={() => handleMemoSave(channel.id)}>
                          저장
                        </button>
                        <button className="btn-memo-cancel" onClick={handleMemoCancel}>
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="channel-memo" onClick={(e) => {
                      e.stopPropagation();
                      handleMemoClick(channel);
                    }}>
                      {channel.memo && String(channel.memo).trim() !== '' ? (
                        <p className="memo-text">{channel.memo}</p>
                      ) : (
                        <p className="memo-placeholder">메모를 입력하려면 클릭하세요</p>
                      )}
                    </div>
                  )}
                  {!roomData.isCompleted && roomData.boss.type === 'DRAGON' && (
                    <div className="boss-type-buttons">
                      {['흑', '진', '묵', '감'].map((bossType) => {
                        const bossColor = getBossColor(channel, bossType);
                        const colorClass = bossColor ? getBossColorClass(bossColor) : '';
                        const isSelectingColor = selectingBossColor?.channelId === channel.id && selectingBossColor?.bossType === bossType;
                        return (
                          <div key={bossType} className="boss-type-wrapper">
                            <button
                              className={`btn-boss-type ${bossColor ? 'selected' : ''} ${colorClass}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isSelectingColor) {
                                  setSelectingBossColor(null);
                                } else {
                                  handleBossTypeClick(channel.id, bossType);
                                }
                              }}
                            >
                              {bossType}
                            </button>
                            {isSelectingColor && (
                              <div className="boss-color-selector-inline" onClick={(e) => e.stopPropagation()}>
                                <button
                                  className="color-option gray"
                                  onClick={() => handleBossColorSelect(channel.id, bossType, 'gray')}
                                  title="회색: 빈방"
                                />
                                <button
                                  className="color-option green"
                                  onClick={() => handleBossColorSelect(channel.id, bossType, 'green')}
                                  title="녹색: CCTV 1~2"
                                />
                                <button
                                  className="color-option yellow"
                                  onClick={() => handleBossColorSelect(channel.id, bossType, 'yellow')}
                                  title="노란색: 2~5"
                                />
                                <button
                                  className="color-option orange"
                                  onClick={() => handleBossColorSelect(channel.id, bossType, 'orange')}
                                  title="주황색: 5명 이상"
                                />
                                <button
                                  className="color-option red"
                                  onClick={() => handleBossColorSelect(channel.id, bossType, 'red')}
                                  title="빨간색: 불가능, 잡힌곳"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                );
              })
            )}
          </div>
        </div>
        {/* 인원 섹션 */}
        <div className="users-info-section">
          {/* 참석 예정 명단 - 주석처리 (기능 숨김) */}
          {/* <div className="participants-section">
            <div className="participants-header">
              <h3>참석 예정 명단 ({roomData.participants?.length || 0}명)</h3>
              {!roomData.isCompleted && user && user.id && (
                <button 
                  className={`btn-participate ${isParticipating ? 'participating' : ''}`}
                  onClick={handleToggleParticipation}
                >
                  {isParticipating ? `${user.displayName || user.username || '알 수 없음'} 레이드 참석 예정` : '레이드 참석으로 표시'}
                </button>
              )}
            </div>
            {roomData.participants && roomData.participants.length > 0 ? (
              <div className="participants-list">
                {roomData.participants.map((participant) => {
                  const isCurrentUser = user && user.id && (typeof user.id === 'string' ? parseInt(user.id, 10) : user.id) === participant.userId;
                  return (
                    <div key={participant.userId} className={`participant-item ${isCurrentUser ? 'current-user' : ''}`}>
                      {participant.avatarUrl && (
                        <img src={participant.avatarUrl} alt={getUserDisplayName(participant)} className="participant-avatar" />
                      )}
                      <span className="participant-name">
                        {getUserDisplayName(participant)} {isCurrentUser && '(나)'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="participants-empty">
                <p>참석 예정 명단이 없습니다.</p>
              </div>
            )}
          </div> */}
          
          {/* 현재 접속한 사용자 목록 (완료된 레이드가 아닐 때만 표시) */}
          {!roomData.isCompleted && (
            <div className="connected-users-section">
              <h3>현재 접속 중 ({roomData.connectedUsers?.length || 0}명)</h3>
              {roomData.connectedUsers && roomData.connectedUsers.length > 0 ? (
                <div className="connected-users-list">
                  {roomData.connectedUsers.map((connectedUser) => {
                    const isCurrentUser = user && user.id && (typeof user.id === 'string' ? parseInt(user.id, 10) : user.id) === connectedUser.userId;
                    return (
                      <div key={connectedUser.userId} className={`connected-user-item ${isCurrentUser ? 'current-user' : ''}`}>
                        {connectedUser.avatarUrl && (
                          <img src={connectedUser.avatarUrl} alt={getUserDisplayName(connectedUser)} className="user-avatar" />
                        )}
                        <span className="user-name">
                          {getUserDisplayName(connectedUser)} {isCurrentUser && '(나)'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="connected-users-empty">
                  <p>현재 접속한 사용자가 없습니다.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RaidRoomPage;


