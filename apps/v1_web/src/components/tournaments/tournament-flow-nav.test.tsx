import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TournamentFlowNav } from './tournament-flow-nav';

describe('TournamentFlowNav — 비활성 다음 단계 버튼', () => {
  it('이름은 단계 이름이고 안내 문구는 설명으로 따로 읽힌다', () => {
    render(
      <TournamentFlowNav
        prev={{ href: '/info', label: '대회 정보' }}
        next={{ href: '/results', label: '최종결과', enabled: false, disabledHint: '대회 종료 후 공개' }}
      />,
    );

    const button = screen.getByRole('button', { name: '최종결과' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('대회 종료 후 공개');
  });

  it('안내 문구가 없으면 설명을 달지 않는다', () => {
    render(
      <TournamentFlowNav
        prev={{ href: '/info', label: '대회 정보' }}
        next={{ href: '/results', label: '최종결과', enabled: false }}
      />,
    );

    const button = screen.getByRole('button', { name: '최종결과' });
    expect(button).not.toHaveAttribute('aria-describedby');
    expect(button).toHaveAccessibleDescription('');
  });
});
