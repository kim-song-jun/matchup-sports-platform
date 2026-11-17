import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberBracketPreviewButton } from './member-bracket-preview-button';
const mocks = vi.hoisted(() => ({ push: vi.fn(), post: vi.fn(), canWrite: true }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => mocks.canWrite }));
vi.mock('@/lib/api-client', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/api-client')>(), v1Post: mocks.post }));
const cup = '12345678-1234-4234-8234-123456789abc';
describe('MemberBracketPreviewButton', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.canWrite = true; mocks.post.mockResolvedValue({ previewId: 'audit' }); });
  function fill(url: string) {
    render(<MemberBracketPreviewButton userId="member" enabled />);
    fireEvent.click(screen.getByRole('button', { name: '회원 화면으로 보기' }));
    fireEvent.change(screen.getByLabelText('대진표 링크'), { target: { value: url } });
    fireEvent.change(screen.getByLabelText('확인 사유'), { target: { value: '경기 표시 오류 조사' } });
    fireEvent.click(screen.getByRole('button', { name: '대진표 조회' }));
  }
  it('starts an audited preview for the selected member and preserves phase without the source return URL', async () => {
    fill(`https://teameet.co.kr/tournaments/${cup}/bracket?schedulePhase=group_stage&from=%2Fmy`);
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/admin/users/member/bracket-preview/audit?schedulePhase=group_stage'));
    expect(mocks.post).toHaveBeenCalledWith('/admin/users/member/bracket-preview', { tournamentId: cup, reason: '경기 표시 오류 조사' });
  });
  it('rejects another site before any request', () => {
    fill(`https://example.test/tournaments/${cup}/bracket`);
    expect(screen.getByRole('alert')).toHaveTextContent('대진표 링크');
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('displays the actual API failure and stays on member detail', async () => {
    mocks.post.mockRejectedValue(new Error('감사 기록 저장 실패'));
    fill(`https://teameet.co.kr/tournaments/${cup}/bracket`);
    expect(await screen.findByRole('alert')).toHaveTextContent('감사 기록 저장 실패');
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it('does not expose the action to support admins', () => {
    mocks.canWrite = false; render(<MemberBracketPreviewButton userId="member" enabled />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
