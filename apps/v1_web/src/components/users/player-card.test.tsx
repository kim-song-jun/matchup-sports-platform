import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayerCard } from './player-card';
import type { V1PlayerCard, V1PlayerCardStat } from '@/types/api';

/**
 * 카드가 **사용자에게 거짓말하지 않는지**를 건다.
 *
 * 잠긴 능력치에 숫자가 그려지거나, 총점 null 이 0 으로 보이거나, 등급이 실력처럼
 * 읽히면 이 기능은 실패한 것이다 -- 셋 다 화면에서만 드러나는 종류라 여기서 잡는다.
 */

const stat = (
  code: V1PlayerCardStat['code'],
  label: string,
  value: number | null,
  lockedBy: V1PlayerCardStat['lockedBy'] = null,
): V1PlayerCardStat => ({ code, label, value, unlocked: lockedBy === null, lockedBy });

const card = (overrides: Partial<V1PlayerCard> = {}): V1PlayerCard => ({
  formulaVersion: 1,
  position: 'MF',
  overall: 72,
  tier: 'silver',
  appearances: 8,
  stats: [
    stat('SHO', '골', 68),
    stat('PAS', '도움', 74),
    stat('APP', '출전', 81),
    stat('SKI', '실력', null, { type: 'reviews', remaining: 3 }),
    stat('MAN', '매너', null, { type: 'reviews', remaining: 3 }),
    stat('PUN', '시간약속', null, { type: 'reviews', remaining: 3 }),
  ],
  unlockedCount: 3,
  nextUnlock: { code: 'SKI', reason: { type: 'reviews', remaining: 3 } },
  ...overrides,
});

const renderCard = (data: V1PlayerCard, isOwner = false) =>
  render(
    <PlayerCard
      card={data}
      displayName="김선준"
      profileImageUrl={null}
      teamName="주말 풋살"
      isOwner={isOwner}
    />,
  );

describe('선수 카드', () => {
  it('잠긴 능력치에 숫자를 그리지 않는다', () => {
    renderCard(card());

    // 열린 것은 숫자가 보인다.
    expect(screen.getByLabelText('골 68점')).toBeInTheDocument();
    // 잠긴 것은 숫자 대신 잠김으로 읽힌다 -- 자물쇠 아이콘만으로는 스크린리더가 못 읽는다.
    expect(screen.getByLabelText('실력 잠김')).toBeInTheDocument();
    expect(screen.queryByLabelText(/실력 \d+점/)).not.toBeInTheDocument();
  });

  it('총점이 없으면 0 이 아니라 값 없음으로 그린다', () => {
    const { container } = renderCard(card({ overall: null, unlockedCount: 0 }));
    const ovr = container.querySelector('.tm-player-card-ovr-value');

    expect(ovr?.textContent).toBe('–');
    expect(ovr?.textContent).not.toBe('0');
  });

  it('등급이 실력이 아니라 출전 수라는 것을 화면에 적는다', () => {
    renderCard(card({ tier: 'bronze', appearances: 2 }));

    expect(screen.getByText('등급은 실력이 아니라 뛴 경기 수로 올라가요')).toBeInTheDocument();
    expect(screen.getByText(/브론즈/)).toBeInTheDocument();
  });

  it('다음에 무엇을 하면 열리는지 한 가지만 안내한다', () => {
    renderCard(card());

    expect(screen.getByText('후기 3개를 더 받으면 열려요')).toBeInTheDocument();
    expect(screen.getByText('3 / 6 열림')).toBeInTheDocument();
  });

  describe('기록 공개 유도', () => {
    const needsConsent = card({
      stats: [
        stat('SHO', '골', null, { type: 'consent' }),
        stat('PAS', '도움', null, { type: 'consent' }),
        stat('APP', '출전', null, { type: 'consent' }),
        stat('SKI', '실력', 84),
        stat('MAN', '매너', 90),
        stat('PUN', '시간약속', 88),
      ],
      unlockedCount: 3,
      nextUnlock: { code: 'SHO', reason: { type: 'consent' } },
    });

    it('본인이 보면 공개 설정으로 데려간다 -- 이게 이 기능의 목적이다', () => {
      renderCard(needsConsent, true);

      expect(screen.getByText('기록 공개를 켜면 골·도움·출전이 한 번에 열려요')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '기록 공개하고 3개 열기' })).toHaveAttribute(
        'href',
        '/my/settings/record-consent',
      );
    });

    it('남의 카드에서는 공개하라고 권하지 않는다', () => {
      renderCard(needsConsent, false);

      expect(screen.queryByRole('link', { name: '기록 공개하고 3개 열기' })).not.toBeInTheDocument();
      // 다만 왜 잠겼는지는 남에게도 보인다 -- 카드가 왜 비었는지 알 수 없으면 오해가 생긴다.
      expect(screen.getByText('기록 공개를 켜면 골·도움·출전이 한 번에 열려요')).toBeInTheDocument();
    });
  });
});
