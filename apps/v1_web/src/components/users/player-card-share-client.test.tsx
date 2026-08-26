import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PlayerCardShareClient } from './player-card-share-client';
import type { V1PlayerCard } from '@/types/api';

/**
 * 공유 버튼이 **아무 말 없이 실패하지 않는지**를 건다.
 *
 * 공유가 이 기능의 목적이므로 여기서 조용히 실패하면 카드를 만든 이유가 사라진다.
 * 모바일은 OS 공유 시트, 데스크톱은 링크 복사로 갈리고, 둘 다 안 되면 화면에 말한다.
 */

vi.mock('@/components/v1-ui/shell', () => ({
  AppChrome: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const card: V1PlayerCard = {
  formulaVersion: 1,
  position: 'GK',
  jerseyNumber: 1,
  overall: 48,
  tier: 'bronze',
  shape: 'rect',
  appearances: 4,
  stats: [
    { code: 'SHO', label: '골', value: 44, unlocked: true, lockedBy: null },
    { code: 'PAS', label: '도움', value: 30, unlocked: true, lockedBy: null },
    { code: 'APP', label: '출전', value: 59, unlocked: true, lockedBy: null },
    { code: 'SKI', label: '실력', value: null, unlocked: false, lockedBy: { type: 'reviews', remaining: 3 } },
    { code: 'MAN', label: '매너', value: null, unlocked: false, lockedBy: { type: 'reviews', remaining: 3 } },
    { code: 'PUN', label: '시간약속', value: null, unlocked: false, lockedBy: { type: 'reviews', remaining: 3 } },
  ],
  unlockedCount: 3,
  nextUnlock: { code: 'SKI', reason: { type: 'reviews', remaining: 3 } },
};

function renderShare() {
  return render(
    <PlayerCardShareClient
      userId="u-1"
      card={card}
      displayName="김선준"
      profileImageUrl={null}
      teamName="주말 풋살"
    />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('선수 카드 공유 화면', () => {
  it('OS 공유 시트가 있으면 그것을 연다 -- 카카오톡으로 바로 보내는 유일한 경로다', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });

    renderShare();
    fireEvent.click(screen.getByRole('button', { name: '카드 공유하기' }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    // 공유 시트가 열렸으면 복사로 내려가지 않는다 -- 둘 다 하면 사용자가 두 번 처리하게 된다.
    expect(writeText).not.toHaveBeenCalled();
  });

  it('공유 시트가 없으면 링크를 복사하고 그 사실을 말한다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderShare();
    fireEvent.click(screen.getByRole('button', { name: '카드 공유하기' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('status')).toHaveTextContent('링크를 복사했어요');
  });

  it('사용자가 공유 시트를 닫은 것은 실패로 말하지 않는다', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('사용자 취소', 'AbortError'));
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });

    renderShare();
    fireEvent.click(screen.getByRole('button', { name: '카드 공유하기' }));

    await waitFor(() => expect(share).toHaveBeenCalled());
    // 취소는 사용자의 선택이다 -- 복사로 우회하거나 에러를 띄우면 의도를 거스른다.
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('복사까지 실패하면 무엇을 하면 되는지 말한다 -- 조용히 죽지 않는다', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderShare();
    fireEvent.click(screen.getByRole('button', { name: '카드 공유하기' }));

    expect(await screen.findByRole('status')).toHaveTextContent('주소창의 주소를 직접 복사해 주세요');
  });

  it('공유 화면 자신에는 공유 화면으로 가는 링크를 두지 않는다', () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } });

    renderShare();

    expect(screen.queryByRole('link', { name: '카드 공유하기' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '프로필 전체 보기' })).toHaveAttribute('href', '/users/u-1');
  });
});
