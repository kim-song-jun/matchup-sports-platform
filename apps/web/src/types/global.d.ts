declare global {
  interface Window {
    Capacitor?: {
      getPlatform?: () => string;
    };
  }
}

export {};
