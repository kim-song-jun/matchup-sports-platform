'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useShellOverride } from '@/components/v1-ui/shell-override';
import { Card, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { PlaceCard } from '@/components/v1-ui/place-card';
import { PlacePicker } from '@/components/v1-ui/place-picker';
import type { V1PlaceView } from '@/types/api';
import { ChevronLeftIcon, ChevronRightIcon, FilterIcon, MoreIcon, PlusIcon, SearchIcon, ShareIcon } from '@/components/v1-ui/icons';
import { MatchTypeSegment } from '@/components/v1-ui/match-type-segment';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { CreateField, FieldErrorText, GenderRuleSelector, MissingFieldsBanner, MultiPresetChipSelector, PresetChipSelector } from '@/components/v1-ui/create-form-fields';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { cssUrl } from '@/lib/assets';
import { formatAmountNumber } from '@/lib/date-utils';
import { matchGenderRuleLabel, TEAM_MATCH_CANCELLED_LABEL } from '@/lib/v1-status-labels';
// 사진 없는 팀매치의 종목 그래픽 — 매치·홈과 같은 공용 컴포넌트를 쓴다(웨이브8에서
// 세 곳의 복사본을 하나로 모았다). 같은 종목이면 어느 화면에서든 같은 그래픽이 나온다.
import { SportIllustration } from '@/components/v1-ui/sport-illustration';
import type {
  TeamMatchCreateViewModel,
  TeamMatchDetailViewModel,
  TeamMatchListViewModel,
  TeamMatchModel,
  TeamMatchStateViewModel,
} from './team-matches.types';
import { buildTeamMatchSummaryLabel } from './team-matches.card-model';
import { teamMatchStepHref } from './team-matches.routes';
import { AppBackLink } from '@/components/v1-ui/app-back-link';
import { josa } from '@/lib/korean';
import { useCurrentHref } from '@/components/v1-ui/use-current-href';
import { withFromPath } from '@/lib/session-storage';
import { HostApplicationsCard, HostApplicationsErrorCard, HostWaitingCard, MatchProgressCard, PendingApplicationCard } from './team-match-now-card';
import { TeamMatchApplyTeamSheet, TeamMatchManageMenuSheet } from './team-match-detail-sheets';
import { TeamMatchImagesField, TeamMatchImagesPreview, teamMatchImage, teamMatchBackgroundImage } from './team-match-images';
import { TeamMatchLevelRangeField } from './team-match-level-range-field';

const TEAM_MATCH_COST_EXPLANATION = '신청하는 팀의 비용이에요';


export function TeamMatchListPageView({ model }: { model: TeamMatchListViewModel }) {
  // title/activeTab/topBar는 route-chrome 테이블(fragments/team-matches.ts)이 고정값으로
  // 갖고 있다 — floatingSlot만 ReactNode라 테이블에 담을 수 없어 override로 밀어넣는다
  // (app-shell-promotion.md §1b, 6곳 중 하나).
  useShellOverride({ floatingSlot: <TeamMatchCreateFloatingButton /> });
  // 상세의 뒤로가기가 검색어·필터가 걸린 이 목록 URL 로 돌아오게 카드마다 출처로 싣는다.
  // 쿼리 없는 목록은 상세 뒤로가기의 fallback 이 이미 같은 곳이라 싣지 않는다(공개 첫 HTML 의 카드 링크를 깨끗하게 유지).
  const currentHref = useCurrentHref();
  let listFromHref = currentHref?.includes('?') ? currentHref : null;
  // 실제 검색 모델이 있으면 상세 복귀도 replace 완료 전의 URL보다 현재 적용한 검색어를 따른다.
  // 첫 # 뒤는 앵커 전체로 보존해 앵커 안의 ?를 목록 검색 조건으로 해석하지 않는다.
  if (currentHref && model.search) {
    const hashIndex = currentHref.indexOf('#');
    const hash = hashIndex >= 0 ? currentHref.slice(hashIndex) : '';
    const pathAndQuery = hashIndex >= 0 ? currentHref.slice(0, hashIndex) : currentHref;
    const queryIndex = pathAndQuery.indexOf('?');
    const pathname = queryIndex >= 0 ? pathAndQuery.slice(0, queryIndex) : pathAndQuery;
    const params = new URLSearchParams(queryIndex >= 0 ? pathAndQuery.slice(queryIndex + 1) : '');
    const appliedQuery = model.query.trim();
    if (appliedQuery) params.set('q', appliedQuery);
    else params.delete('q');
    const search = params.toString();
    listFromHref = search ? `${pathname}?${search}${hash}` : null;
  }
  return (
    <>
      {/* 데스크톱 전용 인라인 헤더 — FAB가 데스크톱에서 숨겨지므로 대체 CTA 제공 */}
      <div className="tm-team-match-desktop-header tm-show-desktop">
        <h1 className="tm-text-heading tm-team-match-desktop-header-title">팀매치</h1>
        <Link className="tm-team-match-desktop-create-btn" href="/team-matches/new/team" aria-label="팀매치 만들기">
          <PlusIcon size={18} strokeWidth={2.5} aria-hidden="true" />
          팀매치 만들기
        </Link>
      </div>
      <TeamMatchSearchBar filterCount={model.filterCount} search={model.search} query={model.query} filterHref={model.filterHref} />
      <MatchTypeSegment active="team" />
      {/* 결과가 0건일 때만 tm-list-empty — matches-page.tsx 와 같은 이유. */}
      <div className={`tm-match-list${!model.isLoading && model.matches.length === 0 ? ' tm-list-empty' : ''}`}>
        <div className="tm-sport-chip-row">{model.sports.map((sport) => sport.href ? <Link key={sport.label} className={`tm-chip ${sport.active ? 'tm-chip-active' : ''}`} href={sport.href} aria-current={sport.active ? 'page' : undefined}>{sport.label} <span className="tab-num">{sport.count}</span></Link> : <button key={sport.label} className={`tm-chip ${sport.active ? 'tm-chip-active' : ''}`} type="button" aria-pressed={sport.active}>{sport.label} <span className="tab-num">{sport.count}</span></button>)}</div>
        <p className="tm-text-caption">전체·종목별 건수는 불러온 목록 기준이에요</p>
        {/* P1: 통계 숫자 tabular-nums + weight 차등 (2:1 원칙) */}
        <div className="tm-match-summary-row">
          {/* matches-page.tsx 와 같은 이유 — 이 화면도 모바일 헤딩이 0개였다. */}
          <h2 className="tm-list-scope-heading">{buildTeamMatchSummaryLabel()}</h2>
          <div className="tm-text-caption tab-num">
            <div>현재 목록 기준</div>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{model.summary.count}</span>개 · 오늘 {model.summary.today} · 모집 중 <strong style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{model.summary.urgent}</strong>
          </div>
        </div>
        {/* #5: 로딩 중엔 PageSkeleton, 완료 후 비어 있으면 EmptyState — 빈/로딩 구분 */}
        {model.isLoading
          ? <PageSkeleton />
          : model.matches.length
            ? <div className="tm-match-card-stack">{model.matches.map((match) => <TeamMatchCard key={match.id} match={match} fromHref={listFromHref} />)}</div>
            : (
              /* matches-page.tsx MatchListPageView 와 동일한 이유·조건 — 필터/종목이 걸려 있을
                 때만 "전체 팀매치 보기" CTA 를 준다(웨이브4, 2026-09-04). */
              <EmptyState
                fill
                illustration={{ name: 'matches-empty' }}
                title="조건에 맞는 팀매치가 없어요"
                sub="다른 종목을 선택하거나 필터를 초기화해 다시 확인해 주세요."
                cta={model.filterCount > 0 || model.sports.some((sport) => sport.active && sport.label !== '전체') ? '전체 팀매치 보기' : undefined}
                ctaHref="/team-matches"
              />
            )
        }
        {/* 서버는 20건씩 커서로 자르는데(team-matches.service.ts) 예전엔 여기서 더 볼 방법이
            없었다(감사 결함) — tournaments/tournaments-list-client.tsx 와 같은 "더 보기" 누적 패턴. */}
        {!model.isLoading && model.hasNext ? (
          <button
            type="button"
            className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
            style={{ marginTop: 16 }}
            disabled={model.loadMorePending}
            onClick={model.onLoadMore}
          >
            {model.loadMorePending ? '불러오는 중…' : '더 보기'}
          </button>
        ) : null}
      </div>
      {model.filterSheet?.open ? <TeamMatchFilterSheet model={model} /> : null}
    </>
  );
}

// /team-matches와 /team-matches/:id 양쪽의 error 분기가 공유하는 컴포넌트 — usePathname()
// 기반 useShellOverride가 현재 라우트를 알아서 타깃하므로 어느 쪽에서 렌더돼도 정확히
// 그 라우트의 override만 남긴다. topBar:false(fragments/team-matches.ts)라 셸 뒤로가기가
// 없고, 이 "목록으로 돌아가기" Link가 유일한 내비다 — model.backHref(?from= 유래)가 있으면
// 그 출처로, 없으면 '/team-matches'로 돌아간다.
export function TeamMatchStatePageView({ model }: { model: TeamMatchStateViewModel }) {
  useShellOverride({ title: model.title, desktopHead: true });
  const backHref = model.backHref ?? '/team-matches';
  return (
    <div className="tm-match-list">
      {/* 오류는 ErrorState + 재시도(DESIGN.md §13, matches-page.tsx MatchStatePageView 와 동일
          패턴, 웨이브4). 예전엔 EmptyState + "목록으로 돌아가기" 카드뿐이라 다시 불러올 길이
          없었다(2026-09-04 감사). */}
      {model.state === 'error' ? (
        <>
          <ErrorState title={model.title} message={model.description} onRetry={model.retry} retryLabel="다시 불러오기" />
          <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href={backHref} style={{ marginTop: 12 }}>{model.backHref ? '돌아가기' : '목록으로 돌아가기'}</Link>
        </>
      ) : (
        <EmptyState title={model.title} sub={model.description} />
      )}
    </div>
  );
}

function TeamMatchCreateFloatingButton() {
  return (
    <Link className="tm-floating-fab" href="/team-matches/new/team" aria-label="팀매치 만들기">
      <PlusIcon size={25} strokeWidth={2.2} />
    </Link>
  );
}

/*
 * mode('default'/'pending'/'approved'/'mine')만으로는 "상대가 이미 정해졌거나 경기가
 * 끝난 매치를 guest/비참여자가 보는 경우"를 구분할 수 없다 — mode는 항상 'default'로
 * 떨어진다(viewerState 기준일 뿐 경기 진행 상태를 안 본다). match.status(카드 레벨
 * open/closed 판정, toTeamMatch의 statusToCardStatus)는 API status까지 반영하므로
 * 여기서 함께 봐야 완료된 리그 경기를 열어도 "모집 중"이 뜨지 않는다(alpha 실측 C-1).
 */
function teamMatchOpponentLabel(mode: TeamMatchDetailViewModel['mode'], match: TeamMatchDetailViewModel['match'], myTeamName?: string) {
  if (mode === 'cancelled') return match.applicantTeams.find((team) => team.status === '승인 완료')?.name ?? '미정';
  // 신청 팀에게는 이 자리가 "우리 팀" 이다(H6 A-2) — 신청 팀을 못 찾았을 때만 검토 상태를 적는다.
  if (mode === 'pending') return myTeamName ?? '검토 중';
  if (mode === 'approved') {
    // 일반 팀매치는 신청 승인 시 applicantTeams에 실제 상대팀이 담기지만, 관리자 생성
    // 매치에서 먼저 승인된 팀이 홈팀이 되는 경우에는 아직 상대팀이 없다. 이때 뷰어의
    // 개인 상태("승인 완료")를 상대팀 이름처럼 표시하면 모집 중인 슬롯이 사라진다.
    const approvedOpponent = match.applicantTeams.find((team) => team.status === '승인 완료');
    return approvedOpponent?.name ?? '모집 중';
  }
  if (mode === 'mine') {
    // 생성팀 뷰도 승인 완료 후에는 'approved'/'closed' 분기와 같은 근거(applicantTeams의
    // '승인 완료' 항목)로 실제 상대팀 이름을 보여줘야 한다 — 그 전까지는 '신청팀'
    // placeholder로 바꾸지 않는다. 승인 전 상대팀 슬롯은 다른 뷰어와 동일한 모집 상태다.
    const approvedOpponent = match.applicantTeams.find((team) => team.status === '승인 완료');
    return approvedOpponent?.name ?? '모집 중';
  }
  if (match.status === 'closed') {
    // approvedOpponentTeam이 있으면 applicantTeams에 그 팀 하나만 '승인 완료' 상태로 담겨
    // 온다(team-matches-client.tsx toApplicantTeamsWithActions) — guest에게도 이 필드는
    // 그대로 내려오므로 실제 상대팀 이름을 보여줄 수 있다.
    const approvedOpponent = match.applicantTeams.find((team) => team.status === '승인 완료');
    return approvedOpponent?.name ?? '모집 마감';
  }
  return '모집 중';
}

/** 상대팀 이름 아래 한 줄 — 그 팀의 상태만. 매치 상태(취소·종료 등)는 히어로 배지가 말한다(W2-V8). */
function teamMatchOpponentSub(mode: TeamMatchDetailViewModel['mode'], match: TeamMatchDetailViewModel['match'], applicationsFailed: boolean): string | null {
  if (mode === 'cancelled') return null;
  if (mode === 'pending') return '승인 대기';
  if (mode === 'approved') {
    const approvedOpponent = match.applicantTeams.find((team) => team.status === '승인 완료');
    return approvedOpponent ? '참가 확정' : '신청 후 승인';
  }
  if (mode === 'mine') {
    const approvedOpponent = match.applicantTeams.find((team) => team.status === '승인 완료');
    if (approvedOpponent) return '참가 확정';
    // 신청이 들어온 사실을 히어로가 먼저 말한다(H6 A-1).
    const requested = match.applicantTeams.filter((team) => team.applicationStatus === 'requested').length;
    if (requested > 0) return `신청 ${requested}팀 대기`;
    // 목록을 못 받았으면 신청 수를 모른다 — '신청 후 승인'(아직 없음)으로 떨어뜨리지 않는다.
    return applicationsFailed ? null : '신청 후 승인';
  }
  if (match.status === 'closed') return match.applicantTeams.some((team) => team.status === '승인 완료') ? '참가 확정' : null;
  return '신청 후 승인';
}

// CTA 카드의 값(model.statusLabel)은 대부분 신청 흐름 상태(승인 대기/완료·신청 마감 등)지만,
// 경기가 시작되거나 지정 종료 시각을 지나면 modelScheduleLabel()이 경기 상태를 덮어써 의미 축이 바뀐다
// (team-matches-client.tsx statusLabelKind 참고) — 그때는 캡션도 '신청 상태'가 아니라
// '경기 상태'라고 해야 값과 뜻이 맞는다.
function teamMatchStatusCaption(model: TeamMatchDetailViewModel) {
  if (model.statusLabelKind === 'match') return '경기 상태';
  if (model.statusCaption) return model.statusCaption;
  if (model.mode === 'mine') return '내가 만든 팀매치';
  return '신청 상태';
}

/**
 * 히어로 CTA 성공 안내는 `mode`가 아니라 **서버가 확정한 결과 상태**에서 뽑는다.
 *
 * `mode`는 viewerState 파생값이라 실제로 실행된 액션과 어긋날 수 있다 — 유령 신청서가 남아
 * viewerState는 'withdrawn'인데 eligibility는 ALREADY_REQUESTED인 조합에서, CTA는 철회를
 * 실행하는데 mode가 'default'라 "신청을 완료했어요."라고 알렸다(C2 후속 지적). 신청·철회 두
 * mutation 모두 `V1TeamMatchApplicationResult`(status 포함)를 resolve 하므로, 그 status가
 * "방금 무엇을 했는가"의 유일한 근거다.
 *
 * 로그인·팀 만들기 리다이렉트는 신청도 철회도 아니라 status가 없다 → null(안내 없음).
 */
function applyResultMessage(result: unknown): string | null {
  if (typeof result !== 'object' || result === null) return null;
  const status = (result as Record<string, unknown>).status;
  if (status === 'withdrawn') return '신청을 취소했어요.';
  if (status === 'requested') return '신청을 완료했어요.';
  return null;
}

/**
 * 팀매치 상세 로딩 셸. 목업 팀매치(team-matches.view-model.ts — 'FC 발빠른놈들' 등)를
 * 그대로 렌더하던 자리를 대신한다. 셸 승격(U27) 이후 title/activeTab/bottomNav/topBar 는
 * route-chrome/fragments/team-matches.ts 테이블의 '/team-matches/:id' 항목(title: '')이
 * 이미 그린다 — TeamMatchDetailPageView(성공 뷰)도 title을 override하지 않으므로 두
 * 상태가 같은 값을 보여 헤더가 흔들리지 않는다. 그래서 본문 스켈레톤만 렌더한다.
 */
export function TeamMatchDetailPageSkeleton() {
  return (
    <>
      <p className="sr-only" role="status">팀매치 정보를 불러오는 중이에요.</p>
      <PageSkeleton variant="detail" />
    </>
  );
}

const LINEUP_ACTION_COPY = {
  attendance: { title: '참석명단', description: '경기에 참석할 선수 명단을 작성하고 제출하세요.', cta: '참석명단 관리' },
  'match-roster': { title: '경기 명단', description: '참가 명단 선수가 출전해요. 이번 경기에 빠지는 선수만 빼 주세요.', cta: '명단 조정' },
} as const;

/** 히어로의 팀 칸 — href 가 있으면 칸 전체가 팀 화면으로 가는 링크(44px 이상)다. */
function HeroTeamLink({ href, name, align, children }: { href?: string; name: string; align: 'left' | 'right'; children: React.ReactNode }) {
  if (!href) return <div style={{ textAlign: align }}>{children}</div>;
  return (
    <Link className="tm-pressable" href={href} aria-label={`${name} 팀 보기`} style={{ display: 'block', minHeight: 44, textAlign: align }}>
      {children}
    </Link>
  );
}

/** 팀 카드의 신뢰 배지와 같은 낱말·같은 배지 — 알 수 없는 값은 숨긴다. */
function HeroTrustBadge({ trustState, align }: { trustState?: string | null; align: 'left' | 'right' }) {
  const label = trustState ? trustStateLabel(trustState) : null;
  if (!label) return null;
  return (
    <div style={{ marginTop: 4, textAlign: align }}>
      <span className="tm-badge tm-badge-sm tm-badge-blue">{label}</span>
    </div>
  );
}

function HeroTeamChevron() {
  return <ChevronRightIcon size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 2, color: 'var(--overlay-white-90)' }} />;
}

