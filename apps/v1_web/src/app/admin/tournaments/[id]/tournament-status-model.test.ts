import { describe, expect, it } from 'vitest';
import type { V1TournamentStatus } from '@/types/api';
import {
  TOURNAMENT_CHIP_LABEL,
  TOURNAMENT_STAGES,
  TOURNAMENT_STAGE_LABEL,
  primaryStatusAction,
  stageIndex,
  statusActions,
  statusConfirmOptions,
  type StatusAction,
} from './tournament-status-model';

const rows = (status: V1TournamentStatus, canRevertStart = false) =>
  statusActions(status, { canRevertStart }).map((action) => [action.kind, action.target, action.label]);

describe('상태 이름·진행 단계', () => {
  it('진행 단계 5칸과 칩 이름 6개를 한 곳에서 정한다', () => {
    expect(TOURNAMENT_STAGES.map((stage) => TOURNAMENT_STAGE_LABEL[stage])).toEqual([
      '초안',
      '접수 중',
      '접수 마감',
      '진행 중',
      '완료',
    ]);
    expect(TOURNAMENT_CHIP_LABEL).toEqual({
      draft: '초안',
      open: '접수 중',
      closed: '접수 마감',
      in_progress: '진행 중',
      completed: '완료',
      cancelled: '취소됨',
    });
  });

  it('stageIndex 는 0~4 이고 취소는 단계가 없다', () => {
    expect(TOURNAMENT_STAGES.map((stage) => stageIndex(stage))).toEqual([0, 1, 2, 3, 4]);
    expect(stageIndex('cancelled')).toBeNull();
  });
});

describe('statusActions — 서버가 허용하는 전환을 순서대로', () => {
  it.each([
    ['draft', false, [['forward', 'open', '접수 시작하기'], ['cancel', 'cancelled', '대회 취소하기']]],
    ['open', false, [['forward', 'closed', '접수 마감하기'], ['cancel', 'cancelled', '대회 취소하기']]],
    [
      'closed',
      false,
      [
        ['forward', 'in_progress', '대회 시작하기'],
        ['reopen', 'open', '접수 다시 열기'],
        ['cancel', 'cancelled', '대회 취소하기'],
      ],
    ],
    ['in_progress', false, [['forward', 'completed', '대회 완료하기'], ['cancel', 'cancelled', '대회 취소하기']]],
    [
      'in_progress',
      true,
      [
        ['forward', 'completed', '대회 완료하기'],
        ['revert', 'closed', '접수 마감으로 되돌리기'],
        ['cancel', 'cancelled', '대회 취소하기'],
      ],
    ],
    ['completed', false, [['revert', 'in_progress', '진행 중으로 되돌리기']]],
    ['cancelled', false, [['revert', 'draft', '초안으로 복구']]],
  ] as [V1TournamentStatus, boolean, string[][]][])('%s (시작 전 되돌리기 %s)', (status, canRevertStart, expected) => {
    expect(rows(status, canRevertStart)).toEqual(expected);
  });

  it('canRevertStart 는 진행 중 → 접수 마감 되돌리기에만 영향을 준다', () => {
    expect(rows('open', true)).toEqual(rows('open', false));
    expect(rows('completed', true)).toEqual(rows('completed', false));
  });

  it('동작마다 설명 문구가 있고 key 는 서로 다르다', () => {
    const actions = statusActions('closed', { canRevertStart: false });
    expect(actions.map((action) => action.description)).toEqual([
      '대진표와 경기 일정을 먼저 확인해 주세요.',
      '새 신청을 다시 받아요.',
      '취소 사유를 남겨요. 나중에 초안으로 복구할 수 있어요.',
    ]);
    expect(new Set(actions.map((action) => action.key)).size).toBe(actions.length);
    expect(statusActions('draft', { canRevertStart: false })[0].description).toBe('신청을 받기 시작해요.');
    expect(statusActions('open', { canRevertStart: false })[0].description).toBe(
      '새 신청을 더 받지 않아요. 필요하면 다시 열 수 있어요.',
    );
    expect(statusActions('in_progress', { canRevertStart: false })[0].description).toBe(
      '시상과 후기가 열리고 참가팀에 후기 요청 알림이 가요.',
    );
  });

  it('되돌리기 설명은 기존 안내의 첫 문장이다', () => {
    expect(statusActions('completed', { canRevertStart: false })[0].description).toBe('완료된 대회를 다시 진행 중으로 바꿔요.');
    expect(statusActions('in_progress', { canRevertStart: true })[1].description).toBe('시작한 경기가 없을 때만 되돌릴 수 있어요.');
  });
});

