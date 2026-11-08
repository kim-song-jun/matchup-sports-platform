import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { GenderCategoryField } from './gender-category-field';
import type { V1TournamentGenderCategory } from '@/types/api';

function Fields() {
  const [first, setFirst] = useState<V1TournamentGenderCategory>('male');
  const [second, setSecond] = useState<V1TournamentGenderCategory>('female');
  return <form>
    <div role="group" aria-label="첫 리그"><GenderCategoryField value={first} onChange={setFirst} /></div>
    <div role="group" aria-label="다음 리그"><GenderCategoryField value={second} onChange={setSecond} /></div>
  </form>;
}

it('같은 폼의 성별 선택 두 묶음이 서로 선택을 해제하지 않는다', () => {
  render(<Fields />);
  const first = within(screen.getByRole('group', { name: '첫 리그' }));
  const second = within(screen.getByRole('group', { name: '다음 리그' }));
  expect(first.getByRole('radio', { name: '남성부' })).toBeChecked();
  expect(second.getByRole('radio', { name: '여성부' })).toBeChecked();
  fireEvent.click(first.getByRole('radio', { name: '혼성' }));
  expect(first.getByRole('radio', { name: '혼성' })).toBeChecked();
  expect(second.getByRole('radio', { name: '여성부' })).toBeChecked();
  fireEvent.click(second.getByRole('radio', { name: '남성부' }));
  expect(second.getByRole('radio', { name: '남성부' })).toBeChecked();
  expect(first.getByRole('radio', { name: '혼성' })).toBeChecked();
});

const cardOf = (name: string) => screen.getByRole('radio', { name, hidden: true }).closest('label') as HTMLLabelElement;

it('잠긴 선택은 어떤 카드도 활성 카드처럼(파란 선택·눌림 커서) 보이지 않고 눌러도 값이 바뀌지 않는다', () => {
  const changes: string[] = [];
  render(<GenderCategoryField value="mixed" onChange={(value) => changes.push(value)} disabled />);
  for (const name of ['혼성', '남성부', '여성부']) {
    const card = cardOf(name);
    expect(card.className).toContain('cursor-not-allowed');
    expect(card.className).not.toMatch(/cursor-pointer|border-blue|--blue/);
    expect(within(card).getByRole('radio', { hidden: true })).toBeDisabled();
  }
  fireEvent.click(cardOf('남성부'));
  expect(changes).toEqual([]);
  expect(screen.getByRole('radio', { name: '혼성', hidden: true })).toBeChecked();
});

it('잠겨도 고른 값은 다른 카드와 구분된다', () => {
  render(<GenderCategoryField value="female" onChange={() => {}} disabled />);
  expect(cardOf('여성부').className).not.toBe(cardOf('혼성').className);
});

it('잠기지 않은 선택은 계속 고를 수 있고 선택 카드는 파랗게 보인다', () => {
  const changes: string[] = [];
  render(<GenderCategoryField value="mixed" onChange={(value) => changes.push(value)} />);
  expect(cardOf('혼성').className).toContain('border-blue-500');
  expect(cardOf('남성부').className).toContain('cursor-pointer');
  expect(cardOf('남성부').className).not.toContain('cursor-not-allowed');
  fireEvent.click(screen.getByRole('radio', { name: '남성부' }));
  expect(changes).toEqual(['male']);
});
