import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // GitHub Pages는 /boss/ 서브패스에서 서비스되므로 base 설정 필요
  base: process.env.NODE_ENV === 'production' ? '/boss/' : '/',
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  server: {
    port: 5000,
    sourcemapIgnoreList: false, // 디버깅을 위해 sourcemap 무시 목록 비활성화
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL || 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: process.env.BACKEND_URL || 'http://localhost:8080',
        ws: true, // WebSocket 프록시 활성화
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port: 5000,
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL || 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: process.env.BACKEND_URL || 'http://localhost:8080',
        ws: true, // WebSocket 프록시 활성화
        changeOrigin: true,
        secure: false,
      },
    },
  },
  // 개발 모드에서도 sourcemap 활성화
  css: {
    devSourcemap: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    emptyOutDir: true,
  },
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

