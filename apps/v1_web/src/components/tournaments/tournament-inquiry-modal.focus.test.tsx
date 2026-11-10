import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TournamentInquiryModal } from './tournament-inquiry-modal';

vi.mock('@/hooks/use-v1-api', () => ({
  useV1CreateInquiry: () => ({ mutate: vi.fn(), isPending: false }),
}));

function mockPointer(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: coarse && query === '(pointer: coarse)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function renderModal(relatedType: 'team_match' | 'tournament') {
  render(
    <TournamentInquiryModal
      tournamentId="t1"
      tournamentTitle="알파 컵"
      relatedType={relatedType}
      relatedId="r1"
      authUser={null}
      isSessionChecking={false}
      hasSessionError={false}
      onRetrySession={() => {}}
      onClose={() => {}}
      onSubmitted={() => {}}
    />,
  );
}

describe('TournamentInquiryModal 초기 포커스', () => {
  afterEach(() => {
    // @ts-expect-error 테스트 정리
    delete window.matchMedia;
  });

  it('터치 기기에서는 패널에 포커스가 가고 입력칸은 포커스되지 않아요', () => {
    mockPointer(true);
    renderModal('team_match');
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('마우스 기기에서는 첫 입력칸에 포커스가 가요', () => {
    mockPointer(false);
    renderModal('team_match');
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog.querySelector('input'));
  });

  it('터치 기기에서 패널 포커스 상태의 Shift+Tab 은 마지막 컨트롤로 되감겨요', () => {
    mockPointer(true);
    renderModal('tournament');
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(dialog);
  });
});
