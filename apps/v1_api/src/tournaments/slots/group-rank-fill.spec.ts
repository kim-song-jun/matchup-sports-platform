import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { GroupRankPreview, GroupRankPreviewRow } from './load-group-rank-preview';
import { planFillFromStandings } from './group-rank-fill';

const row = (slotId: string, state: GroupRankPreviewRow['state'], extra: Partial<GroupRankPreviewRow> = {}): GroupRankPreviewRow => ({
  slotId,
  label: `라벨-${slotId}`,
  state,
  candidateRegistrationId: null,
  candidateTeamName: null,
  tiedRegistrationIds: [],
  currentRegistrationId: null,
  ...extra,
});
const previewOf = (rows: GroupRankPreviewRow[], members: Record<string, string[]> = {}): GroupRankPreview => ({
  rows,
  groupMembers: new Map(rows.map((r) => [r.slotId, new Set(members[r.slotId] ?? ['X', 'Y', 'Z'])])),
});

function failure(operation: () => unknown): { type: string; code: string | undefined } {
  try {
    operation();
  } catch (error) {
    const type = (error as Error).constructor.name;
    const code = (error as { getResponse?: () => { code?: string } }).getResponse?.().code;
    return { type, code };
  }
  throw new Error('예외가 나지 않았다');
}

