import { render, screen, within, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BracketFilterRow } from './bracket-filter-row';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('reveals a selected chip horizontally without moving the other filter row', () => {
  const items = [{ id: '', label: '전체' }, { id: 'last', label: '마지막 토너먼트' }];
  const onSelect = vi.fn();
  const show = (activeId: string) => <><BracketFilterRow label="토너먼트" items={items} activeId={activeId} onSelect={onSelect} /><BracketFilterRow label="라운드" items={items} activeId="" onSelect={onSelect} /></>;
  const { rerender } = render(show(''));
  const first = screen.getByRole('navigation', { name: '토너먼트' });
  const second = screen.getByRole('navigation', { name: '라운드' });
  second.scrollLeft = 40;
  vi.spyOn(first, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 100 } as DOMRect);
  vi.spyOn(within(first).getByRole('button', { name: '마지막 토너먼트' }), 'getBoundingClientRect').mockReturnValue({ left: 150, right: 200 } as DOMRect);
  rerender(show('last'));
  expect(first.scrollLeft).toBe(100);
  expect(second.scrollLeft).toBe(40);
  expect(within(first).getByRole('button', { name: '마지막 토너먼트' })).toHaveAttribute('aria-pressed', 'true');
});