describe('primaryStatusAction — 다음 단계 하나', () => {
  it.each([
    ['draft', '접수 시작하기'],
    ['open', '접수 마감하기'],
    ['closed', '대회 시작하기'],
    ['in_progress', '대회 완료하기'],
    ['completed', null],
    ['cancelled', null],
  ] as [V1TournamentStatus, string | null][])('%s → %s', (status, label) => {
    expect(primaryStatusAction(status, { canRevertStart: true })?.label ?? null).toBe(label);
  });
});

describe('statusConfirmOptions', () => {
  const find = (status: V1TournamentStatus, kind: StatusAction['kind']) => {
    const action = statusActions(status, { canRevertStart: true }).find((candidate) => candidate.kind === kind);
    if (!action) throw new Error(`${status} 에 ${kind} 동작이 없어요.`);
    return action;
  };
  const ctx = { isPublic: true, requiredLabels: [] as string[] };

  it('취소와 되돌리기는 사유 창을 쓰므로 null 이다', () => {
    expect(statusConfirmOptions(find('open', 'cancel'), ctx)).toBeNull();
    expect(statusConfirmOptions(find('completed', 'revert'), ctx)).toBeNull();
    expect(statusConfirmOptions(find('in_progress', 'revert'), ctx)).toBeNull();
  });

  it('접수 시작: 공개이고 비어 있는 설정이 없으면 공개 안내만 있다', () => {
    expect(statusConfirmOptions(find('draft', 'forward'), ctx)).toEqual({
      title: '접수를 시작할까요?',
      message: '신청을 받기 시작하고 참가자에게 대회가 공개돼요.',
      confirmLabel: '접수 시작하기',
    });
  });

  it('접수 시작: 비공개 설정이면 일반 화면에 계속 숨는다고 알린다', () => {
    const options = statusConfirmOptions(find('draft', 'forward'), { ...ctx, isPublic: false });
    expect(options?.message).toBe('신청을 받기 시작해요. 비공개 설정이라 일반 화면에는 계속 보이지 않아요.');
  });

  it('접수 시작: 필요 항목이 남아도 막지 않고 항목만 경고한다', () => {
    const options = statusConfirmOptions(find('draft', 'forward'), { isPublic: true, requiredLabels: ['장소', '정산 계좌'] });
    expect(options).not.toBeNull();
    expect(options?.message).toBe(
      '신청을 받기 시작하고 참가자에게 대회가 공개돼요. 아직 채우지 않은 설정이 있어요: 장소, 정산 계좌. 접수를 시작한 뒤에도 대회 정보에서 채울 수 있어요.',
    );
  });

  it('접수 다시 열기와 앞으로 가는 세 전환은 정해진 확인 창 문구를 쓴다', () => {
    expect(statusConfirmOptions(find('closed', 'reopen'), ctx)).toEqual({
      title: '접수를 다시 열까요?',
      message: '새 참가 신청을 다시 받아요.',
      confirmLabel: '접수 다시 열기',
    });
    expect(statusConfirmOptions(find('open', 'forward'), ctx)).toEqual({
      title: '접수를 마감할까요?',
      message: '새 참가 신청을 더 받지 않아요. 필요하면 다시 접수를 열 수 있어요.',
      confirmLabel: '접수 마감하기',
    });
    expect(statusConfirmOptions(find('closed', 'forward'), ctx)).toEqual({
      title: '대회를 시작할까요?',
      message: '대진표와 경기 일정을 먼저 확인해 주세요. 실제 시작한 경기가 없으면 접수 마감으로 되돌릴 수 있어요.',
      confirmLabel: '대회 시작하기',
    });
    expect(statusConfirmOptions(find('in_progress', 'forward'), ctx)).toEqual({
      title: '대회를 완료할까요?',
      message:
        '완료하면 시상과 후기가 열리고 참가팀에 후기 요청 알림이 가요. 모든 경기 결과가 확정됐는지 먼저 확인해 주세요. 잘못 눌러도 진행 중으로 되돌릴 수 있어요.',
      confirmLabel: '대회 완료하기',
      tone: 'danger',
    });
  });
});