export function TeamMatchDetailPageView({ model, recordEntry, lifecyclePanel }: { model: TeamMatchDetailViewModel; recordEntry?: React.ReactNode; lifecyclePanel?: React.ReactNode }) {
  const { confirm, ConfirmModal } = useConfirm();
  const { match, mode } = model;
  const detailImage = teamMatchImage(match, 'detail');
  const hasAssignedHostTeam = Boolean(match.hostTeamId);
  const shouldShowHostTeamCard = !match.platformManaged || hasAssignedHostTeam;
  const awaitingPlatformTeams = Boolean(match.platformManaged && !hasAssignedHostTeam);
  // 두 팀이 모두 정해지면 히어로가 두 팀을 요약하고 팀 이름이 팀 화면으로 가는 입구다 — 아래 팀 카드는 같은 정보를 반복하므로 그리지 않는다.
  // 플랫폼 주관 매치는 제외한다: 운영 주체와 팀 로고·신뢰 배지를 카드로 따로 보여 주는 화면이라 그대로 둔다.
  const confirmedOpponent = !match.platformManaged && hasAssignedHostTeam
    ? match.applicantTeams.find((team) => team.status === '승인 완료' && team.href)
    : undefined;
  const locked = mode === 'pending' || mode === 'approved' || mode === 'cancelled';
  const cta = model.applyLabel ?? (mode === 'mine' ? '매치 수정' : mode === 'approved' ? '승인 완료' : mode === 'pending' ? '신청 취소' : '신청하기');
  // 호스트의 "지금 할 일" — 대기 중인 신청. 라벨(status)이 아니라 서버 상태 원문으로 고른다.
  const requestedTeams = mode === 'mine' ? match.applicantTeams.filter((team) => team.applicationStatus === 'requested') : [];
  const [menuOpen, setMenuOpen] = useState(false);
  const [applyTeamOpen, setApplyTeamOpen] = useState(false);
  // [P2] 신청한 적 없는 뷰어(mode==='default')가 이미 닫힌(상대 확정·종료·취소·마감) 팀매치를
  // 볼 때 model.statusLabel 은 히어로 상태 배지(heroStatus)가 이미 말한다 — 하단 바
  // 캡션+값은 다시 말하지 않는다(버튼만 남는다).
  const isClosedGuestStatusDuplicate = (mode === 'default' && match.status === 'closed') || mode === 'cancelled';
  const canRunAction = Boolean(model.onApply);
  /* ctaTone: 행동 불가(신청 불가 등 onApply=undefined + 리다이렉트도 없는 상태)는
   * neutral+disabled 조합으로 표시 — primary 파란 버튼처럼 보여 클릭 오인 방지(T1).
   * 신청 취소(pending)는 주 행동이 아니라 중립 톤이다(H6 A-2). */
  const ctaTone = mode === 'approved' ? 'tm-btn-success' : locked ? 'tm-btn-neutral' : canRunAction ? 'tm-btn-primary' : 'tm-btn-neutral tm-btn-disabled';
  // 채팅 버튼: approved/host(mine)는 활성, pending(승인 대기)은 disabled + '승인 완료 후 이용' 안내.
  // default(비참여자)에는 미노출 — 단 `model.onChat`이 있으면(=canOpenTeamMatchChat이 팀
  // 멤버십으로 허용) mode가 default여도 보여준다. 신청팀 owner가 신청서를 직접 내지 않은
  // 경우(매니저가 신청) mode는 'default'로 남는데, 그 owner도 서버는 채팅을 허용한다 —
  // mode만 보면 그 owner에게 버튼 자체가 사라진다.
  const chatEnabled = Boolean(model.onChat);
  const showChat = mode === 'approved' || mode === 'mine' || mode === 'pending' || Boolean(model.onChat);
  const timeRange = match.endTime ? `${match.time}-${match.endTime}` : match.time;
  const [heroMessage, setHeroMessage] = useState('');
  const heroMessageTimerRef = useRef<number | null>(null);
  const heroMountedRef = useRef(false);
  const [chatNoticeVisible, setChatNoticeVisible] = useState(false);
  const chatNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    heroMountedRef.current = true;
    return () => {
      heroMountedRef.current = false;
      if (heroMessageTimerRef.current !== null) window.clearTimeout(heroMessageTimerRef.current);
      heroMessageTimerRef.current = null;
      if (chatNoticeTimerRef.current !== null) window.clearTimeout(chatNoticeTimerRef.current);
      chatNoticeTimerRef.current = null;
    };
  }, []);

  const showHeroMessage = (message: string) => {
    // 이동 뒤 완료된 액션은 떠난 화면의 안내를 예약하지 않는다.
    if (!heroMountedRef.current) return;
    if (heroMessageTimerRef.current !== null) window.clearTimeout(heroMessageTimerRef.current);
    setHeroMessage(message);
    heroMessageTimerRef.current = window.setTimeout(() => {
      heroMessageTimerRef.current = null;
      if (heroMountedRef.current) setHeroMessage('');
    }, 2000);
  };

  const heroActionBusyRef = useRef(false);
  const runHeroAction = (
    action: (() => void | Promise<unknown>) | undefined,
    /** 고정 문구이거나, 액션이 돌려준 결과에서 문구를 뽑는 함수(null이면 아무 안내도 띄우지 않음). */
    successMessage: string | ((result: unknown) => string | null),
  ) => {
    // 로딩 중 재클릭 시 중복 제출 방지 — disabled/loading prop은 리렌더 이후에나 반영되므로
    // 동기적인 ref 락으로 한 번 더 막는다.
    if (!action || heroActionBusyRef.current) return;
    heroActionBusyRef.current = true;
    // action()을 .then() 콜백 안에서 호출 — 동기 throw도 promise rejection으로 변환되어
    // .catch/.finally가 항상 실행되고 락이 풀린다(Promise.resolve(action())은 인자 평가가
    // Promise.resolve 호출보다 먼저라 동기 throw 시 .finally를 건너뛰어 락이 영구 고정됨).
    void Promise.resolve()
      .then(() => action())
      .then((result) => {
        const message = typeof successMessage === 'function' ? successMessage(result) : successMessage;
        if (!message) return;
        showHeroMessage(message);
      })
      .catch(() => {
        showHeroMessage('처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
      })
      .finally(() => {
        heroActionBusyRef.current = false;
      });
  };

  // ⋯ 메뉴 항목 — 확인 창은 시트 위에 겹쳐 뜨고, 확정했을 때만 시트를 닫고 실행한다.
  const runHostAction = async (action: NonNullable<TeamMatchDetailViewModel['hostActions']>[number]) => {
    if (action.confirm) {
      const accepted = await confirm({ ...action.confirm, tone: action.confirm.tone ?? 'danger' });
      if (!accepted) return;
    }
    setMenuOpen(false);
    runHeroAction(action.onClick, `${action.label} 처리를 완료했어요.`);
  };

  type ApplicantTeam = TeamMatchDetailViewModel['match']['applicantTeams'][number];
  // N-2: 승인은 되돌릴 수 없고 나머지 대기 신청이 서버에서 자동 종료되므로 항상 확인한다.
  const approveApplicant = async (team: ApplicantTeam) => {
    const others = requestedTeams.filter((other) => other.applicationId !== team.applicationId);
    const named = others.slice(0, 2).map((other) => other.name).join(', ');
    const othersLabel = others.length > 2 ? `${named} 외 ${others.length - 2}팀` : named;
    const accepted = await confirm({
      title: `${josa(team.name, ['을', '를'])} 상대팀으로 확정할까요?`,
      message: others.length > 0
        ? `확정하면 되돌릴 수 없어요. 나머지 신청 ${others.length}팀(${othersLabel})은 자동으로 종료되고 알림이 가요.`
        : '확정하면 되돌릴 수 없어요.',
      confirmLabel: '승인하기',
      cancelLabel: '닫기',
    });
    if (accepted) team.onApprove?.();
  };
  const rejectApplicant = async (team: ApplicantTeam) => {
    const accepted = await confirm({
      title: `${team.name} 신청을 거절할까요?`,
      message: `거절하면 ${team.name}에 알림이 가요. 모집이 계속되는 동안에는 다시 신청할 수 있어요.`,
      confirmLabel: '거절하기',
      cancelLabel: '닫기',
      tone: 'danger',
    });
    if (accepted) team.onReject?.();
  };

  const handleChatClick = () => {
    if (chatEnabled) {
      model.onChat?.();
      return;
    }
    setChatNoticeVisible(true);
    if (chatNoticeTimerRef.current) window.clearTimeout(chatNoticeTimerRef.current);
    chatNoticeTimerRef.current = window.setTimeout(() => setChatNoticeVisible(false), 2200);
  };

  /* Chat button — pending keeps disabled styling but remains clickable for guidance. */
  const chatButton = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        className={`tm-btn tm-btn-lg tm-btn-neutral${chatEnabled ? '' : ' tm-btn-disabled'}`}
        type="button"
        disabled={model.chatPending}
        aria-disabled={!chatEnabled || model.chatPending}
        onClick={handleChatClick}
      >
        {model.chatPending ? '연결 중' : model.chatLabel ?? '채팅'}
      </button>
      {model.chatError ? (
        <div className="tm-text-micro" role="alert" style={{ textAlign: 'center', color: 'var(--red700)' }}>{model.chatError}</div>
      ) : null}
    </div>
  );

  /* 참가 팀 카드 — 모바일 본문과 데스크톱 우측 컬럼에서 같은 목록을 사용한다.
   * 플랫폼 생성 매치는 팀이 배정되기 전까지 운영 주체를 팀처럼 보여주지 않는다. */
  const hostTeamCardContent = (
    <>
      {/* 팀 로고 아바타 — 원본은 48px였으나 TeamAvatar 표준 사이즈 중 가장 근접한 md(40px)로 통일 */}
      <TeamAvatar seed={match.hostTeamId ?? match.hostTeam} name={match.hostTeam} logoUrl={match.hostTeamLogoUrl} size="md" />
      {/* 팀 정보 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>{hasAssignedHostTeam ? '홈팀 정보' : '운영 주관'}</div>
        <div className="tm-text-body-lg" style={{ marginTop: 2 }}>{match.hostTeam}</div>
        {match.hostTeamRatingScore != null || match.hostTeamWins != null ? (
          <div className="tm-text-micro" style={{ marginTop: 4, color: 'var(--text-caption)' }}>
            {[
              match.hostTeamRatingScore == null ? null : `팀 평점 ${match.hostTeamRatingScore.toFixed(1)}`,
              match.hostTeamWins == null ? null : `${match.hostTeamWins}승`,
            ].filter(Boolean).join(' · ')}
          </div>
        ) : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {match.hostTeamSportName ? <span className="tm-badge tm-badge-blue">{match.hostTeamSportName}</span> : null}
          {match.hostTeamLevelLabel ? <span className="tm-badge tm-badge-grey">{match.hostTeamLevelLabel}</span> : null}
          {match.hostTeamTrustState && trustStateLabel(match.hostTeamTrustState) ? (
            <span className="tm-badge tm-badge-blue">{trustStateLabel(match.hostTeamTrustState)}</span>
          ) : null}
        </div>
      </div>
      {hasAssignedHostTeam ? <span className="tm-btn tm-btn-sm tm-btn-neutral" style={{ flexShrink: 0 }}>팀 보기</span> : null}
    </>
  );
  const hostTeamCard = !shouldShowHostTeamCard ? null : hasAssignedHostTeam ? (
    <Link
      className="tm-card tm-pressable tm-host-team-card"
      href={match.hostTeamHref ?? `/teams/${match.hostTeamId}`}
      aria-label={`${match.hostTeam} 팀 보기`}
      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16 }}
    >
      {hostTeamCardContent}
    </Link>
  ) : (
    <div className="tm-card tm-host-team-card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16 }}>
      {hostTeamCardContent}
    </div>
  );
  const applicantTeamViewCards = match.applicantTeams.filter((team, index, teams) => (
    Boolean(team.href)
    && team.href !== match.hostTeamHref
    && teams.findIndex((candidate) => candidate.href === team.href) === index
  ));
  const hasTeamViewCards = Boolean(hostTeamCard) || applicantTeamViewCards.length > 0;
  const teamViewCards = hasTeamViewCards && !confirmedOpponent ? (
    <div className="tm-team-match-team-cards" style={{ display: 'grid', gap: 12 }} aria-label="팀 보기">
      {hostTeamCard}
      {applicantTeamViewCards.map((team) => (
        <Link
          key={team.href}
          className="tm-card tm-pressable tm-host-team-card"
          href={team.href!}
          aria-label={`${team.name} 팀 보기`}
          style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16 }}
        >
          <TeamAvatar seed={team.teamId ?? team.applicationId ?? team.name} name={team.name} logoUrl={team.logoUrl} size="md" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>
              {team.status === '승인 완료' ? '어웨이팀 정보' : '신청팀 정보'}
            </div>
            <div className="tm-text-body-lg" style={{ marginTop: 2 }}>{team.name}</div>
            {team.meta ? <div className="tm-text-micro" style={{ marginTop: 4, color: 'var(--text-caption)' }}>{team.meta}</div> : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {team.sportName ? <span className="tm-badge tm-badge-blue">{team.sportName}</span> : null}
              {team.levelLabel ? <span className="tm-badge tm-badge-grey">{team.levelLabel}</span> : null}
              {team.trustState && trustStateLabel(team.trustState) ? (
                <span className="tm-badge tm-badge-blue">{trustStateLabel(team.trustState)}</span>
              ) : null}
            </div>
          </div>
          <span className="tm-btn tm-btn-sm tm-btn-neutral" style={{ flexShrink: 0 }}>팀 보기</span>
        </Link>
      ))}
    </div>
  ) : null;

  /* Shared CTA buttons — rendered in both mobile fixed bar and desktop sticky card */
  // W2-V8: 매치 전체의 상태(취소됨·경기 종료 등)는 상대팀 이름 아래가 아니라 히어로 맨 위 배지가 말한다 —
  // 그 자리에 두면 상대 팀의 상태처럼 읽혔다. 상대팀 캡션은 팀 상태(승인 대기·참가 확정 등)만 쓴다.
  const heroStatus = mode === 'cancelled'
    ? model.statusLabel ?? TEAM_MATCH_CANCELLED_LABEL
    : mode === 'default' && match.status === 'closed' ? model.statusLabel ?? null : null;
  const heroStatusBadge = heroStatus ? (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
      <span className="tm-badge" style={{ background: 'var(--static-white)', color: 'var(--static-ink)' }}>{heroStatus}</span>
    </div>
  ) : null;
  // 팀 카드를 그리지 않을 때(confirmedOpponent) 카드가 말하던 수준 라벨·신뢰 배지를 히어로가 이어받는다.
  const hostHeroSub = [
    match.hostTeamRatingScore == null ? null : `팀 평점 ${match.hostTeamRatingScore.toFixed(1)}`,
    match.hostTeamWins == null ? null : `${match.hostTeamWins}승`,
    confirmedOpponent ? match.hostTeamLevelLabel : null,
  ].filter(Boolean).join(' · ');
  const opponentHeroSub = confirmedOpponent ? [confirmedOpponent.meta, confirmedOpponent.levelLabel].filter(Boolean).join(' · ') : '';
  const opponentSub = teamMatchOpponentSub(mode, match, Boolean(model.applicationsError));
  // 취소·모집 마감·수정은 화면 본문이 아니라 히어로 ⋯ 메뉴에 둔다(H6 manage-menu A).
  const manageMenuButton = mode === 'mine' && model.manageMenu ? (
    <button className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" type="button" aria-label="매치 관리 메뉴" aria-haspopup="dialog" onClick={() => setMenuOpen(true)}>
      <MoreIcon size={20} />
    </button>
  ) : null;
  // 상세 맨 위 "지금 할 일" 카드 — 같은 자리가 상태마다 바뀐다(H6 A안). 취소는 모든 상태보다 우선한다.
  const nowCard = mode === 'cancelled'
    ? <StateCard tone="grey" title="취소된 팀매치예요" body="이 팀매치는 취소되어 진행되지 않아요." />
    : model.progress
      ? <MatchProgressCard model={model} />
      : mode === 'mine'
        ? (requestedTeams.length > 0
          ? <HostApplicationsCard teams={requestedTeams} error={match.applicantActionError} onApprove={(team) => { void approveApplicant(team); }} onReject={(team) => { void rejectApplicant(team); }} />
          : model.applicationsError
            ? <HostApplicationsErrorCard onRetry={model.applicationsError.retry} />
            : model.applicationsPending ? null : <HostWaitingCard apiStatus={match.apiStatus} />)
        : mode === 'pending'
          ? <PendingApplicationCard hostTeamName={match.hostTeam} team={model.myApplicationTeam} />
          : mode === 'approved'
            ? <StateCard tone="green" title="승인 완료" body="팀매치 참가가 확정됐어요. 경기 전 안내는 채팅에서 확인할 수 있어요." />
            : null;

  const nextAction = model.nextAction;
  const ctaButtons = (
    <>
      {showChat ? chatButton : null}
      {/* 호스트·참가팀은 상태별 다음 할 일(H6 A-1·A-3) — 매칭 뒤 잠긴 수정 폼으로 보내지 않는다. */}
      {nextAction ? (
        nextAction.href ? (
          <Link className={`tm-btn tm-btn-lg tm-btn-${nextAction.tone}`} href={nextAction.href}>{nextAction.label}</Link>
        ) : (
          <button className={`tm-btn tm-btn-lg tm-btn-${nextAction.tone}`} type="button" onClick={() => runHeroAction(nextAction.onClick, `${nextAction.label} 처리를 완료했어요.`)}>
            {nextAction.label}
          </button>
        )
      ) : mode === 'mine' ? (
        <button className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-disabled" type="button" disabled>{cta}</button>
      ) : model.applyTeamPicker ? (
        // 신청할 수 있는 팀이 2개 이상이면 곧바로 신청하지 않고 팀을 고르게 한다(N-1).
        <button className="tm-btn tm-btn-lg tm-btn-primary" type="button" disabled={model.applyPending} onClick={() => setApplyTeamOpen(true)}>
          {model.applyPending ? '처리 중' : cta}
        </button>
      ) : (
        /* P2: 완료 메시지 능동형 전환 ("신청이 취소되었어요" → "신청을 취소했어요")
         *
         * 안내 문구와 실제 동작은 **같은 근거**에서 나와야 한다 — 둘이 갈리면 화면이 거짓말을
         * 한다(C2 실사고: 라벨은 '신청 취소'인데 액션은 다른 팀 신규 신청이었다). 그래서 문구는
         * mode가 아니라 액션이 돌려준 결과 status에서 뽑는다(applyResultMessage 주석 참고). */
        <button className={`tm-btn tm-btn-lg ${ctaTone}`} disabled={!canRunAction || model.applyPending} type="button" onClick={() => runHeroAction(model.onApply, applyResultMessage)}>
          {model.applyPending ? '처리 중' : cta}
        </button>
      )}
    </>
  );

  return (
    <>
      {/* Desktop page header: back link + title (mobile topbar is hidden on desktop). AppBackLink
          reads `?from=` itself, so the fallback is only the no-from default. */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <AppBackLink className="tm-desktop-back" fallbackHref="/team-matches">
          <ChevronLeftIcon size={22} strokeWidth={2.2} />
        </AppBackLink>
        <h1 className="tm-text-heading" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{match.title || '팀매치 상세'}</h1>
      </div>

      {/* Desktop 2-column layout wrapper */}
      <div className="tm-team-match-detail-desktop tm-content-enter">
        {/* LEFT: VS hero + info */}
        <div className="tm-team-match-detail-left">
          <article className="tm-match-detail">
            {/* 사진이 없으면(match.imageUrl===null) 목업 사진(team-huddle.webp) 대신 종목
                그래픽을 그린다 — matches-page.tsx MatchDetailPageView 의 -sport 변형과 같은
                패턴(웨이브4, 2026-09-04). 사진이 있을 때만 teamMatchBackgroundImage 를 호출한다
                (그 안의 TEAM_MATCH_IMAGE_FALLBACK 층은 "사진이 404" 케이스 전용이라 별개). */}
            <div
              className={`tm-team-vs-hero${detailImage ? ' tm-team-vs-hero-photo' : ' tm-team-vs-hero-sport'}`}
              style={detailImage ? {
                backgroundImage: teamMatchBackgroundImage(detailImage, match.sport),
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
              } : undefined}
            >
              {detailImage ? null : <SportIllustration sport={match.sport} sizes="88px" className="tm-team-vs-hero-illustration" />}
              {/* Mobile-only back + action buttons inside hero (hidden on desktop) */}
              <div className="tm-hide-desktop" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Link className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" href={model.detailBackHref ?? '/team-matches'} aria-label="뒤로가기">
                  <ChevronLeftIcon size={22} strokeWidth={2.2} />
                </Link>
                <div style={{ display: 'flex', gap: 4 }}>
                  {manageMenuButton}
                  <button className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" type="button" aria-label="공유" onClick={() => runHeroAction(model.onShare, '링크를 복사했어요')}><ShareIcon size={20} /></button>
                </div>
              </div>
              {/* Desktop-only share action inside hero */}
              <div className="tm-team-match-hero-actions tm-show-desktop">
                {manageMenuButton}
                <button className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" type="button" aria-label="공유" onClick={() => runHeroAction(model.onShare, '링크를 복사했어요')}><ShareIcon size={20} /></button>
              </div>
              {awaitingPlatformTeams ? (
                <div className="tm-team-vs-summary">
                  {heroStatusBadge}
                  <div className="tm-team-vs-row">
                    {['홈팀', 'vs', '어웨이팀'].map((side) => side === 'vs' ? (
                      <div key={side} className="tm-text-label" style={{ color: 'var(--overlay-white-90)' }}>vs</div>
                    ) : (
                      <div key={side} style={{ textAlign: side === '홈팀' ? 'left' : 'right' }}>
                        <div className="tm-text-caption" style={{ color: 'var(--overlay-white-90)' }}>{side}</div>
                        <div className="tm-text-subhead" style={{ color: 'var(--static-white)' }}>{match.closed ? '미정' : '모집 중'}</div>
                        <div className="tm-text-micro" style={{ color: 'var(--overlay-white-90)' }}>팀 확정 전</div>
                      </div>
                    ))}
                  </div>
                  <div className="tm-text-caption" style={{ color: 'var(--overlay-white-90)', textAlign: 'center', marginTop: 20 }}>
                    {match.closed ? '플랫폼 주관 · 참가팀 미정' : '플랫폼 주관 · 참가할 두 팀을 모집해요'}
                  </div>
                </div>
              ) : (
                <div className="tm-team-vs-summary">
                  {heroStatusBadge}
                  <div className="tm-team-vs-row">
                    <HeroTeamLink href={confirmedOpponent ? match.hostTeamHref ?? `/teams/${match.hostTeamId}` : undefined} name={match.hostTeam} align="left">
                      <div className="tm-text-caption" style={{ color: 'var(--overlay-white-90)' }}>{hasAssignedHostTeam ? '홈팀' : '운영 주관'}</div>
                      <div className="tm-text-subhead" style={{ color: 'var(--static-white)' }}>{match.hostTeam}{confirmedOpponent ? <HeroTeamChevron /> : null}</div>
                      {hostHeroSub ? <div className="tm-text-micro" style={{ color: 'var(--overlay-white-90)' }}>{hostHeroSub}</div> : null}
                      {confirmedOpponent ? <HeroTrustBadge trustState={match.hostTeamTrustState} align="left" /> : null}
                    </HeroTeamLink>
                    <div className="tm-text-label" style={{ color: 'var(--overlay-white-90)' }}>vs</div>
                    <HeroTeamLink href={confirmedOpponent?.href} name={confirmedOpponent?.name ?? ''} align="right">
                      <div className="tm-text-caption" style={{ color: 'var(--overlay-white-90)' }}>{(mode === 'pending' && model.myApplicationTeam) || model.viewerOnApplicantSide ? '우리 팀' : '상대팀'}</div>
                      <div className="tm-text-subhead" style={{ color: 'var(--static-white)' }}>{teamMatchOpponentLabel(mode, match, model.myApplicationTeam?.name)}{confirmedOpponent ? <HeroTeamChevron /> : null}</div>
                      {opponentHeroSub ? <div className="tm-text-micro" style={{ color: 'var(--overlay-white-90)' }}>{opponentHeroSub}</div> : null}
                      {confirmedOpponent ? <HeroTrustBadge trustState={confirmedOpponent.trustState} align="right" /> : null}
                      {opponentSub ? <div className="tm-text-micro" style={{ color: 'var(--overlay-white-90)' }}>{opponentSub}</div> : null}
                    </HeroTeamLink>
                  </div>
                  {match.platformManaged ? (
                    <div className="tm-text-caption" style={{ color: 'var(--overlay-white-90)', textAlign: 'center', marginTop: 20 }}>플랫폼 주관</div>
                  ) : null}
                </div>
              )}
              {/* P2: 완료 피드백 .tm-complete-check 마이크로인터랙션 */}
              {heroMessage ? <div className="tm-text-caption tm-complete-check" role="status" style={{ color: 'var(--overlay-white-90)', marginTop: 8 }}>{heroMessage}</div> : null}
            </div>
            {lifecyclePanel}
            {/* 히어로(뒤로가기 포함) 다음, 본문 앞 — 내비게이션이 항상 먼저 보이게 유지한다. */}
            {recordEntry}
            <div className="tm-match-detail-body">
              {/* 모바일 셸 제목은 비어 있으므로 실제 매치 제목을 본문에서도 보여준다. */}
              <h1 className="tm-text-heading tm-hide-desktop" style={{ marginBlock: 'var(--spacing-3)', overflowWrap: 'anywhere' }}>
                {match.title || '팀매치 상세'}
              </h1>
              {/* 지금 할 일 — 데스크톱은 우측 CTA 카드가 맡고, 모바일은 하단 바 대신 본문 맨 위에도 둔다. */}
              {model.progress && nextAction?.href && nextAction.tone === 'primary' ? (
                <div className="tm-hide-desktop" style={{ marginTop: 12 }}>
                  <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href={nextAction.href}>{nextAction.label}</Link>
                </div>
              ) : null}
              {nowCard}
              {/* ── 그룹 1: 일정 · 장소 ── */}
              <div className="tm-info-group">
                <div className="tm-info-group-label">일정 · 장소</div>
                <InfoRow label="날짜와 시간" value={`${match.date} ${timeRange}`} />
                <DetailPlace place={match.place} fallbackName={match.venue} />
                <InfoRow label="지역" value={match.region} />
              </div>
              {/* ── 그룹 2: 경기 조건 ── */}
              <div className="tm-info-group">
                <div className="tm-info-group-label">경기 조건</div>
                <InfoRow label="종목" value={match.sport} />
                <InfoRow label="실력등급" value={match.grade ? `${match.grade}등급` : '미정'} />
                <InfoRow label="경기방식" value={match.format} />
                <InfoRow label="경기 스타일" value={match.style} />
                <InfoRow label="유니폼 색상" value={match.uniform} />
                <InfoRow label="성별 조건" value={match.gender} />
              </div>
              {/* ── 그룹 3: 비용 — 상대팀 부담금 수치 승격 ──
                  호스트가 비용을 안 적은 매치(costNote 없음, 리그 대진이 대표적)는 이 그룹을
                  통째로 감춘다. 예전에는 목업 금액(140,000원/280,000원)이 그대로 노출됐고,
                  그걸 0 으로 바꾸면 이번엔 '무료초청 · 실제 청구 없어요'라는 다른 거짓말이 된다. */}
              {(match.opponentCost !== null || match.cost !== null) && (
              <div className="tm-info-group">
                <div className="tm-info-group-label">비용</div>
                {/* 상대팀 부담금은 신청 결정의 핵심 — primary 위치로 승격(R-D1) */}
                {/* P1: 숫자(subhead/20px/700) : 단위(body/15px) = 2:1 비율 + tabular-nums */}
                {match.opponentCost !== null && (
                  <div className="tm-info-cost-hero">
                    <div className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>상대팀 부담금</div>
                    <div className="tm-text-caption" style={{ marginTop: 4 }}>{TEAM_MATCH_COST_EXPLANATION}</div>

                    <div className="tm-info-cost-amount">
                      {match.opponentCost === 0 ? (
                        <>
                          <span className="tm-info-cost-value">무료</span>
                          <span className="tm-badge tm-badge-blue" style={{ marginLeft: 8 }}>무료초청</span>
                        </>
                      ) : (
                        <span className="tab-num" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                          <span style={{ fontSize: 'var(--font-size-subhead)', fontWeight: 700, color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>
                            {formatAmountNumber(match.opponentCost)}
                          </span>
                          <span style={{ fontSize: 'var(--font-size-body)', fontWeight: 500, color: 'var(--text-muted)' }}>원</span>
                        </span>
                      )}
                    </div>
                    {match.opponentCost === 0 ? (
                      <div className="tm-text-micro" style={{ marginTop: 2, color: 'var(--text-caption)' }}>실제 청구 없어요</div>
                    ) : null}
                  </div>
                )}
                {/* P1: 총비용도 숫자:단위 2:1 */}
                {match.cost !== null && (
                  <div className="tm-info-row">
                    <div className="tm-text-caption">총비용</div>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                      <span className="tab-num" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
                        <span className="tm-text-label" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAmountNumber(match.cost)}</span>
                        <span className="tm-text-caption" style={{ fontWeight: 500, color: 'var(--text-muted)' }}>원</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
              )}
              {match.description ? (
                <Card pad={16} style={{ marginTop: 12 }}>
                  <div className="tm-text-body-lg">설명</div>
                  <div className="tm-text-body" style={{ marginTop: 8, lineHeight: 1.55, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{match.description}</div>
                </Card>
              ) : null}
              {/* 참가 팀 카드: 모바일은 본문 하단, 데스크톱은 우측 컬럼에 모두 표시 */}
              {teamViewCards ? <div className="tm-hide-desktop" style={{ marginTop: 16 }}>{teamViewCards}</div> : null}
            </div>
          </article>
        </div>

        {/* RIGHT: desktop sticky column — all participating/applicant teams + CTA card */}
        <div className="tm-team-match-detail-right tm-show-desktop">
          {/* 플랫폼 매치는 미배정 상태에서 비워두고, 팀이 생기면 홈/어웨이를 모두 노출한다. */}
          {teamViewCards ? <div className="tm-team-match-right-host">{teamViewCards}</div> : null}
          <div className="tm-team-match-cta-card">
            {isClosedGuestStatusDuplicate ? null : (
              <div className="tm-team-match-cta-meta">
                <span className="tm-text-caption">{teamMatchStatusCaption(model)}</span>
                {/* 비용을 모르면(costNote 미기재) 금액 대신 '비용 미정' — 0원으로 단정하지 않는다. */}
                <span className="tm-text-label">{model.statusLabel ?? (match.opponentCost !== null ? `${formatAmountNumber(match.opponentCost)}원` : '비용 미정')}</span>
              </div>
            )}
            <div className="tm-team-match-cta-actions">
              {ctaButtons}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile fixed CTA — hidden on desktop (desktop card above replaces it) */}
      <div className="tm-fixed-cta tm-team-match-mobile-cta">
        {isClosedGuestStatusDuplicate ? null : (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="tm-text-caption">{teamMatchStatusCaption(model)}</span>
            {/* 비용을 모르면(costNote 미기재) 금액 대신 '비용 미정' — 0원으로 단정하지 않는다. */}
            <span className="tm-text-label">{model.statusLabel ?? (match.opponentCost !== null ? `${formatAmountNumber(match.opponentCost)}원` : '비용 미정')}</span>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: showChat ? '120px 1fr' : '1fr', gap: 8 }}>
          {ctaButtons}
        </div>
      </div>
      {chatNoticeVisible ? (
        <div className="tm-team-match-chat-notice" role="alert" aria-live="assertive">
          승인 완료 후 이용할 수 있어요
        </div>
      ) : null}
      {menuOpen && model.manageMenu ? (
        <TeamMatchManageMenuSheet
          menu={model.manageMenu}
          actions={model.hostActions ?? []}
          onClose={() => setMenuOpen(false)}
          onRunAction={(action) => { void runHostAction(action); }}
        />
      ) : null}
      {applyTeamOpen && model.applyTeamPicker ? (
        <TeamMatchApplyTeamSheet
          picker={model.applyTeamPicker}
          onClose={() => setApplyTeamOpen(false)}
          onApplied={(result) => {
            if (!heroMountedRef.current) return;
            setApplyTeamOpen(false);
            const message = applyResultMessage(result);
            if (!message) return;
            showHeroMessage(message);
          }}
        />
      ) : null}
      {/* 확인 창은 시트보다 위 레이어라(z-index) ⋯ 메뉴 위에 겹쳐 뜬다. */}
      {ConfirmModal}
    </>
  );
}

export function TeamMatchCreatePageView({ model }: { model: TeamMatchCreateViewModel }) {
  const edit = model.step === 'edit';
  const step = edit ? 3 : stepToNumber(model.step);
  const primaryLabel = model.form?.submitLabel ?? (edit ? '변경사항 저장' : model.step === 'confirm' ? '팀매치 만들기' : '다음');
  const primaryAction = model.step === 'confirm' || edit ? model.form?.onSubmit : model.form?.onNext;
  const secondaryAction = model.form?.onBack;
  const missingFields = model.form?.missingFields ?? [];
  const hasEligibleTeams = model.teams.some((team) => !team.disabled);
  const hasSelectedEligibleTeam = model.teams.some((team) => team.selected && !team.disabled);
  const teamStepBlocked = model.step === 'team' && (
    model.isLoadingTeams
    || Boolean(model.teamLoadError)
    || !hasSelectedEligibleTeam
  );
  const primaryDisabled = Boolean(model.form?.submitting || model.form?.lockedReason || teamStepBlocked);
  const primaryDisabledReason = teamStepBlocked
    ? model.isLoadingTeams
      ? '팀 목록을 불러오는 중이에요.'
      : model.teamLoadError
        ? '팀 목록을 다시 불러와 주세요.'
        : hasEligibleTeams
          ? '팀을 선택해 주세요.'
          : '매치 생성 권한이 있는 팀을 찾을 수 없어요.'
    : null;
  return (
    <>
      <div className={`tm-create-shell tm-team-match-create-shell ${edit ? 'tm-create-shell-edit' : ''} tm-content-enter`}>
        <CreateProgress step={step} edit={edit} completeSteps={model.form?.completeSteps?.map(stepToNumber) ?? []} onGoToStep={model.form?.onGoToStep} />
        {model.form?.error ? <StateCard tone="orange" title="저장할 수 없어요" body={model.form.error} /> : null}
        {missingFields.length > 0 ? <MissingFieldsBanner missingFields={missingFields} stepHref={teamMatchStepHref} /> : null}
        {model.form?.lockedReason ? <StateCard tone="orange" title="수정이 제한된 팀매치예요" body={model.form.lockedReason} /> : null}
        {model.step === 'team' ? <TeamStep model={model} /> : null}
        {model.step === 'sport' ? <SportStep model={model} /> : null}
        {model.step === 'info' || edit ? (
          // The server rejects every field of a locked team match, so every control is locked with it.
          <fieldset className="tm-create-fieldset" disabled={Boolean(model.form?.lockedReason)}>
            <InfoStep model={model} edit={edit} />
          </fieldset>
        ) : null}
        {model.step === 'condition' ? <ConditionStep model={model} /> : null}
        {model.step === 'place-time' ? <PlaceTimeStep model={model} /> : null}
        {model.step === 'confirm' ? <ConfirmStep model={model} /> : null}
      </div>
      <div className="tm-fixed-cta tm-create-fixed-cta">
        {primaryDisabledReason ? <div role="status" className="tm-text-caption" style={{ marginBottom: 8, textAlign: 'center' }}>{primaryDisabledReason}</div> : null}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
          {secondaryAction ? <button className="tm-btn tm-btn-lg tm-btn-neutral" type="button" onClick={secondaryAction}>{edit ? '변경 취소' : model.step === 'team' ? '취소' : '이전'}</button> : <Link className="tm-btn tm-btn-lg tm-btn-neutral" href={prevHref(model.step)}>{edit ? '변경 취소' : model.step === 'team' ? '취소' : '이전'}</Link>}
          {primaryAction ? <button className="tm-btn tm-btn-lg tm-btn-primary" type="button" disabled={primaryDisabled} onClick={() => { if (!primaryDisabled) primaryAction(); }}>{model.form?.imageUploading ? '이미지 업로드 중' : model.form?.submitting ? '저장 중' : primaryLabel}</button> : <Link className="tm-btn tm-btn-lg tm-btn-primary" href={nextHref(model.step)}>{primaryLabel}</Link>}
        </div>
        {edit && model.form?.onCancel ? <button className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" type="button" style={{ marginTop: 8 }} disabled={model.form.submitting} onClick={model.form.onCancel}>팀매치 취소</button> : null}
      </div>
    </>
  );
}

function TeamMatchSearchBar({ filterCount, search, query, filterHref = '/team-matches?filter=1' }: { filterCount: number; search?: TeamMatchListViewModel['search']; query: string; filterHref?: string }) {
  return (
    <div className="tm-list-searchbar">
      <form
        className="tm-list-search-form"
        onBlur={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
            search?.onBlur();
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          search?.onSubmit();
        }}
      >
        <div className={`tm-list-search-input tm-list-search-input-field ${search?.isOpen ? 'tm-list-search-input-active' : ''}`} aria-label="팀매치 검색">
          <input
            aria-label="팀매치 검색어"
            className="tm-list-search-field"
            onChange={(event) => search?.onChange(event.target.value)}
            onFocus={search?.onFocus}
            placeholder={search?.placeholder ?? '지역, 팀 이름, 경기조건 검색'}
            value={search?.value ?? query}
          />
          {search?.value ? (
            <button className="tm-list-search-clear" type="button" aria-label="검색어 지우기" onClick={search.onClear}>×</button>
          ) : null}
          <button className="tm-list-search-submit" type="submit" aria-label="검색">
            <SearchIcon size={19} strokeWidth={2} />
          </button>
        </div>
        {search?.isOpen ? (
          <div className="tm-list-search-dropdown">
            <div className="tm-list-search-dropdown-title">최근 검색</div>
            {search.isLoading ? <div className="tm-list-search-empty">불러오는 중</div> : null}
            {!search.isLoading && search.recentItems.length === 0 ? <div className="tm-list-search-empty">최근 검색어가 없어요</div> : null}
            {search.recentItems.map((item) => (
              <button key={item.id} className="tm-list-search-recent" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => search.onSelectRecent(item.query)}>
                <span>{item.query}</span>
                <SearchIcon size={16} strokeWidth={2} />
              </button>
            ))}
          </div>
        ) : null}
      </form>
      <Link className="tm-list-filter-button" href={filterHref} aria-label="필터">
        <FilterIcon size={21} strokeWidth={2} />
        {filterCount > 0 ? <span className="tm-list-filter-count tab-num">{filterCount}</span> : null}
      </Link>
    </div>
  );
}

function TeamMatchFilterSheet({ model }: { model: TeamMatchListViewModel }) {
  const sheet = model.filterSheet;
  if (!sheet) return null;

  // 열림·닫힘의 권위는 URL이다(A안 계약 1) — open은 부모가 이미 URL에서 유도해 둔
  // sheet.open을 그대로 넘긴다. 닫기 경로는 BottomSheet 가 closeHref 로 처리한다.
  return (
    <>
      <BottomSheet open={sheet.open} closeHref={sheet.closeHref} ariaLabel="팀매치 필터">
        <div className="tm-filter-sheet-handle" />
        <div className="tm-filter-sheet-head">
          <div>
            <div className="tm-text-subhead">필터</div>
            <div className="tm-text-caption" style={{ marginTop: 2 }}>원하는 조건으로 정렬하거나 필터를 설정할 수 있어요</div>
          </div>
          <Link className="tm-btn tm-btn-sm tm-btn-ghost" href={sheet.resetHref} style={{ color: 'var(--text-caption)' }}>초기화</Link>
        </div>
        <div className="tm-filter-section">
          <div className="tm-text-label">구분</div>
          <div className="tm-filter-chip-wrap">
            {sheet.kindOptions.map((option) => (
              <Link key={option.value} className={`tm-chip ${option.active ? 'tm-chip-active' : ''}`} href={option.href} aria-current={option.active ? 'page' : undefined}>{option.label}</Link>
            ))}
          </div>
        </div>
        <div className="tm-filter-section">
          <div className="tm-text-label">정렬</div>
          <div className="tm-filter-chip-wrap">
            {sheet.sortOptions.map((option) => (
              <Link key={option.value} className={`tm-chip ${option.active ? 'tm-chip-active' : ''}`} href={option.href} aria-current={option.active ? 'page' : undefined}>{option.label}</Link>
            ))}
          </div>
        </div>
        <div className="tm-filter-section">
          <div className="tm-text-label">성별 조건</div>
          <div className="tm-filter-chip-wrap">
            {sheet.genderOptions.map((option) => (
              <Link key={option.value} className={`tm-chip ${option.active ? 'tm-chip-active' : ''}`} href={option.href} aria-current={option.active ? 'page' : undefined}>{option.label}</Link>
            ))}
          </div>
        </div>
        <div className="tm-filter-section">
          <div className="tm-text-label">레벨</div>
          <div className="tm-filter-chip-wrap">
            {sheet.levelOptions.map((option) => (
              <Link key={option.value} className={`tm-chip ${option.active ? 'tm-chip-active' : ''}`} href={option.href} aria-current={option.active ? 'page' : undefined}>{option.label}</Link>
            ))}
          </div>
        </div>
        <div className="tm-filter-actions">
          <Link className="tm-btn tm-btn-lg tm-btn-neutral" href={sheet.closeHref}>닫기</Link>
          <Link className="tm-btn tm-btn-lg tm-btn-primary" href={sheet.applyHref}>적용하기</Link>
        </div>
      </BottomSheet>
    </>
  );
}

function TeamMatchCard({ match, fromHref }: { match: TeamMatchModel; fromHref: string | null }) {
  const listImage = teamMatchImage(match, 'list');
  /* #20: 상대팀 부담금은 핵심 결정요소 — tm-text-body-lg(17px/700)+blue로 격상.
   *      P1: 숫자:단위 2:1 비율 + tabular-nums. 매너·승 통계는 caption 유지. */
  const league = match.league;
  // 리그 대진은 편성될 때 어드민 명의의 '승인된 신청서'가 함께 만들어진다
  // (league-fixture-creation.ts). 그래서 viewerState 'approved' 는 "내 팀이 승인됐다" 가 아니라
  // "내가 편성했다" 이고, 신청 개념이 없는 리그에서 '승인 완료'·'상대 모집 중' 은 둘 다 거짓이다.
  // 리그 카드의 관계 배지는 호스트 팀 관리자('내 매치')만 남긴다 — 원정팀 관계는 목록 응답에
  // 팀 id 가 없어 판정할 수 없다(없는 사실을 만들지 않는다).
  const isLeagueFixture = league != null;
  // '마감'만으로는 무엇이 마감인지 안 드러난다 — 목록에 마감된 매치가 함께 놓이면서
  // '모집 중'과 대비되는 문구가 필요해졌다(2026-09-07 제보: "신청마감인거랑 신청가능이랑 차이가 보여야지").
  // 배지는 두 가지 서로 다른 사실을 말한다 — **나와의 관계**와 **매치 상태**.
  // 예전엔 한 배지에 눌러 담아서, 호스트가 보는 매치는 마감·취소·종료여도 '내 매치'로만
  // 보이고 마감 표시가 아예 없었다(statusToCardStatus 가 viewerState 를 먼저 본다).
  // 관계가 있으면 관계 배지를, 마감이면 마감 배지를 각각 붙인다 — 둘 다인 경우 둘 다 붙는다.
  const relation = match.status === 'mine'
    ? { label: '내 매치', className: 'tm-badge-blue' }
    : isLeagueFixture
      ? null
      : match.status === 'pending'
        ? { label: '승인 대기', className: 'tm-badge-orange' }
        : match.status === 'approved'
          ? { label: '승인 완료', className: 'tm-badge-green' }
          : null;
  // 마감된 팀매치도 경기 시작 전까지 목록에 남는다(team-matches.service.ts list()) —
  // 배지만으로는 스크롤 중에 안 걸리므로 카드 지면·사진도 함께 눌러 한눈에 갈리게 한다.
  // 판정은 관계가 아니라 API status 로 한다(match.closed) — 호스트도 같은 규칙으로 본다.
  //
  // **리그 대진은 제외한다.** 리그엔 신청 개념이 없어 `closed` 가 "모집이 끝났다" 가 아니라
  // 그냥 "상대가 정해져 있다" 는 뜻인데, 그 상태가 원정팀 팀장·선수 전원에게 붙어
  // **자기 팀 경기가 마감·흐림으로** 보였다.
  const isEnded = match.apiStatus === 'completed' || match.apiStatus === 'cancelled' || match.apiStatus === 'expired';
  const isClosed = isEnded || (match.closed && !isLeagueFixture && !match.live && !match.completionPending);
  // 관계도 없고 마감도 아니면 "상대가 아직 없다"를 쓴다 — 목록 응답에 상대팀이 없어
  // 화면 어디에도 없던 정보다. 상대 "팀 이름"은 응답에 없으므로 만들어내지 않는다.
  const openLabel = !relation && !isClosed && !isLeagueFixture && !match.live && !match.completionPending
    ? (match.platformManaged ? '팀 모집 중' : '상대 모집 중')
    : null;
  return (
    <Link className={`tm-match-row tm-card-interactive tm-pressable${isClosed ? ' tm-card-closed' : ''}`} href={withFromPath(`/team-matches/${match.id}`, fromHref)}>
      {/* 예전엔 카드 위쪽 124px(카드의 44%)이 파란 VS 밴드였다. 그 밴드의 "상대팀" 칸에는
          담을 값이 없다 — 목록 API 응답에 상대팀이 없고, 팀매치는 대부분 상대가 아직 정해지지
          않은 모집 글이라 그 자리를 상태 배지가 차지하고 있었다. 결과적으로 시각 무게가 가장 큰
          영역이 정보를 가장 적게 담았다(alpha 실측 2026-09-07: 390에서 카드 280px·한 화면 2.75장,
          같은 토글의 개인 탭은 131px·5.88장).
          그래서 개인 탭과 같은 행 카드(.tm-match-row)로 통일한다 — 새 카드 체계를 만들지 않고
          이미 배포된 규칙을 그대로 쓴다. */}
      <div className={`tm-match-row-thumb${listImage ? '' : ' tm-match-media-sport'}`} style={listImage ? { backgroundImage: teamMatchBackgroundImage(listImage, match.sport) } : undefined}>
        {listImage ? null : <SportIllustration sport={match.sport} sizes="76px" />}

      </div>
      <div className="tm-match-row-main">
        {/* 팀이 이 목록의 신원이다 — 제목보다 먼저 읽히도록 맨 위 줄에 둔다.
            매너·승수는 모르면(공개 후기 0건) 아예 안 쓴다. 0 으로 채우면 잘하는 팀이 최악으로 보인다. */}
        {/* 상태 배지는 제목 줄이 아니라 이 신원 줄에 둔다. 팀매치는 개인 매치와 달리 거의 모든
            카드에 배지가 붙어(모집 중·신청 마감·승인 완료…), 제목 줄에 인라인으로 두면 매 카드에서
            제목이 그만큼 잘린다 — 데스크톱 실측(2026-09-07)에서 본문 191px 중 제목이 111px 였다. */}
        <div className="tm-text-caption tm-match-row-meta tm-team-match-row-id">
          {/* 상태는 여러 개가 동시에 참일 수 있다. 팀명과 한 flex 줄을 공유하면
              320~430px에서 고정폭 배지가 카드 밖으로 밀린다. 배지만 독립적으로 줄바꿈하고
              신원은 아래 한 줄에서 말줄임해 세 상태를 모두 보존한다. */}
          <div className="tm-team-match-row-badges">
            {match.platformManaged ? <span className="tm-badge tm-badge-grey">플랫폼 주관</span> : null}
            {relation ? (
              <span className={`tm-badge ${relation.className}`}>
                <svg width="7" height="7" viewBox="0 0 7 7" aria-hidden="true" style={{ flexShrink: 0 }}><circle cx="3.5" cy="3.5" r="3.5" fill="currentColor" /></svg>
                {relation.label}
              </span>
            ) : null}
            {match.live && <span className="tm-badge tm-badge-green">진행 중</span>}
            {match.completionPending ? <span className="tm-badge tm-badge-orange">종료 확인 중</span> : null}
            {isClosed ? (
              <span className="tm-badge tm-badge-grey tm-card-closed-badge">
                <svg width="7" height="7" viewBox="0 0 7 7" aria-hidden="true" style={{ flexShrink: 0 }}><circle cx="3.5" cy="3.5" r="3.5" fill="currentColor" /></svg>
                {match.apiStatus === 'on_hold' ? '보류' : match.apiStatus === 'completed' ? '경기 종료' : '신청 마감'}
              </span>
            ) : null}
            {openLabel ? (
              <span className="tm-badge tm-badge-blue">
                <svg width="7" height="7" viewBox="0 0 7 7" aria-hidden="true" style={{ flexShrink: 0 }}><circle cx="3.5" cy="3.5" r="3.5" fill="currentColor" /></svg>
                {openLabel}
              </span>
            ) : null}
            {/* 리그 배지는 형제 배지와 같은 정적 칩이다(링크 아님). 리그명은 조건 줄에 적는다. */}
            {league ? <span className="tm-badge tm-badge-grey">정규 리그</span> : null}
          </div>
          <span className="tm-team-match-row-host">
            {/* **누구와 붙는지**. 목록 응답에 상대팀이 없어 화면 어디에도 없던 정보다
                (`toListItem` 이 `approvedOpponentTeam` 을 싣게 되면서 생겼다 — 추가 쿼리 없음).
                상대가 아직 없으면 붙이지 않는다 — 없는 사실을 만들지 않는다. */}
            <strong style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
              {match.opponentTeam ? `${match.hostTeam} vs ${match.opponentTeam}` : match.hostTeam}
            </strong>
            {match.manner !== null && match.wins !== null ? (
              <> · 매너 <span className="tab-num">{match.manner}</span> · 승 <span className="tab-num">{match.wins}</span></>
            ) : null}
          </span>
        </div>
        <div className="tm-match-row-headline">
          <div className="tm-text-body-lg tm-match-row-title">{match.title}</div>
        </div>
        <div className="tm-text-caption tm-match-row-when">
          <strong style={{ fontWeight: 600 }}>{match.date} {match.time}</strong>
          {' · '}{match.venue}
        </div>
        <div className="tm-match-row-foot">
          <span className="tm-text-caption tm-team-match-row-cond">
            <span>
              {[match.sport, match.grade ? `${match.grade}등급` : '', match.format, match.gender].filter(Boolean).join(' · ')}
            </span>
            {/* 어느 리그인지는 이 줄이 말한다 — 배지엔 종류만, 제목은 여기서 말줄임된다. */}
            {/* 구분점은 리그명과 한 flex item 이어야 줄바꿈 때 혼자 다음 줄로 떨어지지 않는다.
                구분점만 aria-hidden — 스크린리더는 "풋살", "가을 리그" 두 요소로 나눠 읽는다. */}
            {league ? (
              <span className="tm-team-match-row-cond-league">
                <span aria-hidden="true">{' · '}</span>
                {league.title}
              </span>
            ) : null}
          </span>
          {/* 비용을 모르면(costNote 미기재) '비용 미정'으로 둔다 — 0 으로 채워 '무료'라고 하면
              없는 사실을 만들어낸다.

              **리그 대진은 그 자리를 행동 라벨로 바꾼다.** 리그 경기에는 상대팀 부담금이라는
              개념이 없어 '비용 미정' 이 영원히 미정으로 남는다 — 채워질 수 없는 값을 계속
              "미정" 이라 말하면 운영자가 안 채운 것처럼 읽힌다. 자리를 비우지도 않는다(푸터의
              좌우 배치가 무너진다). 카드 탭이 리그 경기 상세로 가므로 그것을 그대로 적는다
              (개인 매치 행 카드의 actionLabel 자리와 같은 클래스). */}
          {isLeagueFixture && match.opponentCost === null ? (
            <span className="tm-text-label tm-match-row-act">경기 보기</span>
          ) : match.opponentCost === null ? (
            <span className="tm-text-caption tm-match-row-cost">비용 미정</span>
          ) : match.opponentCost === 0 ? (
            <span className="tm-text-label tm-match-row-act"><span className="sr-only">상대팀 부담금, {TEAM_MATCH_COST_EXPLANATION}. </span>무료초청</span>
          ) : (
            <span className="tab-num tm-match-row-cost" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
              <span className="sr-only">상대팀 부담금, {TEAM_MATCH_COST_EXPLANATION}. </span>
              <span style={{ fontSize: 'var(--font-size-body-lg)', fontWeight: 700, color: 'var(--blue700)', fontVariantNumeric: 'tabular-nums' }}>{formatAmountNumber(match.opponentCost)}</span>
              <span style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 500, color: 'var(--blue700)' }}>원</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/**
 * CreateField/FieldErrorText 곁에 두는 "필수 입력" 안내 — 실제 제출 로직(RULES 테이블)이
 * 필수로 판정한 필드에만 붙인다. 호출부가 "값이 비어 있고 + 아직 에러도 없을 때"만
 * shown=true를 넘긴다 — 값을 채우면 즉시 사라지고(붉은 별표처럼 다 채워도 남아 있는
 * 표시가 아니다), 에러가 뜨면(에러 문구가 이미 "왜 안 되는지"를 설명하므로) 자리를
 * 비켜준다. CreateField 자체는 라벨 텍스트만 받아 required 마커를 넣을 수 없어
 * (v1-ui/create-form-fields.tsx는 여러 화면이 공유하는 컴포넌트라 여기서 수정하지 않는다)
 * 필드 바깥의 별도 안내로 대신한다.
 */
/** 일정·장소 그룹 안의 장소 행. 이름·주소는 카드가 보여 주므로 InfoRow 와 겹쳐 그리지 않는다. */
function DetailPlace({ place, fallbackName }: { place: V1PlaceView | null; fallbackName: string }) {
  if (!place) return <InfoRow label="장소" value={fallbackName} />;
  return (
    <div className="tm-info-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4, padding: '14px 0' }}>
      <div className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>장소</div>
      <PlaceCard place={place} />
    </div>
  );
}

function RequiredHint({ shown }: { shown: boolean }) {
  if (!shown) return null;
  return <div className="tm-text-micro" style={{ marginTop: 4, color: 'var(--text-caption)' }}>필수 입력이에요</div>;
}

function TeamStep({ model }: { model: TeamMatchCreateViewModel }) {
  const hasTeams = model.teams.length > 0;
  const hasCreatableTeams = model.teams.some((team) => !team.disabled);
  return (
    <div>
      <h1 className="tm-text-heading">어떤 팀의 매치인가요?</h1>
      <p className="tm-text-body" style={{ marginTop: 8 }}>선택한 팀의 종목·등급·권한 정보를 기반으로 팀매치를 만들어요.</p>
      {model.teamLoadError ? (
        <ErrorState title="팀 목록을 불러오지 못했어요" message={model.teamLoadError.message} onRetry={model.teamLoadError.onRetry} />
      ) : model.isLoadingTeams ? (
        <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="tm-review-skeleton" style={{ height: 72 }} aria-hidden="true" />
          ))}
        </div>
      ) : !hasTeams ? (
        <EmptyState title="팀매치를 만들 수 있는 팀이 없어요" sub="팀을 만들거나 팀 목록에서 가입할 팀을 찾아 주세요." cta="팀 만들기" ctaHref="/teams/new" />
      ) : (
        <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
          {model.teams.map((team) => (
            <button
              key={team.name}
              className={`tm-card ${team.disabled ? '' : 'tm-pressable'} ${team.selected ? 'tm-create-selected' : ''}`}
              style={{ padding: 16, textAlign: 'left', opacity: team.disabled ? 0.55 : 1, cursor: team.disabled ? 'default' : 'pointer' }}
              type="button"
              aria-pressed={team.selected}
              disabled={team.disabled}
              onClick={() => { if (!team.disabled) model.form?.onSelectTeam(team.name); }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div className="tm-text-body-lg">{team.name}</div>
                {team.disabled ? (
                  <span className="tm-badge tm-badge-grey" style={{ flexShrink: 0 }}>매치 생성 권한 없음</span>
                ) : null}
              </div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>{team.sport} · {team.members}명 · {team.role}</div>
            </button>
          ))}
        </div>
      )}
      <FieldErrorText id="field-hostTeamId" message={model.form?.fieldErrors?.hostTeamId} />
      {/* 팀이 없는 경우 EmptyState만 표시하고 권한 카드는 생략한다.
          팀은 있으나 권한이 없는 경우에만 권한 카드를 표시한다. */}
      {!model.teamLoadError && !model.isLoadingTeams && hasTeams ? (() => {
        const blocked = !hasCreatableTeams;
        // 두 갈래 다 지면에 색이 깔린다 — grey50 4.42:1 · orange50 4.21:1 (기준 4.5).
        return (
          <Card pad={16} className="tm-on-tint" style={{ marginTop: 16, background: blocked ? 'var(--orange50)' : 'var(--grey50)' }}>
            <div className="tm-text-label" style={blocked ? { color: 'var(--orange700)' } : undefined}>권한 기준</div>
            <div className="tm-text-caption" style={{ marginTop: 8 }}>
              {blocked
                ? '팀장·매니저인 팀이 있어야 다음으로 진행할 수 있어요. 팀을 만들거나 팀 목록에서 함께할 팀을 찾아 주세요.'
                : '팀장·매니저만 다음으로 진행할 수 있어요.'}
            </div>
            {blocked ? <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><Link className="tm-btn tm-btn-sm tm-btn-primary" href="/teams/new">팀 만들기</Link><Link className="tm-btn tm-btn-sm tm-btn-neutral" href="/teams">팀 찾기</Link></div> : null}
          </Card>
        );
      })() : null}
    </div>
  );
}

function SportStep({ model }: { model: TeamMatchCreateViewModel }) {
  return <div><h1 className="tm-text-heading">어떤 종목인가요?</h1><p className="tm-text-body" style={{ marginTop: 8 }}>상대 팀과 함께 진행할 종목을 선택해 주세요.</p><div className="tm-create-sport-grid">{model.sports.map((sport) => <button key={sport} className={`tm-card tm-pressable ${sport === model.selectedSport ? 'tm-create-selected' : ''}`} style={{ padding: 16, textAlign: 'left' }} type="button" aria-pressed={sport === model.selectedSport} onClick={() => model.form?.onSelectSport(sport)}><div className="tm-text-body-lg">{sport}</div><div className="tm-text-caption" style={{ marginTop: 4 }}>{sport === model.selectedSport ? '선택됨' : '탭해서 선택'}</div></button>)}</div><FieldErrorText id="field-sportId" message={model.form?.fieldErrors?.sportId} /></div>;
}

function InfoStep({ model, edit }: { model: TeamMatchCreateViewModel; edit: boolean }) {
  const d = model.draft;
  return (
    <div>
      {/* [P3] 캡션(우상단 "매치 정보")과 h1 이 같은 문구였다 — 1·2·6단계처럼 h1 은 질문형,
          캡션은 단계 이름으로 역할을 가른다. */}
      <h1 className="tm-text-heading">어떤 매치인가요?</h1>
      {edit ? <ImmutableMatchContext team={model.selectedTeam} sport={model.selectedSport} /> : null}
      <CreateField id="field-title" error={model.form?.fieldErrors?.title} label="매치 제목" value={d.title} placeholder="예: 토요일 저녁 풋살 상대팀 구합니다" onChange={(value) => model.form?.onFieldChange('title', value)} />
      <RequiredHint shown={!model.form?.fieldErrors?.title && !d.title.trim()} />
      <CreateField label="설명" value={d.description} placeholder="예: 친선 위주로 즐겁게 경기할 팀을 찾고 있어요." multiline onChange={(value) => model.form?.onFieldChange('description', value)} />
      <TeamMatchImagesField images={d} sport={model.selectedSport} onChange={(field, value) => model.form?.onFieldChange(field, value)} onUpload={model.form?.uploadImage} disabled={model.form?.submitting} />
      {edit ? (
        <>
          <h2 className="tm-text-subhead" style={{ marginTop: 28 }}>경기조건</h2>
          <ConditionFields model={model} />
          <h2 className="tm-text-subhead" style={{ marginTop: 28 }}>장소와 시간</h2>
          <PlaceTimeFields model={model} />
          <StateCard tone="orange" title="수정 중" body="호스트 팀과 종목은 생성 후 바꿀 수 없고, 나머지 항목은 모두 저장돼요." />
        </>
      ) : null}
    </div>
  );
}

function ImmutableMatchContext({ team, sport }: { team: string; sport: string }) {
  return (
    <Card pad={16} className="tm-on-tint" style={{ marginTop: 16, background: 'var(--grey50)' }}>
      <div className="tm-create-two-col">
        <div><div className="tm-text-caption">호스트 팀</div><div className="tm-text-body-lg" style={{ marginTop: 4 }}>{team}</div></div>
        <div><div className="tm-text-caption">종목</div><div className="tm-text-body-lg" style={{ marginTop: 4 }}>{sport}</div></div>
      </div>
      <div className="tm-text-caption" style={{ marginTop: 8 }}>호스트 팀과 팀 종목은 생성 후 변경할 수 없어요.</div>
    </Card>
  );
}

// 경기조건 프리셋 보기. grade는 apps/v1_web/src/lib/v1-levels.ts의 V1_LEVELS(4단계)가
// 유일한 진실이라 자유입력을 허용하지 않는다(allowsFreeText=false) — 이미 팀/매치 매칭·
// 검색이 이 4단계 폐쇄형 체계에 의존하므로 자유입력을 열면 매칭 근거가 깨진다.
// format/style/uniform은 자유입력을 함께 허용한다(구장 크기별 변형, 줄무늬 등 프리셋이
// 못 덮는 값이 실제로 흔함).
const MATCH_FORMAT_OPTIONS_SOCCER = ['11:11', '9:9', '8:8', '7:7'] as const;
const MATCH_FORMAT_OPTIONS_FUTSAL = ['6:6', '5:5', '4:4'] as const;
const MATCH_STYLE_OPTIONS = ['친선', '매너 중시', '교환매치', '실력 중심', '초보 환영', '기타'] as const;
// 최대 3개(사용자 확정 결정) — apps/v1_api/src/team-matches/team-match-conditions.constants.ts의
// MATCH_STYLE_MAX_ITEMS와 값을 맞춘다(별도 앱이라 상수 자체는 공유하지 못한다). 서버 DTO가
// 최종 방어선이고, 이 값은 4번째 선택 시 조용히 막히지 않고 이유를 안내하기 위한 프론트 표시용.
const MATCH_STYLE_MAX_ITEMS = 3;
const UNIFORM_COLOR_OPTIONS = ['흰색', '검정', '빨강', '파랑', '노랑', '초록', '주황', '남색'] as const;

// 서버(apps/v1_api/src/team-matches/team-match-conditions.constants.ts의
// MATCH_FORMAT_OPTIONS_BY_SPORT_SLUG)는 soccer/futsal 두 종목에만 프리셋을 정의한다 —
// "그 외 종목엔 프리셋이 없다"가 모델이다. 예전엔 풋살이 아니면 무조건 축구 프리셋으로
// 폴백해 러닝·수영 같은 종목에도 11:11 같은 축구 방식 칩이 떴다. 프리셋이 없는 종목은
// 빈 배열을 반환해 PresetChipSelector가 "직접입력" 칩만 보여주게 한다(allowFreeText로
// 이미 지원 중이라 화면 쪽 별도 처리가 필요 없다).
function matchFormatOptionsForSport(sportNameOrId: string): readonly string[] {
  const normalized = sportNameOrId.toLowerCase();
  const isFutsal = sportNameOrId.includes('풋살') || normalized.includes('futsal');
  if (isFutsal) return MATCH_FORMAT_OPTIONS_FUTSAL;
  const isSoccer = sportNameOrId.includes('축구') || normalized.includes('soccer') || normalized.includes('football');
  if (isSoccer) return MATCH_FORMAT_OPTIONS_SOCCER;
  return [];
}

// [P3] 위 InfoStep 과 동일 원칙 — 캡션은 '경기조건'(단계 이름) 그대로, h1 만 질문형으로.
function ConditionStep({ model }: { model: TeamMatchCreateViewModel }) {
  return <div><h1 className="tm-text-heading">어떤 조건으로 경기하나요?</h1><p className="tm-text-body" style={{ marginTop: 8 }}>상대팀이 신청 전에 확인할 등급, 방식, 비용 조건을 입력해 주세요.</p><ConditionFields model={model} /><Card pad={16} className="tm-on-tint" style={{ marginTop: 16, background: 'var(--grey50)' }}><div className="tm-text-label">무료초청 표시</div><div className="tm-text-caption" style={{ marginTop: 4 }}>상대팀 부담금이 0원이면 목록과 상세에 '무료초청' 배지가 표시돼요.</div></Card></div>;
}

function ConditionFields({ model }: { model: TeamMatchCreateViewModel }) {
  const d = model.draft;
  const formatOptions = matchFormatOptionsForSport(model.selectedSport);
  return <><TeamMatchLevelRangeField value={d.grade} error={model.form?.fieldErrors?.grade} onChange={(value) => model.form?.onFieldChange('grade', value)} /><PresetChipSelector label="경기방식" options={formatOptions} value={d.format} allowFreeText freeTextPlaceholder="예: 10:10, 3:3" onChange={(value) => model.form?.onFieldChange('format', value)} /><MultiPresetChipSelector label="경기 스타일" options={MATCH_STYLE_OPTIONS} values={d.style} allowFreeText freeTextPlaceholder="목록에 없으면 직접 입력해 주세요" maxItems={MATCH_STYLE_MAX_ITEMS} onChange={(value) => model.form?.onFieldChange('style', value)} /><PresetChipSelector label="유니폼 색상" options={UNIFORM_COLOR_OPTIONS} value={d.uniform} allowFreeText freeTextPlaceholder="예: 줄무늬 상의" onChange={(value) => model.form?.onFieldChange('uniform', value)} /><GenderRuleSelector value={d.gender} onChange={(value) => model.form?.onFieldChange('gender', value)} /><div className="tm-create-two-col"><CreateField label="총비용" value={`${d.cost}`} suffix="원" type="number" onChange={(value) => model.form?.onFieldChange('cost', Number(value))} /><CreateField label="상대팀 부담금" value={`${d.opponentCost}`} suffix="원" type="number" description={TEAM_MATCH_COST_EXPLANATION} onChange={(value) => model.form?.onFieldChange('opponentCost', Number(value))} /></div></>;
}

// [P3] 위와 동일 원칙 — 캡션은 '장소와 시간'(단계 이름) 그대로, h1 만 질문형으로.
function PlaceTimeStep({ model }: { model: TeamMatchCreateViewModel }) {
  return <div><h1 className="tm-text-heading">언제, 어디서 하나요?</h1><PlaceTimeFields model={model} /></div>;
}

function PlaceTimeFields({ model }: { model: TeamMatchCreateViewModel }) {
  const d = model.draft;
  const errors = model.form?.fieldErrors;
  const recentVenues = model.form?.recentVenues ?? [];
  return (
    <>
      <RegionSelect value={model.form?.regionId ?? ''} regions={model.form?.regions ?? []} onChange={model.form?.onRegionChange} error={errors?.regionId} />
      <PlacePicker
        id="field-place"
        label="장소"
        value={d.place}
        onChange={(place) => model.form?.onFieldChange('place', place)}
        error={errors?.place}
        recentVenues={recentVenues}
      />
      <RequiredHint shown={!errors?.place && !d.place} />
      <CreateField id="field-date" error={errors?.date} label="날짜" value={d.date} type="date" onChange={(value) => model.form?.onFieldChange('date', value)} />
      <RequiredHint shown={!errors?.date && !d.date} />
      <div className="tm-create-two-col">
        <div>
          <CreateField id="field-startTime" error={errors?.startTime} label="시작 시간" value={d.startTime} type="time" onChange={(value) => model.form?.onFieldChange('startTime', value)} />
          <RequiredHint shown={!errors?.startTime && !d.startTime} />
        </div>
        <CreateField id="field-endTime" error={errors?.endTime} label="종료 시간" value={d.endTime} type="time" onChange={(value) => model.form?.onFieldChange('endTime', value)} />
      </div>
      <CreateField id="field-endDate" error={errors?.endDate} label="종료 날짜 (다음 날 종료 시)" value={d.endDate ?? ''} type="date" onChange={(value) => model.form?.onFieldChange('endDate', value)} />
      <div className="tm-text-caption" style={{ marginTop: 8 }}>종료 날짜를 비우면 시작 날짜와 같아요. 자정을 넘는 경기는 다음 날을 선택해 주세요.</div>
      <div className="tm-create-two-col">
        <CreateField id="field-deadlineDate" error={errors?.deadlineDate} label="신청 마감일" value={d.deadlineDate} type="date" onChange={(value) => model.form?.onFieldChange('deadlineDate', value)} />
        <CreateField id="field-deadlineTime" error={errors?.deadlineTime} label="신청 마감시간" value={d.deadlineTime} type="time" onChange={(value) => model.form?.onFieldChange('deadlineTime', value)} />
      </div>
      <div className="tm-text-caption" style={{ marginTop: 8 }}>둘 다 비워두면 경기 시작 전까지 신청을 받아요.</div>
    </>
  );
}

function RegionSelect({ value, regions, onChange, error }: { value: string; regions: Array<{ id: string; name: string; shortName?: string; parentName?: string }>; onChange?: (regionId: string) => void; error?: string }) {
  const selectedRegion = regions.find((region) => region.id === value);
  const [selectedParent, setSelectedParent] = useState(selectedRegion?.parentName ?? '');
  const parentNames = Array.from(new Set(regions.map((region) => region.parentName).filter((name): name is string => Boolean(name))));
  const districts = selectedParent ? regions.filter((region) => region.parentName === selectedParent) : [];

  useEffect(() => {
    if (selectedRegion?.parentName) setSelectedParent(selectedRegion.parentName);
  }, [selectedRegion?.parentName]);

  if (parentNames.length === 0) {
    return <label className="tm-create-field"><div className="tm-text-label">지역</div><select id="field-regionId" className="tm-create-input tm-create-select-control" value={value} onChange={(event) => onChange?.(event.target.value)}><option value="">시/군/구 선택</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select><div className="tm-text-caption" style={{ marginTop: 8 }}>지역은 검색·추천 기준으로 사용돼요. 상세주소는 아래에 직접 입력해 주세요.</div><FieldErrorText message={error} /><RequiredHint shown={!error && !value} /></label>;
  }

  return (
    <div className="tm-create-field">
      <div className="tm-text-label">지역</div>
      <div className="tm-create-two-col">
        <select
          className="tm-create-input tm-create-select-control"
          value={selectedParent}
          aria-label="시/도 선택"
          onChange={(event) => {
            setSelectedParent(event.target.value);
            onChange?.('');
          }}
        >
          <option value="">시/도 선택</option>
          {parentNames.map((parentName) => <option key={parentName} value={parentName}>{parentName}</option>)}
        </select>
        <select
          id="field-regionId"
          className="tm-create-input tm-create-select-control"
          value={value}
          aria-label="시/군/구 선택"
          disabled={!selectedParent}
          onChange={(event) => onChange?.(event.target.value)}
        >
          <option value="">시/군/구 선택</option>
          {districts.map((region) => <option key={region.id} value={region.id}>{region.shortName ?? region.name}</option>)}
        </select>
      </div>
      <div className="tm-text-caption" style={{ marginTop: 8 }}>지역은 검색·추천 기준으로 사용돼요. 상세주소는 아래에 직접 입력해 주세요.</div>
      <FieldErrorText message={error} />
      <RequiredHint shown={!error && !value} />
    </div>
  );
}

function ConfirmStep({ model }: { model: TeamMatchCreateViewModel }) {
  const d = model.draft;
  const regionName = model.form?.regions.find((region) => region.id === model.form?.regionId)?.name ?? '지역 선택 필요';
  const deadlineText = d.deadlineDate && d.deadlineTime ? `${d.deadlineDate} ${d.deadlineTime}` : '경기 시작 전까지';
  // 상대팀 부담금 0원일 때만 '무료초청' 뱃지 표시 (목록·상세와 동일 조건 #20)
  const isFreeInvite = d.opponentCost === 0;
  const styleText = d.style.join(' · ');
  // 종료 시간은 선택 입력이라 비어 있을 수 있다 — 상세 화면(:349 InfoRow label="장소")과
  // 동일하게 분기해야 확인 화면에 하이픈만 매달려 남는 것을 막는다.
  const timeRangeText = d.endTime ? `${d.date} ${d.startTime} ~ ${d.endDate && d.endDate !== d.date ? `${d.endDate} ` : ''}${d.endTime}` : `${d.date} ${d.startTime}`;
  return <div><h1 className="tm-text-heading">입력한 내용을 확인해 주세요</h1><Card pad={0} style={{ marginTop: 16, overflow: 'hidden' }}><TeamMatchImagesPreview images={d} sport={model.selectedSport} /><div style={{ padding: 16 }}><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><span className="tm-badge tm-badge-blue">{model.selectedSport}</span><span className="tm-badge tm-badge-grey">{d.grade}</span><span className="tm-badge tm-badge-grey">{d.format}</span><span className="tm-badge tm-badge-grey">{matchGenderRuleLabel(d.gender)}</span>{isFreeInvite ? <span className="tm-badge tm-badge-blue">무료초청</span> : null}</div><div className="tm-text-subhead" style={{ marginTop: 12 }}>{d.title}</div><div className="tm-text-caption" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{d.description}</div></div></Card><Card pad={16} style={{ marginTop: 12 }}><InfoRow label="지역" value={regionName} sub="검색과 추천에 사용돼요" /><InfoRow label="경기조건" value={`${d.grade} · ${d.format}${styleText ? ` · ${styleText}` : ''}`} sub={`${d.uniform} · ${matchGenderRuleLabel(d.gender)}`} /><InfoRow label="비용" value={`총 ${formatAmountNumber(d.cost)}원 · 상대팀 ${formatAmountNumber(d.opponentCost)}원`} sub={TEAM_MATCH_COST_EXPLANATION} /><InfoRow label="일시" value={timeRangeText} /><InfoRow label="신청 마감" value={deadlineText} /><InfoRow label="장소" value={d.place?.name ?? ''} sub={d.place?.address ?? undefined} /></Card></div>;

}

// TeamMatchComplete(웨이브4 이전): /team-matches/new/complete 전용 화면이었다. 실제 제출
// 성공 경로는 항상 /team-matches/:id 로 바로 이동해(team-matches-create-client.tsx) 이 화면에
// 닿는 진짜 경로가 없었다(죽은 라우트, 2026-09-04 감사) — 라우트·타입과 함께 제거한다.

/**
 * D7(2026-08-24 사용자 확정) — 값이 비어 있으면 **'미정'을 값 자리에 적는다**(행을 숨기지 않는다).
 *
 * 리그 대진은 운영자가 만들기 때문에 경기방식·경기 스타일·유니폼 색상을 애초에 입력하지
 * 않는다. 그동안은 라벨만 있고 값 칸이 통째로 비어 있어서, 화면이 "정보가 없다"가 아니라
 * "무언가 깨졌다"처럼 보였다. 행을 유지하는 쪽을 고른 것은 **"이 경기엔 그 규정이 없다"는
 * 사실 자체도 정보**이기 때문이다 — 대신 값이 아니라는 것이 보이도록 흐린 색으로 적는다.
 */
function InfoRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const filled = value.trim().length > 0;
  return <div className="tm-info-row"><div className="tm-text-caption">{label}</div><div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}><div className="tm-text-label" style={filled ? undefined : { color: 'var(--text-caption)', fontWeight: 400 }}>{filled ? value : '미정'}</div>{sub ? <div className="tm-text-micro" style={{ marginTop: 3, color: 'var(--text-caption)' }}>{sub}</div> : null}</div></div>;
}

const STATE_CARD_TONE = {
  orange: { background: 'var(--tint-orange)', title: 'var(--orange700)' },
  green: { background: 'var(--tint-green)', title: 'var(--green700)' },
  grey: { background: 'var(--tint-grey)', title: 'var(--text-muted)' },
} as const;

function StateCard({ tone, title, body }: { tone: keyof typeof STATE_CARD_TONE; title: string; body: string }) {
  /* 배경색은 디자인 토큰 사용 — raw rgba 금지(v1-coding-patterns §2) */
  const color = STATE_CARD_TONE[tone];
  return <Card pad={16} className="tm-on-tint" style={{ marginTop: 16, background: color.background }}><div className="tm-text-label" style={{ color: color.title }}>{title}</div><div className="tm-text-caption" style={{ marginTop: 4 }}>{body}</div></Card>;
}

const CREATE_PROGRESS_STEPS: Array<{ key: TeamMatchCreateViewModel['step']; label: string }> = [
  { key: 'team', label: '팀 선택' },
  { key: 'sport', label: '종목 선택' },
  { key: 'info', label: '매치 정보' },
  { key: 'condition', label: '경기조건' },
  { key: 'place-time', label: '장소와 시간' },
  { key: 'confirm', label: '작성 내용 확인' },
];

/** 받침 유무에 따라 "으로"/"로"를 고른다 — aria-label에 라벨을 이어붙일 때 "선택로"처럼
 * 어색한 조사가 나오는 것을 막는다(예: 팀 선택→으로, 매치 정보→로). */
/** 한글 종성 분해에서 ㄹ의 인덱스. 받침이 ㄹ이면 "으로"가 아니라 "로"를 쓴다
 *  ("이메일로", "서울로" — "이메일으로"는 비문). 받침 유무만 보면 이 예외를
 *  놓친다. */
const JONGSEONG_RIEUL = 8;

function withDestinationParticle(label: string) {
  const trimmed = label.trim();
  const lastChar = trimmed.charCodeAt(trimmed.length - 1);
  const isHangulSyllable = lastChar >= 0xac00 && lastChar <= 0xd7a3;
  const jongseong = isHangulSyllable ? (lastChar - 0xac00) % 28 : 0;
  const needsEuro = jongseong !== 0 && jongseong !== JONGSEONG_RIEUL;
  return `${label}${needsEuro ? '으로' : '로'}`;
}

function CreateProgress({
  step,
  edit,
  completeSteps = [],
  onGoToStep,
}: {
  step: number;
  edit: boolean;
  completeSteps?: number[];
  /** 진행 표시줄 클릭 이동. 있으면 각 단계가 클릭 가능한 버튼이 되고, 없으면(정적 렌더 등)
   * 예전처럼 읽기 전용 progressbar로 표시한다. */
  onGoToStep?: (step: TeamMatchCreateViewModel['step']) => void;
}) {
  const stepLabel = CREATE_PROGRESS_STEPS[step - 1]?.label ?? '';
  const bars = CREATE_PROGRESS_STEPS.map((item, index) => {
    const itemStep = index + 1;
    const active = itemStep <= step;
    const complete = completeSteps.includes(itemStep);
    if (!onGoToStep) {
      return <span key={item.key} data-active={active} data-complete={complete} aria-hidden="true" />;
    }
    return (
      <button
        key={item.key}
        type="button"
        onClick={() => onGoToStep(item.key)}
        aria-current={itemStep === step ? 'step' : undefined}
        aria-label={`${itemStep}단계 ${withDestinationParticle(item.label)} 이동`}
        style={{ display: 'block', width: '100%', background: 'none', border: 0, padding: 0, margin: 0, cursor: 'pointer' }}
      >
        <span data-active={active} data-complete={complete} aria-hidden="true" style={{ display: 'block', width: '100%' }} />
      </button>
    );
  });

  return (
    <div className="tm-create-progress">
      {/* edit 모드: 배지 + 안내 텍스트를 space-between으로 양쪽 정렬.
          일반 단계: 배지 + 단계명을 flex-start gap으로 나란히 정렬 — 레이아웃 패턴 §3 */}
      <div style={{ display: 'flex', justifyContent: edit ? 'space-between' : 'flex-start', alignItems: 'center', gap: 12 }}>
        <span className={`tm-badge ${edit ? 'tm-badge-orange' : 'tm-badge-blue'}`}>{edit ? '수정' : `${step}/6단계`}</span>
        <span className="tm-text-caption">{edit ? '변경한 항목만 저장돼요' : stepLabel}</span>
      </div>
      {/* 단계 진행 바 — onGoToStep이 있으면(create 위저드) 각 단계를 클릭해 바로 이동할 수 있고,
          앞 단계가 비어 있으면 첫 무효 단계로 되돌아간다(team-matches.validation의
          firstIncompleteTeamMatchStep). onGoToStep이 없으면(정적 렌더 등) 예전처럼 읽기 전용
          progressbar로 표시한다. data-complete: 이미 지나온 스텝 중 필수 필드를 전부 채운
          스텝 — CSS가 green으로 표시(#1). */}
      {!edit ? (
        onGoToStep ? (
          <nav aria-label="팀매치 만들기 단계 이동" className="tm-create-bars tm-create-bars-6">
            {bars}
          </nav>
        ) : (
          <div
            className="tm-create-bars tm-create-bars-6"
            role="progressbar"
            aria-valuenow={step}
            aria-valuemin={1}
            aria-valuemax={6}
            aria-label={`팀매치 만들기 진행 상태: ${step}단계 중 6단계 (${stepLabel})`}
          >
            {bars}
          </div>
        )
      ) : null}
    </div>
  );
}

function stepToNumber(step: TeamMatchCreateViewModel['step']) {
  if (step === 'team') return 1;
  if (step === 'sport') return 2;
  if (step === 'info') return 3;
  if (step === 'condition') return 4;
  if (step === 'place-time') return 5;
  return 6;
}

function nextHref(step: TeamMatchCreateViewModel['step']) {
  if (step === 'team') return '/team-matches/new/sport';
  if (step === 'sport') return '/team-matches/new/info';
  if (step === 'info') return '/team-matches/new/condition';
  if (step === 'condition') return '/team-matches/new/place-time';
  if (step === 'place-time') return '/team-matches/new/confirm';
  // confirm 이후(웨이브4 이전엔 /team-matches/new/complete): 이 Link fallback 은 model.form?.onNext
  // 가 없는 정적 렌더에서만 쓰이는데, confirm 스텝은 항상 onSubmit 이 있어(TeamMatchCreatePageView
  // 의 primaryAction) 실제로는 노출되지 않는다. 그래도 노출되는 극단 상황(JS 비활성 등)에서
  // 죽은 라우트로 보내지 않도록 목록으로 향한다.
  return '/team-matches';
}

/* prevHref: "이전" 버튼의 Link fallback — model.form?.onBack 이 없는 정적 렌더에서 사용.
 * 단순히 team 아닌 경우를 모두 /new/team 으로 보내면 중간 단계에서 step 1 로 뛰어넘는
 * 버그가 발생한다(form.onBack 이 항상 있는 client 코드에서도 이 fallback 이 노출될 수 있음). */
function prevHref(step: TeamMatchCreateViewModel['step']) {
  if (step === 'sport') return '/team-matches/new/team';
  if (step === 'info') return '/team-matches/new/sport';
  if (step === 'condition') return '/team-matches/new/info';
  if (step === 'place-time') return '/team-matches/new/condition';
  if (step === 'confirm') return '/team-matches/new/place-time';
  return '/team-matches';
}

/**
 * API TrustState('verified' | 'estimated' | 'sample' | 'none', types/api.ts)의 배지 라벨.
 * 원래 gold/silver/bronze를 매핑하고 나머지를 원문 그대로 돌려줬는데, 그 등급은 API에
 * 존재한 적이 없는 값이라 실제 화면엔 "estimated" 영문 원문이 그대로 떴다(2026-08-25
 * 사용자 보고). 라벨은 공개 프로필(public-profile-client.tsx)·홈(home-client-model.ts)과
 * 같은 낱말을 쓰고, 모르는 값은 null 로 돌려 배지 자체를 숨긴다 — 원문 노출 재발 방지.
 */
function trustStateLabel(trustState: string): string | null {
  if (trustState === 'verified') return '인증팀';
  if (trustState === 'estimated') return '누적 중';
  if (trustState === 'sample') return null;
  return null;
}
