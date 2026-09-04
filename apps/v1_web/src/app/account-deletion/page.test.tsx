import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AccountDeletionPage from './page';

describe('AccountDeletionPage', () => {
  it('offers both the in-app path and a public request path without claiming immediate deletion', () => {
    render(<AccountDeletionPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Teameet 계정 삭제를 요청할 수 있어요' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '앱에서 탈퇴 요청하기' })).toHaveAttribute(
      'href',
      '/my/settings/withdrawal',
    );
    expect(screen.getByRole('link', { name: '이메일로 삭제 요청하기' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^mailto:teameetsports@naver\.com\?/),
    );
    expect(screen.getByText(/본인 확인을 추가로 요청할 수 있어요/)).toBeInTheDocument();
    expect(screen.getByText(/로그인과 푸시 알림 등록을 즉시 중지해요/)).toBeInTheDocument();
    expect(screen.getByText(/활동 지역과 검색 기록을 삭제하거나 식별할 수 없게 처리해요/)).toBeInTheDocument();
    expect(screen.getByText(/제한적으로 보관될 수 있어요/)).toBeInTheDocument();
  });
});
