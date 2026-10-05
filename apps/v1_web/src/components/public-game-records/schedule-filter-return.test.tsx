import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { BracketPageContent } from '@/app/tournaments/[id]/bracket/bracket-page-client';
import LeagueFixtureDetailClient from '@/app/league-matches/[leagueId]/fixtures/[fixtureId]/league-fixture-detail-client';
import { ScheduleContent } from '@/components/public-game-records/schedule-content';
import { AppBackLink } from '@/components/v1-ui/app-back-link';
import { __resetNavigationHistoryForTests, installNavigationHistory } from '@/lib/navigation-history';
import { useV1LeagueMatch, useV1LeagueMatchStandings, useV1ResolveChatRoom, useV1TeamMatch } from '@/hooks/use-v1-api';
import { usePublicLeagueFixtureRecord } from '@/components/public-game-records/use-public-game-records';
import type { PublicMatchDetail, PublicTournamentScheduleResponse } from '@/components/public-game-records/types';
import type { V1TournamentDetail } from '@/types/api';
import { installActualNextReplaceBoundary } from '@/test/helpers/next-history-boundary';

const navigation = vi.hoisted(() => ({ snapshot: null as string | null,
 router: {back:vi.fn(() => window.history.back()), replace:vi.fn((href:string) => window.history.replaceState(window.history.state,'',href)), push:vi.fn(), prefetch:vi.fn()}}));
vi.mock('next/navigation', () => ({
 usePathname: () => window.location.pathname,
 useSearchParams: () => new URLSearchParams(navigation.snapshot ?? window.location.search),
 useRouter: () => navigation.router,
}));
// Next navigation boundary: click the real rendered link, then model only same-tab routing.
vi.mock('next/link', () => ({default: ({href,children,onClick,prefetch: _prefetch,...props}: any) => <a {...props} href={href} onClick={(event) => {
 onClick?.(event); if(event.defaultPrevented) return; event.preventDefault(); window.history.pushState({},'',href);
}}>{children}</a>}));
vi.mock('@/hooks/use-v1-api', () => ({
 useV1MyTournamentFixtures: () => ({data:undefined}),
 useV1LeagueMatch:vi.fn(),useV1LeagueMatchStandings:vi.fn(),useV1TeamMatch:vi.fn(),useV1ResolveChatRoom:vi.fn(),
}));
vi.mock('@/components/public-game-records/use-public-game-records', () => ({
 usePublicTournamentSchedule: () => ({data:{pages:[scheduleData()],pageParams:[null]},isPending:false,isError:false,hasNextPage:false,isFetchingNextPage:false,fetchNextPage:vi.fn()}),
 usePublicTournamentPlayerRecords: () => ({data:{goals:[],assists:[],hiddenByEligibility:false},isLoading:false,isError:false,refetch:vi.fn()}),
 usePublicLeagueFixtureRecord:vi.fn(),
}));
// Participant actions are outside the public filter/navigation contract.
vi.mock('@/components/game-roster/use-my-match-roster-team', () => ({useMyMatchRosterTeam: () => ({status:'none'})}));
vi.mock('@/components/game-roster/match-team-roster-card', () => ({MatchTeamRosterCard:() => null}));
vi.mock('@/components/public-game-records/attest-requests', () => ({AttestRequestsSection:() => null}));
vi.mock('@/components/public-game-records/claim-my-record', () => ({LeagueClaimMyRecordSection:() => null}));

