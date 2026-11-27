import type { ConfirmOptions } from '@/components/v1-ui/confirm-modal';
import type { V1AdminBracketFixture } from '@/types/api';

/** 서버가 삭제를 거절하는 경기(결과가 있거나 진행 중)의 이유. 지울 수 있으면 null. 휴지통은 이때 눌리지 않게 한다. */
export function fixtureDeleteBlockedReason(fixture: V1AdminBracketFixture): string | null {
  const game = fixture.game;
  if (fixture.result !== null || game?.hasOfficialResult) return '결과가 있는 경기는 삭제할 수 없어요.';
  if (game?.state === 'LIVE' || game?.state === 'PAUSED') return '진행 중인 경기는 삭제할 수 없어요.';
  return null;
}

/** 경기 삭제 확인 창 — 이 경기를 출처로 쓰는 후속 경기 수를 미리 알린다. */
export function fixtureDeleteConfirm(input: { title: string; fixture: V1AdminBracketFixture; fixtures: readonly V1AdminBracketFixture[] }): ConfirmOptions {
  const { title, fixture, fixtures } = input;
  const downstreamCount = fixtures.filter((candidate) => candidate.bracketSources?.some((source) => source.fixtureId === fixture.id)).length;
  const linkedImpact = downstreamCount > 0 ? ` 이 경기를 출처로 쓰는 후속 경기 ${downstreamCount}개도 영향을 받아요.` : '';
  return { title: '경기 삭제', message: `${title}를 삭제할까요? 되돌릴 수 없어요.${linkedImpact}`, confirmLabel: '삭제', tone: 'danger' };
}
