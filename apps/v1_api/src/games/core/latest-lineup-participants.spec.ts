import { V1GameLineupState } from '@prisma/client';
import { selectLatestLineupParticipants } from './latest-lineup-participants';

describe('selectLatestLineupParticipants', () => {
  it('keeps only the latest lineup revision independently for each side', () => {
    const participants = [
      { id: 'home-old', sideId: 'home', lineupId: 'home-1' },
      { id: 'home-new', sideId: 'home', lineupId: 'home-2' },
      { id: 'away-current', sideId: 'away', lineupId: 'away-3' },
      { id: 'away-current-2', sideId: 'away', lineupId: 'away-3' },
    ];
    const lineups = [
      { id: 'home-1', sideId: 'home', revision: 1, state: V1GameLineupState.SUBMITTED },
      { id: 'home-2', sideId: 'home', revision: 2, state: V1GameLineupState.SUBMITTED },
      { id: 'away-3', sideId: 'away', revision: 3, state: V1GameLineupState.SUBMITTED },
    ];

    expect(selectLatestLineupParticipants(participants, lineups).map((participant) => participant.id)).toEqual([
      'home-new',
      'away-current',
      'away-current-2',
    ]);
  });

  it('returns an empty list for a game without a saved lineup', () => {
    expect(selectLatestLineupParticipants([], [])).toEqual([]);
  });

  it('drops participants whose lineup row is missing instead of keeping them all', () => {
    // `undefined === undefined` 로 통과시키던 회귀 방어: 라인업이 하나도 없으면
    // 최신 리비전을 확정할 수 없으므로 어떤 participant 도 남지 않아야 한다.
    const participants = [
      { id: 'orphan-1', sideId: 'home', lineupId: 'home-1' },
      { id: 'orphan-2', sideId: 'away', lineupId: 'away-1' },
    ];

    expect(selectLatestLineupParticipants(participants, [])).toEqual([]);
  });

  it('ignores an unactioned DRAFT correction-request revision when state is supplied', () => {
    // 실제로 재현되는 경기 상태: 상대팀이 정정을 요청하면 SUBMITTED 리비전(1) 위에
    // revision 2 짜리 DRAFT 사본이 새로 열린다(team-match-lineup.service.ts
    // requestChange). 그 사이드가 킥오프 전까지 다시 저장/제출하지 않으면 DRAFT가
    // 리비전 번호상 "최신"으로 영원히 남는다. 공식 결과 스냅샷처럼 `state` 를 채워
    // 넘기는 소비처는 이 DRAFT 를 건너뛰고 실제로 제출됐던 revision 1 을 써야 한다.
    const participants = [
      { id: 'home-submitted', sideId: 'home', lineupId: 'home-1' },
      { id: 'home-draft-correction', sideId: 'home', lineupId: 'home-2' },
      { id: 'away-locked', sideId: 'away', lineupId: 'away-1' },
    ];
    const lineups = [
      { id: 'home-1', sideId: 'home', revision: 1, state: V1GameLineupState.SUBMITTED },
      { id: 'home-2', sideId: 'home', revision: 2, state: V1GameLineupState.DRAFT },
      { id: 'away-1', sideId: 'away', revision: 1, state: V1GameLineupState.LOCKED },
    ];

    expect(selectLatestLineupParticipants(participants, lineups).map((participant) => participant.id)).toEqual([
      'home-submitted',
      'away-locked',
    ]);
  });

  it('falls back to a lower revision that is still operable when the true latest is DRAFT-only', () => {
    // 위와 같은 시나리오를 더 극단으로: DRAFT 리비전만 있고 SUBMITTED/LOCKED 인
    // 리비전이 하나도 없는 사이드(정정 요청 없이 처음부터 저장만 하고 제출 전 킥오프를
    // 맞은 경우)는 "확정된 최신 운영 가능 리비전"이 아예 없으므로 참가자가 전혀 없어야
    // 한다 -- 전원 통과가 아니라 전원 배제가 안전한 방향이다(위 회귀 테스트와 동일 원칙).
    const participants = [{ id: 'home-draft-only', sideId: 'home', lineupId: 'home-1' }];
    const lineups = [{ id: 'home-1', sideId: 'home', revision: 1, state: V1GameLineupState.DRAFT }];

    expect(selectLatestLineupParticipants(participants, lineups)).toEqual([]);
  });

});
