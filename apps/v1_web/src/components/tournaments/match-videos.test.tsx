import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MatchVideos } from './match-videos';

/**
 * 유튜브 임베드는 우리가 제어할 수 없는 이유로 막힐 수 있다 — 사이트 CSP(frame-src),
 * 업로더가 끈 "다른 사이트에서 재생 허용", 연령 제한. 그때 모달의 iframe 은 빈 화면만
 * 보여 주므로, 원본으로 나갈 링크가 없으면 관전자는 막다른 길에 갇힌다.
 * 이 테스트는 그 탈출구가 사라지는 회귀를 잡는다.
 */
describe('MatchVideos — 유튜브 재생 모달', () => {
  it('유튜브 영상에는 원본 시청 링크를 함께 준다', async () => {
    const user = userEvent.setup();
    render(
      <MatchVideos
        videos={[{ id: 'v1', title: '결승 하이라이트', url: 'https://youtu.be/abcdefghijk' }]}
        matchLabel="레드FC vs 블루FC"
      />,
    );

    await user.click(screen.getByRole('button', { name: '결승 하이라이트 재생' }));

    const escapeHatch = screen.getByRole('link', { name: /유튜브에서 보기/ });
    expect(escapeHatch).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abcdefghijk');
    expect(escapeHatch).toHaveAttribute('target', '_blank');
  });

  it('업로드 영상 모달에는 유튜브 링크를 붙이지 않는다', async () => {
    const user = userEvent.setup();
    render(
      <MatchVideos
        videos={[{ id: 'v2', title: '전반 기록', url: '/uploads/2026/08/clip.mp4' }]}
        matchLabel="레드FC vs 블루FC"
      />,
    );

    await user.click(screen.getByRole('button', { name: '전반 기록 재생' }));

    expect(screen.queryByRole('link', { name: /유튜브에서 보기/ })).toBeNull();
  });
});
