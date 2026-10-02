import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useShellOverride } from '@/components/v1-ui/shell-override';
import { Card, EmptyState, ErrorState, KPIStat } from '@/components/v1-ui/primitives';
import { ChevronRightIcon } from '@/components/v1-ui/icons';
import { SegmentedTabs, type SegmentedTabsItem } from '@/components/v1-ui/segmented-tabs';
import { cssUrl } from '@/lib/assets';
import { displayInitials } from '@/lib/display-initials';
import { useKeepTappedItemInPlace } from './review-scroll-anchor';
import { REVIEW_METRIC_FIELDS } from './reviews.types';
import type { ReviewMetricDraft, ReviewSourcePageModel, ReviewsPageModel, ReviewsReceivedPageModel, ReviewsTab, ReviewTargetDraft, ReviewTargetViewModel } from './reviews.types';
import {
  REVIEW_TAG_OPTIONS,
  draftForTarget,
  formatReviewProgress,
  formatTagSummary,
  getReviewProgress,
  incompleteHint,
  incompleteNote,
  isReviewTargetPending,
  reviewDraftStatus,
  reviewTargetKey,
  selectedTagLabels,
  toTargetViewModel,
} from './reviews.view-model';
import { ReviewsSummaryDashboard } from './reviews-summary-dashboard';
import type { V1ReceivedReviewDetail, V1ReviewReceivedSummaryResponse, V1ReviewTargetType } from '@/types/api';
import { nextStarValue, STAR_VALUES } from '@/lib/star-rating-keys';

type QueryStateProps = {
  errorMessage: string | null;
  loading: boolean;
  onRetry: () => void;
};

