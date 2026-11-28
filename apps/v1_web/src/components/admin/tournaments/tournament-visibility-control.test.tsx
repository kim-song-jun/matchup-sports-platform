import { describe, expect, it, vi } from 'vitest';
import type { ActionSheetAction } from '@/components/v1-ui/action-sheet';
import type { V1TournamentStatus } from '@/types/api';
import { tournamentVisibilityAction, tournamentVisibilityHiddenReason } from './tournament-visibility-control';

type ButtonAction = Extract<ActionSheetAction, { onSelect: () => void }>;

function actionFor(overrides: Partial<Parameters<typeof tournamentVisibilityAction>[0]> = {}) {
  const onToggle = vi.fn();
  const action = tournamentVisibilityAction({
    isPublic: true,
    status: 'open' as V1TournamentStatus,
    canWrite: true,
    pending: false,
    onToggle,
    ...overrides,
  });
  return { action: action as ButtonAction | null, onToggle };
}

describe('tournamentVisibilityAction', () => {
  it('취소된 대회는 항목이 없다(노출 안 됨 사유 export 는 유지)', () => {
    expect(actionFor({ status: 'cancelled' }).action).toBeNull();
    expect(tournamentVisibilityHiddenReason('cancelled')).toBe(
      '취소된 대회는 공개 설정과 관계없이 일반 사용자 화면에 보이지 않아요.',
    );
    expect(tournamentVisibilityHiddenReason('open')).toBeUndefined();
  });

  it.each([
    [true, 'draft', '접수를 시작하면 공개돼요.'],
    [false, 'draft', '접수를 시작해도 비공개로 유지돼요.'],
    [true, 'open', '공개 대회 목록과 검색, 홈 화면에 보여요.'],
    [false, 'in_progress', '일반 사용자에게 숨겨져요. 관리자 운영과 참가·대진 정보는 유지돼요.'],
  ] as [boolean, V1TournamentStatus, string][])('공개 %s · %s 의 설명 문구', (isPublic, status, description) => {
    expect(actionFor({ isPublic, status }).action?.description).toBe(description);
  });

  it('label 은 「참가자에게 공개」, checked 는 isPublic, groupLabel 은 「공개」, 누르면 onToggle 에 !isPublic 을 넘긴다', () => {
    const publicOne = actionFor({ isPublic: true });
    expect(publicOne.action).toMatchObject({ label: '참가자에게 공개', checked: true, groupLabel: '공개', disabled: false });
    publicOne.action?.onSelect();
    expect(publicOne.onToggle).toHaveBeenCalledWith(false);

    const hiddenOne = actionFor({ isPublic: false });
    expect(hiddenOne.action?.checked).toBe(false);
    hiddenOne.action?.onSelect();
    expect(hiddenOne.onToggle).toHaveBeenCalledWith(true);
  });

  it('canWrite=false 면 비활성이고 이유는 「현재 계정은 공개 상태를 변경할 권한이 없어요.」, pending 이면 「저장 중이에요.」', () => {
    const readOnly = actionFor({ canWrite: false }).action;
    expect(readOnly).toMatchObject({ disabled: true, disabledReason: '현재 계정은 공개 상태를 변경할 권한이 없어요.' });

    const saving = actionFor({ pending: true }).action;
    expect(saving).toMatchObject({ disabled: true, disabledReason: '저장 중이에요.' });

    const idle = actionFor().action;
    expect(idle?.disabled).toBe(false);
    expect(idle?.disabledReason).toBeNull();
  });
});