describe('planFillFromStandings', () => {
  it('ready 자리는 후보로 자동 배정하고 현재 값과 다른 것만 writes 에 담는다', () => {
    const plan = planFillFromStandings(
      previewOf([
        row('s1', 'ready', { candidateRegistrationId: 'X' }),
        row('s2', 'ready', { candidateRegistrationId: 'Y', currentRegistrationId: 'Z' }),
        row('s3', 'ready', { candidateRegistrationId: 'Z', currentRegistrationId: 'Z' }),
      ]),
      [],
    );
    expect(plan.assignments).toEqual([
      { slotId: 's1', registrationId: 'X' },
      { slotId: 's2', registrationId: 'Y' },
      { slotId: 's3', registrationId: 'Z' },
    ]);
    // s3 은 이미 맞게 들어 있다 — 쓰지 않는다(시작된 결선 경기에 걸린 자리를 괜히 건드리면 SLOT_LOCKED).
    expect(plan.writes).toEqual([
      { slotId: 's1', from: null, to: 'X' },
      { slotId: 's2', from: 'Z', to: 'Y' },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it('override 없는 tied 자리와 group_incomplete 자리는 건너뛰고 이유를 남긴다 — ready 자리는 그대로 채운다', () => {
    const plan = planFillFromStandings(
      previewOf([
        row('s1', 'ready', { candidateRegistrationId: 'X' }),
        row('s2', 'tied', { tiedRegistrationIds: ['Y', 'Z'] }),
        row('s3', 'group_incomplete'),
      ]),
      [],
    );
    expect(plan.assignments).toEqual([{ slotId: 's1', registrationId: 'X' }]);
    expect(plan.skipped).toEqual([
      { slotId: 's2', reason: 'tied' },
      { slotId: 's3', reason: 'group_incomplete' },
    ]);
  });

  it('tied 자리는 override 로 고른 팀이 들어간다', () => {
    const plan = planFillFromStandings(
      previewOf([row('s1', 'tied', { tiedRegistrationIds: ['X', 'Y'] })]),
      [{ slotId: 's1', registrationId: 'Y' }],
    );
    expect(plan.writes).toEqual([{ slotId: 's1', from: null, to: 'Y' }]);
    expect(plan.skipped).toEqual([]);
  });

  it('1·2위 동률 맞바꾸기(A1 <-> A2): 두 자리 모두 writes 에 from/to 가 교차로 담긴다', () => {
    const plan = planFillFromStandings(
      previewOf([
        row('a1', 'tied', { tiedRegistrationIds: ['X', 'Y'], currentRegistrationId: 'X' }),
        row('a2', 'tied', { tiedRegistrationIds: ['X', 'Y'], currentRegistrationId: 'Y' }),
      ]),
      [{ slotId: 'a1', registrationId: 'Y' }, { slotId: 'a2', registrationId: 'X' }],
    );
    expect(plan.writes).toEqual([
      { slotId: 'a1', from: 'X', to: 'Y' },
      { slotId: 'a2', from: 'Y', to: 'X' },
    ]);
  });

  it('3팀 동률에서 1·2위 자리에 서로 다른 두 팀을 골라 넣을 수 있다 (세 번째 팀은 탈락)', () => {
    const tied = { tiedRegistrationIds: ['X', 'Y', 'Z'] };
    const plan = planFillFromStandings(
      previewOf([row('a1', 'tied', tied), row('a2', 'tied', tied)]),
      [{ slotId: 'a1', registrationId: 'Z' }, { slotId: 'a2', registrationId: 'X' }],
    );
    expect(plan.assignments).toEqual([
      { slotId: 'a1', registrationId: 'Z' },
      { slotId: 'a2', registrationId: 'X' },
    ]);
  });

  it('ready 자리에도 그 조 소속 팀이면 override 로 바꿀 수 있다', () => {
    const plan = planFillFromStandings(
      previewOf([row('s1', 'ready', { candidateRegistrationId: 'X' })], { s1: ['X', 'Y'] }),
      [{ slotId: 's1', registrationId: 'Y' }],
    );
    expect(plan.assignments).toEqual([{ slotId: 's1', registrationId: 'Y' }]);
  });

  // 허용 범위는 스펙 S4 그대로다 — tied 자리 = 그 동률 팀만, ready 자리 = 그 자리의 원천 조 팀만, 그 밖은 전부 422.
  // 조 소속(X·Y·Z)과 동률 팀(X·Y)을 일부러 다르게 둬서 "조 소속이면 통과" 같은 느슨한 구현이 red 가 되게 한다.
  const GROUP = ['X', 'Y', 'Z'];
  it.each([
    ['tied 자리에 같은 조지만 동률 밖인 팀', [row('s1', 'tied', { tiedRegistrationIds: ['X', 'Y'] })], 'Z'],
    ['tied 자리에 다른 조 팀', [row('s1', 'tied', { tiedRegistrationIds: ['X', 'Y'] })], 'OUTSIDER'],
    ['ready 자리에 다른 조 팀', [row('s1', 'ready', { candidateRegistrationId: 'X' })], 'OUTSIDER'],
    ['group_incomplete 자리에 그 조 팀', [row('s1', 'group_incomplete')], 'X'],
  ])('잘못된 override(%s)는 422 SLOT_REGISTRATION_INVALID', (_name, rows, registrationId) => {
    expect(failure(() => planFillFromStandings(previewOf(rows, { s1: GROUP }), [{ slotId: 's1', registrationId }]))).toEqual({
      type: UnprocessableEntityException.name,
      code: 'SLOT_REGISTRATION_INVALID',
    });
  });

  it('같은 자리를 두 번 지정하면 422, 이 대회 순위 자리가 아닌 slotId 는 404 SLOT_NOT_FOUND', () => {
    const preview = previewOf([row('s1', 'tied', { tiedRegistrationIds: ['X', 'Y'] })]);
    expect(
      failure(() => planFillFromStandings(preview, [{ slotId: 's1', registrationId: 'X' }, { slotId: 's1', registrationId: 'Y' }])),
    ).toEqual({ type: UnprocessableEntityException.name, code: 'SLOT_REGISTRATION_INVALID' });
    expect(failure(() => planFillFromStandings(preview, [{ slotId: 'ghost', registrationId: 'X' }]))).toEqual({
      type: NotFoundException.name,
      code: 'SLOT_NOT_FOUND',
    });
  });

  it('같은 팀이 두 자리에 배정되면 409 SLOT_TEAM_ALREADY_PLACED (ready 후보 X 와 override X)', () => {
    const preview = previewOf([
      row('s1', 'ready', { candidateRegistrationId: 'X' }),
      row('s2', 'tied', { tiedRegistrationIds: ['X', 'Y'] }),
    ]);
    expect(failure(() => planFillFromStandings(preview, [{ slotId: 's2', registrationId: 'X' }]))).toEqual({
      type: ConflictException.name,
      code: 'SLOT_TEAM_ALREADY_PLACED',
    });
  });
});