export function ReviewsPageView({
  errorMessage,
  hasManagedTeam,
  loading,
  model,
  onPeriodChange,
  onRetry,
  onTabChange,
  onTeamPeriodChange,
  period,
  receivedModel,
  summary,
  summaryLoading,
  teamPeriod,
  teamSummary,
  teamSummaryLoading,
}: QueryStateProps & {
  hasManagedTeam: boolean;
  model: ReviewsPageModel;
  onPeriodChange: (period: string | null) => void;
  onTabChange: (tab: ReviewsTab) => void;
  onTeamPeriodChange: (period: string | null) => void;
  period: string | null;
  receivedModel: ReviewsReceivedPageModel;
  summary: V1ReviewReceivedSummaryResponse | undefined;
  summaryLoading: boolean;
  teamPeriod: string | null;
  teamSummary: V1ReviewReceivedSummaryResponse | undefined;
  teamSummaryLoading: boolean;
}) {
  const isReceivedTab = model.tab === 'received';
  // 로딩·에러 중엔 아직 "레거시 리뷰가 없다"고 단정할 수 없으므로 섹션을 숨기지 않는다.
  // (모델이 비어있는 것과 로딩/에러로 아직 모르는 것을 구분 — 그렇지 않으면 에러 상태가 조용히 사라진다.)
  const hasReceivedContent = receivedModel.userGroups.length > 0 || receivedModel.teamGroups.length > 0;

  return (
    <>
      <div className="tm-review-shell tm-content-enter">
        <ReviewTabs active={model.tab} onChange={onTabChange} />
        {isReceivedTab ? (
          <>
            {loading ? <ReviewSkeleton count={2} /> : null}
            {!loading && errorMessage ? (
              <ErrorState title="리뷰를 불러오지 못했어요" message={errorMessage} onRetry={onRetry} />
            ) : null}
            {/* 요약 카드는 집계 0건이면 스스로 렌더하지 않는다 — 개별 리뷰까지 0건이면 화면에
                아무것도 남지 않으므로(실측: 완전 빈 화면) 여기서 빈 상태를 책임진다. */}
            {!loading && !errorMessage && !hasReceivedContent ? (
              <EmptyState
                illustration={{ name: 'journey-done' }}
                title="아직 받은 리뷰가 없어요"
                sub="경기가 끝나고 함께 뛴 사람들이 리뷰를 남기면 여기에 모여요."
              />
            ) : null}
            {/* 개별 리뷰가 주인공, 요약은 보조. */}
            {hasReceivedContent ? <AnonymousReceivedContent model={receivedModel} /> : null}
            <div style={{ display: 'grid', gap: 12, marginTop: hasReceivedContent ? 24 : 0 }}>
              <ReviewsSummaryDashboard
                summary={summary}
                period={period}
                onPeriodChange={onPeriodChange}
                loading={summaryLoading}
                title="내가 받은 리뷰 요약"
              />
              {hasManagedTeam ? (
                <ReviewsSummaryDashboard
                  summary={teamSummary}
                  period={teamPeriod}
                  onPeriodChange={onTeamPeriodChange}
                  loading={teamSummaryLoading}
                  title="내 팀이 받은 리뷰 요약"
                  // 팀 요약의 개수는 **리뷰 수가 아니라 리뷰를 남긴 팀 수**다(팀 단위 평균).
                  countUnit="팀"
                  // 태그 비율의 분모는 원시 리뷰 수라, 문장으로 갈라 주지 않으면
                  // "1개 팀" 옆의 "33%" 가 서로를 부정하는 것처럼 보인다.
                  countNote="숫자는 리뷰를 남긴 팀 수예요. 아래 태그 비율은 리뷰 하나하나를 세요."
                />
              ) : null}
            </div>
          </>
        ) : (
          <>
            <ReviewStats stats={model.stats} />
            <div style={{ display: 'grid', gap: 12 }}>
              {loading ? <ReviewSkeleton count={2} /> : null}
              {!loading && errorMessage ? <ErrorState title="리뷰를 불러오지 못했어요" message={errorMessage} onRetry={onRetry} /> : null}
              {!loading && !errorMessage && model.cards.length === 0 ? (
                <EmptyState
                  illustration={{ name: 'journey-done' }}
                  title={model.emptyTitle}
                  sub={model.emptySub}
                  {...(model.tab === 'pending' ? { cta: '매치 둘러보기', ctaHref: '/matches' } : {})}
                />
              ) : null}
              {!loading && !errorMessage ? model.cards.map((card) => (
                <Link key={`${card.sourceType}:${card.sourceId}:${card.reviewerTeam?.teamId ?? card.targetType}`} className="tm-review-schedule-card tm-pressable" href={card.href}>
                  <div className="tm-review-card-head">
                    <div style={{ minWidth: 0 }}>
                      <div className="tm-text-body-lg line-clamp-2">{card.title}</div>
                      <div className="tm-text-caption" style={{ marginTop: 4 }}>{card.meta}</div>
                    </div>
                    <span className={`tm-badge ${card.state === 'done' ? 'tm-badge-green' : 'tm-badge-blue'}`}>{card.badgeLabel}</span>
                  </div>
                  {/* #17: CTA 영역에 ChevronRight 추가 — 탭 가능한 카드임을 명시적으로 전달 */}
                  <div className="tm-review-card-foot">
                    <span className="tm-badge tm-badge-grey">{card.kindLabel}</span>
                    <span className="tm-text-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--blue700)' }}>
                      {card.ctaLabel}
                      <ChevronRightIcon size={14} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              )) : null}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function AnonymousReceivedContent({ model }: { model: ReviewsReceivedPageModel }) {
  return (
    <div style={{ marginTop: 24 }}>
      {/* 제도 전/후를 나누지 않는다 — "이전 리뷰" 섹션은 제거했다. 작성자도 공개한다. */}
      <div className="tm-my-section-label">경기에서 받은 리뷰</div>
      <div className="tm-text-caption" style={{ marginBottom: 12 }}>상호 작성이 끝나거나 72시간이 지나면 보여요. 운영 평가는 바로 공개되며 참가자 평점과 별도예요.</div>
      {model.userGroups.length > 0 ? <ReceivedGroupSection groups={model.userGroups} title="내가 받은 리뷰" /> : null}
      {model.teamGroups.length > 0 ? (
        <div style={{ marginTop: 16 }}><ReceivedGroupSection groups={model.teamGroups} title="내 팀이 받은 리뷰" /></div>
      ) : null}
    </div>
  );
}

const SUBMIT_HINT_ID = 'review-submit-hint';
const GENERIC_SUBMIT_HINT = '별점과 태그를 골라야 리뷰를 보낼 수 있어요';

type MetricKey = keyof ReviewMetricDraft;

type DraftHandlers = {
  onClearDraft: (key: string) => void;
  onToggleTag: (key: string, tagCode: string) => void;
  onUpdateMetricScore: (key: string, metric: MetricKey, score: number) => void;
  onUpdateRating: (key: string, rating: number) => void;
};

export function ReviewSourcePageView({
  drafts,
  errorMessage,
  loading,
  message,
  model,
  onClearDraft,
  onRetry,
  onSubmit,
  onToggleOpen,
  onToggleTag,
  onUpdateMetricScore,
  onUpdateRating,
  openKey,
  submitting,
  admin = false,
}: QueryStateProps & DraftHandlers & {
  admin?: boolean;
  drafts: Record<string, ReviewTargetDraft>;
  message: string | null;
  model: ReviewSourcePageModel | null;
  onSubmit: () => void;
  onToggleOpen: (key: string) => void;
  /** 펼쳐진 선수의 key. 한 번에 한 명만 펼쳐진다. */
  openKey: string | null;
  submitting: boolean;
}) {
  const progress = model ? getReviewProgress(model.targets, drafts) : null;
  // 부분 입력이 하나라도 있으면 잠근다 — 예전엔 태그 없는 대상을 말없이 빼고 보냈다.
  const canSubmit = progress !== null && progress.ready.length > 0 && progress.incomplete.length === 0;
  const pendingCount = progress ? progress.inProgress + progress.remaining : 0;
  // 로딩·에러·전송 중이거나 쓸 대상이 없으면 버튼이 회색인 이유가 다르므로 안내를 띄우지 않는다.
  const submitHint = progress === null || canSubmit
    ? null
    : incompleteHint(progress.incomplete) ?? (pendingCount > 0 ? GENERIC_SUBMIT_HINT : null);
  const showSubmitHint = !loading && !errorMessage && !submitting && submitHint !== null;
  const statusNote = progress ? incompleteNote(progress.incomplete) : null;

  return (
    <>
      <div className="tm-review-shell tm-review-compose-shell tm-content-enter">
        {loading ? <ReviewSkeleton count={3} /> : null}
        {!loading && errorMessage ? <ErrorState title="리뷰 대상을 불러오지 못했어요" message={errorMessage} onRetry={onRetry} /> : null}
        {!loading && !errorMessage && model && progress ? (
          <>
            <Card pad={16}>
              <div className="tm-review-card-head">
                <div>
                  <div className="tm-text-caption">{model.sourceMeta}</div>
                  <div className="tm-text-body-lg" style={{ marginTop: 4 }}>{model.source.title}</div>
                </div>
                <span className="tm-badge tm-badge-blue">작성 중 {progress.inProgress}명</span>
              </div>
            </Card>
            <ReviewTargetSections
              drafts={drafts}
              model={model}
              onClearDraft={onClearDraft}
              onToggleOpen={onToggleOpen}
              onToggleTag={onToggleTag}
              onUpdateMetricScore={onUpdateMetricScore}
              onUpdateRating={onUpdateRating}
              openKey={openKey}
            />
            <Card className={message ? 'tm-review-notice-error' : ''} pad={16} style={message ? undefined : { background: 'var(--grey50)' }}>
              <div className="tm-text-label">{message ?? formatReviewProgress(progress)}</div>
              {message || statusNote ? (
                <div className="tm-text-caption" style={{ marginTop: 4 }}>
                  {message ? '선택 상태를 확인한 뒤 다시 시도해 주세요.' : statusNote}
                </div>
              ) : null}
            </Card>
          </>
        ) : null}
      </div>
      <div className={admin ? 'mt-6' : 'tm-fixed-cta'}>
        {/* 서버 계약(SubmitReviewDto 의 `@ArrayMinSize(1)`)이 별점과 태그를 모두 요구해서 버튼을
            풀어줄 수는 없다 — 왜 못 보내는지, 누가 덜 끝났는지를 말해준다.
            `aria-describedby` 로 버튼에 묶어 스크린리더도 비활성 이유를 읽게 한다. */}
        {showSubmitHint ? (
          <p
            id={SUBMIT_HINT_ID}
            className="tm-text-caption"
            style={{ margin: '0 0 8px', textAlign: 'center', color: 'var(--text-caption)' }}
          >
            {submitHint}
          </p>
        ) : null}
        <button
          aria-describedby={showSubmitHint ? SUBMIT_HINT_ID : undefined}
          className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
          disabled={!canSubmit || submitting || loading || Boolean(errorMessage)}
          onClick={onSubmit}
          type="button"
        >
          {submitting ? '전송 중' : canSubmit ? `리뷰 ${progress.ready.length}건 보내기` : '리뷰 보내기'}
        </button>
      </div>
    </>
  );
}


export function ReviewSubmitCompleteView({ model, onConfirm }: { model: ReviewSourcePageModel; onConfirm: () => void }) {
  const reviewed = model.targets.filter((target) => target.alreadySubmitted || target.review).length;
  const remaining = Math.max(0, model.targets.length - reviewed);
  // 이 뷰가 렌더되는 순간엔 항상 title=""(제출 완료 화면 — fragments/reviews.ts의 정적
  // "리뷰 남기기"를 덮어씀). 같은 라우트(/my/reviews/:sourceType/:sourceId)에서 폼/완료 두
  // 분기 중 어느 게 렌더될지가 런타임(complete 쿼리 + fetch 완료 여부) 의존이라 override로
  // 처리한다(app-shell-promotion.md §1.9 R7).
  useShellOverride({ title: '' });

  return (
    <>
      <div className="tm-review-complete">
        <div className="tm-review-complete-icon">✓</div>
        <div className="tm-text-heading" style={{ marginTop: 24 }}>리뷰를 보냈어요</div>
        <Card pad={16} style={{ marginTop: 24, textAlign: 'left' }}>
          <div className="tm-text-label">{model.source.title}</div>
          {/* "별점 선택됨"·"태그 선택됨"은 무엇을 보냈든 항상 같은 문구라 아무것도 알려주지
              않았다. 실제로 달라지는 값(보낸 인원 / 남은 인원)만 남긴다. */}
          <div className="tm-review-chip-row">
            <span className="tm-badge tm-badge-blue">{reviewed}명 전송</span>
            {remaining > 0 ? <span className="tm-badge tm-badge-grey">{remaining}명 남음</span> : null}
          </div>
        </Card>
      </div>
      <div className="tm-fixed-cta">
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" onClick={onConfirm} type="button">확인</button>
      </div>
    </>
  );
}

/**
 * 후기 작성 대상 배치 — **상대 팀 평가가 기본이고 선수는 선택**이다.
 *
 * 팀 카드는 항상 펼쳐 두고, 선수는 이름 한 줄 행으로 접어 둔다. 누른 선수만 펼치고(한 번에 한 명)
 * 안 누른 선수는 보내지 않는다 — 예전엔 선수마다 550px 카드가 깔려 10명이면 화면 6~7장이었다.
 */
function ReviewTargetSections({
  drafts,
  model,
  onClearDraft,
  onToggleOpen,
  onToggleTag,
  onUpdateMetricScore,
  onUpdateRating,
  openKey,
}: DraftHandlers & {
  drafts: Record<string, ReviewTargetDraft>;
  model: ReviewSourcePageModel;
  onToggleOpen: (key: string) => void;
  openKey: string | null;
}) {
  const teamTargets = model.targets.filter((target) => target.targetType === 'team');
  const playerTargets = model.targets.filter((target) => target.targetType !== 'team');
  const playersInProgress = playerTargets.filter(
    (target) => isReviewTargetPending(target) && reviewDraftStatus(draftForTarget(target, drafts)) !== 'empty',
  ).length;
  // reviewerTeam 이 null = 양 팀 겸직이라 대상마다 작성자 팀이 다르다는 뜻.
  const showReviewerTeam = model.reviewerTeam === null;

  return (
    <>
      {teamTargets.length > 0 ? (
        <div
          className="tm-review-target-stack"
          style={{ gridTemplateColumns: teamTargets.length === 1 ? 'minmax(0, 1fr)' : undefined }}
        >
          {teamTargets.map((target) => {
            const key = reviewTargetKey(target);
            return (
              <ReviewTeamCard
                key={key}
                draft={draftForTarget(target, drafts)}
                onClear={() => onClearDraft(key)}
                onToggleTag={(tagCode) => onToggleTag(key, tagCode)}
                onUpdateRating={(rating) => onUpdateRating(key, rating)}
                target={toTargetViewModel(target, showReviewerTeam)}
              />
            );
          })}
        </div>
      ) : null}

      {playerTargets.length > 0 ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 }}>
            <span className="tm-text-body-lg" style={{ fontSize: 'var(--font-size-body)' }}>
              선수 개별 평가 <span className="tab-num">{playerTargets.length}</span>명
            </span>
            <span className="tm-badge tm-badge-blue">{playersInProgress}명 작성 중</span>
          </div>
          <div className="tm-text-caption" style={{ margin: '-8px 0 0' }}>
            남기고 싶은 선수만 눌러 평가해요. 누르지 않은 선수는 보내지 않아요.
          </div>
          <div className="tm-review-player-list">
            {playerTargets.map((target) => {
              const key = reviewTargetKey(target);
              return (
                <ReviewPlayerItem
                  key={key}
                  draft={draftForTarget(target, drafts)}
                  onClear={() => onClearDraft(key)}
                  onToggle={() => onToggleOpen(key)}
                  onToggleTag={(tagCode) => onToggleTag(key, tagCode)}
                  onUpdateMetricScore={(metric, score) => onUpdateMetricScore(key, metric, score)}
                  onUpdateRating={(rating) => onUpdateRating(key, rating)}
                  open={openKey === key}
                  target={toTargetViewModel(target, showReviewerTeam)}
                />
              );
            })}
          </div>
        </>
      ) : null}
    </>
  );
}

// href 기반 라우팅 링크 3개 — 활성 표시는 미끄러지는 thumb 하나가 담당한다(항목별
// background on/off 방식이던 예전 .tm-review-tab 은 제거). id 는 항상 고정 3개라
// 렌더 밖 상수로 뺀다(불필요한 배열 재생성 방지).
const REVIEW_TAB_ITEMS: SegmentedTabsItem[] = [
  { id: 'pending', label: '작성할 리뷰', href: '/my/reviews?tab=pending' },
  { id: 'written', label: '작성된 리뷰', href: '/my/reviews?tab=written' },
  { id: 'received', label: '받은 리뷰', href: '/my/reviews?tab=received' },
];

// 세 항목 모두 `/my/reviews?tab=<id>` 로 **주소를 바꾸는 라우팅 링크**다. 따라서
// role="tablist"(→ 각 항목 role="tab" + aria-selected)를 주지 않는다 — tab 역할은
// "같은 페이지 안에서 패널을 갈아끼우는 위젯"을 뜻해서, 보조기기에 링크라는 사실과
// 뒤 이동이 일어난다는 예고가 사라진다. role 을 비우면 SegmentedTabs 가 <nav> +
// 링크 + aria-current="page" 로 렌더한다(라우팅 하위 내비게이션의 표준 형태).
function ReviewTabs({ active, onChange }: { active: ReviewsTab; onChange: (tab: ReviewsTab) => void }) {
  return (
    <SegmentedTabs
      items={REVIEW_TAB_ITEMS}
      activeId={active}
      onSelect={(id) => onChange(id as ReviewsTab)}
      ariaLabel="리뷰 탭"
    />
  );
}

function ReviewStats({ stats }: { stats: Array<{ label: string; value: string }> }) {
  return (
    <div className="tm-review-stat-grid">
      {stats.map((stat) => (
        <Card key={stat.label} pad={12}>
          <KPIStat label={stat.label} value={stat.value} />
        </Card>
      ))}
    </div>
  );
}

function targetBadge(target: ReviewTargetViewModel, active: boolean) {
  if (target.statusLabel === '작성됨') return { className: 'tm-badge-green', label: target.statusLabel };
  if (target.statusLabel === '잠김') return { className: 'tm-badge-grey', label: target.statusLabel };
  return active ? { className: 'tm-badge-blue', label: '작성 중' } : { className: 'tm-badge-grey', label: target.statusLabel };
}

function isTargetLocked(target: ReviewTargetViewModel) {
  return target.locked || target.alreadySubmitted || Boolean(target.review);
}

function ReviewTeamCard({
  draft,
  onClear,
  onToggleTag,
  onUpdateRating,
  target,
}: {
  draft: ReviewTargetDraft;
  onClear: () => void;
  onToggleTag: (tagCode: string) => void;
  onUpdateRating: (rating: number) => void;
  target: ReviewTargetViewModel;
}) {
  const locked = isTargetLocked(target);
  const active = !locked && reviewDraftStatus(draft) !== 'empty';
  const badge = targetBadge(target, active);

  return (
    <Card
      className={active ? 'tm-review-target-card tm-review-target-active' : 'tm-review-target-card'}
      pad={16}
      style={{ width: '100%', minWidth: 0 }}
    >
      <div className="tm-review-target-head">
        <Avatar imageUrl={target.imageUrl} initials={target.initials} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tm-review-card-head" style={{ flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <div className="tm-text-body-lg">{target.name}</div>
              <div className="tm-text-caption" style={{ marginTop: 2 }}>{target.subtitle || targetTypeLabel(target.targetType)}</div>
              {target.reviewerTeamLabel ? (
                <div className="tm-text-caption" style={{ marginTop: 2 }}>{target.reviewerTeamLabel}</div>
              ) : null}
            </div>
            <span className={`tm-badge ${badge.className}`}>{badge.label}</span>
          </div>
        </div>
      </div>
      {target.lockReasonLabel ? <div className="tm-text-caption" style={{ marginTop: 8, overflowWrap: 'anywhere' }}>{target.lockReasonLabel}</div> : null}
      <ReviewTargetEditor
        clearLabel="이 팀 평가 지우기"
        draft={draft}
        locked={locked}
        name={target.name}
        onClear={onClear}
        onToggleTag={onToggleTag}
        onUpdateRating={onUpdateRating}
      />
    </Card>
  );
}

/**
 * 선수 한 명 — 접힌 한 줄 행이 곧 펼침 버튼이다. 펼쳐도 같은 버튼 요소가 머리 줄이 되어
 * 키보드 포커스가 유지된다(행과 카드를 따로 그리면 펼치는 순간 포커스가 사라진다).
 */
function ReviewPlayerItem({
  draft,
  onClear,
  onToggle,
  onToggleTag,
  onUpdateMetricScore,
  onUpdateRating,
  open,
  target,
}: {
  draft: ReviewTargetDraft;
  onClear: () => void;
  onToggle: () => void;
  onToggleTag: (tagCode: string) => void;
  onUpdateMetricScore: (metric: MetricKey, score: number) => void;
  onUpdateRating: (rating: number) => void;
  open: boolean;
  target: ReviewTargetViewModel;
}) {
  const panelId = useId();
  const itemRef = useRef<HTMLDivElement>(null);
  // 위쪽 선수 패널이 접히면 이 행이 화면에서 밀려나므로, 누른 자리에 그대로 두도록 스크롤을 보정한다.
  const keepInPlace = useKeepTappedItemInPlace(open);
  const locked = isTargetLocked(target);
  const status = reviewDraftStatus(draft);
  const hasInput = !locked && status !== 'empty';
  const badge = targetBadge(target, hasInput);
  const tagSummary = formatTagSummary(target.review ? target.review.tags.map((tag) => tag.label) : selectedTagLabels(draft.tagCodes));

  let detail: string | null = null;
  let detailWarn = false;
  if (open) {
    detail = [target.subtitle || targetTypeLabel(target.targetType), target.reviewerTeamLabel].filter(Boolean).join(' · ');
  } else if (locked) {
    detail = target.review || target.alreadySubmitted ? tagSummary : target.lockReasonLabel;
  } else if (status === 'ready') {
    detail = tagSummary;
  } else if (status !== 'empty') {
    detail = status === 'needsRating' ? '별점을 골라 주세요' : '태그를 하나 이상 골라 주세요';
    detailWarn = true;
  }

  let trailing: ReactNode = <span className="tm-text-caption">평가하기</span>;
  if (locked || open) {
    trailing = locked || hasInput ? <span className={`tm-badge ${badge.className}`}>{badge.label}</span> : null;
  } else if (status === 'ready') {
    trailing = <span className="tm-badge tm-badge-blue">★{draft.rating} · 태그 {draft.tagCodes.length}</span>;
  } else if (status !== 'empty') {
    trailing = <span className="tm-badge tm-badge-orange">{status === 'needsRating' ? '별점 필요' : '태그 필요'}</span>;
  }

  const rowState = locked || status === 'empty' ? undefined : status === 'ready' ? 'ready' : 'incomplete';

  return (
    <div
      ref={itemRef}
      className={open ? `tm-review-player tm-card tm-review-target-card${hasInput ? ' tm-review-target-active' : ''}` : 'tm-review-player'}
      data-open={open}
    >
      <button
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        className="tm-list-row tm-review-player-row"
        data-state={rowState}
        onClick={() => {
          keepInPlace(itemRef.current);
          onToggle();
        }}
        type="button"
      >
        <Avatar imageUrl={target.imageUrl} initials={target.initials} size={36} />
        <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
          <div className="tm-text-label" style={{ fontSize: 'var(--font-size-body)' }}>{target.name}</div>
          {detail ? (
            <div className="tm-text-caption" style={{ marginTop: 2, color: detailWarn ? 'var(--orange700)' : undefined }}>{detail}</div>
          ) : null}
        </div>
        {trailing}
        <span aria-hidden="true" className="tm-review-player-chevron" />
      </button>
      {open ? (
        <div id={panelId}>
          {target.lockReasonLabel ? <div className="tm-text-caption" style={{ marginTop: 8, overflowWrap: 'anywhere' }}>{target.lockReasonLabel}</div> : null}
          <ReviewTargetEditor
            clearLabel="이 선수 평가 지우기"
            draft={draft}
            locked={locked}
            name={target.name}
            onClear={onClear}
            onToggleTag={onToggleTag}
            onUpdateMetricScore={onUpdateMetricScore}
            onUpdateRating={onUpdateRating}
          />
        </div>
      ) : null}
    </div>
  );
}

/** 팀 카드와 펼친 선수 카드가 함께 쓰는 입력부. 별과 태그 중 하나만 채운 상태를 그 자리에서 짚는다. */
function ReviewTargetEditor({
  clearLabel,
  draft,
  locked,
  name,
  onClear,
  onToggleTag,
  onUpdateMetricScore,
  onUpdateRating,
}: {
  clearLabel: string;
  draft: ReviewTargetDraft;
  locked: boolean;
  name: string;
  onClear: () => void;
  onToggleTag: (tagCode: string) => void;
  /** 넘기면 세부 4항목 조정을 함께 보여 준다(사람 대상에만). */
  onUpdateMetricScore?: (metric: MetricKey, score: number) => void;
  onUpdateRating: (rating: number) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const status = reviewDraftStatus(draft);

  return (
    <div ref={editorRef}>
      <StarRating disabled={locked} label={`${name} 총점`} rating={draft.rating} onChange={onUpdateRating} />
      {!locked && draft.rating === null ? (
        <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--orange700)' }}>별점을 골라 주세요</div>
      ) : null}
      <div className="tm-review-chip-row">
        {REVIEW_TAG_OPTIONS.map((tag) => {
          const selected = draft.tagCodes.includes(tag.code);
          return (
            <button
              key={tag.code}
              aria-pressed={selected}
              className="tm-review-tag-chip"
              data-active={selected}
              disabled={locked}
              onClick={() => onToggleTag(tag.code)}
              type="button"
            >
              {tag.label}
            </button>
          );
        })}
      </div>
      {!locked && status === 'needsTags' ? (
        <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--orange700)' }}>태그를 하나 이상 골라 주세요</div>
      ) : null}
      {/* 4항목 채점 -- 사람 대상에만. 이 값이 상대 선수 카드의 실력·매너·시간약속을
          만들고, 후기 3개로 능력치가·10개로 카드 모양이 열린다(Task 155 해금의 원천).
          바꾸지 않은 항목은 종합 별점을 따라가서 세부를 안 만져도 제출 마찰이 늘지 않는다. */}
      {onUpdateMetricScore && !locked && draft.rating !== null ? (
        <ReviewMetricEditor
          name={name}
          onChange={onUpdateMetricScore}
          overrides={draft.metricOverrides ?? {}}
          rating={draft.rating}
        />
      ) : null}
      {!locked && status !== 'empty' ? (
        <button
          className="tm-btn tm-btn-ghost tm-btn-sm tm-review-clear"
          onClick={() => {
            // 이 버튼이 사라지므로 포커스를 별점으로 옮겨 키보드 사용자가 길을 잃지 않게 한다.
            editorRef.current?.querySelector<HTMLButtonElement>('[role="radio"]')?.focus();
            onClear();
          }}
          type="button"
        >
          {clearLabel}
        </button>
      ) : null}
    </div>
  );
}

