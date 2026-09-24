import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppBackLink } from './app-back-link';

const navigation = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => navigation.searchParams }));

describe('AppBackLink', () => {
  it.each([
    ['경로 출처를 따른다', 'from=%2Fmy%2Freviews', '/my/reviews'],
    ['알림 표식은 알림 화면으로 간다', 'from=notifications', '/notifications'],
    ['출처가 없으면 기본값', '', '/teams'],
    ['외부 주소는 무시하고 기본값', 'from=%2F..%2F%2Fevil.example', '/teams'],
    ['경로가 아닌 표식은 무시하고 기본값', 'from=tournament', '/teams'],
  ])('%s', (_label, query, expected) => {
    navigation.searchParams = new URLSearchParams(query);
    render(<AppBackLink fallbackHref="/teams">뒤로</AppBackLink>);
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', expected);
  });
});