const bracketPath='/tournaments/league-one/bracket';
function relativeUrl() { return `${window.location.pathname}${window.location.search}${window.location.hash}`; }
function scheduleData(): PublicTournamentScheduleResponse {
 return {tournamentId:'league-one',tournamentTitle:'합성 리그',bracketPublished:true,
  items:[fixtureEntry({fixtureId:'fixture-one',round:'1주차'})],unscheduled:[],standings:[],nextCursor:null};
}
function bracket() { return <BracketPageContent tournament={makeTournament({id:'league-one',status:'completed',format:'league',kind:'regular_league'})} />; }
let client: QueryClient;
let restoreNextBoundary: (() => void) | undefined;
function mount(element: React.ReactNode) { return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>); }
function selectRegular() { fireEvent.click(screen.getByRole('tab',{name:'정규 라운드'})); }
function selected(name:string) { expect(screen.getByRole('tab',{name})).toHaveAttribute('aria-selected','true'); }
function fixtureLink() { return Array.from(document.querySelectorAll<HTMLAnchorElement>('a')).find((a) => a.getAttribute('href')?.startsWith('/league-matches/league-one/fixtures/fixture-one'))!; }
function backControl() { return <AppBackLink fallbackHref="/teams">뒤로</AppBackLink>; }
async function backTo(target:string) {
 fireEvent.click(screen.getByRole('link',{name:'뒤로가기'}));
 await waitFor(() => expect(relativeUrl()).toBe(target));
}

beforeEach(() => {
 __resetNavigationHistoryForTests(); window.sessionStorage.clear(); window.localStorage.clear();
 window.history.replaceState({qaMarker:'keep'},'',`${bracketPath}?from=%2Ftournaments%3Fq%3Dleague`);
 navigation.snapshot=null; vi.clearAllMocks(); client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 vi.mocked(useV1LeagueMatch,{partial:true}).mockReturnValue({data:{leagueId:'league-one',title:'검증 리그',state:'completed',teamIds:[],startsOn:'2026-08-01',endsOn:'2026-08-02',registrationDeadlineAt:null,registrationOpen:false,seriesSiblings:[],fixtures:[{teamMatchId:'fixture-one',title:'검증 경기',homeTeamId:'team-home',awayTeamId:'team-away',startAt:'2026-08-01T10:00:00.000Z',placeName:'합성 경기장',status:'completed',homeScore:1,awayScore:0}]},isError:false});
 vi.mocked(useV1LeagueMatchStandings,{partial:true}).mockReturnValue({data:{leagueId:'league-one',tier:null,tierLabel:null,tieBreakOrder:['points'],standings:[],pendingFixtures:[],champions:[],cancelledFixtureCount:0,promotionDecided:false,promotionForecast:null,tieBreakGroups:[]},isError:false});
 vi.mocked(useV1TeamMatch,{partial:true}).mockReturnValue({data:undefined,isPending:false,isError:false});
 vi.mocked(useV1ResolveChatRoom,{partial:true}).mockReturnValue({mutate:vi.fn(),isPending:false});
 vi.mocked(usePublicLeagueFixtureRecord,{partial:true}).mockReturnValue({data:makeRecord(),isPending:false,isError:false});
});
afterEach(() => {cleanup();client.clear();restoreNextBoundary?.();restoreNextBoundary=undefined;__resetNavigationHistoryForTests();});

function fixtureEntry(overrides: Partial<import('@/components/public-game-records/types').PublicScheduleEntry> = {}): import('@/components/public-game-records/types').PublicScheduleEntry {
  return {
    fixtureId: 'fixture-1',
    round: '조별리그',
    fixtureNumber: 1,
    legNumber: 1,
    groupId: null,
    groupName: null,
    scheduledAt: '2026-08-01T10:00:00.000Z',
    venue: null,
    fieldId: null,
    fieldName: null,
    home: { registrationId: 'reg-home', teamId: 'team-home', teamName: '홈팀' },
    away: { registrationId: 'reg-away', teamId: 'team-away', teamName: '원정팀' },
    visibilityMode: 'live',
    status: 'ended',
    resultState: 'official',
    scoreStatus: 'official',
    score: { home: 1, away: 0, penalties: null },
    clock: null,
    periodBreak: null,
    scorers: [],
    cards: [],
    outcome: null,
    hasVideo: false,
    ...overrides,
  };
}


