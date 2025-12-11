import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const backendUrl = import.meta.env.VITE_BACKEND_URL || (window as any).BACKEND_URL || 'http://localhost:8080';
(window as any).BACKEND_URL = backendUrl;

// 개발 환경에서 확장 프로그램 관련 에러 필터링 (선택사항)
if (import.meta.env.DEV) {
  const originalError = console.error;
  console.error = (...args: any[]) => {
    const message = args[0]?.toString() || '';
    // "runtime.lastError" 또는 "message channel closed" 에러는 무시
    if (message.includes('runtime.lastError') || 
        message.includes('message channel closed') ||
        message.includes('asynchronous response')) {
      return; // 에러 로그 출력하지 않음
    }
    originalError.apply(console, args);
  };
}

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

