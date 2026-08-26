/**
 * U1 확장(2026-08-25): 결과 입력·정정 모달의 선택적 득점·도움 기록.
 * 잠그는 계약 —
 *  1. participants 를 주면 섹션이 뜨고, 선수 추가→입력→제출 시 onSubmit 4번째 인자로
 *     0-0 행을 제외한 participantStats 가 나간다.
 *  2. 사이드 득점 합 > 팀 스코어면 경고가 뜨고 제출이 잠긴다(서버 규칙과 동일).
 *  3. participants 미제공이면 섹션이 없고 기존 흐름은 빈 배열로 제출된다.
 *
 * F5 수정(2026-08-26)으로 잠그는 계약 —
 *  4. 정정 모드는 현재 공식 스코어를 프리필하고, 열린 뒤 props 가 다시 들어와도 덮지 않는다.
 *  5. 프리필된 칸에는 첫 포커스를 두지 않는다 — 열자마자 친 숫자가 기존 값에 이어붙으면
 *     ('2' → '32') 그대로 공식 스코어가 된다(R3 회귀).
 *  6. 본문에 뷰포트 비율 높이가 다시 붙지 않고, 액션 바는 스크롤 본문 바깥에 있다.
 *     겹침·클리핑 자체는 jsdom 에 레이아웃이 없어 못 잡는다 — 브라우저 실측 몫이다.
 *
 * R3 후속(2026-08-26)으로 잠그는 계약 —
 *  7. 스코어 비교 박스·스코어 입력은 스크롤 본문 **바깥**에 있다. 5번 때문에 첫 포커스가
 *     본문 맨 아래 사유로 가고, 브라우저는 포커스 대상을 보이게 본문을 굴린다 — 스코어
 *     UI 가 본문 안이면 그 굴림에 열자마자 밀려 나간다. 굴림의 양은 못 재도 "굴려도
 *     사라질 수 없는 위치인지"는 잴 수 있다.
 *
 * T4(2026-08-26) — **여기에 테스트가 없는 계약**: 7번이 고정 영역을 늘린 대가로 낮은
 *  뷰포트(가로 모드 폰 계열)에서 본문 예산이 0 이 될 수 있어, 본문에 min-h 바닥을 주고
 *  패널을 overflow-y-auto 로 바꿔 넘치는 만큼 모달 전체가 스크롤되게 했다. 이 계약은
 *  "높이 임계"라 jsdom 으로 원리적으로 못 잡는다(레이아웃이 없어 clientHeight 가 0).
 *  클래스 문자열을 되읊는 단언은 회귀를 하나도 못 잡으므로 쓰지 않는다 — 확인은
 *  브라우저 실측(844x390 / 390x844 / 1440x1000)이고 절차는 보고서 residualRisk 에 있다.
 *
 * C3(2026-08-27) — 390x844 에서 액션 바가 사유 입력의 아래 모서리를 23px 덮던 것을
 *  본문과 패널 양쪽의 scroll-padding-bottom(액션 바 높이 84px)으로 고쳤다. 겹침 좌표는
 *  위와 같은 이유로 여기서 못 잡는다(브라우저 실측 몫 — 실컴포넌트를 띄워 좌표로 쟀고
 *  수치는 보고서에 있다). 여기서 잠그는 것은 그 처방이 기대는 구조뿐 —
 *  8. 사유 입력의 설명(글자수)은 실제 글자수를 따라가고, 입력칸과 같은 스크롤 영역의
 *     **뒤쪽**에 있다. 그래서 굴림이 모자라면 이 설명이 가장 먼저 접힌다.
 *  9. 액션 바는 스크롤 본문 **뒤**의 형제다. 낮은 뷰포트에서 액션 바를 화면에 들이는 것은
 *     패널의 굴림이라, 액션 바가 본문 앞으로 올라가면 패널 쪽 처방의 전제가 사라진다.
 *
 * D3(2026-08-27) — 위 패널 scroll-padding-bottom 이 가로 모드 좁은 띠에서 패널을 열자마자
 *  끝까지 굴려 **모달 제목과 닫기(X)가 화면 밖으로** 나갔다(실측 844x410: 24→0px, 44→0px).
 *  헤더를 패널 스크롤포트에 sticky 로 붙여 고정했다. 고정 자체는 jsdom 이 못 잡으므로
 *  (레이아웃·Tailwind 스타일시트가 없어 computed position 이 늘 static) —
 *  10. 제목과 닫기 버튼은 **패널의 직속 자식** 상자에 함께 있고 스크롤 본문 바깥이다.
 *      sticky 는 가장 가까운 스크롤 조상에 붙으므로, 이 부모 관계가 곧 처방의 전제다.
 *
 *  로케이터 주의: 스크롤 본문은 클래스가 아니라 id(`league-result-modal-body`)로 잡는다.
 *  closest('div.overflow-y-auto') 는 본문에서 그 클래스가 빠지는 순간 패널을 잡아 단언이
 *  조용히 통과했다 — getScrollBody() 주석 참고.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { V1LeagueFixtureParticipantsResponse } from '@/types/league-match';
import { LeagueResultEntryModal } from './league-result-entry-modal';

const PARTICIPANTS: V1LeagueFixtureParticipantsResponse = {
  leagueId: 'league-1',
  teamMatchId: 'tm-1',
  home: {
    teamName: '성수 FC',
    players: [
      { participantId: 'p-h1', name: '김성수' },
      { participantId: 'p-h2', name: '박왕십' },
    ],
  },
  away: { teamName: '왕십리 유나이티드', players: [{ participantId: 'p-a1', name: '이유나' }] },
  currentStats: [],
};

type ModalProps = Parameters<typeof LeagueResultEntryModal>[0];

function renderModal(overrides: Partial<ModalProps> = {}) {
  const onSubmit = vi.fn();
  const props: ModalProps = {
    open: true,
    mode: 'entry',
    homeTeamName: '성수 FC',
    awayTeamName: '왕십리 유나이티드',
    weekLabel: '1주차',
    participants: PARTICIPANTS,
    onSubmit,
    onClose: vi.fn(),
    ...overrides,
  };
  const view = render(<LeagueResultEntryModal {...props} />);
  /** 열려 있는 동안 대진 목록이 refetch 돼 같은 모달에 새 props 가 들어오는 상황. */
  const rerenderWith = (next: Partial<ModalProps>) =>
    view.rerender(<LeagueResultEntryModal {...props} {...next} />);
  return { onSubmit, rerenderWith };
}

