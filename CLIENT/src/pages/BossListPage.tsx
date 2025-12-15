import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTodayBosses, createRaidRoom } from '../services/BossService';
import { User, Boss, Room } from '../types';
import { websocketService } from '../services/websocket';

interface BossListPageProps {
  user: User;
  onLogout: () => void;
}

const BossListPage: React.FC<BossListPageProps> = ({ user, onLogout }) => {
  const [bosses, setBosses] = useState<Boss[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    bossType: 'DRAGON',
    raidDate: new Date().toISOString().split('T')[0],
    raidHour: '00',
    raidMinute: '00'
  });
  const navigate = useNavigate();
  const wsSubscriptionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    loadBosses();
    connectWebSocket();

    return () => {
      // WebSocket 구독 해제
      if (wsSubscriptionRef.current) {
        wsSubscriptionRef.current();
        wsSubscriptionRef.current = null;
      }
    };
  }, []);

  const loadBosses = async (forceRefresh: boolean = false) => {
    try {
      setLoading(true);
      const data = await getTodayBosses(forceRefresh);
      setBosses(data.bosses || []);
    } catch (err: any) {
      setError('보스 목록을 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  const connectWebSocket = () => {
    // WebSocket 서비스 연결
    if (!websocketService.isConnected()) {
      websocketService.connect();
    }

    // 이전 구독 해제
    if (wsSubscriptionRef.current) {
      wsSubscriptionRef.current();
    }

    // 보스 목록 업데이트 구독
    const unsubscribe = websocketService.subscribe('/topic/bosses/today', (data: any) => {
      // 서버에서 받은 데이터로 상태 업데이트
      if (data && data.bosses) {
        setBosses(data.bosses);
      }
    });

    wsSubscriptionRef.current = unsubscribe;
  };

  const handleEnterRoom = (roomId: number) => {
    navigate(`/raid-room/${roomId}`);
  };

  const handleCreateRoom = async () => {
    try {
      setError('');
      const raidTime = `${createForm.raidHour.padStart(2, '0')}:${createForm.raidMinute.padStart(2, '0')}`;
      const data = await createRaidRoom(
        createForm.bossType,
        createForm.raidDate,
        raidTime
      );
      if (data.success) {
        setShowCreateModal(false);
        setError('');
        // 레이드 생성 성공 시 목록 강제 새로고침 (캐시 무효화)
        // WebSocket을 통해 자동으로 목록이 업데이트됨
        await loadBosses(true);
      } else {
        const errorMsg = data.error || data.message || '레이드 생성에 실패했습니다.';
        setError(errorMsg);
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error 
        || err.response?.data?.message 
        || err.message 
        || '레이드 생성 중 오류가 발생했습니다.';
      setError(errorMsg);
    }
  };

  // 시간 옵션 생성 (0 ~ 23)
  const generateHourOptions = () => {
    const hours = [];
    for (let hour = 0; hour < 24; hour++) {
      hours.push(hour.toString().padStart(2, '0'));
    }
    return hours;
  };

  // 분 옵션 생성 (0 ~ 59, 1분 단위)
  const generateMinuteOptions = () => {
    const minutes = [];
    for (let minute = 0; minute < 60; minute += 1) {
      minutes.push(minute.toString().padStart(2, '0'));
    }
    return minutes;
  };

  // 특정 보스 타입의 다음 레이드를 찾는 함수 (가장 가까운 미래 레이드)
  const findNextRaidByBossType = (bossType: string): Room | null => {
    const now = new Date();
    let closestRoom: Room | null = null;
    let closestDateTime: Date | null = null;

    // 해당 보스 타입의 모든 방을 순회하며 가장 가까운 미래 레이드 찾기
    bosses.forEach((boss) => {
      // 보스 타입이 일치하는 경우만 확인
      if (boss.type !== bossType) return;
      
      boss.rooms.forEach((room) => {
        // 완료된 방은 제외
        if (room.isCompleted) return;
        
        // raidDate와 raidTime이 모두 있어야 함
        if (!room.raidDate || !room.raidTime) return;

        try {
          // 날짜와 시간을 결합하여 Date 객체 생성
          const [hours, minutes] = room.raidTime.split(':').map(Number);
          const raidDate = new Date(room.raidDate);
          raidDate.setHours(hours, minutes, 0, 0);

          // 현재 시간보다 미래인 레이드만 고려
          if (raidDate > now) {
            // 가장 가까운 레이드 찾기
            if (!closestDateTime || raidDate < closestDateTime) {
              closestRoom = room;
              closestDateTime = raidDate;
            }
          }
        } catch (e) {
          // 날짜/시간 파싱 오류는 무시
        }
      });
    });

    return closestRoom;
  };

  // 특정 레이드가 해당 보스 타입의 다음 레이드인지 확인하는 함수
  const isNextRaid = (room: Room, bossType: string): boolean => {
    const nextRaid = findNextRaidByBossType(bossType);
    return nextRaid !== null && nextRaid.id === room.id;
  };

  // 레이드가 1시간 이내에 시작하는지 확인하는 함수
  const isRaidWithinOneHour = (room: Room): boolean => {
    if (!room.raidDate || !room.raidTime || room.isCompleted) return false;
    
    try {
      const now = new Date();
      const [hours, minutes] = room.raidTime.split(':').map(Number);
      const raidDate = new Date(room.raidDate);
      raidDate.setHours(hours, minutes, 0, 0);

      // 미래 레이드만 확인
      if (raidDate <= now) return false;

      // 남은 시간 계산 (분 단위)
      const timeDiff = raidDate.getTime() - now.getTime();
      const minutesRemaining = Math.floor(timeDiff / (1000 * 60));

      // 1시간 이내이고 아직 시작하지 않은 경우
      return minutesRemaining > 0 && minutesRemaining <= 60;
    } catch (e) {
      return false;
    }
  };

  return (
    <div className="boss-list-container">
      <div className="header">
        <div className="header-title">
          <h1>개화 레이드</h1>
        </div>
        <div className="header-actions">
          <button
            className="btn-completed"
            onClick={() => navigate('/completed')}
          >
            완료된 레이드
          </button>
          <span className="user-name">{user.displayName || user.username}</span>
          <button className="btn-logout" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      </div>
      <div className="content">
        <div className="channels-section">
          <div className="channels-header">
            <div className="channels-header-left">
              <h2>레이드  목록</h2>
            </div>
            <div className="channels-header-actions">
              <button
                className="btn-add"
                onClick={() => setShowCreateModal(true)}
              >
                + 새 레이드 생성
              </button>
            </div>
          </div>
          {loading ? (
            <p>로딩 중...</p>
          ) : error ? (
            <p style={{ color: 'red' }}>{error}</p>
          ) : bosses.length === 0 ? (
            <div className="no-bosses">
              <p>오늘의 보스 레이드가 없습니다.</p>
              <p>위의 "새 레이드 생성" 버튼을 눌러 레이드를 생성해주세요.</p>
            </div>
          ) : (
            <div className="boss-list">
              {bosses.map((boss) => (
                <div key={boss.id} className="boss-card">
                  <h3>{boss.name}</h3>
                {boss.description && <p>{boss.description}</p>}
                <div className="rooms">
                  {boss.rooms.length > 0 ? (
                    boss.rooms.map((room) => {
                      const isUrgent = isRaidWithinOneHour(room);
                      const isNext = boss.type ? isNextRaid(room, boss.type) : false;
                      return (
                        <div 
                          key={room.id} 
                          className={`room-card ${isUrgent ? 'urgent' : ''}`}
                          onClick={() => handleEnterRoom(room.id)}
                        >
                          <div className="room-info">
                            <div className="room-header">
                              {room.bossName && (
                                <span className="boss-badge">{room.bossName}</span>
                              )}
                              {isUrgent ? (
                                <span className="urgent-badge">⚠️ 곧 시작!</span>
                              ) : isNext ? (
                                <span className="next-raid-badge">⏰ 다음 레이드</span>
                              ) : null}
                            </div>
                            <div className="room-date-time">
                              {room.raidDate && (
                                <div className="room-date">
                                  {new Date(room.raidDate).toLocaleDateString('ko-KR', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                    weekday: 'short'
                                  })}
                                </div>
                              )}
                              <div className="room-time">
                                ⏰ {room.raidTime && room.raidTime !== '' ? `${room.raidTime} 레이드` : `시간 미정`}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="no-rooms">레이드가 없습니다. 위의 "새 레이드 생성" 버튼을 눌러주세요.</p>
                  )}
                </div>
               </div>
             ))}
            </div>
          )}
        </div>
      </div>

      {/* 레이드 생성 모달 */}
      {showCreateModal && (
          <div className="modal-overlay" onClick={() => {
            setShowCreateModal(false);
            setError('');
          }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>🐉 레이드 생성</h2>
              <div className="form-group">
                <label htmlFor="bossType">레이드 종류</label>
                <select
                  id="bossType"
                  value={createForm.bossType}
                  onChange={(e) => setCreateForm({ ...createForm, bossType: e.target.value })}
                >
                  <option value="DRAGON">🐲 용</option>
                  <option value="SKELETON_KING">💀 해골왕</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="raidDate">레이드 날짜</label>
                <input
                  type="date"
                  id="raidDate"
                  value={createForm.raidDate}
                  onChange={(e) => setCreateForm({ ...createForm, raidDate: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="form-group">
                <label htmlFor="raidTime">레이드 시간</label>
                <div className="time-selector">
                  <select
                    id="raidHour"
                    value={createForm.raidHour}
                    onChange={(e) => setCreateForm({ ...createForm, raidHour: e.target.value })}
                  >
                    {generateHourOptions().map((hour) => (
                      <option key={hour} value={hour}>
                        {hour}시
                      </option>
                    ))}
                  </select>
                  <select
                    id="raidMinute"
                    value={createForm.raidMinute}
                    onChange={(e) => setCreateForm({ ...createForm, raidMinute: e.target.value })}
                  >
                    {generateMinuteOptions().map((minute) => (
                      <option key={minute} value={minute}>
                        {minute}분
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {error && <div className="error-message">{error}</div>}
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => {
                  setShowCreateModal(false);
                  setError('');
                }}>
                  취소
                </button>
                <button className="btn-submit" onClick={handleCreateRoom}>
                  ✨ 생성하기
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default BossListPage;

