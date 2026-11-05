import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TournamentOpsDemo } from './tournament-ops-demo';
import { TournamentOpsDemoEntry } from './demo-entry';
import { DEMO_STORAGE_KEY } from '@/lib/tournament-ops-demo';

beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });

describe('대회 운영 체험 실제 UI 계약', () => {
  it('운영 목록의 CTA는 권한 없는 외부 업체도 열 수 있는 새 탭 공유 경로다', () => {
    render(<TournamentOpsDemoEntry />);
    const link = screen.getByRole('link', { name: /운영 콘솔 체험하기/ });
    expect(link).toHaveAttribute('href', '/tournament-ops-demo');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });
  it('API 없이 준비부터 참가자 결과·시상까지 실제 상태를 바꾸고 새로고침 복원한다', async () => {
    const network = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    const view = render(<TournamentOpsDemo />);
    await waitFor(() => expect(screen.getByRole('button', { name: /설정 저장 후/ })).toBeEnabled());
    await user.clear(screen.getByLabelText('체험 대회명'));
    await user.type(screen.getByLabelText('체험 대회명'), '업체 시연컵');
    await user.click(screen.getByRole('button', { name: /설정 저장 후/ }));
    for (const team of ['블루 FC', '오렌지 FS', '그린 FC', '화이트 FS']) await user.click(screen.getByRole('button', { name: `${team} 참가 확정` }));
    await user.click(screen.getByRole('button', { name: /대진 구성으로/ }));
    await user.click(screen.getByRole('button', { name: '샘플 대진 만들기' }));
    await user.click(screen.getByRole('button', { name: '기록 담당자' }));
    expect(screen.getByLabelText('체험 경기').querySelectorAll('option')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '체험 경기 시작' }));
    expect(screen.getByRole('alert')).toHaveTextContent('라인업');
    await user.click(screen.getByRole('button', { name: '체험용 라인업 준비' }));
    await user.click(screen.getByRole('button', { name: '체험 경기 시작' }));
    await user.click(screen.getByRole('button', { name: '득점 기록' }));
    expect(screen.getByLabelText('체험 경기 점수')).toHaveTextContent('1 : 0');
    await user.click(screen.getByRole('button', { name: '경고 기록' }));
    await user.click(screen.getByRole('button', { name: '마지막 기록 취소' }));
    expect(within(screen.getByRole('list', { name: '체험 경기 기록' })).getAllByRole('listitem')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '체험 경기 종료' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '체험 경기 종료' }));
    await user.click(await screen.findByRole('button', { name: /디렉터 결과 검토로/ }));
    await user.click(screen.getByRole('button', { name: '4강 1경기 체험 결과 확정' }));
    await user.click(screen.getByRole('button', { name: '체험 시상 저장' }));
    await user.click(screen.getByRole('button', { name: '참가자 화면 보기' }));
    expect(screen.getByRole('heading', { name: '참가자에게 보이는 결과' })).toBeInTheDocument();
    expect(screen.getByText('체험 MVP · 블루 FC 선수 1')).toBeInTheDocument();
    expect(screen.getByText('블루 FC 승리 · 결승 진출')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '득점 기록' })).not.toBeInTheDocument();
    view.unmount(); render(<TournamentOpsDemo />);
    await waitFor(() => expect(screen.getByLabelText('체험 대회명')).toHaveValue('업체 시연컵'));
    expect(network).not.toHaveBeenCalled();
  });
  it('손상된 저장 기록은 오류로 알리고 확인 후 자기 체험만 초기화한다', async () => {
    sessionStorage.setItem(DEMO_STORAGE_KEY, 'broken');
    sessionStorage.setItem('unrelated', 'preserve');
    const user = userEvent.setup(); render(<TournamentOpsDemo />);
    expect(await screen.findByRole('alert')).toHaveTextContent('기록을 읽거나 저장하지 못했어요');
    expect(screen.getByRole('button', { name: /설정 저장 후/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '체험 초기화' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '체험 초기화' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(sessionStorage.getItem('unrelated')).toBe('preserve');
    expect(JSON.parse(sessionStorage.getItem(DEMO_STORAGE_KEY)!)).toEqual({ version: 1, commands: [] });
  });
  it('저장 실패 시 변경 성공을 표시하거나 다음 단계로 이동하지 않는다', async () => {
    const user = userEvent.setup(); render(<TournamentOpsDemo />);
    await waitFor(() => expect(screen.getByRole('button', { name: /설정 저장 후/ })).toBeEnabled());
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('체험 저장 공간이 부족해요.'); });
    await user.click(screen.getByRole('button', { name: /설정 저장 후/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('저장 공간이 부족');
    expect(screen.getByRole('heading', { name: '대회 준비' })).toBeInTheDocument();
    expect(screen.queryByText('체험 대회 설정을 저장했어요.')).not.toBeInTheDocument();
  });
  it('공유는 진행 기록 없는 시작 URL만 복사하고 실패 시 직접 복사 경로를 보여준다', async () => {
    const user = userEvent.setup(); render(<TournamentOpsDemo />);
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    await waitFor(() => expect(screen.getByRole('button', { name: '공유 링크 복사' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '공유 링크 복사' }));
    expect(copy).toHaveBeenCalledWith(`${window.location.origin}/tournament-ops-demo`);
    expect(screen.getByRole('alert')).toHaveTextContent('직접 선택해 복사');
    fireEvent.focus(screen.getByLabelText('공유할 체험 주소'));
    expect(screen.getByLabelText('공유할 체험 주소')).toHaveValue(`${window.location.origin}/tournament-ops-demo`);
  });
});
