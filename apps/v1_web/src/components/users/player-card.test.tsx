import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
  shape: 'rect',
  position: 'MF',
  jerseyNumber: 7,
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

  it('총점이 없으면 0 이 아니라 NEW 로 그린다', () => {
    // alpha 실측(2026-08-24): 0경기 사용자의 카드는 총점 자리에 52px 대시가 그려져
    // **레이아웃이 깨진 흰 막대**로 보였다. 0 을 쓸 수 없다는 계약은 그대로 두고,
    // "아직 없음"이 글자로 읽히게 바꾼다.
    const { container } = renderCard(card({ overall: null, unlockedCount: 0 }));
    const ovr = container.querySelector('.tm-player-card-ovr-value');

    expect(ovr?.textContent).toBe('NEW');
    expect(ovr?.textContent).not.toBe('0');
  });

  it('포지션이 없으면 대시를 그리지 않는다 -- 작은 막대가 떠 있는 것처럼 보였다', () => {
    const { container } = renderCard(card({ position: null }));

    expect(container.querySelector('.tm-player-card-ovr-pos')).toBeNull();
    // 포지션이 없다는 사실은 아래 한 줄(포지션 미정)이 이미 말한다 -- 두 번 말할 필요가 없다.
    expect(screen.getByText(/포지션 미정/)).toBeInTheDocument();
  });

  it('등급이 실력이 아니라 출전 수라는 것을 화면에 적는다', () => {
    renderCard(card({ tier: 'bronze', appearances: 2 }));

    expect(screen.getByText('등급은 실력이 아니라 뛴 경기 수로 올라가요')).toBeInTheDocument();
    // 티어 한글 이름은 카드 아래 요약 줄과 뒷면 성향 태그 양쪽에 나온다.
    expect(screen.getAllByText(/브론즈/).length).toBeGreaterThan(0);
  });

  it('다음에 무엇을 하면 열리는지 한 가지만 안내한다 (본인)', () => {
    renderCard(card(), true);

    expect(screen.getByText('후기 3개를 더 받으면 열려요')).toBeInTheDocument();
    expect(screen.getByText('3 / 6 열림')).toBeInTheDocument();
  });

  it('남이 보는 카드에는 진행도·해금 안내를 그리지 않는다', () => {
    // 진행도는 카드 주인에게 하는 말이다 -- 남의 프로필에서 보이면 소음이다.
    // 잠긴 이유가 궁금한 사람에게는 뒷면(산식·잠금 사유)이 말한다.
    renderCard(card(), false);

    expect(screen.queryByText('후기 3개를 더 받으면 열려요')).not.toBeInTheDocument();
    expect(screen.queryByText('3 / 6 열림')).not.toBeInTheDocument();
    // 뒤집기·공유 같은 중립 요소는 남에게도 남는다.
    expect(screen.getByRole('button', { name: /카드 뒤집기/ })).toBeInTheDocument();
  });

  it('0경기 카드는 자물쇠 벽 대신 여정 면을 그린다 (A안)', () => {
    const { container } = renderCard(
      card({
        appearances: 0,
        overall: null,
        unlockedCount: 0,
        stats: card().stats.map((s) => ({ ...s, value: null, unlocked: false, lockedBy: { type: 'appearances' as const, remaining: 3 } })),
        nextUnlock: { code: 'APP', reason: { type: 'appearances', remaining: 1 } },
      }),
    );

    // 앞면에 자물쇠 그리드가 없다 -- "잠긴 것 목록"이 첫 카드가 되면 안 된다.
    expect(container.querySelector('.tm-player-card-stats')).toBeNull();
    expect(screen.getByText('첫 경기를 기다리는 선수')).toBeInTheDocument();
    expect(screen.getByText(/다음 목표 · 첫 경기 뛰기/)).toBeInTheDocument();
    expect(container.querySelector('.tm-player-card')?.getAttribute('data-face')).toBe('journey');
  });

  it('기록이 있으면 다음 목표 한 줄이 카드 안에 보인다', () => {
    renderCard(card());

    expect(screen.getByText(/다음 목표 · 후기 3개 받기/)).toBeInTheDocument();
  });

  it('settingsHref 를 주면 카드 설정 입구가, 없으면(남의 카드) 안 보인다', () => {
    // 적대 검증(2026-08-25) 확정 결함: 숨김·모양 설정이 카드에서 2클릭 떨어진 메뉴에만
    // 있어 발견 불가능했다. 입구는 본인 카드에서만 -- 남의 카드에 설정 아이콘이 뜨면 오해다.
    const { rerender } = render(
      <PlayerCard
        card={card()}
        displayName="김선준"
        profileImageUrl={null}
        teamName={null}
        isOwner
        settingsHref="/my/settings/player-card"
      />,
    );
    expect(screen.getByRole('link', { name: '카드 설정' })).toHaveAttribute('href', '/my/settings/player-card');

    rerender(
      <PlayerCard card={card()} displayName="김선준" profileImageUrl={null} teamName={null} isOwner={false} />,
    );
    expect(screen.queryByRole('link', { name: '카드 설정' })).not.toBeInTheDocument();
  });

  it('아직 한 경기도 안 뛴 사람에게 "더 뛰면" 이라고 말하지 않는다', () => {
    // alpha 실측(2026-08-24)에서 잡았다. 0경기 사용자가 "1경기 더 뛰면 열려요" 를
    // 받고 있었는데, 더 뛸 앞선 경기가 없는 사람에게는 틀린 말이다.
    renderCard(
      card({
        appearances: 0,
        overall: null,
        unlockedCount: 0,
        stats: [
          stat('SHO', '골', null, { type: 'appearances', remaining: 3 }),
          stat('PAS', '도움', null, { type: 'appearances', remaining: 3 }),
          stat('APP', '출전', null, { type: 'appearances', remaining: 1 }),
          stat('SKI', '실력', null, { type: 'reviews', remaining: 3 }),
          stat('MAN', '매너', null, { type: 'reviews', remaining: 3 }),
          stat('PUN', '시간약속', null, { type: 'reviews', remaining: 3 }),
        ],
        nextUnlock: { code: 'APP', reason: { type: 'appearances', remaining: 1 } },
      }),
      true,
    );

    expect(screen.getByText('첫 경기를 뛰면 기록이 쌓이기 시작해요')).toBeInTheDocument();
    expect(screen.queryByText(/더 뛰면/)).not.toBeInTheDocument();
  });

  it('티어와 형태를 data 속성으로 내보내 CSS 가 형태·재질을 그리게 한다', () => {
    // 실루엣·재질·엠블럼은 전부 globals.css 의 [data-tier][data-shape] 규칙이 그린다.
    // 이 속성이 빠지면 다섯 티어가 전부 같은 카드로 보인다 -- 화면에서만 드러나는 종류라 여기서 잡는다.
    const { container } = renderCard(card({ tier: 'gold', shape: 'shield' }));
    const root = container.querySelector('.tm-player-card');

    expect(root?.getAttribute('data-tier')).toBe('gold');
    expect(root?.getAttribute('data-shape')).toBe('shield');
  });

  it('카드를 뒤집으면 숫자의 근거(산식·잠금 사유)가 보인다', () => {
    renderCard(card());

    // 처음엔 앞면 -- 뒷면은 보조기기에서 숨겨져 있다.
    const back = document.querySelector('.tm-pcard-side[data-side="back"]');
    expect(back?.getAttribute('aria-hidden')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /카드 뒤집기/ }));

    expect(back?.getAttribute('aria-hidden')).toBe('false');
    // 뒷면이 숫자의 출처를 실제로 말하는지 -- 헤더와 총점 규칙 문장으로 확인한다.
    expect(screen.getByText(/어떤 선수인가/)).toBeInTheDocument();
    expect(screen.getByText(/총점에 넣지 않아요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /앞면 보기/ })).toBeInTheDocument();
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

    it('남의 카드에서는 공개 유도도 진행 안내도 하지 않는다', () => {
      renderCard(needsConsent, false);

      expect(screen.queryByRole('link', { name: '기록 공개하고 3개 열기' })).not.toBeInTheDocument();
      expect(screen.queryByText('기록 공개를 켜면 골·도움·출전이 한 번에 열려요')).not.toBeInTheDocument();
      // 왜 잠겼는지는 뒷면이 남에게도 말한다 -- 카드가 왜 비었는지 오해하지 않게.
      expect(screen.getByText(/골 · 기록 공개를 켜면 열려요/)).toBeInTheDocument();
    });
  });
});
