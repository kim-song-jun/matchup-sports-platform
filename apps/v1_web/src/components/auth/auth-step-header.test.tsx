import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthStepHeader } from './auth-step-header';

const STEPS = ['account', 'verify', 'profile'] as const;

function header(index: number, focusOnChange = false) {
  return (
    <AuthStepHeader
      name="회원가입"
      steps={STEPS}
      index={index}
      title={`제목 ${index + 1}`}
      sub={`부제 ${index + 1}`}
      focusOnChange={focusOnChange}
    />
  );
}

describe('AuthStepHeader', () => {
  it('진행 바에 단계 수와 지금 위치를 싣고, 지난 칸까지 켠다', () => {
    const { container } = render(header(1));

    const bar = screen.getByRole('progressbar', { name: '회원가입 진행 단계 2 / 3' });
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '3');
    expect([...container.querySelectorAll('.tm-signup-progress span')].map((span) => span.getAttribute('data-on'))).toEqual(['true', 'true', 'false']);
  });

  it('기본은 포커스를 옮기지 않고 live region 이 단계를 알린다(입력칸 autoFocus 를 쓰는 화면용)', () => {
    const { rerender } = render(header(0));
    const live = () => screen.getByText('3단계 중 1단계: 제목 1');
    expect(live()).toHaveAttribute('aria-live', 'polite');

    rerender(header(1));

    expect(screen.getByText('3단계 중 2단계: 제목 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '제목 2' })).not.toHaveFocus();
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveAttribute('tabindex');
  });

  it('줄바꿈이 든 제목은 live region 에서 공백으로 읽는다', () => {
    render(<AuthStepHeader name="회원가입" steps={STEPS} index={0} title={'가입 정보를\n확인해 주세요'} />);

    expect(screen.getByText('3단계 중 1단계: 가입 정보를 확인해 주세요')).toBeInTheDocument();
  });

  it('focusOnChange 는 처음 그릴 때가 아니라 단계가 바뀔 때만 제목으로 포커스를 옮기고, live region 은 두지 않는다', () => {
    const { rerender } = render(header(0, true));
    expect(screen.getByRole('heading', { level: 1, name: '제목 1' })).not.toHaveFocus();
    expect(screen.queryByText(/단계 중/)).not.toBeInTheDocument();

    rerender(header(1, true));
    expect(screen.getByRole('heading', { level: 1, name: '제목 2' })).toHaveFocus();

    // 같은 단계로 다시 그려도(입력 중 상태 갱신) 포커스를 뺏지 않는다.
    (document.activeElement as HTMLElement).blur();
    rerender(header(1, true));
    expect(screen.getByRole('heading', { level: 1, name: '제목 2' })).not.toHaveFocus();
  });

  it('부제가 없으면 제목만 있는 간격으로 그린다', () => {
    const { container } = render(<AuthStepHeader name="회원가입" steps={STEPS} index={2} title="프로필" />);

    expect(container.querySelector('.tm-signup-hero-title-only')).not.toBeNull();
    expect(container.querySelector('.tm-auth-sub')).toBeNull();
  });
});
