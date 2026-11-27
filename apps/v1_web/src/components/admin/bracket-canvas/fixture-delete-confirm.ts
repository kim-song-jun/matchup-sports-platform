import type { ConfirmOptions } from '@/components/v1-ui/confirm-modal';
import type { V1AdminBracketFixture } from '@/types/api';

/** 경기 삭제 확인 창 — 이 경기를 출처로 쓰는 후속 경기 수와 서버가 거절하는 상태(결과·진행 중)를 미리 알린다. */
export function fixtureDeleteConfirm(input: { title: string; fixture: V1AdminBracketFixture; fixtures: readonly V1AdminBracketFixture[] }): ConfirmOptions {
  const { title, fixture, fixtures } = input;
  const downstreamCount = fixtures.filter((candidate) => candidate.bracketSources?.some((source) => source.fixtureId === fixture.id)).length;
  const linkedImpact = downstreamCount > 0 ? ` 이 경기를 출처로 쓰는 후속 경기 ${downstreamCount}개도 영향을 받아요.` : '';
  const game = fixture.game;
  const protection = fixture.result !== null || game?.hasOfficialResult
    ? ' 결과가 있는 경기는 삭제할 수 없어요.'
    : game?.state === 'LIVE' || game?.state === 'PAUSED'
      ? ' 진행 중인 경기는 삭제할 수 없어요.'
      : '';
  return { title: '경기 삭제', message: `${title}를 삭제할까요? 되돌릴 수 없어요.${linkedImpact}${protection}`, confirmLabel: '삭제', tone: 'danger' };
}
