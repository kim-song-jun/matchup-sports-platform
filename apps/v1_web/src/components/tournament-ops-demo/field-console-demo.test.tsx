import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldConsoleDemo } from './field-console-demo';
import { TournamentOpsDemoEntry } from './demo-entry';
import { DemoReturnLink, rememberDemoReturnPath } from './demo-return-link';

vi.mock('next/navigation', () => ({ usePathname: () => '/field-console-demo', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
const EXPIRED_NOTICE = /설정된 시간이 끝났어요/;

beforeEach(() => {
  sessionStorage.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('필드 운영콘솔 안내와 체험', () => {
  it('운영콘솔 체험과 기존 주요 기능 안내를 각각 연결한다', () => {
    render(<TournamentOpsDemoEntry />);
    expect(screen.getByRole('link', { name: /운영 콘솔 체험하기/ })).toHaveAttribute('href', '/field-console-demo');
    expect(screen.getByRole('link', { name: /주요 기능 보기/ })).toHaveAttribute('href', '/tournament-ops-demo#demo-guide');
    for (const name of [/운영 콘솔 체험하기/, /주요 기능 보기/]) {
      const link = screen.getByRole('link', { name });
      expect(link).not.toHaveAttribute('target');
      link.addEventListener('click', event => event.preventDefault(), { once: true });
      fireEvent.click(link);
      expect(sessionStorage.getItem('teameet.demo.return-path')).toBe('/tournament-management');
    }
  });
  it.each(['/tournament-management', '/my/tournament-staff', '/admin/ops/tournaments'])('체험에서 원래 운영 화면 %s로 돌아간다', async (path) => {
    rememberDemoReturnPath(path);
    render(<DemoReturnLink />);
    expect(await screen.findByRole('link', { name: '대회 운영으로 돌아가기' })).toHaveAttribute('href', path);
  });
  it('외부 주소가 저장돼 있어도 내부 운영 화면으로 돌아간다', () => {
    sessionStorage.setItem('teameet.demo.return-path', 'https://example.com');
    render(<DemoReturnLink />);
    expect(screen.getByRole('link', { name: '대회 운영으로 돌아가기' })).toHaveAttribute('href', '/tournament-management');
  });
  it('실제 콘솔 위에서 5단계 안내를 보고 시작 전 체험으로 들어간다', async () => {
    const user = userEvent.setup();
    const network = vi.spyOn(globalThis, 'fetch');
    render(<FieldConsoleDemo />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('먼저 팀·점수·경기 시간을 확인해요');
    expect(screen.getByText('콘솔 사용 안내 · 1/5')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('준비가 끝나면 ‘경기 시작’을 눌러요');
    await user.click(screen.getByRole('button', { name: '이전' }));
    expect(screen.getByText('콘솔 사용 안내 · 1/5')).toBeInTheDocument();
    for (let i = 0; i < 4; i++) await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('콘솔 사용 안내 · 5/5')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '직접 체험하기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '대회 운영으로 돌아가기' })).toHaveAttribute('href', '/tournament-management');
    expect(screen.getByRole('button', { name: '경기 시작' })).toBeEnabled();
    expect(screen.getByLabelText(/스코어 블루 FC 0점, 오렌지 FS 0점/)).toBeInTheDocument();
    expect(network).not.toHaveBeenCalled();
  });
  it('시작·득점·중지·재개·전후반·종료를 실제 콘솔에서 처리하고 안내 재진입도 기록을 보존한다', async () => {
    const user = userEvent.setup();
    const network = vi.spyOn(globalThis, 'fetch');
    render(<FieldConsoleDemo />);
    await user.click(screen.getByRole('button', { name: '건너뛰기' }));
    async function command(label: string) {
      await user.click(screen.getByRole('button', { name: label }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: label }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
    await command('경기 시작');
    await user.click(screen.getByRole('button', { name: '골' }));
    const picker = await screen.findByRole('dialog');
    await user.click(within(picker).getByRole('button', { name: /김하늘/ }));
    const confirmation = await screen.findByRole('dialog');
    await user.click(within(confirmation).getByRole('button', { name: '골 기록' }));
    await waitFor(() => expect(screen.getByLabelText(/스코어 블루 FC 1점, 오렌지 FS 0점/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '옐로카드' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /김하늘/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '옐로카드 기록' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '교체' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /김하늘/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /윤겨울/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '교체 기록' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const history = screen.getByRole('heading', { name: /기록된 이벤트/ }).parentElement!;
    expect(within(history).getByText(/옐로카드/)).toBeInTheDocument();
    expect(within(history).getByText(/윤겨울/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '안내 다시 보기' }));
    await user.keyboard('{Escape}');
    expect(screen.getByLabelText(/스코어 블루 FC 1점, 오렌지 FS 0점/)).toBeInTheDocument();
    await command('일시 중지'); await command('재개');
    await command('전반 종료'); await command('후반 시작'); await command('후반 종료'); await command('경기 종료');
    expect(await screen.findByText(/샘플 경기를 종료했어요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '골' })).not.toBeInTheDocument();
    expect(network).not.toHaveBeenCalled();
  }, 20000);
  // The core re-reads the game every 5 seconds once a period runs out. Here that read must stay on the sample source.
  it('기간이 끝나 상세를 다시 읽어도 실제 서버로 요청하지 않는다', async () => {
    vi.useFakeTimers();
    try {
      const network = vi.spyOn(globalThis, 'fetch');
      render(<FieldConsoleDemo />);
      fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));
      fireEvent.click(screen.getByRole('button', { name: '경기 시작' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '경기 시작' }));
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(screen.queryByText(EXPIRED_NOTICE)).not.toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(20 * 60_000 + 16_000); });
      expect(screen.getByText(EXPIRED_NOTICE)).toBeInTheDocument();
      expect(network).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
