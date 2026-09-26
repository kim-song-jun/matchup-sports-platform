import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { LandingBeforeAfter } from './landing-before-after';
import { LandingMotionToggle, LandingThemeToggle } from './landing-nav-controls';
import { LandingRoot } from './landing-root';
import { setMotionPaused } from './landing-motion-store';

const hooks = vi.hoisted(() => ({ useV1Settings: vi.fn(), useV1UpdateSettings: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => hooks);
vi.mock('@/lib/session-storage', () => ({ hasStoredV1Session: () => false }));

beforeEach(() => {
  hooks.useV1Settings.mockReturnValue({ data: undefined });
  hooks.useV1UpdateSettings.mockReturnValue({ mutate: vi.fn(), isPending: false });
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
});

afterEach(() => {
  setMotionPaused(false);
});

describe('LandingThemeToggle', () => {
  it('앱 ThemeProvider 와 같은 tm-theme 키와 <html>.dark 로 테마를 바꾼다', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <LandingThemeToggle />
      </ThemeProvider>,
    );
    const toggle = screen.getByRole('button', { name: '다크 모드' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);
    expect(document.documentElement).toHaveClass('dark');
    expect(window.localStorage.getItem('tm-theme')).toBe('dark');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(toggle);
    expect(document.documentElement).not.toHaveClass('dark');
    expect(window.localStorage.getItem('tm-theme')).toBe('light');
    // 랜딩 전용 저장 키가 따로 생기면 앱으로 들어갈 때 테마가 뒤집힌다.
    const keys = Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i));
    expect(keys).toEqual(['tm-theme']);
  });
});

describe('LandingMotionToggle', () => {
  it('누르면 랜딩 루트가 멈춤 상태가 되고, 다시 누르면 풀린다', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <LandingRoot>
        <LandingMotionToggle />
      </LandingRoot>,
    );
    const root = container.querySelector('.tm-landing')!;
    const toggle = screen.getByRole('button', { name: '움직임 멈추기' });

    await user.click(toggle);
    expect(root).toHaveAttribute('data-paused', 'true');
    // 툴팁과 접근 가능한 이름이 같은 "다음 동작"을 말해야 음성 제어가 맞는다.
    expect(toggle).toHaveAccessibleName('움직임 다시 재생');
    expect(toggle).toHaveAttribute('title', '움직임 다시 재생');

    await user.click(toggle);
    expect(root).not.toHaveAttribute('data-paused');
    expect(toggle).toHaveAccessibleName('움직임 멈추기');
    expect(toggle).toHaveAttribute('title', '움직임 멈추기');
  });
});

describe('LandingBeforeAfter', () => {
  it('기본은 "이제는" 보기이고, 누른 쪽만 눌림 상태가 된다', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <LandingBeforeAfter>
        <p>본문</p>
      </LandingBeforeAfter>,
    );
    const wrapper = container.querySelector('.tm-landing-ba')!;
    const before = screen.getByRole('button', { name: '예전엔' });
    const after = screen.getByRole('button', { name: '이제는' });
    expect(wrapper).toHaveAttribute('data-view', 'after');
    expect(after).toHaveAttribute('aria-pressed', 'true');

    await user.click(before);
    expect(wrapper).toHaveAttribute('data-view', 'before');
    expect(before).toHaveAttribute('aria-pressed', 'true');
    expect(after).toHaveAttribute('aria-pressed', 'false');
  });
});
