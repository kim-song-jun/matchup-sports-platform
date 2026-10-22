import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompetitionDiscoveryControls } from './competition-discovery-controls';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation, usePathname: () => '/tournaments', useSearchParams: () => new URLSearchParams() }));
const props = { filters: { kind: 'tournament' as const }, sports: [{ id: 'sport-1', label: '풋살' }], sheetOpen: false, desktop: true, total: 12, pending: false };
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe('필터 선택·적용과 목록 정렬', () => {
  it('총 건수 옆에서 정렬을 선택하고 모집 조건까지 URL에 전달한다', () => {
    render(<CompetitionDiscoveryControls {...props} />);
    expect(screen.getByText('총 12개')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '대회·리그 정렬' }), { target: { value: 'deadline' } });
    expect(navigation.replace).toHaveBeenCalledWith('/tournaments?kind=tournament&registration=open&sort=deadline', { scroll: false });
  });
  it('필터 시트를 열고 닫을 때 현재 페이지를 유지한다', () => {
    const view = render(<CompetitionDiscoveryControls {...props} page={3} />);
    expect(screen.getByRole('link', { name: '필터 열기 — 현재 전체' })).toHaveAttribute('href', '/tournaments?kind=tournament&page=3&filter=1');
    view.rerender(<CompetitionDiscoveryControls {...props} page={3} sheetOpen />);
    const dialog = within(screen.getByRole('dialog', { name: '대회·리그 필터' }));
    expect(dialog.getByRole('link', { name: '닫기' })).toHaveAttribute('href', '/tournaments?kind=tournament&page=3');
    fireEvent.click(dialog.getByRole('button', { name: '결과 보기' }));
    expect(navigation.replace).toHaveBeenCalledWith('/tournaments?kind=tournament', { scroll: false });
  });
  it('시트에서 고른 값은 결과 보기를 누르기 전 URL에 적용하지 않는다', () => {
    render(<CompetitionDiscoveryControls {...props} sheetOpen />);
    const dialog = within(screen.getByRole('dialog', { name: '대회·리그 필터' }));
    fireEvent.click(dialog.getByRole('button', { name: '혼성' }));
    fireEvent.click(dialog.getByRole('button', { name: '풋살' }));
    expect(navigation.replace).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole('button', { name: '결과 보기' }));
    expect(navigation.replace).toHaveBeenCalledWith('/tournaments?kind=tournament&sportId=sport-1&genderCategory=mixed', { scroll: false });
  });
  it('리그 시트는 성별·참가비·경기 방식을 노출하지 않는다', () => {
    render(<CompetitionDiscoveryControls {...props} filters={{ kind: 'league' }} sheetOpen />);
    const dialog = within(screen.getByRole('dialog', { name: '대회·리그 필터' }));
    expect(dialog.queryByText('성별 부문')).not.toBeInTheDocument();
    expect(dialog.queryByText('참가비')).not.toBeInTheDocument();
    expect(dialog.queryByText('경기 방식')).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: '준비 중' }));
    fireEvent.click(dialog.getByRole('button', { name: '신청 접수 중' }));
    fireEvent.click(dialog.getByRole('button', { name: '결과 보기' }));
    expect(navigation.replace).toHaveBeenCalledWith('/tournaments?kind=league&phase=upcoming&registration=open', { scroll: false });
  });
  it('시트 초기화는 임시값만 해제하고 현재 유형을 보존한다', () => {
    render(<CompetitionDiscoveryControls {...props} filters={{ kind: 'league', sportId: 'sport-1', phase: 'ongoing' }} sheetOpen />);
    const dialog = within(screen.getByRole('dialog', { name: '대회·리그 필터' }));
    fireEvent.click(dialog.getByRole('button', { name: '초기화' }));
    expect(navigation.replace).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole('button', { name: '결과 보기' }));
    expect(navigation.replace).toHaveBeenCalledWith('/tournaments?kind=league', { scroll: false });
  });
  it('날짜 역전은 적용하지 않고 오류를 안내한다', () => {
    render(<CompetitionDiscoveryControls {...props} sheetOpen />);
    fireEvent.change(screen.getByLabelText('시작 날짜'), { target: { value: '2026-11-30' } });
    fireEvent.change(screen.getByLabelText('종료 날짜'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: '결과 보기' }));
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('종료 날짜');
  });
  it('모바일 정렬은 선택 시트를 열고 선택한 정렬을 적용한다', () => {
    render(<CompetitionDiscoveryControls {...props} desktop={false} />);
    fireEvent.click(screen.getByRole('button', { name: /최신 등록순/ }));
    const sheet = screen.getByRole('dialog', { name: '정렬' });
    expect(sheet.querySelectorAll('.tm-filter-sheet-handle')).toHaveLength(1);
    const dialog = within(sheet);
    fireEvent.click(dialog.getByRole('button', { name: '개최 가까운 순' }));
    expect(navigation.replace).toHaveBeenCalledWith('/tournaments?kind=tournament&sort=scheduled', { scroll: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('모바일 B안 — 한 줄 목록 조작', () => {
  it('건수·필터·정렬을 같은 영역에 두고 외부 접수 토글·요약·초기화를 반복하지 않는다', () => {
    render(<CompetitionDiscoveryControls {...props} desktop={false} filters={{ kind: 'tournament', registration: 'open' }} total={1} />);
    const controls = within(screen.getByRole('group', { name: '대회 목록 필터 및 정렬' }));
    expect(controls.getByText('총 1개')).toBeInTheDocument();
    expect(controls.getByRole('link', { name: '필터 열기 — 현재 신청 접수 중' })).toHaveTextContent('필터 1');
    expect(controls.getByRole('button', { name: /최신 등록순/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '신청 접수 중만' })).not.toBeInTheDocument();
    expect(screen.queryByText('신청 접수 중', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '초기화' })).not.toBeInTheDocument();
  });
  it('모바일 접수 상태와 초기화는 필터 시트에서 적용하며 페이지를 첫 장으로 돌린다', () => {
    const filters = { kind: 'tournament' as const, registration: 'open' as const, sort: 'scheduled' as const };
    const view = render(<CompetitionDiscoveryControls {...props} desktop={false} filters={filters} page={3} />);
    expect(screen.getByRole('link', { name: '필터 열기 — 현재 신청 접수 중' })).toHaveAttribute('href', '/tournaments?kind=tournament&registration=open&sort=scheduled&page=3&filter=1');
    view.rerender(<CompetitionDiscoveryControls {...props} desktop={false} filters={filters} page={3} sheetOpen />);
    const dialog = within(screen.getByRole('dialog', { name: '대회·리그 필터' }));
    expect(dialog.getByRole('button', { name: /^신청 접수 중$/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(dialog.getByRole('button', { name: '초기화' }));
    expect(navigation.replace).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole('button', { name: '결과 보기' }));
    expect(navigation.replace).toHaveBeenCalledWith('/tournaments?kind=tournament&sort=scheduled', { scroll: false });
  });
  it('모바일 마감 정렬은 시트에서 접수 조건을 안내하고 적용한다', () => {
    render(<CompetitionDiscoveryControls {...props} desktop={false} />);
    fireEvent.click(screen.getByRole('button', { name: /최신 등록순/ }));
    const dialog = within(screen.getByRole('dialog', { name: '정렬' }));
    expect(dialog.getByText('마감 가까운 순은 신청 접수 중인 항목만 보여줘요.')).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: '마감 가까운 순' }));
    expect(navigation.replace).toHaveBeenCalledWith('/tournaments?kind=tournament&registration=open&sort=deadline', { scroll: false });
  });
  it('PC에서는 기존 접수 토글·조건 요약·초기화와 정렬 선택을 유지한다', () => {
    render(<CompetitionDiscoveryControls {...props} filters={{ kind: 'tournament', registration: 'open' }} />);
    expect(screen.getByRole('link', { name: '신청 접수 중만' })).toBeInTheDocument();
    expect(screen.getByText('신청 접수 중', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '초기화' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '대회·리그 정렬' })).toBeInTheDocument();
  });
});