function makeTournament(overrides: Partial<V1TournamentDetail> & Pick<V1TournamentDetail, 'id' | 'status' | 'format'>): V1TournamentDetail {
  return {
    kind: 'regular_tournament',
    sportId: 'sport-futsal',
    sport: { code: 'futsal', name: '풋살' },
    title: '테스트 대회',
    registrationDeadlineAt: null,
    rosterDeadlineAt: null,
    bracketPublishedAt: '2026-01-01T00:00:00.000Z',
    bracketPublishScheduledAt: null,
    scheduledAt: null,
    scheduledEndAt: null,
    venue: null,
    latitude: null,
    longitude: null,
    coverImageUrl: null,
    teamCount: 8,
    minPlayers: 5,
    maxPlayers: 10,
    genderCategory: null,
    genderMinMale: null,
    genderMaxMale: null,
    genderMinFemale: null,
    genderMaxFemale: null,
    entryFee: 0,
    prizePool: null,
    prizeSummary: null,
    prizeBreakdown: null,
    promoHomeEnabled: false,
    promoHomeTitle: null,
    promoHomeSubtitle: null,
    promoHomeImageUrl: null,
    promoHomeBadgeText: null,
    promoHomeDateText: null,
    promoHomeTeamsText: null,
    promoHomeLocationText: null,
    promoHomePrizeText: null,
    promoHomePriority: 0,
    promoListEnabled: false,
    promoListTitle: null,
    promoListSubtitle: null,
    promoListImageUrl: null,
    promoListBadgeText: null,
    promoListDateText: null,
    promoListTeamsText: null,
    promoListLocationText: null,
    promoListPrizeText: null,
    promoListPriority: 0,
    campaignSlug: null,
    rulesText: null,
    yellowAccumulationLimit: null,
    redCardSuspensionMatches: null,
    refundPolicyText: null,
    confirmedCount: 0,
    participantTeams: [],
    pendingPaymentCount: 0,
    groups: [],
    fixtures: [],
    leagueFixtures: [],
    announcements: [],
    sponsors: [],
    reviews: [],
    reviewsTotalCount: 0,
    awards: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}


const players = [
  ['라인업 홈 선수', '/users/u-home'], ['라인업 원정 선수', '/users/u-away'],
  ['득점 선수', '/users/u-goal'], ['도움 선수', '/users/u-assist'],
  ['기타 득점 선수', '/users/u-other'], ['MVP 선수', '/users/u-mvp'],
] as const;

function makeRecord(profileHref: (path: string) => string | null = (path) => path): PublicMatchDetail {
  return {
    tournamentId: 'league-one', tournamentTitle: '검증 리그', fixtureId: 'fixture-one', gameId: 'game-one',
    round: '1주차', fixtureNumber: 1, legNumber: 1, groupId: null, groupName: null,
    scheduledAt: '2026-08-01T10:00:00.000Z', venue: null, fieldName: null,
    home: { registrationId: 'reg-home', teamId: 'team-home', teamName: '홈팀' },
    away: { registrationId: 'reg-away', teamId: 'team-away', teamName: '원정팀' },
    visibilityMode: 'live', status: 'ended', resultState: 'official', scoreStatus: 'official',
    score: { home: 1, away: 0, penalties: null }, clock: null, periodBreak: null,
    lineup: {
      home: [{ participantId: 'p-home', displayName: players[0][0], jerseyNumber: 1, position: null, profileHref: profileHref(players[0][1]) }],
      away: [{ participantId: 'p-away', displayName: players[1][0], jerseyNumber: 2, position: null, profileHref: profileHref(players[1][1]) }],
    },
    events: [
      {
        type: 'GOAL', cardColor: null, sideId: 'side-home', side: 'home', participantId: 'p-goal',
        participantName: players[2][0], profileHref: profileHref(players[2][1]), jerseyNumber: 9, period: 1, clockMs: 600_000,
        assist: { participantName: players[3][0], jerseyNumber: 3, profileHref: profileHref(players[3][1]) },
      },
      {
        type: 'GOAL', cardColor: null, sideId: 'side-away', side: 'away', participantId: 'p-other',
        participantName: players[4][0], profileHref: profileHref(players[4][1]), jerseyNumber: 10, period: null, clockMs: 300_000, assist: null,
      },
    ],
    mvp: { participantId: 'p-mvp', displayName: players[5][0], profileHref: profileHref(players[5][1]) },
    outcome: null, pendingProjection: false, history: [], videos: [], nextMatch: null,
  };
}



describe('실제 bracket caller → 일정 → 경기 → 선수 → 페이지 Back → 일정 (#1418)', () => {
 it.each(['','&q=league&tag=a&tag=b#schedule'])('두 단계 실제 Back 뒤 정규 라운드를 유지한다: %s',async(extra) => {
  window.history.replaceState({qaMarker:'keep'},'',relativeUrl()+extra); installNavigationHistory();
  let rendered=mount(bracket()); selectRegular(); selected('정규 라운드');
  const originalBracket=relativeUrl();
  fireEvent.click(fixtureLink()); const fixtureUrl=relativeUrl();
  rendered.unmount(); rendered=mount(<>{backControl()}<LeagueFixtureDetailClient leagueId="league-one" fixtureId="fixture-one" /></>);
  fireEvent.click(screen.getByRole('link',{name:'득점 선수'}));
  rendered.unmount(); rendered=mount(backControl());
  await backTo(fixtureUrl); rendered.unmount();
  rendered=mount(<>{backControl()}<LeagueFixtureDetailClient leagueId="league-one" fixtureId="fixture-one" /></>);
  await backTo(originalBracket); rendered.unmount();
  mount(bracket()); selected('정규 라운드');
  expect(navigation.router.back).toHaveBeenCalledTimes(2);
  expect(navigation.router.replace).not.toHaveBeenCalled();
 });
 it('상위 일정 → 순위 → 일정 재마운트에서도 선택을 유지한다',() => {
  mount(bracket());selectRegular();
  fireEvent.click(screen.getByRole('tab',{name:'리그 순위'}));
  fireEvent.click(screen.getByRole('tab',{name:'경기 일정'})); selected('정규 라운드');
 });
 it('정규 라운드 URL로 직접 진입하고 재마운트할 수 있다',() => {
  window.history.replaceState(null,'',`${bracketPath}?schedulePhase=knockout`);
  const view=mount(bracket());selected('정규 라운드');view.unmount();mount(bracket());selected('정규 라운드');
 });
 it('빠른 연속 선택은 마지막 선택과 그 경기 링크 출처를 유지한다',() => {
  navigation.snapshot=window.location.search;
  mount(bracket());selectRegular();fireEvent.click(screen.getByRole('tab',{name:'전체'}));selectRegular();
  selected('정규 라운드');expect(new URL(window.location.href).searchParams.get('schedulePhase')).toBe('knockout');
  const link=new URL(fixtureLink().href);expect(new URL(link.searchParams.get('from')!,window.location.origin).searchParams.get('schedulePhase')).toBe('knockout');
 });
 it('늦은 query snapshot은 최신 선택과 즉시 클릭할 fixture from을 덮지 않는다',() => {
  const initial=window.location.search;const view=mount(bracket());selectRegular();
  navigation.snapshot=initial;view.rerender(<QueryClientProvider client={client}>{bracket()}</QueryClientProvider>);
  selected('정규 라운드');
  expect(new URL(new URL(fixtureLink().href).searchParams.get('from')!,window.location.origin).searchParams.get('schedulePhase')).toBe('knockout');
 });
 it('phase만 replace하고 다른 query·nested from·hash·history 길이를 유지한다',() => {
  window.history.replaceState({qaMarker:'keep'},'',`${bracketPath}?from=%2Ftournaments%3Fq%3Dqa&q=keep&tag=a&tag=b#schedule`);
  const initial=new URL(window.location.href),length=window.history.length;
  mount(bracket());selectRegular();const now=new URL(window.location.href);
  expect(now.searchParams.get('schedulePhase')).toBe('knockout');
  expect(now.searchParams.get('from')).toBe(initial.searchParams.get('from'));expect(now.searchParams.get('q')).toBe('keep');
  expect(now.searchParams.getAll('tag')).toEqual(['a','b']);expect(now.hash).toBe('#schedule');
  expect(window.history.length).toBe(length);
  fireEvent.click(screen.getByRole('tab',{name:'전체'}));expect(new URL(window.location.href).searchParams.has('schedulePhase')).toBe(false);
 });
 it('잘못된 phase는 전체 기본값을 유지한다',() => {
  window.history.replaceState(null,'',`${bracketPath}?schedulePhase=invalid`);mount(bracket());selected('전체');
 });
 it('다른 엔티티로 이동할 때 이전 선택을 넘기지 않는다',() => {
  const view=mount(<ScheduleContent tournamentId="league-one" data={scheduleData()} isRegularLeague fromHref={relativeUrl()} />);selectRegular();
  window.history.replaceState(null,'','/tournaments/league-two/bracket');
  view.rerender(<QueryClientProvider client={client}><ScheduleContent tournamentId="league-two" data={{...scheduleData(),tournamentId:'league-two'}} isRegularLeague fromHref={relativeUrl()} /></QueryClientProvider>);selected('전체');
 });
 it('mounted renderer도 브라우저 Back/Forward의 phase를 읽는다',() => {
  mount(bracket());
  act(() => {window.history.replaceState(window.history.state,'',`${bracketPath}?schedulePhase=knockout`);window.dispatchEvent(new PopStateEvent('popstate'));});selected('정규 라운드');
  act(() => {window.history.replaceState(window.history.state,'',bracketPath);window.dispatchEvent(new PopStateEvent('popstate'));});selected('전체');
 });
 it('자기 URL을 받지 않은 공용 renderer는 기존 local 동작과 링크를 유지한다',() => {
  const initial=relativeUrl();mount(<ScheduleContent tournamentId="league-one" data={scheduleData()} isRegularLeague />);selectRegular();selected('정규 라운드');
  expect(relativeUrl()).toBe(initial);expect(new URL(fixtureLink().href).searchParams.has('from')).toBe(false);
 });
});

describe('일정 phase SSR·query 정규화 경계', () => {
 it('설치된 Next __NA history patch에서도 라우터 query와 상위 탭 복귀가 동기화된다',() => {
  const tree={synthetic:'router-tree'};
  window.history.replaceState({__NA:true,__PRIVATE_NEXTJS_INTERNALS_TREE:tree},'',relativeUrl());
  installNavigationHistory();
  const index=window.history.state.__tmIdx;
  navigation.snapshot=window.location.search;
  const dispatch=vi.fn((action: {url:URL}) => {navigation.snapshot=action.url.search;});
  restoreNextBoundary=installActualNextReplaceBoundary(dispatch);
  mount(bracket());selectRegular();
  fireEvent.click(screen.getByRole('tab',{name:'리그 순위'}));
  fireEvent.click(screen.getByRole('tab',{name:'경기 일정'}));
  selected('정규 라운드');
  expect(dispatch).toHaveBeenCalledOnce();
  expect(new URLSearchParams(navigation.snapshot!).get('schedulePhase')).toBe('knockout');
  expect(window.history.state.__NA).toBe(true);
  expect(window.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE).toEqual(tree);
  expect(window.history.state.__tmIdx).toBe(index);
 });
 it('SSR과 첫 client render가 동일한 deeplink phase를 선택한다',() => {
  const href=`${bracketPath}?schedulePhase=knockout`;
  window.history.replaceState(null,'',href);
  const element=<ScheduleContent tournamentId="league-one" data={scheduleData()} isRegularLeague fromHref={href} />;
  const html=renderToString(element);const node=document.createElement('div');node.innerHTML=html;
  expect(node.querySelector('[role="tab"][aria-selected="true"]')).toHaveTextContent('정규 라운드');
  mount(element);selected('정규 라운드');
 });
 it('query 값의 literal ?와 정규화된 space를 phase 분리자로 오해하지 않는다',() => {
  window.history.replaceState(null,'',`${bracketPath}?q=one?two%20words&schedulePhase=knockout`);
  mount(bracket());selected('정규 라운드');
  expect(new URL(new URL(fixtureLink().href).searchParams.get('from')!,window.location.origin).searchParams.get('q')).toBe('one?two words');
 });
});
