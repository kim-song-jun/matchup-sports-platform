import type { GameSide } from '@/types/game-operations';

type MatchupSide = Pick<GameSide, 'id' | 'sideKey' | 'displayNameSnapshot'>;

/**
 * 운영 콘솔의 경기 제목 — 홈·원정 한 줄씩(F70). 한 줄 "A vs B" 는 1440 에서도 잘렸고, 잘린 쪽이
 * 늘 원정팀이라 어느 경기를 운영 중인지 제목만으로 알 수 없었다.
 */
export function MatchupTitle({ sides }: { sides: readonly MatchupSide[] }) {
  if (sides.length === 0) return <p className="text-sm font-bold text-[var(--text-strong)]">경기 운영</p>;
  const ordered = [...sides].sort((left, right) => Number(right.sideKey === 'HOME') - Number(left.sideKey === 'HOME'));
  return (
    <div>
      {ordered.map((side) => (
        <p key={side.id} className="break-keep text-sm font-bold text-[var(--text-strong)]">
          <span className="inline-block w-7 text-xs font-normal text-[var(--text-muted)]">{side.sideKey === 'HOME' ? '홈' : '원정'}</span>
          {side.displayNameSnapshot}
        </p>
      ))}
    </div>
  );
}
