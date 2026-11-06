import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompetitionDiscoveryControls } from './competition-discovery-controls';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation, usePathname: () => '/tournaments', useSearchParams: () => new URLSearchParams() }));
const props = { filters: { kind: 'tournament' as const }, sports: [{ id: 'sport-1', label: '풋살' }], sheetOpen: false, desktop: true, total: 12, pending: false };
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe('필터 선택·적용', () => {
  it('정렬 선택은 없고 총 건수와 필터만 보여 준다', () => {
    render(<CompetitionDiscoveryControls {...props} />);
    expect(screen.getByText('총 12개')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '필터 열기 — 현재 전체' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText('정렬')).not.toBeInTheDocument();
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
  it.each(['league', 'all'] as const)('%s 시트는 성별 부문을 보여 주고 참가비·경기 방식은 노출하지 않으며 모집·진행 두 줄에서 상태를 하나만 고른다', (kind) => {
    render(<CompetitionDiscoveryControls {...props} filters={{ kind }} sheetOpen />);
    const dialog = within(screen.getByRole('dialog', { name: '대회·리그 필터' }));
    expect(within(dialog.getByRole('group', { name: '성별 부문' })).getAllByRole('button').map((button) => button.textContent)).toEqual(['전체', '남성부', '여성부', '혼성']);
    expect(dialog.queryByText('참가비')).not.toBeInTheDocument();
    expect(dialog.queryByText('경기 방식')).not.toBeInTheDocument();
    const recruit = within(dialog.getByRole('group', { name: '모집 상태' }));
    const progress = within(dialog.getByRole('group', { name: '진행 상태' }));
    expect(recruit.getAllByRole('button').map((button) => button.textContent)).toEqual(['전체', '신청 접수 중', '접수 마감']);
    expect(progress.getAllByRole('button').map((button) => button.textContent)).toEqual(['전체', '준비 중', '진행 중', '종료']);
    fireEvent.click(progress.getByRole('button', { name: '준비 중' }));
    fireEvent.click(recruit.getByRole('button', { name: '신청 접수 중' }));
    // 두 줄은 하나의 선택이다 — 다른 줄에서 고르면 앞의 줄은 '전체'로 돌아간다.
    expect(progress.getByRole('button', { name: '준비 중' })).toHaveAttribute('aria-pressed', 'false');
    expect(progress.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');
    expect(recruit.getByRole('button', { name: '신청 접수 중' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(dialog.getByRole('button', { name: '결과 보기' }));
    expect(navigation.replace).toHaveBeenCalledWith(`/tournaments?${kind === 'all' ? '' : 'kind=league&'}stage=recruiting`, { scroll: false });
  });
  it('리그 탭에서 고른 성별을 주소와 요약에 그대로 싣는다', () => {
    render(<CompetitionDiscoveryControls {...props} filters={{ kind: 'league' }} sheetOpen />);
    const dialog = within(screen.getByRole('dialog', { name: '대회·리그 필터' }));
    fireEvent.click(within(dialog.getByRole('group', { name: '성별 부문' })).getByRole('button', { name: '여성부' }));
    fireEvent.click(dialog.getByRole('button', { name: '결과 보기' }));
    expect(navigation.replace).toHaveBeenCalledWith('/tournaments?kind=league&genderCategory=female', { scroll: false });
  });
  it('한 줄의 전체는 그 줄의 선택만 해제하고 다른 줄의 선택은 건드리지 않는다', () => {
    render(<CompetitionDiscoveryControls {...props} filters={{ kind: 'league', stage: 'ongoing' }} sheetOpen />);
    const dialog = within(screen.getByRole('dialog', { name: '대회·리그 필터' }));
    const recruit = within(dialog.getByRole('group', { name: '모집 상태' }));
    const progress = within(dialog.getByRole('group', { name: '진행 상태' }));
    expect(recruit.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(recruit.getByRole('button', { name: '전체' }));
    expect(progress.getByRole('button', { name: '진행 중' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(progress.getByRole('button', { name: '전체' }));
    expect(progress.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(dialog.getByRole('button', { name: '결과 보기' }));
    expect(navigation.replace).toHaveBeenCalledWith('/tournaments?kind=league', { scroll: false });
  });
  it('대회 시트의 성별 부문에는 미지정이 없다', () => {
    render(<CompetitionDiscoveryControls {...props} sheetOpen />);
    const dialog = within(screen.getByRole('dialog', { name: '대회·리그 필터' }));
    const genders = within(dialog.getByRole('group', { name: '성별 부문' }));
    expect(genders.getAllByRole('button').map((button) => button.textContent)).toEqual(['전체', '남성부', '여성부', '혼성']);
    expect(dialog.queryByRole('button', { name: '미지정' })).not.toBeInTheDocument();
  });
  it('대회 시트의 진행 상태 줄에는 준비 중이 없다', () => {
    render(<CompetitionDiscoveryControls {...props} sheetOpen />);
    const dialog = within(screen.getByRole('dialog', { name: '대회·리그 필터' }));
    expect(within(dialog.getByRole('group', { name: '모집 상태' })).getAllByRole('button').map((button) => button.textContent)).toEqual(['전체', '신청 접수 중', '접수 마감']);
    expect(within(dialog.getByRole('group', { name: '진행 상태' })).getAllByRole('button').map((button) => button.textContent)).toEqual(['전체', '진행 중', '종료']);
  });
  it('시트 초기화는 임시값만 해제하고 현재 유형을 보존한다', () => {
    render(<CompetitionDiscoveryControls {...props} filters={{ kind: 'league', sportId: 'sport-1', stage: 'ongoing' }} sheetOpen />);
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
    // 시트 맨 아래가 아니라 날짜 칸 바로 밑에 띄운다 — 아래에 두면 '결과 보기'가 반응하지 않는 것처럼 보였다.
    expect(within(screen.getByRole('group', { name: '개최 기간' })).getByRole('alert')).toHaveTextContent('종료 날짜');
  });
  it('참가비 역전 안내는 참가비 칸 바로 밑에 띄운다', () => {
    render(<CompetitionDiscoveryControls {...props} sheetOpen />);
    fireEvent.change(screen.getByLabelText('최소 금액(원)'), { target: { value: '50000' } });
    fireEvent.change(screen.getByLabelText('최대 금액(원)'), { target: { value: '10000' } });
    fireEvent.click(screen.getByRole('button', { name: '결과 보기' }));
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(within(screen.getByRole('group', { name: '참가비' })).getByRole('alert')).toHaveTextContent('최대 참가비');
    expect(within(screen.getByRole('group', { name: '개최 기간' })).queryByRole('alert')).not.toBeInTheDocument();
  });
  it('최소 금액만 고르면 요약을 "N원 이상"으로 보여 준다', () => {
    render(<CompetitionDiscoveryControls {...props} filters={{ kind: 'tournament', feeMin: 100000 }} />);
    expect(screen.getByText('100,000원 이상')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '필터 열기 — 현재 100,000원 이상' })).toBeInTheDocument();
  });
});

describe('모바일 B안 — 한 줄 목록 조작', () => {
  it('건수와 필터를 같은 영역에 두고 정렬 버튼·외부 접수 토글·요약·초기화를 두지 않는다', () => {
    render(<CompetitionDiscoveryControls {...props} desktop={false} filters={{ kind: 'tournament', stage: 'recruiting' }} total={1} />);
    const controls = within(screen.getByRole('group', { name: '대회 목록 필터' }));
    expect(controls.getByText('총 1개')).toBeInTheDocument();
    expect(controls.getByRole('link', { name: '필터 열기 — 현재 신청 접수 중' })).toHaveTextContent('필터 1');
    expect(screen.queryByRole('button', { name: /최신 등록순|정렬/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '접수 중만' })).not.toBeInTheDocument();
    expect(screen.queryByText('신청 접수 중', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '초기화' })).not.toBeInTheDocument();
  });
  it('모바일 상태와 초기화는 필터 시트에서 적용하며 페이지를 첫 장으로 돌린다', () => {
    const filters = { kind: 'tournament' as const, stage: 'recruiting' as const };
    const view = render(<CompetitionDiscoveryControls {...props} desktop={false} filters={filters} page={3} />);
    expect(screen.getByRole('link', { name: '필터 열기 — 현재 신청 접수 중' })).toHaveAttribute('href', '/tournaments?kind=tournament&stage=recruiting&page=3&filter=1');
    view.rerender(<CompetitionDiscoveryControls {...props} desktop={false} filters={filters} page={3} sheetOpen />);
    const dialog = within(screen.getByRole('dialog', { name: '대회·리그 필터' }));
    expect(dialog.getByRole('button', { name: /^신청 접수 중$/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(dialog.getByRole('button', { name: '초기화' }));
    expect(navigation.replace).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole('button', { name: '결과 보기' }));
    expect(navigation.replace).toHaveBeenCalledWith('/tournaments?kind=tournament', { scroll: false });
  });
  it('PC에서는 조건 요약·초기화를 두고 접수 토글과 정렬 선택은 두지 않는다', () => {
    render(<CompetitionDiscoveryControls {...props} filters={{ kind: 'tournament', stage: 'recruiting' }} />);
    expect(screen.queryByRole('link', { name: '접수 중만' })).not.toBeInTheDocument();
    expect(screen.getByText('신청 접수 중', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '초기화' })).toHaveAttribute('href', '/tournaments?kind=tournament');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
