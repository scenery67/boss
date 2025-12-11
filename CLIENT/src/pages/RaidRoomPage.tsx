import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getRaidRoom, createChannel, deleteChannel, markDefeated, completeRaidRoom, deleteRaidRoom, updateChannelMemo, toggleChannelSelection, updateChannelBossColor } from '../services/BossService';
import { User, RaidRoomData, Channel, Participant } from '../types';
import { websocketService } from '../services/websocket';

interface RaidRoomPageProps {
  user: User;
}

const RaidRoomPage: React.FC<RaidRoomPageProps> = ({ user }) => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [roomData, setRoomData] = useState<RaidRoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingMemo, setEditingMemo] = useState<{ channelId: number; memo: string } | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [selectingBossColor, setSelectingBossColor] = useState<{ channelId: number; bossType: string } | null>(null);
  const wsSubscriptionRef = useRef<(() => void) | null>(null);
  const websocketTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isAddingChannelRef = useRef<boolean>(false);

  useEffect(() => {
    if (roomId) {
      loadRoomInfo();
      connectWebSocket();
    }

    return () => {
      // WebSocket 구독 해제
      if (wsSubscriptionRef.current) {
        wsSubscriptionRef.current();
        wsSubscriptionRef.current = null;
      }
    };
  }, [roomId]);

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
    if (!roomId) return;

    // WebSocket 서비스 연결
    if (!websocketService.isConnected()) {
      websocketService.connect();
    }

    // 이전 구독 해제
    if (wsSubscriptionRef.current) {
      wsSubscriptionRef.current();
    }

    // 레이드 방 업데이트 구독
    const unsubscribe = websocketService.subscribe(`/topic/raid-room/${roomId}`, (data: RaidRoomData) => {
      console.log('레이드 방 업데이트 수신:', data);
      console.log('타임스탬프:', (data as any)._timestamp);
      
      // 웹소켓 메시지 수신 시 타임아웃 취소 및 채널 추가 플래그 해제
      if (websocketTimeoutRef.current) {
        clearTimeout(websocketTimeoutRef.current);
        websocketTimeoutRef.current = null;
        console.log('웹소켓 메시지 수신, 타임아웃 취소');
      }
      if (isAddingChannelRef.current) {
        isAddingChannelRef.current = false;
        console.log('채널 추가 완료 (웹소켓 메시지 수신)');
      }
      
      // 서버에서 받은 데이터로 상태 업데이트
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
          } else {
            // 사용자가 이동중이 아닌 채널에 있으면 선택 해제하지 않음 (로컬 선택 유지)
          }
        }
      }
      setRoomData(data);
    });

    wsSubscriptionRef.current = unsubscribe;
    console.log('WebSocket 구독 완료:', `/topic/raid-room/${roomId}`);
  };

  const handleAddChannel = async () => {
    // 중복 요청 방지
    if (isAddingChannelRef.current) {
      console.log('채널 추가 중... 대기');
      return;
    }

    const channelNumber = prompt('채널 번호를 입력하세요:');
    if (!channelNumber || !roomId || !roomData) return;

    // 이미 존재하는 채널 번호인지 확인
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
      console.log('채널 생성 요청:', channelNumber);
      const result = await createChannel(parseInt(roomId), channelNum);
      
      if (result.success) {
        console.log('채널 생성 성공, 웹소켓 메시지 대기 중...');
        // 웹소켓 메시지가 도착하면 서버 데이터로 덮어쓰기됨
        // 타임아웃 안전장치: 웹소켓이 실패하면 API로 폴백 (1초 후)
        if (websocketTimeoutRef.current) {
          clearTimeout(websocketTimeoutRef.current);
        }
        websocketTimeoutRef.current = setTimeout(() => {
          console.warn('웹소켓 메시지 타임아웃, API로 폴백 새로고침');
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
      
      // 백그라운드에서 서버 데이터 동기화 (로딩 화면 없이)
      setTimeout(() => {
        loadRoomInfo(true, true); // silent 모드
      }, 100);
    } catch (err: any) {
      console.error('채널 삭제 실패:', err);
      const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || '채널 삭제에 실패했습니다.';
      const statusCode = err.response?.status;
      
      if (statusCode === 404) {
        alert('채널 삭제 API가 서버에 구현되지 않았습니다. 백엔드 개발자에게 문의하세요.');
      } else {
        alert(errorMessage);
      }
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
      markDefeated(parseInt(roomId), channelId)
        .then(() => {
          // 조용히 서버 데이터 동기화
          setTimeout(() => {
            loadRoomInfo(true, true); // silent 모드
          }, 100);
        })
        .catch((err) => {
          console.error('잡혔다 표시 실패:', err);
          // 에러 발생 시 상태 복원
          const updatedChannels = roomData.channels.map(ch => 
            ch.id === channelId ? { ...ch, isDefeated: !ch.isDefeated } : ch
          );
          setRoomData({ ...roomData, channels: updatedChannels });
        });
    } catch (err) {
      console.error('잡혔다 표시 실패:', err);
    }
  };

  const handleMemoClick = (channel: Channel) => {
    if (roomData?.isCompleted) return;
    const memoValue = channel.memo && channel.memo.trim() !== '' ? channel.memo : '';
    setEditingMemo({ channelId: channel.id, memo: memoValue });
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
      updateChannelMemo(parseInt(roomId), channelId, memoValue)
        .then(() => {
          // 조용히 서버 데이터 동기화
          setTimeout(() => {
            loadRoomInfo(true, true); // silent 모드
          }, 100);
        })
        .catch((err) => {
          console.error('메모 저장 실패:', err);
          alert('메모 저장에 실패했습니다.');
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
      
      // 백그라운드에서 서버에 저장 (로딩 화면 없이)
      toggleChannelSelection(parseInt(roomId), selectedChannelId, userId)
        .then(() => {
          // 조용히 서버 데이터 동기화
          setTimeout(() => {
            loadRoomInfo(true, true); // silent 모드
          }, 100);
        })
        .catch((err) => {
          console.error('이동중 표시 실패:', err);
          console.error('에러 상세:', err.response?.data);
          alert(err.response?.data?.error || '이동중 표시에 실패했습니다.');
        });
    } catch (err: any) {
      console.error('이동중 표시 실패:', err);
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
      
      // 현재 선택된 채널에서 이동중 해제
      toggleChannelSelection(parseInt(roomId), selectedChannelId, userId)
        .then(() => {
          setTimeout(() => {
            loadRoomInfo(true, true);
          }, 100);
        })
        .catch((err) => {
          console.error('이동중 해제 실패:', err);
        });
    } catch (err: any) {
      console.error('이동중 해제 실패:', err);
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
      // 즉시 로컬 상태 업데이트
      const updatedChannels = roomData.channels.map(ch => {
        if (ch.id === channelId) {
          const updated = { ...ch };
          switch (bossType) {
            case '흑': updated.bossHeukColor = color; break;
            case '진': updated.bossJinColor = color; break;
            case '묵': updated.bossMukColor = color; break;
            case '감': updated.bossGamColor = color; break;
          }
          return updated;
        }
        return ch;
      });
      setRoomData({ ...roomData, channels: updatedChannels });
      setSelectingBossColor(null);
      
      // 백그라운드에서 서버에 저장 (로딩 화면 없이)
      updateChannelBossColor(parseInt(roomId), channelId, bossType, color)
        .then(() => {
          // 조용히 서버 데이터 동기화
          setTimeout(() => {
            loadRoomInfo(true, true); // silent 모드
          }, 100);
        })
        .catch((err) => {
          console.error('보스 색상 선택 실패:', err);
          alert('보스 색상 저장에 실패했습니다.');
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
        <button className="btn-back" onClick={() => navigate('/')}>
          ← 뒤로
        </button>
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
            <h2>채널 목록</h2>
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
                  {/* 서버에서 저장된 이동중 표시 */}
                  {user && user.id && channel.users?.some((u: any) => {
                    const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
                    return u.userId === userId && u.isMoving;
                  }) && (
                    <div className="moving-indicator">
                      {getUserDisplayName({ userId: typeof user.id === 'string' ? parseInt(user.id, 10) : user.id, username: user.username || '', displayName: user.displayName })} 이동중
                    </div>
                  )}
                  {editingMemo?.channelId === channel.id ? (
                    <div className="channel-memo-edit">
                      <textarea
                        value={editingMemo.memo}
                        onChange={(e) => setEditingMemo({ ...editingMemo, memo: e.target.value })}
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
                                  className="color-option green"
                                  onClick={() => handleBossColorSelect(channel.id, bossType, 'green')}
                                  title="초록"
                                />
                                <button
                                  className="color-option yellow"
                                  onClick={() => handleBossColorSelect(channel.id, bossType, 'yellow')}
                                  title="노랑"
                                />
                                <button
                                  className="color-option orange"
                                  onClick={() => handleBossColorSelect(channel.id, bossType, 'orange')}
                                  title="주황"
                                />
                                <button
                                  className="color-option red"
                                  onClick={() => handleBossColorSelect(channel.id, bossType, 'red')}
                                  title="빨강"
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
          {roomData.participants && roomData.participants.length > 0 && (
            <div className="participants-section">
              <h3>참여자 목록</h3>
              <div className="participants-list">
                {roomData.participants.map((participant) => (
                  <div key={participant.userId} className="participant-item">
                    {participant.avatarUrl && (
                      <img src={participant.avatarUrl} alt={getUserDisplayName(participant)} className="participant-avatar" />
                    )}
                    <span className="participant-name">{getUserDisplayName(participant)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RaidRoomPage;


