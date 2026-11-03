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
