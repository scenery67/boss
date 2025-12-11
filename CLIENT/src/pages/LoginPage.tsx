import React, { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { guestLogin, discordLogin } from '../services/AuthService';
import { User } from '../types';

interface LoginPageProps {
  onLogin: (user: User) => void;
  isServerAlive?: boolean | null; // null: 초기 상태, true: 살아있음, false: sleep
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, isServerAlive = null }) => {
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // URL 파라미터에서 에러 확인
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      // URL에서 에러 파라미터 제거
      window.history.replaceState({}, '', '/login');
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!nickname.trim()) {
      setError('닉네임을 입력해주세요');
      setLoading(false);
      return;
    }

    try {
      const data = await guestLogin(nickname);
      if (data.success) {
        onLogin(data.user);
        navigate('/');
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : '로그인 실패';
      setError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDiscordLogin = () => {
    discordLogin();
  };

  return (
    <div className="login-container">
      <h1 className="login-title">
        🐉 보스 레이드
        {isServerAlive !== null && (
          <span 
            className={`server-status-indicator ${isServerAlive ? 'alive' : 'sleep'}`}
            title={isServerAlive ? '서버가 살아있습니다' : '서버가 sleep 중입니다. 로그인 요청을 보내면, 3~4분 후에 서버가 켜집니다.'}
          />
        )}
      </h1>
      <p className="subtitle">로그인하여 레이드에 참가하세요</p>

      <form className="login-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="nickname">닉네임</label>
          <input
            type="text"
            id="nickname"
            name="nickname"
            placeholder="닉네임을 입력하세요"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            required
          />
          {error && <div className="error-message">{error}</div>}
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? '로그인 중...' : '닉네임으로 시작'}
        </button>
      </form>

      <div className="divider">또는</div>

      <button className="btn btn-discord" onClick={handleDiscordLogin} disabled>
        <svg className="discord-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.29-.444.644-.608.991a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-.991.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
        <span>Discord로 로그인 (준비 중)</span>
      </button>
    </div>
  );
};

export default LoginPage;

