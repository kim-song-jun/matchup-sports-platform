'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Pause, Play, Sun } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';
import { getMotionPaused, setMotionPaused, subscribeMotionPaused } from './landing-motion-store';

const noopSubscribe = () => () => {};

/**
 * 테마는 앱과 같은 ThemeProvider 설정(tm-theme 키·라이트 기본·<html>.dark)을 그대로 쓴다.
 * 랜딩만의 저장소를 따로 두면 앱으로 들어갈 때 테마가 뒤집힌다.
 * 서버는 저장값을 모르므로 hydration 이 끝나기 전엔 눌림 상태를 false 로 둔다.
 */
export function LandingThemeToggle() {
  const { effectiveTheme, setPreference } = useTheme();
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const dark = hydrated && effectiveTheme === 'dark';
  return (
    <button
      type="button"
      className="tm-landing-icon-btn tm-landing-theme-toggle"
      aria-label="다크 모드"
      aria-pressed={dark}
      onClick={() => setPreference(dark ? 'light' : 'dark')}
    >
      <Moon className="tm-landing-icon-moon" size={20} aria-hidden="true" />
      <Sun className="tm-landing-icon-sun" size={20} aria-hidden="true" />
    </button>
  );
}

/**
 * 5초 넘게 반복되는 움직임(WCAG 2.2.2)을 한 번에 멈추는 페이지 단위 스위치.
 * 아이콘이 다음 동작(멈춤/재생)을 그리므로 이름도 다음 동작을 말한다 — aria-pressed 와 함께 쓰면
 * 툴팁과 접근 가능한 이름이 어긋나 음성 제어가 안 맞는다.
 */
export function LandingMotionToggle() {
  const paused = useSyncExternalStore(subscribeMotionPaused, getMotionPaused, () => false);
  const label = paused ? '움직임 다시 재생' : '움직임 멈추기';
  return (
    <button
      type="button"
      className="tm-landing-icon-btn tm-landing-motion-toggle"
      aria-label={label}
      title={label}
      onClick={() => setMotionPaused(!paused)}
    >
      {paused ? <Play size={20} aria-hidden="true" /> : <Pause size={20} aria-hidden="true" />}
    </button>
  );
}