/**
 * 스크롤 본문을 가리키는 유일한 로케이터 — 스타일 클래스가 아니라 컴포넌트가 붙인 id 로 잡는다.
 *
 * 예전에는 `closest('div.overflow-y-auto')` 를 썼는데, 본문에서 그 클래스가 빠지면 closest 가
 * 한 칸 더 올라가 **패널**(role=dialog, 역시 overflow-y-auto)을 잡았다 — 아래 단언들이 "같은
 * 스크롤 영역 안"을 패널 기준으로 다시 계산해 전부 통과했다. 계약이 깨진 바로 그 순간에
 * 침묵하는 로케이터라 바꿨다. id 는 패널과 절대 겹치지 않으므로 그 미끄러짐이 원천 봉쇄된다.
 * "본문이 실제로 굴리는 상자인가" 는 아래 '스크롤 영역은 하나뿐' 테스트가 따로 잠근다.
 */
function getScrollBody(): HTMLElement {
  const el = document.getElementById('league-result-modal-body');
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

async function fillBaseForm(user: ReturnType<typeof userEvent.setup>) {
  // 모달 오픈 60ms 뒤 첫 입력으로 오토포커스가 한 번 더 이동한다 — 그 전에 타이핑하면
  // 포커스를 빼앗겨 입력이 중간에 끊긴다(league-match-disputes/page.test.tsx 와 같은 함정,
  // CI 저속 환경에서 실제 재현됨). 오토포커스가 끝난 뒤부터 입력한다.
  await new Promise((resolve) => setTimeout(resolve, 100));
  await user.type(screen.getByLabelText('성수 FC'), '2');
  await user.type(screen.getByLabelText('왕십리 유나이티드'), '1');
  await user.type(screen.getByLabelText(/사유/), '실측 결과 입력');
}

describe('LeagueResultEntryModal 득점·도움 기록', () => {
  it('선수를 추가해 득점·도움을 넣으면 onSubmit 에 0-0 행을 제외한 participantStats 가 실린다', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();
    await fillBaseForm(user);

    await user.selectOptions(screen.getByLabelText('성수 FC 선수 추가'), 'p-h1');
    await user.type(screen.getByLabelText('김성수 득점'), '2');
    await user.type(screen.getByLabelText('김성수 도움'), '1');
    // 추가만 하고 아무 것도 안 채운 행은 제출에서 빠져야 한다.
    await user.selectOptions(screen.getByLabelText('왕십리 유나이티드 선수 추가'), 'p-a1');

    await user.click(screen.getByRole('button', { name: '확인' }));

    expect(onSubmit).toHaveBeenCalledWith(2, 1, '실측 결과 입력', [
      { participantId: 'p-h1', goals: 2, assists: 1 },
    ]);
  });

  it('사이드 득점 합이 팀 스코어를 넘으면 경고를 띄우고 제출을 잠근다', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();
    await fillBaseForm(user);

    await user.selectOptions(screen.getByLabelText('성수 FC 선수 추가'), 'p-h1');
    await user.type(screen.getByLabelText('김성수 득점'), '3');

    expect(screen.getByRole('alert')).toHaveTextContent('기록 합이 맞지 않아요');
    await user.click(screen.getByRole('button', { name: '확인' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('도움 합이 기록된 득점 합을 넘으면 제출을 잠근다 (스코어 기준이 아니라 득점 기준)', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();
    await fillBaseForm(user);

    // 홈 스코어 2인데 기록된 득점 0 + 도움 1 — 스코어 기준이면 통과했을 조합.
    await user.selectOptions(screen.getByLabelText('성수 FC 선수 추가'), 'p-h1');
    await user.type(screen.getByLabelText('김성수 도움'), '1');

    expect(screen.getByRole('alert')).toHaveTextContent('도움 합은 기록된 득점 합을 넘을 수 없어요');
    await user.click(screen.getByRole('button', { name: '확인' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('정정 모드에서는 현재 공식 기록을 미리 채운다', () => {
    renderModal({
      mode: 'correction',
      currentHomeScore: 2,
      currentAwayScore: 1,
      participants: { ...PARTICIPANTS, currentStats: [{ participantId: 'p-h1', goals: 2, assists: 1 }] },
    });

    expect(screen.getByLabelText('김성수 득점')).toHaveValue(2);
    expect(screen.getByLabelText('김성수 도움')).toHaveValue(1);
  });

  it('participants 미제공이면 섹션이 없고 빈 배열로 제출된다', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal({ participants: null });
    await fillBaseForm(user);

    expect(screen.queryByText(/득점·도움 기록/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '확인' }));
    expect(onSubmit).toHaveBeenCalledWith(2, 1, '실측 결과 입력', []);
  });
});

describe('LeagueResultEntryModal 정정 프리필·본문 높이 (F5)', () => {
  it('정정 모드는 현재 공식 스코어를 프리필하고, 스코어를 그대로 둔 채 제출하면 원래 값이 나간다', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal({
      mode: 'correction',
      currentHomeScore: 2,
      currentAwayScore: 1,
      participants: { ...PARTICIPANTS, currentStats: [] },
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(screen.getByLabelText('성수 FC')).toHaveValue(2);
    expect(screen.getByLabelText('왕십리 유나이티드')).toHaveValue(1);
    // "전 → 후" 비교도 프리필을 반영해야 한다 — 후가 '— : —' 로 남으면 스코어를
    // 다시 입력해야만 제출되는 옛 동작이다.
    expect(screen.getAllByText('2 : 1')).toHaveLength(2);

    await user.type(screen.getByLabelText(/사유/), '득점자만 정정해요');
    await user.click(screen.getByRole('button', { name: '확인' }));

    expect(onSubmit).toHaveBeenCalledWith(2, 1, '득점자만 정정해요', []);
  });

  it('열려 있는 동안 props 가 다시 들어와도 운영자가 고친 스코어를 덮지 않는다', async () => {
    const user = userEvent.setup();
    const { rerenderWith } = renderModal({
      mode: 'correction',
      currentHomeScore: 2,
      currentAwayScore: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const homeInput = screen.getByLabelText('성수 FC');
    await user.clear(homeInput);
    await user.type(homeInput, '3');
    expect(homeInput).toHaveValue(3);

    rerenderWith({ currentHomeScore: 5, currentAwayScore: 4 });

    expect(screen.getByLabelText('성수 FC')).toHaveValue(3);
  });

  it('정정 모드에서 열자마자 숫자를 치면 프리필된 스코어에 이어붙지 않는다', async () => {
    // 회귀 재현(2026-08-26 R3): 오토포커스가 값이 든 홈 스코어 칸에 캐럿만 놓아서,
    // 운영자가 클릭 없이 바로 '3' 을 치면 2 → '32'(또는 '23') 가 됐다. 그 값은
    // scoresValid 를 통과해 그대로 공식 스코어·순위·득점왕 집계에 들어간다.
    const user = userEvent.setup();
    renderModal({ mode: 'correction', currentHomeScore: 2, currentAwayScore: 1 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    await user.keyboard('3');

    expect(screen.getByLabelText('성수 FC')).toHaveValue(2);
    // 정정에서 항상 비어 있고 항상 필수인 칸은 사유 하나뿐 — 첫 포커스는 여기여야 한다.
    expect(screen.getByLabelText(/사유/)).toHaveValue('3');
  });

  it('신규 입력 모드는 열자마자 친 숫자가 홈 스코어로 들어간다', async () => {
    // 위 수정이 신규 입력까지 사유로 옮겨 버리면 "열고 바로 스코어 타이핑" 이 깨진다.
    const user = userEvent.setup();
    renderModal({ mode: 'entry' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    await user.keyboard('2');

    expect(screen.getByLabelText('성수 FC')).toHaveValue(2);
    expect(screen.getByLabelText(/사유/)).toHaveValue('');
  });

  it('정정 모드 첫 포커스가 사유로 가도 스코어 비교·입력은 스크롤에 밀려나지 않는다', () => {
    // 회귀 재현(2026-08-26 R3): 계약 5를 지키느라 첫 포커스를 본문 맨 아래 사유로 옮겼는데,
    // 브라우저의 focus() 는 preventScroll 없이는 대상을 보이게 스크롤한다 — 본문이 넘치는
    // 뷰포트(390x844·1440x800 실측)에서 모달을 연 순간 본문이 내려가면서 '현재 공식 스코어와
    // 비교' 박스와 스코어 칸이 위로 사라졌다. 운영자는 "전 → 후" 대조를 못 본 채 사유부터
    // 쓰게 되고, 스코어를 고칠 수 있다는 것 자체를 놓친다.
    //
    // 굴림의 **양**은 jsdom 으로 못 잰다(레이아웃이 없어 clientHeight 가 0). 대신 "굴려도
    // 사라질 수 없는 자리인가"는 잴 수 있다 — 스크롤 컨테이너 바깥이면 scrollTop 이 얼마든
    // 화면에 남는다. 좌표 확인은 브라우저 실측 몫(보고서 residualRisk).
    renderModal({ mode: 'correction', currentHomeScore: 2, currentAwayScore: 1 });

    const dialog = screen.getByRole('dialog');
    // 패널 **안쪽** 스크롤 영역은 하나뿐이어야 한다 — 둘이면 어느 쪽이 굴러 무엇을 감추는지
    // 아래 단언으로 판별할 수 없다. 패널 자신은 세지 않는다(querySelectorAll 은 루트 제외):
    // 패널은 낮은 뷰포트에서 모달 전체를 굴리는 스크롤 컨테이너로 의도된 것이고(T4),
    // 그때도 비교 박스는 본문의 굴림에는 여전히 닿지 않는다 — 이 단언이 잠그는 것이 그것이다.
    const scrollers = dialog.querySelectorAll('div.overflow-y-auto');
    expect(scrollers).toHaveLength(1);
    // 그 하나가 곧 본문이다 — 다른 테스트들이 id 로 잡는 상자와 같은 것임을 여기서 한 번만
    // 묶어 둔다. 본문에서 굴림이 빠지면 여기가 0 개로 떨어져 크게 깨진다(조용한 통과 없음).
    const scrollBody = getScrollBody();
    expect(scrollers[0]).toBe(scrollBody);

    // 첫 포커스 대상은 본문 안 — 그래서 브라우저가 본문을 굴린다(전제).
    expect(scrollBody.contains(screen.getByLabelText(/사유/))).toBe(true);
    // 스코어 비교·입력은 본문 바깥 — 굴림과 무관하게 남는다.
    expect(scrollBody.contains(screen.getByText('현재 공식 스코어와 비교'))).toBe(false);
    expect(scrollBody.contains(screen.getByLabelText('성수 FC'))).toBe(false);
    expect(scrollBody.contains(screen.getByLabelText('왕십리 유나이티드'))).toBe(false);
    // 본문 밖으로 뺐다고 패널 밖으로 나가면 안 된다 — 포커스 트랩·Tab 순환 안에 있어야 한다.
    expect(dialog.contains(screen.getByLabelText('성수 FC'))).toBe(true);
  });

  it('스코어를 고정 영역으로 옮겨도 Tab 순서는 스코어 → 사유 → 액션 순 그대로다', async () => {
    // 스코어 UI 를 스크롤 본문 밖으로 올리는 수정은 DOM 순서를 건드린다 — 고정 영역을
    // 본문 뒤에 두면 화면에는 위에 있는데 Tab 은 사유 다음에 닿는 어긋남이 생긴다.
    // participants 를 빼 득점 섹션을 지우면 사슬이 짧아져 순서만 또렷하게 검증된다.
    const user = userEvent.setup();
    renderModal({ participants: null });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(screen.getByLabelText('성수 FC')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('왕십리 유나이티드')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText(/사유/)).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: '취소' })).toHaveFocus();
  });

  it('본문에 뷰포트 비율 높이가 다시 붙지 않고, 액션 바는 스크롤 본문 바깥에 있다', () => {
    // 정직하게 적어 둔다: **이 결함(겹침·클리핑) 자체는 jsdom 으로 잡을 수 없다.**
    // jsdom 에는 레이아웃이 없어 clientHeight 가 항상 0 이라 "사유가 58px 잘렸다" 를
    // 좌표로 확인할 방법이 없다 — 실제 확인은 브라우저 실측이다(보고서 residualRisk).
    // 여기서는 그 좌표를 만들어 낸 구조 두 가지만 잠근다. 클래스 문자열을 그대로
    // 되읊는 단언(패널 max-h 리터럴·flex-col·min-h-0·shrink-0)은 의미가 같은 리팩터에
    // false-fail 만 내고 정작 겹침은 하나도 못 잡아서 걷어 냈다.
    renderModal({ mode: 'correction', currentHomeScore: 2, currentAwayScore: 1 });

    const dialog = screen.getByRole('dialog');
    const scrollBody = getScrollBody();
    expect(scrollBody.contains(screen.getByLabelText(/사유/))).toBe(true);

    // ① 되돌아오면 안 되는 것: 헤더·액션 바 높이를 모르는 본문 고정 비율(옛 max-h-[60vh]).
    //    본문이 뷰포트 비율로 묶이면 패널이 뷰포트보다 작아지고 필수 입력이 다시 잘린다.
    expect(scrollBody.className).not.toMatch(/max-h-\[\d+d?v[hw]\]/);

    // ② 액션 바는 스크롤 본문 바깥 — 본문이 길어져도 '확인'·'취소' 가 함께 스크롤돼
    //    사라지지 않는다.
    const confirm = screen.getByRole('button', { name: '확인' });
    expect(scrollBody.contains(confirm)).toBe(false);

    // ③ 그리고 본문 **뒤**다(2026-08-27 C3 2라운드). 낮은 뷰포트에서는 패널까지 굴러야
    //    액션 바가 화면에 들어오는데, 그 굴림을 끝까지 끌고 가는 것이 패널의
    //    scroll-padding-bottom 이다 — 액션 바가 본문 앞으로 올라가면 그 처방의 전제가
    //    사라진다. 굴림의 양은 jsdom 이 못 재도 위아래 관계는 잰다.
    expect(scrollBody.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
      0,
    );
    // 액션 바는 여전히 패널(= 낮은 뷰포트에서 굴러 주는 상자) 안에 있어야 한다.
    expect(dialog.contains(confirm)).toBe(true);
  });

  it('모달 제목과 닫기 버튼은 패널의 직속 자식 상자에 함께 있다', () => {
    // D3(2026-08-27) 수정이 기대는 구조. 위 패널 scroll-padding-bottom 은 가로 모드 좁은 띠
    // (844x390~450 · 932x430 · 740x360 · 915x412)에서 패널을 열자마자 끝까지 굴리는데, 헤더가
    // 그냥 흘러가면 제목과 닫기(X)가 화면 밖으로 나갔다 — 실측(844x410): 제목 24 → 0px,
    // X 44 → 0px, X 중앙 hit-test null. 그래서 헤더를 패널 스크롤포트에 sticky 로 붙였다.
    //
    // **고정 자체(position:sticky)는 여기서 못 잡는다** — jsdom 에는 레이아웃도 Tailwind
    // 스타일시트도 없어 computed position 이 언제나 static 이다. 클래스 문자열을 되읊는
    // 단언은 회귀를 하나도 못 잡으므로 이 파일의 다른 계약들과 같은 규칙으로 쓰지 않는다
    // (수치 확인은 브라우저 실측 — 보고서 residualRisk 의 뷰포트 목록).
    //
    // 여기서 잠그는 것은 그 처방이 성립하는 **유일한 구조**다: sticky top-0 은 "가장 가까운
    // 스크롤 조상"에 붙는다. 헤더가 패널의 직속 자식이라 그 조상이 곧 굴러가는 패널이다 —
    // 헤더를 form 안이나 스크롤 본문 안으로 옮기면 붙는 상자가 바뀌어(또는 사라져) 제목·X 가
    // 다시 흘러가는데, 그때 이 단언이 그 자리에서 깨진다.
    renderModal({ mode: 'correction', currentHomeScore: 2, currentAwayScore: 1 });

    const dialog = screen.getByRole('dialog');
    const header = document.getElementById('league-result-modal-header');
    expect(header).not.toBeNull();

    // ① 굴러가는 상자(패널)의 직속 자식 — sticky 가 붙을 스크롤포트가 곧 이 패널이다.
    expect(header?.parentElement).toBe(dialog);

    // ② 제목과 닫기 버튼이 그 상자 **안**에 함께 있다. 둘 중 하나만 남으면
    //    "지금 무슨 모달인지" 나 "닫는 법" 중 하나가 다시 굴림에 실려 나간다.
    expect(header?.contains(screen.getByRole('heading', { name: '결과 정정' }))).toBe(true);
    expect(header?.contains(screen.getByRole('button', { name: '모달 닫기' }))).toBe(true);

    // ③ 안쪽 스크롤 본문 바깥 — 본문이 굴러도 헤더는 함께 밀리지 않는다.
    expect(getScrollBody().contains(header as Node)).toBe(false);
  });

  it('사유 입력의 설명(글자수)은 실제 글자수를 따라가고 같은 스크롤 영역의 뒤쪽에 있다', async () => {
    // C3(2026-08-27) 수정이 기대는 구조. 390x844 실측에서 액션 바가 사유 입력의 아래
    // 모서리를 23px 덮고 있었고, 그때 이 설명(글자수)은 100% 잘려 있었다 — 본문
    // scroll-padding-bottom 이 살려 내야 하는 것이 바로 이 노드다. 크기는 여기서 정하지
    // 않는다(액션 바 실측 높이 84px, 근거는 컴포넌트 주석과 브라우저 실측 표에 있다).
    // 글자수는 이 칸의 aria-describedby 대상이라, 포커스된 필수 입력의 설명이 화면에
    // 남아야 한다는 것이 지켜야 할 접근성 계약이기도 하다.
    //
    // 겹침 좌표 자체는 jsdom 이 못 잰다(레이아웃이 없다). 여기서 잠그는 것은 그 여백이
    // 기대는 두 가지뿐이다 — 설명이 실제로 이 칸의 글자수이고(이름만 같은 다른 노드가
    // 아니고), 입력칸과 같은 스크롤 영역의 뒤쪽에 있다는 것. 글자수를 고정 영역이나 라벨
    // 옆으로 옮기거나 aria-describedby 를 떼면 여기서 깨져 컴포넌트 주석을 다시 읽게 된다.
    const user = userEvent.setup();
    renderModal({ mode: 'correction', currentHomeScore: 2, currentAwayScore: 1 });

    const reason = screen.getByLabelText(/사유/);
    const describedBy = reason.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    const description = document.getElementById(describedBy as string);
    expect(description).not.toBeNull();

    // 설명이 정말 이 칸의 글자수인가 — 두 글자를 치면 그 수를 따라와야 한다.
    await user.type(reason, '오심');
    expect(description?.textContent).toContain('2');

    const scrollBody = getScrollBody();
    expect(scrollBody.contains(reason)).toBe(true);
    expect(scrollBody.contains(description as Node)).toBe(true);
    // 문서 순서상 입력칸 **뒤** — 굴림이 모자랄 때 가장 먼저 접히는 것이 이 설명이다.
    expect(
      reason.compareDocumentPosition(description as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });
});
