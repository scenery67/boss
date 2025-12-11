import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCompletedRooms } from '../services/BossService';
import { User } from '../types';

interface CompletedRoomsPageProps {
  user: User;
  onLogout: () => void;
}

interface CompletedRoom {
  id: number;
  bossName: string;
  bossType: string;
  raidDate: string;
  raidTime: string;
  completedAt: string;
  channelCount: number;
}

const CompletedRoomsPage: React.FC<CompletedRoomsPageProps> = ({ user, onLogout }) => {
  const [rooms, setRooms] = useState<CompletedRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadCompletedRooms();
  }, []);

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
        navigate('/');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [navigate]);

  const loadCompletedRooms = async () => {
    try {
      setLoading(true);
      const data = await getCompletedRooms();
      setRooms(data.rooms || []);
    } catch (err: any) {
      setError('완료된 레이드 목록을 불러올 수 없습니다.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewRoom = (roomId: number) => {
    navigate(`/raid-room/${roomId}`, { state: { fromCompleted: true } });
  };

  return (
    <div className="completed-rooms-container">
      <div className="header">
        <button className="btn-back" onClick={() => navigate('/')}>
          ← 뒤로
        </button>
        <div className="header-actions">
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
              <h2>✓ 완료된 레이드</h2>
            </div>
          </div>
          {loading ? (
            <p>로딩 중...</p>
          ) : error ? (
            <p style={{ color: 'red' }}>{error}</p>
          ) : rooms.length === 0 ? (
            <p className="no-completed-rooms">완료된 레이드가 없습니다.</p>
          ) : (
            <div className="completed-rooms-list">
              {rooms.map((room) => (
                <div key={room.id} className="completed-room-card">
                  <div className="room-header">
                    <h3>{room.bossName}</h3>
                    <span className="completed-badge">✓ 완료됨</span>
                  </div>
                  <div className="room-details">
                    <p>레이드 날짜: {room.raidDate}</p>
                    {room.raidTime && <p>레이드 시간: {room.raidTime}</p>}
                    <p>완료 시간: {new Date(room.completedAt).toLocaleString('ko-KR')}</p>
                    <p>채널 수: {room.channelCount}개</p>
                  </div>
                  <button
                    className="btn-view"
                    onClick={() => handleViewRoom(room.id)}
                  >
                    상세 보기 (읽기 전용)
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompletedRoomsPage;

