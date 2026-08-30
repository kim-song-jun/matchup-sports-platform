import { V1GameLineupState } from '@prisma/client';
import { selectLineupParticipantsWithDraftFallback } from './latest-lineup-participants';

/**
 * [P1-c] 여기 있던 `selectLatestLineupParticipants`(제출본만 인정) 는 소비처가 0 이 되어
 * 삭제했다 -- 시작 게이트를 걷어내면서 공식 결과와 신원 연결 후보가 모두 폴백 셀렉터로
 * 넘어갔다. 아래 세 케이스는 **두 셀렉터가 공유하던 리비전 선택 로직**을 검증하던 것이라
 * 살아남는 셀렉터로 그대로 옮긴다 -- 함께 지웠으면 그 계약의 커버리지가 통째로 사라진다.
 */
describe('selectLineupParticipantsWithDraftFallback — 공유 리비전 선택 로직', () => {
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

    expect(selectLineupParticipantsWithDraftFallback(participants, lineups).map((participant) => participant.id)).toEqual([
      'home-new',
      'away-current',
      'away-current-2',
    ]);
  });

  it('returns an empty list for a game without a saved lineup', () => {
    expect(selectLineupParticipantsWithDraftFallback([], [])).toEqual([]);
  });

  it('drops participants whose lineup row is missing instead of keeping them all', () => {
    // `undefined === undefined` 로 통과시키던 회귀 방어: 라인업이 하나도 없으면
    // 최신 리비전을 확정할 수 없으므로 어떤 participant 도 남지 않아야 한다.
    const participants = [
      { id: 'orphan-1', sideId: 'home', lineupId: 'home-1' },
      { id: 'orphan-2', sideId: 'away', lineupId: 'away-1' },
    ];

    expect(selectLineupParticipantsWithDraftFallback(participants, [])).toEqual([]);
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

    expect(selectLineupParticipantsWithDraftFallback(participants, lineups).map((participant) => participant.id)).toEqual([
      'home-submitted',
      'away-locked',
    ]);
  });

});

describe('selectLineupParticipantsWithDraftFallback — 리그 결과 입력용 사이드별 폴백', () => {
  // 리그는 라이브 콘솔 시작 게이트를 거치지 않아 "끝났으면 제출본이 있다"가 거짓이다.
  // 팀장이 자동저장만 하고 '제출'을 안 누른 채 경기가 끝나는 것이 흔한 경로이고,
  // 그때 엄격 셀렉터를 쓰면 운영자 득점자 목록이 0명이 되고 출전 기록도 안 쌓였다.
  it('제출본이 하나도 없는 사이드는 최신 DRAFT 를 인정한다', () => {
    const participants = [
      { id: 'p-old', sideId: 'home', lineupId: 'home-1' },
      { id: 'p-latest', sideId: 'home', lineupId: 'home-2' },
    ];
    const lineups = [
      { id: 'home-1', sideId: 'home', revision: 1, state: V1GameLineupState.DRAFT },
      { id: 'home-2', sideId: 'home', revision: 2, state: V1GameLineupState.DRAFT },
    ];

    expect(
      selectLineupParticipantsWithDraftFallback(participants, lineups).map((p) => p.id),
    ).toEqual(['p-latest']);
  });

  it('제출본이 있는 사이드에서는 그 위에 얹힌 DRAFT 가 직전 제출을 밀어내지 못한다', () => {
    // 정정 요청으로 재오픈된 초안이 확정 제출을 덮어쓰면 안 된다 — 폴백을 넣어도
    // 이 보호는 그대로여야 한다.
    const participants = [
      { id: 'p-submitted', sideId: 'home', lineupId: 'home-1' },
      { id: 'p-reopened-draft', sideId: 'home', lineupId: 'home-2' },
    ];
    const lineups = [
      { id: 'home-1', sideId: 'home', revision: 1, state: V1GameLineupState.SUBMITTED },
      { id: 'home-2', sideId: 'home', revision: 2, state: V1GameLineupState.DRAFT },
    ];

    expect(
      selectLineupParticipantsWithDraftFallback(participants, lineups).map((p) => p.id),
    ).toEqual(['p-submitted']);
  });

  it('사이드마다 따로 판단한다 — 한쪽은 제출본, 다른 쪽은 DRAFT 폴백', () => {
    const participants = [
      { id: 'home-submitted', sideId: 'home', lineupId: 'home-1' },
      { id: 'home-draft', sideId: 'home', lineupId: 'home-2' },
      { id: 'away-draft', sideId: 'away', lineupId: 'away-1' },
    ];
    const lineups = [
      { id: 'home-1', sideId: 'home', revision: 1, state: V1GameLineupState.SUBMITTED },
      { id: 'home-2', sideId: 'home', revision: 2, state: V1GameLineupState.DRAFT },
      { id: 'away-1', sideId: 'away', revision: 1, state: V1GameLineupState.DRAFT },
    ];

    expect(
      selectLineupParticipantsWithDraftFallback(participants, lineups).map((p) => p.id).sort(),
    ).toEqual(['away-draft', 'home-submitted']);
  });
});
