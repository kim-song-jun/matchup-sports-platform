import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // CI 러너는 UTC, 개발자 기기는 KST 다. 핀이 없으면 자정 경계 픽스처가 **로컬에서만**
    // 갈린다(2026-09-08 확인: 워크플로·러너 설정 어디에도 TZ 가 없었다). CI 를 바꾸는 게
    // 아니라 **로컬을 CI 에 맞추는** 핀이다.
    env: { TZ: 'UTC' },
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
