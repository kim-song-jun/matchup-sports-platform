import { describe, expect, it } from 'vitest';
import type { V1TeamMatchLineup } from '@/types/api';
import {
  buildSavePayload,
  describeLineupPhase,
  hydrateLineupEditorState,
  isLineupSubmitted,
  serverRosterEntries,
} from './lineup.view-model';

// API 타입을 먼저 배포하지 않은 창에서도 실제 응답을 기존 소비자에 전달해 검증해요.
type EffectiveLineup = V1TeamMatchLineup & {
  readonly effectiveRosterSource?: 'MANUAL' | 'DEFAULT_PREVIEW' | 'DEFAULT_FROZEN' | 'BLOCKED';
};

const qualifiedPlayer = {
  id: '14600000-0000-4000-8000-000000000001',
  userId: '14600000-0000-4000-8000-000000000101',
  displayName: '현재 자격 선수',
  jerseyNumber: 7,
  position: null,
  goalkeeper: false,
  positionX: null,
  positionY: null,
} as const;

function lineup(overrides: Partial<EffectiveLineup> = {}): EffectiveLineup {
  return {
    teamMatchId: 'tm-146',
    gameId: 'game-146',
    sideId: 'side-host',
    role: 'team_owner',
    lineupId: 'lineup-146',
    revision: 1,
    state: 'DRAFT',
    editable: true,
    lockReason: null,
    version: 1,
    formation: null,
    publicLineupAt: null,
    starters: [qualifiedPlayer],
    bench: [],
    ...overrides,
  };
}

describe('미제출 기본 참석명단 소비 (MD-QA146)', () => {
  it.each([
    { source: 'DEFAULT_PREVIEW' as const, revision: 1 },
    { source: 'DEFAULT_FROZEN' as const, revision: 2 },
  ])('$source는 실제 DRAFT 참가자와 CAS를 보존하고 제출 완료로 바꾸지 않는다', ({ source, revision }) => {
    const response = lineup({ effectiveRosterSource: source, revision, version: 3 });
    const editor = hydrateLineupEditorState(response);

    expect(editor.participants).toEqual([
      expect.objectContaining({ userId: qualifiedPlayer.userId, displayName: qualifiedPlayer.displayName, jerseyNumber: 7 }),
    ]);
    expect(buildSavePayload(editor)).toMatchObject({
      expectedVersion: revision,
      participants: [{ userId: qualifiedPlayer.userId, displayName: qualifiedPlayer.displayName, jerseyNumber: 7 }],
    });
    expect(editor.dirty).toBe(false);
    expect(isLineupSubmitted(response, null)).toBe(false);
    expect(describeLineupPhase(response.state, true, null).label).toBe('초안');
    expect(response).toMatchObject({ lineupId: 'lineup-146', revision, version: 3, state: 'DRAFT' });
  });

  it('기본 미리보기는 revision 1이어도 읽기 전용 목록에서 실제 참가자 UUID를 보인다', () => {
    const response = lineup({ effectiveRosterSource: 'DEFAULT_PREVIEW', editable: false });

    expect(serverRosterEntries(response)).toEqual([
      expect.objectContaining({ key: qualifiedPlayer.id, userId: qualifiedPlayer.userId, displayName: qualifiedPlayer.displayName }),
    ]);
  });

  it('고정된 DRAFT는 저장된 참가자를 보이고 늦게 온 선수 추가만 가능한 상태를 유지한다', () => {
    const frozenPlayer = { ...qualifiedPlayer, displayName: '고정 당시 선수' };
    const response = lineup({
      effectiveRosterSource: 'DEFAULT_FROZEN',
      revision: 2,
      starters: [frozenPlayer],
      editable: false,
      lockReason: 'records_exist',
      lateAdditionAllowed: true,
      eligibleMembers: [{ userId: 'new-member', displayName: '고정 후 새 팀원', jerseyNumber: 9, attending: true }],
    });

    expect(serverRosterEntries(response)).toEqual([
      expect.objectContaining({ key: frozenPlayer.id, displayName: '고정 당시 선수' }),
    ]);
    expect(describeLineupPhase(response.state, false, 'records_exist', false, true)).toMatchObject({
      label: '경기 중 · 추가만', editable: false,
    });
    expect(isLineupSubmitted(response, null)).toBe(false);
  });

  it('실제 수동 제출본은 revision 1이어도 제출한 참가자를 지우지 않는다', () => {
    const response = lineup({ effectiveRosterSource: 'MANUAL', state: 'SUBMITTED' });

    expect(hydrateLineupEditorState(response).participants).toEqual([
      expect.objectContaining({ userId: qualifiedPlayer.userId, displayName: qualifiedPlayer.displayName }),
    ]);
    expect(serverRosterEntries(response).map((row) => row.key)).toEqual([qualifiedPlayer.id]);
    expect(isLineupSubmitted(response, null)).toBe(true);
  });

  it('제출 후 다시 연 BLOCKED 초안은 명시된 수동 행을 유지하고 현재 팀원으로 채우지 않는다', () => {
    const response = lineup({
      effectiveRosterSource: 'BLOCKED',
      revision: 4,
      starters: [{ ...qualifiedPlayer, displayName: '다시 연 수동 선수' }],
      eligibleMembers: [{ userId: 'new-member', displayName: '새 자격 선수', jerseyNumber: 9, attending: true }],
    });

    expect(hydrateLineupEditorState(response).participants.map((row) => row.displayName)).toEqual(['다시 연 수동 선수']);
    expect(serverRosterEntries(response).map((row) => row.displayName)).toEqual(['다시 연 수동 선수']);
    expect(isLineupSubmitted(response, null)).toBe(false);
    expect(response.state).toBe('DRAFT');
  });

  it('메타데이터가 없는 구 API의 revision 1은 기존 미편집 스냅샷 처리와 호환된다', () => {
    const response = lineup();

    expect(hydrateLineupEditorState(response)).toMatchObject({ participants: [], baseRevision: 1, dirty: false });
    expect(serverRosterEntries(response)).toEqual([]);
  });

  it('다시 연 BLOCKED 초안이 비어 있으면 현재 자격 선수가 있어도 빈 명단으로 남는다', () => {
    const response = lineup({
      effectiveRosterSource: 'BLOCKED',
      revision: 4,
      starters: [],
      eligibleMembers: [{ userId: qualifiedPlayer.userId, displayName: qualifiedPlayer.displayName, jerseyNumber: 7, attending: true }],
    });

    expect(hydrateLineupEditorState(response).participants).toEqual([]);
    expect(serverRosterEntries(response)).toEqual([]);
  });
});
