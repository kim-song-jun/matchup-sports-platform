import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TournamentDatetimeField } from './tournament-datetime-field';

function setup(props: Partial<Parameters<typeof TournamentDatetimeField>[0]> = {}) {
  const onChange = vi.fn();
  render(<TournamentDatetimeField id="start" label="대회 시작" value="" onChange={onChange} {...props} />);
  return { onChange };
}

describe('TournamentDatetimeField', () => {
  it('label 로 입력칸을 찾고 값을 바꾸면 onChange 가 불린다', () => {
    const { onChange } = setup();

    fireEvent.change(screen.getByLabelText('대회 시작'), { target: { value: '2026-12-01T10:00' } });

    expect(onChange).toHaveBeenCalledWith('2026-12-01T10:00');
  });

  it('hint 는 기본으로 role 없는 안내 문단이고 입력칸의 설명이 된다', () => {
    setup({ hint: '시작 시각은 나중에 바꿀 수 있어요.' });

    const hint = screen.getByText('시작 시각은 나중에 바꿀 수 있어요.');
    expect(hint).not.toHaveAttribute('role');
    expect(screen.getByLabelText('대회 시작')).toHaveAccessibleDescription('시작 시각은 나중에 바꿀 수 있어요.');
  });

  it('hintTone=warning 이면 hint 가 role=status 로 읽히고 설명으로도 남는다', () => {
    setup({ hint: '마감이 시작보다 늦어요.', hintTone: 'warning' });

    expect(screen.getByRole('status')).toHaveTextContent('마감이 시작보다 늦어요.');
    expect(screen.getByLabelText('대회 시작')).toHaveAccessibleDescription('마감이 시작보다 늦어요.');
  });

  it('hintTone=warning 이어도 hint 가 없으면 status 가 없다', () => {
    setup({ hintTone: 'warning' });

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('error 가 있으면 hintTone 과 관계없이 role=alert 가 우선하고 hint 는 그리지 않는다', () => {
    setup({ hint: '마감이 시작보다 늦어요.', hintTone: 'warning', error: '날짜를 입력해 주세요.' });

    expect(screen.getByRole('alert')).toHaveTextContent('날짜를 입력해 주세요.');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('마감이 시작보다 늦어요.')).toBeNull();
    expect(screen.getByLabelText('대회 시작')).toBeInvalid();
  });
});
