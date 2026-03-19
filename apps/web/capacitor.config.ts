import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'kr.matchup.app',
  appName: 'MatchUp',
  webDir: 'out',
  server: {
    // 개발 시 로컬 서버로 연결
    url: process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : undefined,
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#FF6B35',
    },
  },
};

export default config;
