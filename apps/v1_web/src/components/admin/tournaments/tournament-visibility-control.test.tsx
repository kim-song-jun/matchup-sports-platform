import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TournamentVisibilityControl } from './tournament-visibility-control';

vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => true }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1UpdateTournamentVisibility: () => ({ mutate: vi.fn(), isPending: false, isError: false, isSuccess: false, error: null }),
}));

const card = () => screen.getByRole('region', { name: '공개 설정' });

describe('TournamentVisibilityControl — 상태 때문에 안 보이는 대회는 그대로 말한다', () => {
  it('취소된 대회는 공개여도 "노출 안 됨"과 이유를 보이고 전환 버튼을 숨긴다', () => {
    render(<TournamentVisibilityControl tournamentId="t-1" isPublic status="cancelled" />);

    expect(card()).toHaveTextContent('현재 상태: 일반 화면에 노출 안 됨');
    expect(card()).toHaveTextContent('취소된 대회는 공개 설정과 관계없이 일반 사용자 화면에 보이지 않아요.');
    expect(card()).not.toHaveTextContent('현재 상태: 공개');
    expect(within(card()).queryByRole('button')).toBeNull();
  });

  it('준비 중인 대회는 설정을 바꿀 수 있고, 접수를 시작해야 보인다고 덧붙인다', () => {
    render(<TournamentVisibilityControl tournamentId="t-1" isPublic status="draft" />);

    expect(card()).toHaveTextContent('현재 상태: 공개');
    expect(card()).toHaveTextContent('준비 중이라 아직 일반 화면에 보이지 않아요. 접수를 시작하면 공개돼요.');
    expect(within(card()).getByRole('button', { name: '비공개로 전환' })).toBeEnabled();
  });

  it('접수 중인 대회는 지금처럼 공개 상태와 전환 버튼만 보인다', () => {
    render(<TournamentVisibilityControl tournamentId="t-1" isPublic={false} status="open" />);

    expect(card()).toHaveTextContent('현재 상태: 비공개');
    expect(card()).not.toHaveTextContent('준비 중이라');
    expect(within(card()).getByRole('button', { name: '공개로 전환' })).toBeEnabled();
  });
});
