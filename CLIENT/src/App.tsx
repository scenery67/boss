import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import BossListPage from './pages/BossListPage';
import RaidRoomPage from './pages/RaidRoomPage';
import CompletedRoomsPage from './pages/CompletedRoomsPage';
import DragonWaterFireRoomPage from './pages/DragonWaterFireRoomPage';
import { User } from './types';
import { getBackendUrl } from './services/api';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Discord 로그인 성공 확인
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('discord_success') === 'true') {
      // 백엔드에서 사용자 정보 가져오기
      const backendUrl = getBackendUrl();
      fetch(`${backendUrl}/api/auth/me`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          if (data.authenticated && data.user) {
            handleSetUser(data.user);
            // URL에서 파라미터 제거 (basename 고려)
            const basePath = import.meta.env.PROD ? '/boss' : '';
            window.history.replaceState({}, '', `${basePath}/`);
          }
        })
        .catch(err => console.error('사용자 정보 조회 실패:', err));
    } else {
      // 세션에서 사용자 정보 확인
      const userStr = sessionStorage.getItem('user');
      if (userStr) {
        try {
          setUser(JSON.parse(userStr));
        } catch (e) {
          sessionStorage.removeItem('user');
        }
      } else {
        // 백엔드에서 세션 확인
        const backendUrl = getBackendUrl();
        fetch(`${backendUrl}/api/auth/me`, { credentials: 'include' })
          .then(res => res.json())
          .then(data => {
            if (data.authenticated && data.user) {
              handleSetUser(data.user);
            }
          })
          .catch(err => console.error('사용자 정보 조회 실패:', err));
      }
    }
    setLoading(false);
  }, []);

  const handleSetUser = (newUser: User | null) => {
    setUser(newUser);
    if (newUser) {
      sessionStorage.setItem('user', JSON.stringify(newUser));
    } else {
      sessionStorage.removeItem('user');
    }
  };

  if (loading) {
    return <div>로딩 중...</div>;
  }

  // GitHub Pages 서브패스 고려
  const basename = import.meta.env.PROD ? '/boss' : '';

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/" replace />
            ) : (
              <LoginPage onLogin={handleSetUser} />
            )
          }
        />
        <Route
          path="/"
          element={
            user ? (
              <BossListPage user={user} onLogout={() => handleSetUser(null)} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/raid-room/:roomId"
          element={
            user ? (
              <RaidRoomPage user={user} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/water-fire-dragon"
          element={
            user ? (
              <DragonWaterFireRoomPage user={user} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/completed"
          element={
            user ? (
              <CompletedRoomsPage user={user} onLogout={() => handleSetUser(null)} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