function ReviewMetricEditor({
  name,
  onChange,
  overrides,
  rating,
}: {
  name: string;
  onChange: (metric: MetricKey, score: number) => void;
  overrides: Partial<ReviewMetricDraft>;
  rating: number;
}) {
  const panelId = useId();
  const customized = Object.keys(overrides).length > 0;
  const [open, setOpen] = useState(customized);

  return (
    <>
      <button
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        className="tm-btn tm-btn-ghost tm-btn-sm tm-review-metric-toggle"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="tm-text-caption">
          {customized ? '실력·매너·시간약속·안전을 따로 골랐어요' : '실력·매너·시간약속·안전은 종합 별점과 같게 보내요'}
        </span>
        <span className="tm-text-label" style={{ color: 'var(--blue700)' }}>{open ? '접기' : '바꾸기'}</span>
      </button>
      {open ? (
        <div id={panelId} className="tm-review-metric-rows">
          {REVIEW_METRIC_FIELDS.map((field) => (
            <div key={field.key} className="tm-review-metric-row" style={{ flexWrap: 'wrap' }}>
              <span className="tm-review-metric-label">{field.label}</span>
              <StarRating
                compact
                label={`${name} ${field.label}`}
                rating={overrides[field.key] ?? rating}
                onChange={(score) => onChange(field.key, score)}
              />
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

function StarRating({ compact, disabled, label, onChange, rating }: { compact?: boolean; disabled?: boolean; label: string; onChange: (rating: number) => void; rating: number | null }) {
  const filled = rating ?? 0;
  // 방향키는 점수를 바꾸고 포커스도 따라간다 — 선택된 별만 탭 정지점(roving tabindex)이라
  // 포커스가 남으면 화면에 보이는 점수와 포커스가 어긋난다. 아직 아무것도 고르지 않았으면
  // 첫 별이 탭 정지점이다(radiogroup 은 선택이 없을 때도 키보드로 들어갈 수 있어야 한다).
  const onStarKeyDown = (event: KeyboardEvent<HTMLButtonElement>, value: number) => {
    const next = nextStarValue(event.key, value);
    if (next === null) return;
    event.preventDefault();
    onChange(next);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next - 1]?.focus();
  };

  return (
    <div
      className="tm-review-stars"
      style={{
        width: '100%',
        minWidth: compact ? 220 : 0,
        maxWidth: compact ? 220 : 284,
        flex: compact ? '1 1 220px' : '0 1 284px',
        justifyContent: 'space-between',
        gap: 0,
        padding: 0,
      }}
      data-compact={compact ? 'true' : undefined}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
    >
      {STAR_VALUES.map((value) => (
        <button
          key={value}
          role="radio"
          aria-checked={value === rating}
          aria-label={`${value}점`}
          className="tm-review-star"
          data-active={value <= filled}
          disabled={disabled}
          onClick={() => onChange(value)}
          onKeyDown={(event) => onStarKeyDown(event, value)}
          tabIndex={value === (rating ?? 1) ? 0 : -1}
          type="button"
        >
          {value <= filled ? '★' : '☆'}
        </button>
      ))}
    </div>
  );
}

function ReceivedGroupSection({ groups, title }: { groups: ReviewsReceivedPageModel['userGroups']; title: string }) {
  return (
    <section>
      <div className="tm-my-section-label">{title}</div>
      <div style={{ display: 'grid', gap: 12 }}>
        {groups.map((group) => (
          <Card key={`${group.sourceType}:${group.sourceId}`} pad={16}>
            <div className="tm-review-card-head">
              <div>
                <div className="tm-text-body-lg">{group.title}</div>
                <div className="tm-text-caption" style={{ marginTop: 4 }}>{group.meta}</div>
              </div>
              <span className="tm-badge tm-badge-blue">{group.average}</span>
            </div>
            <div className="tm-review-received-list">
              {group.reviews.map((review) => <ReceivedReviewRow key={review.reviewId} review={review} />)}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

function ReceivedReviewRow({ review }: { review: V1ReceivedReviewDetail }) {
  const firstTag = review.tags[0]?.label ?? '별점만';
  return (
    <div className="tm-review-received-row">
      {/* 작성자를 공개한다(2026-08-18). 팀 대상 후기는 보낸 팀 이름이 더 유용해서 팀명을 우선한다. */}
      <Avatar imageUrl={review.reviewerUser?.imageUrl} initials={displayInitials(review.reviewerTeam?.name ?? review.reviewerUser?.name, { fallback: '리뷰', count: 2 })} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-text-label">{review.reviewerTeam?.name ?? review.reviewerUser?.name ?? '작성자 미상'}</div>
        <div className="tm-text-caption" style={{ marginTop: 2 }}>{review.rating}점 · {firstTag}</div>
      </div>
    </div>
  );
}

function Avatar({ imageUrl, initials, size = 42 }: { imageUrl: string | null | undefined; initials: string; size?: number }) {
  return imageUrl ? (
    <div className="tm-review-avatar" style={{ width: size, height: size, backgroundImage: cssUrl(imageUrl) }} />
  ) : (
    <div className="tm-review-avatar" style={{ width: size, height: size }}>{initials}</div>
  );
}

function ReviewSkeleton({ count }: { count: number }) {
  return Array.from({ length: count }, (_, index) => <div key={index} className="tm-review-skeleton" />);
}

function targetTypeLabel(targetType: V1ReviewTargetType) {
  return targetType === 'team' ? '상대 팀' : '참가자';
}
