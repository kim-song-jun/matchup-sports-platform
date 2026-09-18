import { V1GameResultRevisionState } from '@prisma/client';
import { resolveResultStage } from './league-result-stage';

/**
 * 이 매핑이 틀리면 운영자가 화면에서 **거짓 진행 상황**을 본다 — 예를 들어 확정본이
 * 풀린 경기를 '확정'으로 읽으면 손봐야 할 경기를 영영 지나친다. 그래서 "어느 입력이
 * 어느 단계로 읽히는가"를 값 단위로 고정한다.
 */
describe('resolveResultStage', () => {
  const rev = (state: V1GameResultRevisionState) => ({ state });

  it('확정 리비전이 있으면 최신 리비전 상태와 무관하게 확정이다', () => {
    // 확정 이후 새 초안이 열려 있어도 "지금 공식인 결과"는 존재한다.
    expect(
      resolveResultStage({
        currentOfficialRevisionId: 'rev-1',
        resultRevisions: [rev(V1GameResultRevisionState.DRAFT)],
      }),
    ).toBe('official');
  });

  it('리비전이 하나도 없으면 미입력이다', () => {
    expect(resolveResultStage({ currentOfficialRevisionId: null, resultRevisions: [] })).toBe('not_entered');
  });

  it('경기가 없으면 미입력으로 읽는다', () => {
    expect(resolveResultStage(null)).toBe('not_entered');
  });

  it('제출된 결과는 승인 대기다', () => {
    expect(
      resolveResultStage({ currentOfficialRevisionId: null, resultRevisions: [rev(V1GameResultRevisionState.SUBMITTED)] }),
    ).toBe('awaiting_approval');
  });

  it('작성 중인 초안은 작성 중이다', () => {
    expect(
      resolveResultStage({ currentOfficialRevisionId: null, resultRevisions: [rev(V1GameResultRevisionState.DRAFT)] }),
    ).toBe('draft');
  });

  // 반려·보완 요청은 contract 마이그레이션이 CHANGE_REQUESTED 로 옮겨 더는 존재하지
  // 않는다(2026-09-03). 셋을 한 단계로 묶던 계약 덕분에 그 이동으로 화면 값이 달라지지
  // 않았다 — 원래도 셋 다 여기로 왔다.
  it.each([V1GameResultRevisionState.CHANGE_REQUESTED])('%s 는 정정 요청으로 묶는다', (state) => {
    expect(resolveResultStage({ currentOfficialRevisionId: null, resultRevisions: [rev(state)] })).toBe('change_requested');
  });

  // games.service.ts의 voidTeamMatchResult는 새로 만든 VOID 리비전으로
  // currentOfficialRevisionId를 **함께 옮긴다**(4111행) — 즉 무효화된 결과는 항상
  // 포인터가 세팅된 채로 도착한다. `currentOfficialRevisionId: null` 조합은 실제로
  // 생기지 않는 픽스처였고, 그래서 "포인터가 있으면 무조건 확정"이라는 규칙에 먼저
  // 걸려 이 분기가 도달 불가능한 채로도 테스트가 계속 통과했다(감사 확인).
  it('무효화된 결과는 무효로 표시한다 (currentOfficialRevisionId가 VOID 리비전을 가리키는 실제 조합)', () => {
    expect(
      resolveResultStage({
        currentOfficialRevisionId: 'void-revision-id',
        resultRevisions: [rev(V1GameResultRevisionState.VOID)],
      }),
    ).toBe('voided');
  });

  // 확정본 포인터가 풀렸는데 리비전만 OFFICIAL 로 남은 상태는 정상이 아니다.
  // '확정'으로 읽으면 운영자가 끝난 경기로 오해하므로 손이 필요한 쪽으로 읽는다.
  it('확정 포인터 없이 OFFICIAL 만 남은 비정상 상태는 확정으로 읽지 않는다', () => {
    expect(
      resolveResultStage({ currentOfficialRevisionId: null, resultRevisions: [rev(V1GameResultRevisionState.OFFICIAL)] }),
    ).toBe('change_requested');
  });
});
