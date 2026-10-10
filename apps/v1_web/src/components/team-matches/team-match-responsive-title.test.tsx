import { readFileSync } from 'node:fs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import postcss from 'postcss';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetNavigationHistoryForTests } from '@/lib/navigation-history';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import type { V1TeamMatch } from '@/types/api';
import { toTeamMatch } from './team-matches.card-model';
import { TeamMatchDetailPageView } from './team-matches-page';
import type { TeamMatchDetailViewModel } from './team-matches.types';
import { getTeamMatchDetailViewModel } from './team-matches.view-model';

const MATCH_ID = '7b63bb6e-8949-4aa4-8731-b901b79b17a6';
const MATCH_TITLE = '(QA) 플랫폼 채팅 숨김 확인 1008';
const BACK_HREF = '/team-matches?sport=futsal&q=QA';
const desktopCss = readFileSync('src/app/desktop/_shell.css', 'utf8');
const clients: QueryClient[] = [];
let viewportStyle: HTMLStyleElement | undefined;

vi.mock('next/navigation', () => ({
  usePathname: () => '/team-matches/7b63bb6e-8949-4aa4-8731-b901b79b17a6',
  useSearchParams: () => new URLSearchParams({ from: '/team-matches?sport=futsal&q=QA' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  viewportStyle?.remove();
  viewportStyle = undefined;
  for (const client of clients.splice(0)) client.clear();
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
});

function renderAtWidth(model: TeamMatchDetailViewModel, width: number) {
  // jsdom은 media query를 적용하지 않으므로 실제 responsive CSS의 너비 조건만 펼쳐요.
  // 숨김 규칙을 테스트에 복제하면 실제 .tm-show-desktop 회귀를 놓칠 수 있어요.
  const css = postcss.parse(desktopCss);
  css.walkAtRules('media', (rule) => {
    const minWidth = rule.params.match(/min-width:\s*(\d+)px/);
    const maxWidth = rule.params.match(/max-width:\s*(\d+)px/);
    const applies = (minWidth || maxWidth)
      && (!minWidth || width >= Number(minWidth[1]))
      && (!maxWidth || width <= Number(maxWidth[1]));
    if (applies) rule.replaceWith(...(rule.nodes ?? []));
    else rule.remove();
  });
  viewportStyle = document.createElement('style');
  viewportStyle.textContent = css.toString();
  document.head.append(viewportStyle);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><TeamMatchDetailPageView model={model} /></QueryClientProvider>);
}

function currentModel(platformManaged = true, title = MATCH_TITLE, mode: TeamMatchDetailViewModel['mode'] = 'default'): TeamMatchDetailViewModel {
  const base = getTeamMatchDetailViewModel(mode === 'cancelled' ? 'default' : mode);
  const api: V1TeamMatch = {
    id: MATCH_ID, title, platformManaged, status: mode === 'cancelled' ? 'cancelled' : 'recruiting', capacityText: '0/2',
    sportName: '풋살', placeName: '합성 경기장', startsAt: '2099-10-10T10:00:00.000Z',
    hostTeamName: platformManaged ? undefined : '합성 홈팀',
  };
  return {
    ...base,
    mode,
    applyLabel: mode === 'cancelled' ? '취소된 팀매치예요' : undefined,
    detailBackHref: BACK_HREF,
    match: {
      ...base.match, ...toTeamMatch(api, base.match),
      hostTeamId: platformManaged ? null : 'synthetic-host', applicantTeams: [], description: '', place: null,
    },
  };
}

describe('QA #46 실제 모델 → 상세 화면 responsive 제목', () => {
  it.each([
    [390, true], [502, true], [768, true], [1188, true], [1440, true],
    [390, false], [502, false], [768, false], [1188, false], [1440, false],
  ] as const)('%spx platformManaged=%s에서 현재 매치의 제목 하나와 돌아갈 경로를 보여줘요', (width, platformManaged) => {
    renderAtWidth(currentModel(platformManaged), width);

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(MATCH_TITLE);
    expect(headings[0]).toBeVisible();
    for (const back of screen.getAllByRole('link', { name: '뒤로가기' })) {
      expect(back).toHaveAttribute('href', BACK_HREF);
    }
    if (width >= 1024) expect(headings[0].closest('.tm-desktop-page-head')).not.toBeNull();
  });

  it.each([502, 1440])('%spx에서 공백 없는 긴 제목을 자르지 않고 줄바꿈할 수 있어요', (width) => {
    const title = '긴팀매치제목'.repeat(30);
    renderAtWidth(currentModel(true, title), width);

    const heading = screen.getByRole('heading', { level: 1, name: title });
    expect(heading).toBeVisible();
    expect(heading).toHaveStyle({ overflowWrap: 'anywhere' });
    expect(heading).not.toHaveStyle({ whiteSpace: 'nowrap', overflow: 'hidden' });
  });

  it('502px에서 신청 시트를 열고 닫아도 현재 제목과 신청 입구가 유지돼요', async () => {
    const model = currentModel();
    model.applyTeamPicker = {
      teams: [{ teamId: 'synthetic-applicant', name: '합성 신청팀', roleLabel: '팀장', eligible: true, reason: null }],
      defaultTeamId: 'synthetic-applicant',
      submit: async () => undefined,
    };
    renderAtWidth(model, 502);

    fireEvent.click(screen.getByRole('button', { name: '신청하기' }));
    const sheet = await screen.findByRole('dialog', { name: '어느 팀으로 신청할까요?' });
    expect(within(sheet).getByRole('radio', { name: /합성 신청팀/ })).toBeChecked();
    fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 1, name: MATCH_TITLE })).toBeVisible();
    expect(screen.getByRole('button', { name: '신청하기' })).toBeEnabled();
  });

  it.each([
    ['pending', '신청 취소'], ['approved', '승인 완료'], ['cancelled', '취소된 팀매치예요'],
  ] as const)('502px %s 상태에서도 제목을 보존하고 실행할 수 없는 %s 액션을 활성화하지 않아요', (mode, label) => {
    renderAtWidth(currentModel(true, MATCH_TITLE, mode), 502);

    expect(screen.getByRole('heading', { level: 1, name: MATCH_TITLE })).toBeVisible();
    expect(screen.getByRole('button', { name: label })).toBeDisabled();
  });
});
