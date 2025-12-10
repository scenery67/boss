import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTodayBosses, createRaidRoom } from '../services/BossService';
import { User, Boss } from '../types';
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
      console.log('보스 목록 업데이트 수신:', data);
      // 서버에서 받은 데이터로 상태 업데이트
      if (data && data.bosses) {
        setBosses(data.bosses);
      }
    });

    wsSubscriptionRef.current = unsubscribe;
    console.log('WebSocket 구독 완료: /topic/bosses/today');
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
        // 방 생성 성공 시 목록 강제 새로고침 (캐시 무효화)
        await loadBosses(true);
        // 약간의 지연 후 생성된 방으로 이동 (목록 업데이트를 위해)
        setTimeout(() => {
          navigate(`/raid-room/${data.roomId}`);
        }, 100);
      } else {
        const errorMsg = data.error || data.message || '방 생성에 실패했습니다.';
        setError(errorMsg);
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error 
        || err.response?.data?.message 
        || err.message 
        || '방 생성 중 오류가 발생했습니다.';
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

  return (
    <div className="boss-list-container">
            <div className="header">
              <h1>🐉 보스 레이드</h1>
              <div className="user-info">
                <button
                  className="btn-completed"
                  onClick={() => navigate('/completed')}
                >
                  ✓ 완료된 레이드
                </button>
                <span>{user.displayName || user.username}</span>
                <button className="btn-logout" onClick={onLogout}>
                  로그아웃
                </button>
              </div>
            </div>
      <div className="content">
        <div className="content-header">
          <h2>예정된 보스 레이드</h2>
          <button
            className="btn-create-room"
            onClick={() => setShowCreateModal(true)}
          >
            + 새 레이드 방 생성
          </button>
        </div>
        {loading ? (
          <p>로딩 중...</p>
        ) : error ? (
          <p style={{ color: 'red' }}>{error}</p>
        ) : bosses.length === 0 ? (
          <div className="no-bosses">
            <p>오늘의 보스 레이드 방이 없습니다.</p>
            <p>위의 "새 레이드 방 생성" 버튼을 눌러 방을 생성해주세요.</p>
          </div>
        ) : (
          <div className="boss-list">
              {bosses.map((boss) => (
                <div key={boss.id} className="boss-card">
                  <h3>{boss.name}</h3>
                {boss.description && <p>{boss.description}</p>}
                <div className="rooms">
                  {boss.rooms.length > 0 ? (
                    boss.rooms.map((room) => (
                      <div 
                        key={room.id} 
                        className="room-card"
                        onClick={() => handleEnterRoom(room.id)}
                      >
                        <div className="room-info">
                          <div className="room-header">
                            {room.bossName && (
                              <span className="boss-badge">{room.bossName}</span>
                            )}
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
                    ))
                  ) : (
                    <p className="no-rooms">방이 없습니다. 위의 "방 생성" 버튼을 눌러주세요.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 방 생성 모달 */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => {
            setShowCreateModal(false);
            setError('');
          }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>🐉 레이드 방 생성</h2>
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
    </div>
  );
};

export default BossListPage;

