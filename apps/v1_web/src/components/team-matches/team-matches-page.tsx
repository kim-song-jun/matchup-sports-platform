'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ChangeEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useShellOverride } from '@/components/v1-ui/shell-override';
import { Card, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { ChevronLeftIcon, ChevronRightIcon, FilterIcon, PlusIcon, SearchIcon, ShareIcon } from '@/components/v1-ui/icons';
import { MatchTypeSegment } from '@/components/v1-ui/match-type-segment';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { CreateField, FieldErrorText, GenderRuleSelector, MissingFieldsBanner, MultiPresetChipSelector, PresetChipSelector, RecentVenueChips } from '@/components/v1-ui/create-form-fields';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { cssUrl } from '@/lib/assets';
// 사진 없는 팀매치의 종목 그래픽 이름 매핑 — matches.card-model.ts 와 같은 함수를 그대로
// 재사용한다(웨이브4). CSS 클래스(tm-match-sport-illustration)도 새로 만들지 않고 그대로 쓴다.
import { sportIllustration } from '@/components/matches/matches.card-model';
import type {
  TeamMatchCreateViewModel,
  TeamMatchDetailViewModel,
  TeamMatchListViewModel,
  TeamMatchModel,
  TeamMatchStateViewModel,
} from './team-matches.types';
import { buildTeamMatchSummaryLabel } from './team-matches.card-model';
import { teamMatchStepHref } from './team-matches.routes';

const TEAM_MATCH_IMAGE_FALLBACK = '/mock/generated/team-huddle.webp';

function teamMatchBackgroundImage(imageUrl: string) {
  const fallback = cssUrl(TEAM_MATCH_IMAGE_FALLBACK);
  return imageUrl && imageUrl !== TEAM_MATCH_IMAGE_FALLBACK
    ? `linear-gradient(rgba(17, 24, 39, 0.58), rgba(17, 24, 39, 0.72)), ${cssUrl(imageUrl)}, ${fallback}`
    : `linear-gradient(rgba(17, 24, 39, 0.58), rgba(17, 24, 39, 0.72)), ${fallback}`;
}

/**
 * 사진 없는 팀매치의 종목 그래픽 — matches-page.tsx 의 SportIllustration 과 동일한 이미지
 * 자산·CSS 클래스(tm-match-sport-illustration)를 재사용한다(웨이브4). 이름 매핑
 * (sportIllustration)도 그대로 가져와 두 화면이 같은 종목에 같은 그래픽을 그린다. 장식이라
 * aria-hidden — 크기는 소비처(카드/히어로)가 정한다.
 */
function TeamMatchSportIllustration({ sport, sizes, className }: { sport: string; sizes: string; className?: string }) {
  return (
    <Image
      className={`tm-match-sport-illustration${className ? ` ${className}` : ''}`}
      src={`/illustrations/${sportIllustration(sport)}-640.webp`}
      alt=""
      aria-hidden="true"
      width={640}
      height={640}
      sizes={sizes}
    />
  );
}

export function TeamMatchListPageView({ model }: { model: TeamMatchListViewModel }) {
  // title/activeTab/topBar는 route-chrome 테이블(fragments/team-matches.ts)이 고정값으로
  // 갖고 있다 — floatingSlot만 ReactNode라 테이블에 담을 수 없어 override로 밀어넣는다
  // (app-shell-promotion.md §1b, 6곳 중 하나).
  useShellOverride({ floatingSlot: <TeamMatchCreateFloatingButton /> });
  return (
    <>
      {/* 데스크톱 전용 인라인 헤더 — FAB가 데스크톱에서 숨겨지므로 대체 CTA 제공 */}
      <div className="tm-team-match-desktop-header tm-show-desktop">
        <h1 className="tm-team-match-desktop-header-title">팀매치</h1>
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
        {/* P1: 통계 숫자 tabular-nums + weight 차등 (2:1 원칙) */}
        <div className="tm-match-summary-row">
          <div className="tm-text-label">{buildTeamMatchSummaryLabel()}</div>
          <div className="tm-text-caption tab-num">
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{model.summary.count}</span>개 · 오늘 {model.summary.today} · 모집 중 <strong style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{model.summary.urgent}</strong>
          </div>
        </div>
        {/* #5: 로딩 중엔 PageSkeleton, 완료 후 비어 있으면 EmptyState — 빈/로딩 구분 */}
        {model.isLoading
          ? <PageSkeleton />
          : model.matches.length
            ? <div className="tm-match-card-stack">{model.matches.map((match) => <TeamMatchCard key={match.id} match={match} />)}</div>
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
            없었다(감사 결함) — tournaments/page.tsx 와 같은 "더 보기" 누적 패턴. */}
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
// 그 라우트의 override만 남긴다. backHref="/team-matches"·topBar 기본값(true)은 원래
// 성공 분기(topBar:false)와 달랐지만 ShellOverride가 지원하지 않는 필드라 테이블 값을
// 그대로 따른다 — "목록으로 돌아가기" Link가 이미 있어 내비게이션은 안전하게 유지된다
// (fragments/team-matches.ts 주석 참고).
export function TeamMatchStatePageView({ model }: { model: TeamMatchStateViewModel }) {
  useShellOverride({ title: model.title, desktopHead: true });
  return (
    <div className="tm-match-list">
      {/* 오류는 ErrorState + 재시도(DESIGN.md §13, matches-page.tsx MatchStatePageView 와 동일
          패턴, 웨이브4). 예전엔 EmptyState + "목록으로 돌아가기" 카드뿐이라 다시 불러올 길이
          없었다(2026-09-04 감사). */}
      {model.state === 'error' ? (
        <>
          <ErrorState title={model.title} message={model.description} onRetry={model.retry} retryLabel="다시 불러오기" />
          <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/team-matches" style={{ marginTop: 12 }}>목록으로 돌아가기</Link>
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
function teamMatchOpponentLabel(mode: TeamMatchDetailViewModel['mode'], match: TeamMatchDetailViewModel['match']) {
  if (mode === 'pending') return '검토 중';
  if (mode === 'approved') {
    // 승인된 시점부터 상대는 확정이다 — 팀 이름 자리에 신청 상태("승인 완료")를 넣으면
    // 정작 누구와 붙는지가 화면에서 사라진다(2026-08-25 사용자 보고). applicantTeams에는
    // 승인된 팀(=이 뷰어의 팀) 하나가 '승인 완료' 상태로 담겨 온다 — 아래 closed 분기와
    // 같은 소스다. 이름을 못 찾는 예외 상황에서만 기존 상태 문구로 물러난다.
    const approvedOpponent = match.applicantTeams.find((team) => team.status === '승인 완료');
    return approvedOpponent?.name ?? '승인 완료';
  }
  if (mode === 'mine') return '신청팀';
  if (match.status === 'closed') {
    // approvedOpponentTeam이 있으면 applicantTeams에 그 팀 하나만 '승인 완료' 상태로 담겨
    // 온다(team-matches-client.tsx toApplicantTeamsWithActions) — guest에게도 이 필드는
    // 그대로 내려오므로 실제 상대팀 이름을 보여줄 수 있다.
    const approvedOpponent = match.applicantTeams.find((team) => team.status === '승인 완료');
    return approvedOpponent?.name ?? '모집 마감';
  }
  return '모집 중';
}

function teamMatchOpponentSub(mode: TeamMatchDetailViewModel['mode'], match: TeamMatchDetailViewModel['match'], statusLabel?: string) {
  if (mode === 'pending') return '홈팀 검토 중';
  if (mode === 'approved') return '참가 확정';
  if (mode === 'mine') return '승인 후 확정';
  // statusLabel(모델에서 이미 계산돼 온 문구)이 matched/completed/cancelled를
  // 구분해 정확한 상태를 준다 — team-matches-client.tsx statusLabel() 참고.
  if (match.status === 'closed') return statusLabel ?? '신청 마감';
  return '신청 후 승인';
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

export function TeamMatchDetailPageView({ model }: { model: TeamMatchDetailViewModel }) {
  const router = useRouter();
  const { match, mode } = model;
  const league = match.league;
  /* 매치 관리 카드의 "화면당 primary 1개" 규칙(DESIGN.md §14) — 라인업 → 경기 결과 → 후기
   * 순서에서 실제로 보이는(model 에 설정된) 첫 행이 primary, 나머지는 outline이다. */
  const matchManageNextAction: 'lineup' | 'result' | 'review' | null = model.lineupHref
    ? 'lineup'
    : model.resultAction
      ? 'result'
      : model.reviewAction
        ? 'review'
        : null;
  const locked = mode === 'pending' || mode === 'approved';
  const cta = model.applyLabel ?? (mode === 'mine' ? '매치 관리' : mode === 'approved' ? '승인 완료' : mode === 'pending' ? '신청 취소' : '신청하기');
  const canRunAction = Boolean(model.onApply);
  /* ctaTone: 행동 불가(신청 불가 등 onApply=undefined + 리다이렉트도 없는 상태)는
   * neutral+disabled 조합으로 표시 — primary 파란 버튼처럼 보여 클릭 오인 방지(T1). */
  const ctaTone = mode === 'pending' ? 'tm-btn-warning' : mode === 'approved' ? 'tm-btn-success' : locked ? 'tm-btn-neutral' : canRunAction ? 'tm-btn-primary' : 'tm-btn-neutral tm-btn-disabled';
  // 채팅 버튼: approved/host(mine)는 활성, pending(승인 대기)은 disabled + '승인 완료 후 이용' 안내.
  // default(비참여자)에는 미노출 — 단 `model.onChat`이 있으면(=canOpenTeamMatchChat이 팀
  // 멤버십으로 허용) mode가 default여도 보여준다. 신청팀 owner가 신청서를 직접 내지 않은
  // 경우(매니저가 신청) mode는 'default'로 남는데, 그 owner도 서버는 채팅을 허용한다 —
  // mode만 보면 그 owner에게 버튼 자체가 사라진다.
  const chatEnabled = Boolean(model.onChat);
  const showChat = mode === 'approved' || mode === 'mine' || mode === 'pending' || Boolean(model.onChat);
  const timeRange = match.endTime ? `${match.time}-${match.endTime}` : match.time;
  const [heroMessage, setHeroMessage] = useState('');

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
        setHeroMessage(message);
        window.setTimeout(() => setHeroMessage(''), 2000);
      })
      .catch(() => {
        setHeroMessage('처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
        window.setTimeout(() => setHeroMessage(''), 2000);
      })
      .finally(() => {
        heroActionBusyRef.current = false;
      });
  };

  /* Chat button — rendered only when showChat is true (approved/mine/pending).
   * disabled + notice when chatEnabled is false (pending, not yet approved). */
  const chatButton = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button className="tm-btn tm-btn-lg tm-btn-neutral" type="button" disabled={!chatEnabled || model.chatPending} onClick={model.onChat}>
        {model.chatPending ? '연결 중' : model.chatLabel ?? '채팅'}
      </button>
      {!chatEnabled ? (
        <div className="tm-text-micro" style={{ textAlign: 'center', color: 'var(--text-caption)' }}>승인 완료 후 이용할 수 있어요</div>
      ) : null}
      {model.chatError ? (
        <div className="tm-text-micro" role="alert" style={{ textAlign: 'center', color: 'var(--red700)' }}>{model.chatError}</div>
      ) : null}
    </div>
  );

  /* Host-team card — rendered in left column (mobile) and right column (desktop).
   * Desktop 우측 컬럼에 이동해 40% 보이드를 채움(T1). 모바일은 기존 위치 유지. */
  const hostTeamCard = (
    <Link className="tm-card tm-pressable tm-host-team-card" href={match.hostTeamHref ?? '/teams'} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16 }}>
      {/* 팀 로고 아바타 — 원본은 48px였으나 TeamAvatar 표준 사이즈 중 가장 근접한 md(40px)로 통일 */}
      <TeamAvatar seed={match.hostTeamId ?? match.hostTeam} name={match.hostTeam} logoUrl={match.hostTeamLogoUrl} size="md" />
      {/* 팀 정보 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>홈팀 정보</div>
        <div className="tm-text-body-lg" style={{ marginTop: 2 }}>{match.hostTeam}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          <span className="tm-badge tm-badge-blue">{match.sport}</span>
          {/* 등급 미입력(리그 대진 등 levelLabel 없음)이면 값 없는 "등급" 배지가 뜬다 — 숨긴다. */}
          {match.grade ? <span className="tm-badge tm-badge-grey">{match.grade}등급</span> : null}
          {match.hostTeamTrustState && trustStateLabel(match.hostTeamTrustState) ? (
            <span className="tm-badge tm-badge-blue">{trustStateLabel(match.hostTeamTrustState)}</span>
          ) : null}
          {/* 리그 상세 페이지는 앱 안에 진입점이 전혀 없었다(직접 URL 만) -- 이 링크가
              사실상 첫 통로다. 배지 자체를 링크로 만들어 리그명을 함께 보여준다.
              hostTeamCard 전체가 이미 팀 상세로 가는 Link라 배지를 또 <a>로 두면 <a>가
              중첩돼 브라우저가 바깥 <a>를 조기에 닫아버린다(오케스트레이터 지적,
              2026-08-20) -- TeamMatchCard(R3, 목록 카드 리그전 배지)와 동일하게
              button + preventDefault/stopPropagation + router.push로 바꿨고,
              같은 .tm-league-badge-link 클래스를 재사용해 화살표 아이콘+밑줄로
              "클릭 가능함"을 컬러 외 신호로도 전달한다. */}
          {league ? (
            <button
              type="button"
              className="tm-badge tm-badge-grey tm-league-badge-link"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                router.push(`/league-matches/${league.leagueId}`);
              }}
              aria-label={`${league.title} 리그 상세로 이동`}
            >
              {/* F7: 리그명이 길면 배지가 카드 밖으로 밀려 나가 화면이 가로로 스크롤됐다
                  (390px 실측: 카드 밖 152px, 뷰포트 밖 37px). 리그명만 말줄임하고
                  화살표는 항상 보이게 텍스트를 별도 span 으로 감싼다 — 팀 상세의
                  "내 리그" 목록이 이미 쓰는 처리와 같은 방식이다.
                  목록 카드 쪽 배지(아래)는 리그명 없이 '정규 리그'만 실어서 넘치지 않는다. */}
              <span className="tm-league-badge-text">정규 리그 · {league.title}</span>
              <ChevronRightIcon size={12} strokeWidth={2.5} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
      {/* 팀 보기는 보조 CTA — apply가 단일 primary; 파란 fill 중복 방지(R-K5) */}
      <span className="tm-btn tm-btn-sm tm-btn-neutral" style={{ flexShrink: 0 }}>팀 보기</span>
    </Link>
  );

  /* Shared CTA buttons — rendered in both mobile fixed bar and desktop sticky card */
  const ctaButtons = (
    <>
      {showChat ? chatButton : null}
      {mode === 'mine' ? (
        <Link className="tm-btn tm-btn-lg tm-btn-primary" href={match.manageHref ?? `/team-matches/${match.id}/edit`}>{cta}</Link>
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
      {/* Desktop page header: back link + title (mobile topbar is hidden on desktop) */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href="/team-matches" aria-label="팀매치 목록으로 돌아가기">
          <ChevronLeftIcon size={22} strokeWidth={2.2} />
        </Link>
        <h1 className="tm-text-heading">{match.title || '팀매치 상세'}</h1>
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
            <div className={`tm-team-vs-hero${match.imageUrl ? '' : ' tm-team-vs-hero-sport'}`} style={match.imageUrl ? { backgroundImage: teamMatchBackgroundImage(match.imageUrl) } : undefined}>
              {match.imageUrl ? null : <TeamMatchSportIllustration sport={match.sport} sizes="120px" className="tm-team-vs-hero-illustration" />}
              {/* Mobile-only back + action buttons inside hero (hidden on desktop) */}
              <div className="tm-hide-desktop" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Link className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" href="/team-matches" aria-label="뒤로가기">
                  <ChevronLeftIcon size={22} strokeWidth={2.2} />
                </Link>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" type="button" aria-label="공유" onClick={() => runHeroAction(model.onShare, '링크를 복사했어요')}><ShareIcon size={20} /></button>
                </div>
              </div>
              {/* Desktop-only share action inside hero */}
              <div className="tm-team-match-hero-actions tm-show-desktop">
                <button className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" type="button" aria-label="공유" onClick={() => runHeroAction(model.onShare, '링크를 복사했어요')}><ShareIcon size={20} /></button>
              </div>
              <div className="tm-team-vs-row">
                <div>
                  <div className="tm-text-caption" style={{ color: 'var(--overlay-white-68)' }}>홈팀</div>
                  <div className="tm-text-subhead" style={{ color: 'var(--static-white)' }}>{match.hostTeam}</div>
                  {/* 매너·승수는 API 가 내려주지만(hostTeam.mannerScore / hostTeam.wins), 공개된
                      팀 후기가 0건이면 매너 점수를 낼 수 없어 null 이 온다 — 모르면 이 줄을 통째로
                      감춘다. 0 으로 채워 "매너 0 · 승 0"을 보여주면 실제로 잘하는 팀이 최악으로
                      보이고, 목업으로 채우면 모든 매치가 같은 숫자를 보여준다(2026-08-23 실사고). */}
                  {match.manner !== null && match.wins !== null ? (
                    <div className="tm-text-micro" style={{ color: 'var(--overlay-white-72)' }}>매너 {match.manner} · 승 {match.wins}</div>
                  ) : null}
                </div>
                <div className="tm-text-label" style={{ color: 'var(--overlay-white-76)' }}>vs</div>
                <div style={{ textAlign: 'right' }}>
                  <div className="tm-text-caption" style={{ color: 'var(--overlay-white-68)' }}>상대팀</div>
                  <div className="tm-text-subhead" style={{ color: 'var(--static-white)' }}>{teamMatchOpponentLabel(mode, match)}</div>
                  <div className="tm-text-micro" style={{ color: 'var(--overlay-white-72)' }}>{teamMatchOpponentSub(mode, match, model.statusLabel)}</div>
                </div>
              </div>
              {/* P2: 완료 피드백 .tm-complete-check 마이크로인터랙션 */}
              {heroMessage ? <div className="tm-text-caption tm-complete-check" role="status" style={{ color: 'var(--overlay-white-86)', marginTop: 8 }}>{heroMessage}</div> : null}
            </div>
            <div className="tm-match-detail-body">
              {/* ── 그룹 1: 일정 · 장소 ── */}
              <div className="tm-info-group">
                <div className="tm-info-group-label">일정 · 장소</div>
                <InfoRow label="날짜와 시간" value={`${match.date} ${timeRange}`} />
                <InfoRow label="장소" value={match.venue} sub={match.address} />
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
                    <div className="tm-info-cost-amount">
                      {match.opponentCost === 0 ? (
                        <>
                          <span className="tm-info-cost-value">무료</span>
                          <span className="tm-badge tm-badge-blue" style={{ marginLeft: 8 }}>무료초청</span>
                        </>
                      ) : (
                        <span className="tab-num" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                          <span style={{ fontSize: 'var(--font-size-subhead)', fontWeight: 700, color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>
                            {match.opponentCost.toLocaleString('ko-KR')}
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
                        <span className="tm-text-label" style={{ fontVariantNumeric: 'tabular-nums' }}>{match.cost.toLocaleString('ko-KR')}</span>
                        <span className="tm-text-caption" style={{ fontWeight: 500, color: 'var(--text-muted)' }}>원</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
              )}
              {/* P2: 능동형 카피 적용 */}
              {mode === 'pending' ? <StateCard tone="orange" title="신청을 접수했어요" body="홈팀이 검토를 마치면 알림으로 알려드릴게요." /> : null}
              {mode === 'approved' ? <StateCard tone="green" title="승인 완료" body="팀매치 참가가 확정됐어요. 경기 전 안내는 채팅에서 확인할 수 있어요." /> : null}
              {match.description ? (
                <Card pad={16} style={{ marginTop: 12 }}>
                  <div className="tm-text-body-lg">설명</div>
                  <div className="tm-text-body" style={{ marginTop: 8, lineHeight: 1.55, color: 'var(--text-muted)' }}>{match.description}</div>
                </Card>
              ) : null}
              {/* 매치 관리: 라인업(Task 15)과 경기 결과(Task 17) CTA를 한 카드로 묶는다 —
                  예전엔 결과 입력 버튼이 카드 없이 붕 떠서 라인업 카드와 시각적으로
                  분리돼 보였다(QA 지적). model.lineupHref/resultAction은
                  team-matches-client.tsx가 권한 조건일 때만 설정한다.
                  웨이브4(2026-09-04): 세 행이 모두 primary(파란 버튼)라 "무엇부터 해야 하는지"가
                  안 보였다(DESIGN.md §14 — 화면당 primary 1개). 순서(라인업 → 경기 결과 → 후기)상
                  가장 먼저 나타나는(=아직 안 끝난) 행 하나만 primary, 나머지는 outline. */}
              {model.lineupHref || model.resultAction || model.reviewAction ? (
                <Card pad={16} style={{ marginTop: 12 }}>
                  <div className="tm-text-body-lg">매치 관리</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                    {model.lineupHref ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <div className="tm-text-label" style={{ fontWeight: 600 }}>라인업</div>
                          <div className="tm-text-caption" style={{ marginTop: 2, color: 'var(--text-muted)' }}>
                            선발·후보 명단을 작성하고 제출하세요.
                          </div>
                        </div>
                        <Link className={`tm-btn tm-btn-sm ${matchManageNextAction === 'lineup' ? 'tm-btn-primary' : 'tm-btn-outline'}`} href={model.lineupHref} style={{ flexShrink: 0, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
                          라인업 관리
                        </Link>
                      </div>
                    ) : null}
                    {model.resultAction ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          ...(model.lineupHref ? { borderTop: '1px solid var(--border)', paddingTop: 12 } : {}),
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div className="tm-text-label" style={{ fontWeight: 600 }}>경기 결과</div>
                          <div className="tm-text-caption" style={{ marginTop: 2, color: 'var(--text-muted)' }}>
                            경기 결과를 기록하거나 확인하세요.
                          </div>
                        </div>
                        <Link
                          className={`tm-btn tm-btn-sm ${matchManageNextAction === 'result' ? 'tm-btn-primary' : 'tm-btn-outline'}`}
                          href={model.resultAction.href}
                          style={{ flexShrink: 0, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
                        >
                          {model.resultAction.label}
                        </Link>
                      </div>
                    ) : null}
                    {/* 후기: 경기가 끝나야 열린다. 이 행이 없던 동안 팀매치 후기로 가는 링크가
                        앱 전체에 없어서, /my/reviews 목록에 뜨기를 기다리는 수밖에 없었다. */}
                    {model.reviewAction ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          ...(model.lineupHref || model.resultAction
                            ? { borderTop: '1px solid var(--border)', paddingTop: 12 }
                            : {}),
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div className="tm-text-label" style={{ fontWeight: 600 }}>후기</div>
                          <div className="tm-text-caption" style={{ marginTop: 2, color: 'var(--text-muted)' }}>
                            상대 팀과 함께 뛴 선수에게 후기를 남겨요.
                          </div>
                        </div>
                        <Link
                          className={`tm-btn tm-btn-sm ${matchManageNextAction === 'review' ? 'tm-btn-primary' : 'tm-btn-outline'}`}
                          href={model.reviewAction.href}
                          style={{ flexShrink: 0, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
                        >
                          {model.reviewAction.label}
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </Card>
              ) : null}
              {/* 홈팀 카드: 모바일은 왼쪽 컬럼 하단, 데스크톱은 우측 컬럼(tm-hide-desktop)으로 이동 */}
              <div className="tm-hide-desktop" style={{ marginTop: 16 }}>{hostTeamCard}</div>
              {mode === 'mine' ? (
                <Card pad={16} style={{ marginTop: 12 }}>
                  <div className="tm-text-body-lg">신청팀</div>
                  {match.applicantActionError ? (
                    <div className="tm-text-micro" role="alert" style={{ color: 'var(--red700)', marginTop: 8 }}>{match.applicantActionError}</div>
                  ) : null}
                  {model.hostActions?.length ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                      {model.hostActions.map((action) => (
                        <button
                          key={action.label}
                          className={`tm-btn tm-btn-sm ${hostActionClass(action.tone)}`}
                          type="button"
                          disabled={action.pending}
                          onClick={() => runHeroAction(action.onClick, `${action.label} 처리를 완료했어요.`)}
                        >
                          {action.pending ? '처리 중' : action.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                    {match.applicantTeams.map((team) => (
                      <div key={team.applicationId ?? team.name} style={{ border: '1px solid var(--grey100)', borderRadius: 'var(--radius-control)', padding: '12px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="tm-text-label">{team.name}</div>
                            <div className="tm-text-micro" style={{ marginTop: 3, color: 'var(--text-caption)' }}>{team.meta}</div>
                          </div>
                          {/* P0/P1: 상태 색상+아이콘+텍스트 병행 (WCAG 1.4.1) */}
                          <span className={`tm-badge ${team.status === '승인 완료' ? 'tm-badge-green' : team.status === '미승인' ? 'tm-badge-red' : 'tm-badge-orange'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            {team.status === '승인 완료' ? (
                              <svg width="9" height="7" viewBox="0 0 9 7" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M1 3.5L3.5 6L8 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
                            ) : team.status === '미승인' ? (
                              <svg width="7" height="7" viewBox="0 0 7 7" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M1 1L6 6M6 1L1 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" /></svg>
                            ) : (
                              <svg width="7" height="7" viewBox="0 0 7 7" aria-hidden="true" style={{ flexShrink: 0 }}><circle cx="3.5" cy="3.5" r="3.5" fill="currentColor" /></svg>
                            )}
                            {team.status}
                          </span>
                        </div>
                        {(team.onApprove ?? team.onReject) ? (
                          // #4: 순서 [거절(좌)] [승인(우)] — 위험 행동을 왼쪽, 확정 행동을 오른쪽으로.
                          // 웨이브4(2026-09-04): 신청팀 행은 접기/펼치기 없이 전부 항상 펼쳐진
                          // 채로 그려진다 — 신청팀이 여럿이면 행마다 primary(승인)가 동시에 여러 개
                          // 보여 "화면당 primary 1개"(DESIGN.md §14)가 깨졌다. 접기 상태 자체가
                          // 없으므로 승인은 outline, 거절은 ghost로 낮춰 화면 전체의 primary 예산을
                          // 매치 관리 카드(matchManageNextAction)와 하단 고정 CTA 에 남긴다.
                          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            {team.onReject ? (
                              <button
                                className="tm-btn tm-btn-sm tm-btn-ghost"
                                type="button"
                                disabled={team.actionPending}
                                onClick={() => { void team.onReject?.(); }}
                                aria-label={`${team.name} 거절`}
                              >
                                거절
                              </button>
                            ) : null}
                            {team.onApprove ? (
                              <button
                                className="tm-btn tm-btn-sm tm-btn-outline"
                                type="button"
                                disabled={team.actionPending}
                                onClick={() => { void team.onApprove?.(); }}
                                aria-label={`${team.name} 승인`}
                              >
                                {team.actionPending ? '처리 중' : '승인'}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </Card>
              ) : null}
            </div>
          </article>
        </div>

        {/* RIGHT: desktop sticky column — host-team compact + CTA card */}
        <div className="tm-team-match-detail-right tm-show-desktop">
          {/* 홈팀 카드: 데스크톱 우측 컬럼 상단 — 40% 보이드 채움(T1) */}
          <div className="tm-team-match-right-host">{hostTeamCard}</div>
          <div className="tm-team-match-cta-card">
            <div className="tm-team-match-cta-meta">
              <span className="tm-text-caption">{mode === 'mine' ? '내가 만든 팀매치' : '신청 상태'}</span>
              {/* 비용을 모르면(costNote 미기재) 금액 대신 '비용 미정' — 0원으로 단정하지 않는다. */}
              <span className="tm-text-label">{model.statusLabel ?? (match.opponentCost !== null ? `${match.opponentCost.toLocaleString('ko-KR')}원` : '비용 미정')}</span>
            </div>
            <div className="tm-team-match-cta-actions">
              {ctaButtons}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile fixed CTA — hidden on desktop (desktop card above replaces it) */}
      <div className="tm-fixed-cta tm-team-match-mobile-cta">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <span className="tm-text-caption">{mode === 'mine' ? '내가 만든 팀매치' : '신청 상태'}</span>
          {/* 비용을 모르면(costNote 미기재) 금액 대신 '비용 미정' — 0원으로 단정하지 않는다. */}
          <span className="tm-text-label">{model.statusLabel ?? (match.opponentCost !== null ? `${match.opponentCost.toLocaleString('ko-KR')}원` : '비용 미정')}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: showChat ? '120px 1fr' : '1fr', gap: 8 }}>
          {ctaButtons}
        </div>
      </div>
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
  return (
    <>
      <div className={`tm-create-shell tm-team-match-create-shell ${edit ? 'tm-create-shell-edit' : ''} tm-content-enter`}>
        <CreateProgress step={step} edit={edit} completeSteps={model.form?.completeSteps?.map(stepToNumber) ?? []} onGoToStep={model.form?.onGoToStep} />
        {model.form?.error ? <StateCard tone="orange" title="저장할 수 없어요" body={model.form.error} /> : null}
        {missingFields.length > 0 ? <MissingFieldsBanner missingFields={missingFields} stepHref={teamMatchStepHref} /> : null}
        {model.form?.lockedReason ? <StateCard tone="orange" title="수정이 제한된 팀매치예요" body={model.form.lockedReason} /> : null}
        {model.step === 'team' ? <TeamStep model={model} /> : null}
        {model.step === 'sport' ? <SportStep model={model} /> : null}
        {model.step === 'info' || edit ? <InfoStep model={model} edit={edit} /> : null}
        {model.step === 'condition' ? <ConditionStep model={model} /> : null}
        {model.step === 'place-time' ? <PlaceTimeStep model={model} /> : null}
        {model.step === 'confirm' ? <ConfirmStep model={model} /> : null}
      </div>
      <div className="tm-fixed-cta tm-create-fixed-cta"><div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>{secondaryAction ? <button className="tm-btn tm-btn-lg tm-btn-neutral" type="button" onClick={secondaryAction}>{edit ? '변경 취소' : model.step === 'team' ? '취소' : '이전'}</button> : <Link className="tm-btn tm-btn-lg tm-btn-neutral" href={prevHref(model.step)}>{edit ? '변경 취소' : model.step === 'team' ? '취소' : '이전'}</Link>}{primaryAction ? <button className="tm-btn tm-btn-lg tm-btn-primary" type="button" disabled={model.form?.submitting || Boolean(model.form?.lockedReason)} onClick={primaryAction}>{model.form?.submitting ? '저장 중' : primaryLabel}</button> : <Link className="tm-btn tm-btn-lg tm-btn-primary" href={nextHref(model.step)}>{primaryLabel}</Link>}</div>{edit && model.form?.onCancel ? <button className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" type="button" style={{ marginTop: 8 }} disabled={model.form.submitting} onClick={model.form.onCancel}>팀매치 취소</button> : null}</div>
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
  const router = useRouter();
  if (!sheet) return null;

  // 열림·닫힘의 권위는 URL이다(A안 계약 1) — open은 부모가 이미 URL에서 유도해 둔
  // sheet.open을 그대로 넘긴다. 닫기는 기존 Link/DraggableFilterSheet와 동일하게
  // router.push(closeHref)로 네비게이션한다(뒤로가기·URL 공유 성질 보존, A안 계약 2).
  return (
    <>
      <Link className="tm-filter-scrim" href={sheet.closeHref} aria-label="필터 닫기" />
      <BottomSheet open={sheet.open} onRequestClose={() => router.push(sheet.closeHref)} ariaLabel="팀매치 필터">
        <div className="tm-filter-sheet-handle" />
        <div className="tm-filter-sheet-head">
          <div>
            <div className="tm-text-subhead">필터</div>
            <div className="tm-text-caption" style={{ marginTop: 2 }}>원하는 조건으로 정렬하거나 필터를 설정할 수 있어요</div>
          </div>
          <Link className="tm-btn tm-btn-sm tm-btn-ghost" href={sheet.resetHref} style={{ color: 'var(--text-caption)' }}>초기화</Link>
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

function TeamMatchCard({ match }: { match: TeamMatchModel }) {
  /* #20: 상대팀 부담금은 핵심 결정요소 — tm-text-body-lg(17px/700)+blue로 격상.
   *      P1: 숫자:단위 2:1 비율 + tabular-nums. 매너·승 통계는 caption 유지. */
  const router = useRouter();
  const league = match.league;
  const statusLabel = match.status === 'mine' ? '내 매치' : match.status === 'pending' ? '승인 대기' : match.status === 'approved' ? '승인 완료' : match.status === 'closed' ? '마감' : '모집 중';
  const statusClass = match.status === 'mine' ? 'tm-badge-blue' : match.status === 'pending' ? 'tm-badge-orange' : match.status === 'approved' ? 'tm-badge-green' : match.status === 'closed' ? 'tm-badge-grey' : 'tm-badge-blue';
  return (
    <Link className="tm-team-match-card tm-pressable" href={`/team-matches/${match.id}`}>
      <div className={`tm-team-match-vs${match.imageUrl ? '' : ' tm-team-match-vs-sport'}`} style={match.imageUrl ? { backgroundImage: teamMatchBackgroundImage(match.imageUrl) } : undefined}>
        {match.imageUrl ? null : <TeamMatchSportIllustration sport={match.sport} sizes="88px" className="tm-team-match-vs-illustration" />}
        <div>
          <div className="tm-text-caption">홈팀</div>
          <div className="tm-text-subhead">{match.hostTeam}</div>
        </div>
        <span aria-hidden="true">vs</span>
        <div style={{ textAlign: 'right' }}>
          <div className="tm-text-caption">상대팀</div>
          {/* P0/P1: 상태를 색상+아이콘+텍스트 병행 (WCAG 1.4.1) */}
          <div className={`tm-badge ${statusClass}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <svg width="7" height="7" viewBox="0 0 7 7" aria-hidden="true" style={{ flexShrink: 0 }}><circle cx="3.5" cy="3.5" r="3.5" fill="currentColor" /></svg>
            {statusLabel}
          </div>
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="tm-badge tm-badge-blue">{match.sport}</span>
          {/* 값이 비면 내용 없는 회색 알약만 남는다(리그 대진은 등급·경기방식 미입력이 기본) — 숨긴다. */}
          {match.grade ? <span className="tm-badge tm-badge-grey">{match.grade}등급</span> : null}
          {match.format ? <span className="tm-badge tm-badge-grey">{match.format}</span> : null}
          {match.gender ? <span className="tm-badge tm-badge-grey">{match.gender}</span> : null}
          {/* 리그전 배지: 상태(모집중/마감)가 아니라 카테고리라 중립 grey 를 쓴다.
              컬러만으로 뜻을 전달하지 않도록 "리그전" 텍스트를 함께 싣는다(DESIGN.md 규칙).
              카드 전체가 이미 상세로 가는 Link라 <a>를 중첩하면 브라우저 파서가 바깥
              <a>를 조기에 닫아 하이드레이션 불일치·레이아웃 붕괴를 낸다(HTML5 어댑션
              에이전시 규칙 — <a> 안에 새 <a>가 열리면 바깥 태그가 강제로 닫힌다).
              대신 button + stopPropagation/preventDefault로 안전하게 리그 홈으로
              이동시킨다. "클릭 가능함"은 컬러가 아니라 화살표 아이콘+밑줄로 전달한다. */}
          {league ? (
            <button
              type="button"
              className="tm-badge tm-badge-grey tm-league-badge-link"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                router.push(`/league-matches/${league.leagueId}`);
              }}
              aria-label={`${league.title} 리그 상세로 이동`}
            >
              정규 리그
              <ChevronRightIcon size={12} strokeWidth={2.5} aria-hidden="true" />
            </button>
          ) : null}
          {/* 비용을 모를 때(null)는 배지를 붙이지 않는다 — 0 과 null 을 같이 다루면
              costNote 를 안 적은 매치가 전부 '무료초청'으로 둔갑한다. */}
          {match.opponentCost === 0 ? <span className="tm-badge tm-badge-blue">무료초청</span> : null}
        </div>
        <div className="tm-text-body-lg" style={{ marginTop: 12 }}>{match.title}</div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>{match.date} {match.time} · {match.venue}</div>
        <div className="tm-match-list-footer">
          {/* 매너·승수를 모르면(공개된 팀 후기 0건 등) 줄을 비운다 — 0 으로 채우면 잘하는 팀이 최악으로 보인다.
              푸터의 좌우 배치를 유지하려고 빈 span 을 자리표시자로 남긴다. */}
          {match.manner !== null && match.wins !== null ? (
            <span className="tm-text-caption">매너 <span style={{ fontVariantNumeric: 'tabular-nums' }}>{match.manner}</span> · 승 <span style={{ fontVariantNumeric: 'tabular-nums' }}>{match.wins}</span></span>
          ) : (
            <span />
          )}
          {/* P1: 숫자는 body-lg(17px/700), 단위 "원"은 caption(12px) — 2:1 비율 */}
          {/* 비용을 모르면(costNote 미기재) 금액 자리를 '비용 미정'으로 둔다 — 0 으로 채워
              '무료'라고 하면 없는 사실을 만들어낸다. */}
          {match.opponentCost === null ? (
            <span className="tm-text-caption">비용 미정</span>
          ) : match.opponentCost === 0 ? (
            <span className="tm-text-body-lg tab-num" style={{ color: 'var(--blue700)' }}>무료</span>
          ) : (
            <span className="tab-num" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
              <span style={{ fontSize: 'var(--font-size-body-lg)', fontWeight: 700, color: 'var(--blue700)', fontVariantNumeric: 'tabular-nums' }}>{match.opponentCost.toLocaleString('ko-KR')}</span>
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
      {model.isLoadingTeams ? (
        <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="tm-review-skeleton" style={{ height: 72 }} aria-hidden="true" />
          ))}
        </div>
      ) : !hasTeams ? (
        <EmptyState title="팀매치를 만들 수 있는 팀이 없어요" sub="소속된 팀이 없거나 팀 정보를 불러오지 못했어요." />
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
      {!model.isLoadingTeams && hasTeams ? (() => {
        const blocked = !hasCreatableTeams;
        return (
          <Card pad={16} style={{ marginTop: 16, background: blocked ? 'var(--orange50)' : 'var(--grey50)' }}>
            <div className="tm-text-label" style={blocked ? { color: 'var(--orange700)' } : undefined}>권한 기준</div>
            <div className="tm-text-caption" style={{ marginTop: 8 }}>
              {blocked
                ? '팀장이거나 매치 생성 권한이 있어야 다음으로 진행할 수 있어요. 해당 권한이 있는 팀으로 다시 시도해 주세요.'
                : '팀장이거나 매치 생성 권한이 있는 관리자만 다음으로 진행할 수 있어요.'}
            </div>
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
      <h1 className="tm-text-heading">매치 정보</h1>
      {edit ? <ImmutableMatchContext team={model.selectedTeam} sport={model.selectedSport} /> : null}
      <CreateField id="field-title" error={model.form?.fieldErrors?.title} label="매치 제목" value={d.title} placeholder="예: 토요일 저녁 풋살 상대팀 구합니다" onChange={(value) => model.form?.onFieldChange('title', value)} />
      <RequiredHint shown={!model.form?.fieldErrors?.title && !d.title.trim()} />
      <CreateField label="설명" value={d.description} placeholder="예: 친선 위주로 즐겁게 경기할 팀을 찾고 있어요." multiline onChange={(value) => model.form?.onFieldChange('description', value)} />
      <ImageUploadField image={d.imageUrl} onChange={(value) => model.form?.onFieldChange('imageUrl', value)} onUpload={model.form?.uploadImage} />
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
    <Card pad={16} style={{ marginTop: 16, background: 'var(--grey50)' }}>
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
const GRADE_OPTIONS = ['입문', '초보', '중수', '고수'] as const;
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

function ConditionStep({ model }: { model: TeamMatchCreateViewModel }) {
  return <div><h1 className="tm-text-heading">경기조건</h1><p className="tm-text-body" style={{ marginTop: 8 }}>상대팀이 신청 전에 확인할 등급, 방식, 비용 조건을 입력해 주세요.</p><ConditionFields model={model} /><Card pad={16} style={{ marginTop: 16, background: 'var(--grey50)' }}><div className="tm-text-label">무료초청 표시</div><div className="tm-text-caption" style={{ marginTop: 4 }}>상대팀 부담금이 0원이면 목록과 상세에 '무료초청' 배지가 표시돼요.</div></Card></div>;
}

function ConditionFields({ model }: { model: TeamMatchCreateViewModel }) {
  const d = model.draft;
  const formatOptions = matchFormatOptionsForSport(model.selectedSport);
  return <><PresetChipSelector label="실력등급" options={GRADE_OPTIONS} value={d.grade} onChange={(value) => model.form?.onFieldChange('grade', value)} /><PresetChipSelector label="경기방식" options={formatOptions} value={d.format} allowFreeText freeTextPlaceholder="예: 10:10, 3:3" onChange={(value) => model.form?.onFieldChange('format', value)} /><MultiPresetChipSelector label="경기 스타일" options={MATCH_STYLE_OPTIONS} values={d.style} allowFreeText freeTextPlaceholder="목록에 없으면 직접 입력해 주세요" maxItems={MATCH_STYLE_MAX_ITEMS} onChange={(value) => model.form?.onFieldChange('style', value)} /><PresetChipSelector label="유니폼 색상" options={UNIFORM_COLOR_OPTIONS} value={d.uniform} allowFreeText freeTextPlaceholder="예: 줄무늬 상의" onChange={(value) => model.form?.onFieldChange('uniform', value)} /><GenderRuleSelector value={d.gender} onChange={(value) => model.form?.onFieldChange('gender', value)} /><div className="tm-create-two-col"><CreateField label="총비용" value={`${d.cost}`} suffix="원" type="number" onChange={(value) => model.form?.onFieldChange('cost', Number(value))} /><CreateField label="상대팀 부담금" value={`${d.opponentCost}`} suffix="원" type="number" onChange={(value) => model.form?.onFieldChange('opponentCost', Number(value))} /></div></>;
}

function PlaceTimeStep({ model }: { model: TeamMatchCreateViewModel }) {
  return <div><h1 className="tm-text-heading">장소와 시간</h1><PlaceTimeFields model={model} /></div>;
}

function PlaceTimeFields({ model }: { model: TeamMatchCreateViewModel }) {
  const d = model.draft;
  const errors = model.form?.fieldErrors;
  const recentVenues = model.form?.recentVenues ?? [];
  // #3 1단계: matches-page.tsx의 PlaceTimeFields와 동일한 focus/blur 칩 패턴 —
  // 팀이 호스트로 과거에 실제로 쓴 장소를 재사용할 수 있게 한다.
  const [venueFocused, setVenueFocused] = useState(false);
  return (
    <>
      <RegionSelect value={model.form?.regionId ?? ''} regions={model.form?.regions ?? []} onChange={model.form?.onRegionChange} error={errors?.regionId} />
      <CreateField
        id="field-venue"
        error={errors?.venue}
        label="장소"
        value={d.venue}
        placeholder="예: 잠실 풋살파크 A구장"
        onChange={(value) => model.form?.onFieldChange('venue', value)}
        onFocus={() => setVenueFocused(true)}
        onBlur={() => setVenueFocused(false)}
      >
        {venueFocused ? (
          <RecentVenueChips
            items={recentVenues}
            selectedValue={d.venue}
            onSelect={(venue) => {
              model.form?.onFieldChange('venue', venue.placeName);
              model.form?.onFieldChange('address', venue.addressText ?? '');
              setVenueFocused(false);
            }}
          />
        ) : null}
      </CreateField>
      <RequiredHint shown={!errors?.venue && !d.venue.trim()} />
      <CreateField label="상세 주소" value={d.address} placeholder="예: 서울 송파구 올림픽로 25, 3층 2번 코트" onChange={(value) => model.form?.onFieldChange('address', value)} />
      <CreateField id="field-date" error={errors?.date} label="날짜" value={d.date} type="date" onChange={(value) => model.form?.onFieldChange('date', value)} />
      <RequiredHint shown={!errors?.date && !d.date} />
      <div className="tm-create-two-col">
        <div>
          <CreateField id="field-startTime" error={errors?.startTime} label="시작 시간" value={d.startTime} type="time" onChange={(value) => model.form?.onFieldChange('startTime', value)} />
          <RequiredHint shown={!errors?.startTime && !d.startTime} />
        </div>
        <CreateField label="종료 시간" value={d.endTime} type="time" onChange={(value) => model.form?.onFieldChange('endTime', value)} />
      </div>
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
  const timeRangeText = d.endTime ? `${d.date} ${d.startTime}-${d.endTime}` : `${d.date} ${d.startTime}`;
  return <div><h1 className="tm-text-heading">입력한 내용을 확인해 주세요</h1><Card pad={0} style={{ marginTop: 16, overflow: 'hidden' }}><div className="tm-team-create-preview" style={{ backgroundImage: cssUrl(d.imageUrl) }}><div className="tm-text-subhead" style={{ color: 'var(--static-white)' }}>{model.selectedTeam} vs 상대팀</div></div><div style={{ padding: 16 }}><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><span className="tm-badge tm-badge-blue">{model.selectedSport}</span><span className="tm-badge tm-badge-grey">{d.grade}</span><span className="tm-badge tm-badge-grey">{d.format}</span><span className="tm-badge tm-badge-grey">{d.gender}</span>{isFreeInvite ? <span className="tm-badge tm-badge-blue">무료초청</span> : null}</div><div className="tm-text-subhead" style={{ marginTop: 12 }}>{d.title}</div><div className="tm-text-caption" style={{ marginTop: 8 }}>{d.description}</div></div></Card><Card pad={16} style={{ marginTop: 12 }}><InfoRow label="지역" value={regionName} sub="검색과 추천에 사용돼요" /><InfoRow label="경기조건" value={`${d.grade} · ${d.format}${styleText ? ` · ${styleText}` : ''}`} sub={`${d.uniform} · ${d.gender}`} /><InfoRow label="비용" value={`총 ${d.cost.toLocaleString('ko-KR')}원 · 상대팀 ${d.opponentCost.toLocaleString('ko-KR')}원`} /><InfoRow label="일시" value={timeRangeText} /><InfoRow label="신청 마감" value={deadlineText} /><InfoRow label="장소" value={d.venue} sub={d.address} /></Card></div>;
}

// TeamMatchComplete(웨이브4 이전): /team-matches/new/complete 전용 화면이었다. 실제 제출
// 성공 경로는 항상 /team-matches/:id 로 바로 이동해(team-matches-create-client.tsx) 이 화면에
// 닿는 진짜 경로가 없었다(죽은 라우트, 2026-09-04 감사) — 라우트·타입과 함께 제거한다.

function hostActionClass(tone: NonNullable<TeamMatchDetailViewModel['hostActions']>[number]['tone']) {
  if (tone === 'primary') return 'tm-btn-primary';
  if (tone === 'danger') return 'tm-btn-danger';
  return 'tm-btn-neutral';
}

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

function StateCard({ tone, title, body }: { tone: 'orange' | 'green'; title: string; body: string }) {
  /* 배경색은 디자인 토큰 사용 — raw rgba 금지(v1-coding-patterns §2) */
  return <Card pad={16} style={{ marginTop: 16, background: tone === 'green' ? 'var(--tint-green)' : 'var(--tint-orange)' }}><div className="tm-text-label" style={{ color: tone === 'green' ? 'var(--green700)' : 'var(--orange700)' }}>{title}</div><div className="tm-text-caption" style={{ marginTop: 4 }}>{body}</div></Card>;
}

function ImageUploadField({ image, onChange, onUpload }: { image: string; onChange?: (value: string) => void; onUpload?: (file: File) => Promise<string> }) {
  const [fileName, setFileName] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileName(file.name);
    setUploadError(null);

    if (!onUpload) return;

    setUploading(true);
    try {
      const url = await onUpload(file);
      onChange?.(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '이미지 업로드에 실패했어요. 다시 시도해 주세요.';
      setUploadError(msg);
      setFileName('');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card pad={0} style={{ marginTop: 16, overflow: 'hidden' }}>
      <div className="tm-create-image-preview" style={{ backgroundImage: cssUrl(image) }}>
        <span className="tm-badge tm-badge-grey">배경 이미지</span>
      </div>
      <div style={{ padding: 16 }}>
        <label className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" style={{ opacity: uploading ? 0.6 : 1 }}>
          {uploading ? '업로드 중...' : fileName || image ? '이미지 변경' : '배경 이미지 선택'}
          <input className="sr-only" type="file" accept="image/*" disabled={uploading} onChange={handleChange} />
        </label>
        <div className="tm-text-caption" style={{ marginTop: 8 }}>목록과 상세 화면의 상단 배경으로 보여요.</div>
        {uploadError ? <div className="tm-text-caption" role="alert" style={{ marginTop: 8, color: 'var(--orange700)' }}>{uploadError}</div> : null}
        {(fileName || image) && !uploading ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <span className="tm-text-caption" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName || '선택한 이미지'}</span>
            <button className="tm-btn tm-btn-sm tm-btn-ghost" type="button" onClick={() => { setFileName(''); onChange?.(''); }}>제거</button>
          </div>
        ) : null}
      </div>
    </Card>
  );
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
