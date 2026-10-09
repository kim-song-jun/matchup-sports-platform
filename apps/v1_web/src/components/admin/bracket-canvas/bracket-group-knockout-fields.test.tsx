// apps/v1_web/src/components/admin/bracket-canvas/bracket-group-knockout-fields.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GROUP_KNOCKOUT_VALUE,
  GroupKnockoutFields,
  applyGroupKnockoutChange,
  groupKnockoutShapeIssue,
  type GroupKnockoutTemplateValue,
} from './bracket-group-knockout-fields';

const v = (patch: Partial<GroupKnockoutTemplateValue>): GroupKnockoutTemplateValue => ({ ...DEFAULT_GROUP_KNOCKOUT_VALUE, ...patch });

describe('groupKnockoutShapeIssue', () => {
  it('기본값과 지원하는 조합(2x1·2x2·4x1·4x2·8x1·8x2)은 문제없다', () => {
    for (const [groupCount, advancePerGroup] of [[2, 1], [2, 2], [4, 1], [4, 2], [8, 1], [8, 2]] as const) {
      expect(groupKnockoutShapeIssue(v({ groupCount, advancePerGroup }))).toBeNull();
    }
  });

  it.each([
    ['결선 크기 3', v({ groupCount: 3, advancePerGroup: 1 }), /2·4·8·16팀.*3팀/],
    ['결선 크기 6', v({ groupCount: 3, advancePerGroup: 2 }), /2·4·8·16팀.*6팀/],
    ['결선 크기 12', v({ groupCount: 6, advancePerGroup: 2 }), /2·4·8·16팀.*12팀/],
    ['결선 크기 7', v({ groupCount: 7, advancePerGroup: 1 }), /2·4·8·16팀.*7팀/],
    ['결승만인데 3·4위전', v({ advancePerGroup: 1, thirdPlace: true }), /3·4위전/],
  ])('%s → 안내 문장', (_name, value, pattern) => {
    expect(groupKnockoutShapeIssue(value)).toMatch(pattern);
  });
});

describe('applyGroupKnockoutChange', () => {
  it('결선이 결승 한 경기뿐이 되면 3·4위전을 끈다 — 대조: 4강이 있으면 유지', () => {
    expect(applyGroupKnockoutChange(v({ thirdPlace: true }), { advancePerGroup: 1 }).thirdPlace).toBe(false);
    expect(applyGroupKnockoutChange(v({ thirdPlace: true }), { teamsPerGroup: 5 }).thirdPlace).toBe(true);
  });
});

function Harness({ onChange }: { onChange?: (value: GroupKnockoutTemplateValue) => void }) {
  const [value, setValue] = useState(DEFAULT_GROUP_KNOCKOUT_VALUE);
  return (
    <GroupKnockoutFields
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('GroupKnockoutFields', () => {
  it('기본값을 보여 주고 문제가 없으면 알림이 없다', () => {
    render(<Harness />);
    expect(screen.getByLabelText('조 수')).toHaveValue('2');
    expect(screen.getByLabelText('조당 팀 수')).toHaveValue('4');
    expect(screen.getByLabelText('조별 진출 팀 수')).toHaveValue('2');
    expect(screen.getByLabelText('조별 회전')).toHaveValue('1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('지원하지 않는 조합이 되면 이유를 알림으로 보여 주고 바뀐 값은 그대로 전달한다', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('조 수'), { target: { value: '3' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ groupCount: 3, advancePerGroup: 2 }));
    expect(screen.getByRole('alert')).toHaveTextContent('2·4·8·16팀');
  });

  it('진출 팀을 1팀으로 줄여 결승만 남으면 3·4위전 체크가 꺼지고 비활성화되며 안내가 붙는다 (경고는 아니다)', () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText('3·4위전도 만들기'));
    expect(screen.getByLabelText('3·4위전도 만들기')).toBeChecked();
    fireEvent.change(screen.getByLabelText('조별 진출 팀 수'), { target: { value: '1' } });
    expect(screen.getByLabelText('3·4위전도 만들기')).not.toBeChecked();
    expect(screen.getByLabelText('3·4위전도 만들기')).toBeDisabled();
    expect(screen.getByText(/결승 한 경기뿐/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('조별 회전 선택이 전달된다', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('조별 회전'), { target: { value: '2' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ legs: 2 }));
  });

  it('disabled 면 모든 입력이 잠긴다', () => {
    render(<GroupKnockoutFields value={DEFAULT_GROUP_KNOCKOUT_VALUE} onChange={() => {}} disabled />);
    for (const label of ['조 수', '조당 팀 수', '조별 진출 팀 수', '조별 회전', '3·4위전도 만들기']) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
  });
});
