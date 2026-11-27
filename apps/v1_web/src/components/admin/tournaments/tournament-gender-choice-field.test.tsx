import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GENDER_CHOICE_OPTIONS, TournamentGenderChoiceField, type GenderChoice } from './tournament-gender-choice-field';

function setup(props: Partial<Parameters<typeof TournamentGenderChoiceField>[0]> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <TournamentGenderChoiceField value="none" defaultValue="none" onChange={onChange} {...props} />,
  );
  return { onChange, ...utils };
}

const chipOf = (name: string) => screen.getByRole('radio', { name }).closest('label') as HTMLElement;

describe('TournamentGenderChoiceField', () => {
  it('성별 radio 4개가 구분 없음·남성부·여성부·혼성 순서로 있다', () => {
    setup();

    expect(GENDER_CHOICE_OPTIONS.map(([value]) => value)).toEqual(['none', 'male', 'female', 'mixed']);
    const group = screen.getByRole('group', { name: '성별' });
    expect(within(group).getAllByRole('radio').map((radio) => radio.closest('label')?.textContent)).toEqual([
      '구분 없음기본',
      '남성부',
      '여성부',
      '혼성',
    ]);
  });

  it('defaultValue 칸에만 「기본」 글자가 있고 defaultValue 가 바뀌면 그 칸으로 옮겨간다', () => {
    const { rerender, onChange } = setup({ defaultValue: 'none' });
    expect(screen.getAllByText('기본')).toHaveLength(1);
    expect(within(chipOf('구분 없음')).getByText('기본')).toBeInTheDocument();

    rerender(<TournamentGenderChoiceField value="none" defaultValue="male" onChange={onChange} />);

    expect(screen.getAllByText('기본')).toHaveLength(1);
    expect(within(chipOf('남성부')).getByText('기본')).toBeInTheDocument();
    expect(within(chipOf('구분 없음')).queryByText('기본')).toBeNull();
  });

  it('기본 표시는 칸의 이름을 바꾸지 않고 설명으로 읽힌다', () => {
    setup({ defaultValue: 'female' });

    expect(screen.getByRole('radio', { name: '여성부' })).toHaveAccessibleDescription('기본');
    expect(screen.getByRole('radio', { name: '남성부' })).not.toHaveAccessibleDescription();
  });

  it('칸을 누르면 onChange 가 그 값으로 불리고 value 가 가리키는 라디오만 checked 다', () => {
    const { onChange, rerender } = setup({ value: 'male' });

    expect(screen.getByRole('radio', { name: '남성부' })).toBeChecked();
    expect(screen.getAllByRole('radio').filter((radio) => (radio as HTMLInputElement).checked)).toHaveLength(1);

    fireEvent.click(screen.getByRole('radio', { name: '혼성' }));
    expect(onChange).toHaveBeenCalledWith('mixed' satisfies GenderChoice);

    rerender(<TournamentGenderChoiceField value="mixed" defaultValue="none" onChange={onChange} />);
    expect(screen.getByRole('radio', { name: '혼성' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '남성부' })).not.toBeChecked();
  });

  it('disabled 면 라디오가 전부 disabled 다', () => {
    setup({ disabled: true });

    expect(screen.getAllByRole('radio')).toHaveLength(4);
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
  });

  it('hint 와 children 이 그려진다', () => {
    setup({ value: 'mixed', hint: '혼성이면 팀 인원 구성을 정해 주세요.', children: <p>팀당 남성 최소 1명</p> });

    expect(screen.getByText('혼성이면 팀 인원 구성을 정해 주세요.')).toBeInTheDocument();
    expect(screen.getByText('팀당 남성 최소 1명')).toBeInTheDocument();
  });
});
