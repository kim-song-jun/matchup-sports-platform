import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, KPIStat } from '@/components/v1-ui/primitives';
import { ChevronRightIcon } from '@/components/v1-ui/icons';
import { cssUrl } from '@/lib/assets';
import { DEFAULT_REVIEW_RATING, REVIEW_METRIC_FIELDS } from './reviews.types';
import type { ReviewSourcePageModel, ReviewsPageModel, ReviewsReceivedPageModel, ReviewsTab, ReviewTargetDraft, ReviewTargetViewModel } from './reviews.types';
import { REVIEW_TAG_OPTIONS, toTargetViewModel } from './reviews.view-model';
import { ReviewsSummaryDashboard } from './reviews-summary-dashboard';
import type { V1ReceivedReviewDetail, V1ReviewReceivedSummaryResponse, V1ReviewTargetType } from '@/types/api';

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
    <AppChrome title="리뷰" activeTab="my" backHref="/my" desktopHead>
      <div className="tm-review-shell">
        <ReviewTabs active={model.tab} onChange={onTabChange} />
        {isReceivedTab ? (
          <>
            {loading ? <ReviewSkeleton count={2} /> : null}
            {!loading && errorMessage ? (
              <ReviewNotice title="리뷰를 불러오지 못했어요" sub={errorMessage} onRetry={onRetry} />
            ) : null}
            {/* 요약 카드는 집계 0건이면 스스로 렌더하지 않는다 — 개별 리뷰까지 0건이면 화면에
                아무것도 남지 않으므로(실측: 완전 빈 화면) 여기서 빈 상태를 책임진다. */}
            {!loading && !errorMessage && !hasReceivedContent ? (
              <ReviewEmpty
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
                />
              ) : null}
            </div>
          </>
        ) : (
          <>
            <ReviewStats stats={model.stats} />
            <div style={{ display: 'grid', gap: 12 }}>
              {loading ? <ReviewSkeleton count={2} /> : null}
              {!loading && errorMessage ? <ReviewNotice title="리뷰를 불러오지 못했어요" sub={errorMessage} onRetry={onRetry} /> : null}
              {!loading && !errorMessage && model.cards.length === 0 ? <ReviewEmpty title={model.emptyTitle} sub={model.emptySub} /> : null}
              {!loading && !errorMessage ? model.cards.map((card) => (
                <Link key={`${card.sourceType}:${card.sourceId}`} className="tm-review-schedule-card tm-pressable" href={card.href}>
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
    </AppChrome>
  );
}

function AnonymousReceivedContent({ model }: { model: ReviewsReceivedPageModel }) {
  return (
    <div style={{ marginTop: 24 }}>
      {/* 제도 전/후를 나누지 않는다 — "이전 리뷰" 섹션은 제거했다. 작성자도 공개한다. */}
      <div className="tm-my-section-label">경기에서 받은 리뷰</div>
      <div className="tm-text-caption" style={{ marginBottom: 12 }}>상호 작성이 끝나거나 72시간이 지나면 보여요.</div>
      {model.userGroups.length > 0 ? <ReceivedGroupSection groups={model.userGroups} title="내가 받은 리뷰" /> : null}
      {model.teamGroups.length > 0 ? (
        <div style={{ marginTop: 16 }}><ReceivedGroupSection groups={model.teamGroups} title="내 팀이 받은 리뷰" /></div>
      ) : null}
    </div>
  );
}

const SUBMIT_HINT_ID = 'review-submit-hint';

export function ReviewSourcePageView({
  drafts,
  errorMessage,
  loading,
  message,
  model,
  onRetry,
  onSubmit,
  onToggleTag,
  onUpdateMetricScore,
  onUpdateRating,
  submitting,
}: QueryStateProps & {
  drafts: Record<string, ReviewTargetDraft>;
  message: string | null;
  model: ReviewSourcePageModel | null;
  onSubmit: () => void;
  onToggleTag: (key: string, tagCode: string) => void;
  onUpdateMetricScore: (key: string, metric: 'skill' | 'manner' | 'punctuality' | 'safety', score: number) => void;
  onUpdateRating: (key: string, rating: number) => void;
  submitting: boolean;
}) {
  const pendingTargets = model?.targets.filter((target) => !target.locked && !target.alreadySubmitted && !target.review) ?? [];
  const canSubmit = pendingTargets.some((target) => drafts[targetKey(target.targetType, target.targetUserId, target.targetTeamId)]?.tagCodes.length > 0);
  // 아직 쓸 대상이 남아 있는데 태그를 하나도 안 골라 버튼이 잠긴 상태에서만 안내한다 —
  // 로딩·에러·전송 중이거나 남은 대상이 없으면 버튼이 회색인 이유가 다르므로 띄우지 않는다.
  const showSubmitHint = !loading && !errorMessage && !submitting && pendingTargets.length > 0 && !canSubmit;

  return (
    <AppChrome title="리뷰 남기기" activeTab="my" bottomNav={false} backHref="/my/reviews" desktopHead>
      <div className="tm-review-shell tm-review-compose-shell">
        {loading ? <ReviewSkeleton count={3} /> : null}
        {!loading && errorMessage ? <ReviewNotice title="리뷰 대상을 불러오지 못했어요" sub={errorMessage} onRetry={onRetry} /> : null}
        {!loading && !errorMessage && model ? (
          <>
            <Card pad={16}>
              <div className="tm-review-card-head">
                <div>
                  <div className="tm-text-caption">{model.sourceMeta}</div>
                  <div className="tm-text-body-lg" style={{ marginTop: 4 }}>{model.source.title}</div>

                </div>
                <span className="tm-badge tm-badge-blue">{model.progressLabel.split(' · ')[0]}</span>
              </div>
            </Card>
            <ReviewTargetSections
              drafts={drafts}
              model={model}
              onToggleTag={onToggleTag}
              onUpdateMetricScore={onUpdateMetricScore}
              onUpdateRating={onUpdateRating}
            />
            <Card className={message ? 'tm-review-notice-error' : ''} pad={14} style={message ? undefined : { background: 'var(--grey50)' }}>
              <div className="tm-text-label">{message ?? '작성 현황'}</div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>{message ? '선택 상태를 확인한 뒤 다시 시도해 주세요.' : model.progressLabel}</div>
            </Card>
          </>
        ) : null}
      </div>
      <div className="tm-fixed-cta">
        {/* 별점은 기본값(5)으로 이미 채워져 있어서, 태그를 안 고른 사용자 눈에는 "다 했는데
            버튼만 회색"으로 보인다 — 태그 1개 이상은 서버 계약(SubmitReviewDto 의
            `@ArrayMinSize(1)`)이라 버튼을 풀어줄 수는 없으니, 왜 못 보내는지를 말해준다.
            `aria-describedby` 로 버튼에 묶어 스크린리더도 비활성 이유를 읽게 한다. */}
        {showSubmitHint ? (
          <p
            id={SUBMIT_HINT_ID}
            className="tm-text-caption"
            style={{ margin: '0 0 8px', textAlign: 'center', color: 'var(--text-caption)' }}
          >
            태그를 하나 이상 골라야 리뷰를 보낼 수 있어요
          </p>
        ) : null}
        <button
          aria-describedby={showSubmitHint ? SUBMIT_HINT_ID : undefined}
          className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
          disabled={!canSubmit || submitting || loading || Boolean(errorMessage)}
          onClick={onSubmit}
          type="button"
        >
          {submitting ? '전송 중' : '리뷰 보내기'}
        </button>
      </div>
    </AppChrome>
  );
}

export function ReviewsReceivedPageView({
  errorMessage,
  hasManagedTeam,
  loading,
  model,
  onPeriodChange,
  onRetry,
  onTeamPeriodChange,
  period,
  summary,
  summaryLoading,
  teamPeriod,
  teamSummary,
  teamSummaryLoading,
}: QueryStateProps & {
  hasManagedTeam: boolean;
  model: ReviewsReceivedPageModel;
  onPeriodChange: (period: string | null) => void;
  onTeamPeriodChange: (period: string | null) => void;
  period: string | null;
  summary: V1ReviewReceivedSummaryResponse | undefined;
  summaryLoading: boolean;
  teamPeriod: string | null;
  teamSummary: V1ReviewReceivedSummaryResponse | undefined;
  teamSummaryLoading: boolean;
}) {
  // 로딩·에러 중엔 아직 "레거시 리뷰가 없다"고 단정할 수 없으므로 섹션을 숨기지 않는다.
  // (모델이 비어있는 것과 로딩/에러로 아직 모르는 것을 구분 — 그렇지 않으면 에러 상태가 조용히 사라진다.)
  const hasReceivedContent = model.userGroups.length > 0 || model.teamGroups.length > 0;
  return (
    // #24: 뒤로가기는 received 탭으로 이동한다 (/my/reviews?tab=received 는 page.tsx에서 파싱됨).
    <AppChrome title="받은 리뷰" activeTab="my" bottomNav={false} backHref="/my/reviews?tab=received" desktopHead>
      <div className="tm-review-shell">
        {/* 개별 리뷰가 주인공이고 요약은 보조다 — 예전엔 순서가 반대라 큰 대시보드 두 개를
            지나야 정작 받은 리뷰 내용이 나왔다. 요약은 집계가 0건이면 스스로 렌더하지 않는다. */}
        {hasReceivedContent ? <AnonymousReceivedContent model={model} /> : null}
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
            />
          ) : null}
        </div>
      </div>
    </AppChrome>
  );
}

export function ReviewSubmitCompleteView({ model, onConfirm }: { model: ReviewSourcePageModel; onConfirm: () => void }) {
  const reviewed = model.targets.filter((target) => target.alreadySubmitted || target.review).length;
  const remaining = Math.max(0, model.targets.length - reviewed);

  return (
    <AppChrome title="" activeTab="my" bottomNav={false} backHref="/my/reviews" desktopHead>
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
    </AppChrome>
  );
}

/**
 * 후기 작성 대상 배치 — **상대 팀 평가가 기본이고 선수는 선택**이다.
 *
 * 예전에는 팀 1 + 선수 N(대회 경기에서 최대 8명)을 전부 같은 높이의 카드로 세로로 깔아,
 * 화면이 "이 경기의 모든 사람을 평가해야 한다"처럼 읽혔다. 실제로는 팀 평가만 남겨도 되고
 * 인상 깊은 선수만 골라 덧붙이면 된다 — 제출도 이미 "태그를 고른 대상만" 보낸다.
 */
function ReviewTargetSections({
  drafts,
  model,
  onToggleTag,
  onUpdateMetricScore,
  onUpdateRating,
}: {
  drafts: Record<string, ReviewTargetDraft>;
  model: ReviewSourcePageModel;
  onToggleTag: (key: string, tagCode: string) => void;
  onUpdateMetricScore: (key: string, metric: 'skill' | 'manner' | 'punctuality' | 'safety', score: number) => void;
  onUpdateRating: (key: string, rating: number) => void;
}) {
  const teamTargets = model.targets.filter((target) => target.targetType === 'team');
  const playerTargets = model.targets.filter((target) => target.targetType !== 'team');
  // 이미 손댄 선수가 있는데 접어 두면 그 결과가 사라진 것처럼 보인다.
  const hasPlayerProgress = playerTargets.some((target) => target.alreadySubmitted || target.review);
  // 팀 대상이 아예 없으면 선수가 유일한 할 일이므로 펼친 채로 둔다.
  // 이 파일은 서버 컴포넌트로도 렌더되므로(use client 없음) 상태 대신 <details> 로 접는다.
  const playersOpen = hasPlayerProgress || teamTargets.length === 0;

  const renderCard = (target: ReviewSourcePageModel['targets'][number]) => {
    // reviewerTeam 이 null = 양 팀 겸직이라 대상마다 작성자 팀이 다르다는 뜻.
    const targetModel = toTargetViewModel(target, model.reviewerTeam === null);
    const key = targetKey(target.targetType, target.targetUserId, target.targetTeamId);
    return (
      <ReviewTargetCard
        key={key}
        draft={drafts[key] ?? { rating: target.review?.rating ?? DEFAULT_REVIEW_RATING, tagCodes: target.review?.tags.map((tag) => tag.tagCode) ?? [] }}
        onToggleTag={(tagCode) => onToggleTag(key, tagCode)}
        onUpdateMetricScore={(metric, score) => onUpdateMetricScore(key, metric, score)}
        onUpdateRating={(rating) => onUpdateRating(key, rating)}
        target={targetModel}
      />
    );
  };

  return (
    <>
      {teamTargets.length > 0 ? <div className="tm-review-target-stack">{teamTargets.map(renderCard)}</div> : null}

      {playerTargets.length > 0 ? (
        <details className="tm-review-player-details" open={playersOpen} style={{ marginTop: teamTargets.length > 0 ? 16 : 0 }}>
          <summary className="tm-review-player-summary">
            선수 개별 평가 <span className="tab-num">{playerTargets.length}</span>명
          </summary>
          <div className="tm-text-caption" style={{ margin: '8px 0 12px' }}>
            남기고 싶은 선수만 골라 주세요. 비워 두면 팀 후기만 전송돼요.
          </div>
          <div className="tm-review-target-stack">{playerTargets.map(renderCard)}</div>
        </details>
      ) : null}
    </>
  );
}

function ReviewTabs({ active, onChange }: { active: ReviewsTab; onChange: (tab: ReviewsTab) => void }) {
  const tabs: Array<[ReviewsTab, string]> = [['pending', '작성할 리뷰'], ['written', '작성된 리뷰'], ['received', '받은 리뷰']];
  return (
    <div className="tm-review-tabs" role="tablist">
      {tabs.map(([id, label]) => (
        <Link
          key={id}
          aria-current={active === id ? 'page' : undefined}
          className="tm-review-tab"
          data-active={active === id}
          href={`/my/reviews?tab=${id}`}
          onClick={() => onChange(id)}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

function ReviewStats({ stats }: { stats: Array<{ label: string; value: string }> }) {
  return (
    <div className="tm-review-stat-grid">
      {stats.map((stat) => (
        <Card key={stat.label} pad={10}>
          <KPIStat label={stat.label} value={stat.value} />
        </Card>
      ))}
    </div>
  );
}

function ReviewTargetCard({
  draft,
  onToggleTag,
  onUpdateMetricScore,
  onUpdateRating,
  target,
}: {
  draft: ReviewTargetDraft;
  onToggleTag: (tagCode: string) => void;
  onUpdateMetricScore: (metric: 'skill' | 'manner' | 'punctuality' | 'safety', score: number) => void;
  onUpdateRating: (rating: number) => void;
  target: ReviewTargetViewModel;
}) {
  const locked = target.locked || target.alreadySubmitted || Boolean(target.review);
  const active = !locked && draft.tagCodes.length > 0;

  return (
    <Card className={active ? 'tm-review-target-card tm-review-target-active' : 'tm-review-target-card'} pad={14}>
      <div className="tm-review-target-head">
        <Avatar imageUrl={target.imageUrl} initials={target.initials} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tm-review-card-head">
            <div style={{ minWidth: 0 }}>
              <div className="tm-text-body-lg">{target.name}</div>
              <div className="tm-text-caption" style={{ marginTop: 2 }}>{target.subtitle || targetTypeLabel(target.targetType)}</div>
              {target.reviewerTeamLabel ? (
                <div className="tm-text-caption" style={{ marginTop: 2 }}>{target.reviewerTeamLabel}</div>
              ) : null}
            </div>
            <span className={`tm-badge ${target.statusLabel === '작성됨' ? 'tm-badge-green' : target.statusLabel === '잠김' ? 'tm-badge-grey' : active ? 'tm-badge-blue' : 'tm-badge-grey'}`}>
              {target.statusLabel === '대기' && active ? '작성 중' : target.statusLabel}
            </span>
          </div>
          {target.lockReasonLabel ? <div className="tm-text-caption" style={{ marginTop: 8 }}>{target.lockReasonLabel}</div> : null}
          <StarRating disabled={locked} rating={draft.rating} onChange={onUpdateRating} />
          {/* 4항목 채점 -- 사람 대상에만. 이 값이 상대 선수 카드의 실력·매너·시간약속을
              만들고, 후기 3개로 능력치가·10개로 카드 모양이 열린다(Task 155 해금의 원천).
              기본값은 종합 별점과 같아 세부를 안 만져도 제출 마찰이 늘지 않는다. */}
          {target.targetType === 'user' && draft.metricScores ? (
            <div className="tm-review-metric-rows">
              {REVIEW_METRIC_FIELDS.map((field) => (
                <div key={field.key} className="tm-review-metric-row">
                  <span className="tm-review-metric-label">{field.label}</span>
                  <StarRating
                    compact
                    disabled={locked}
                    rating={draft.metricScores?.[field.key] ?? draft.rating}
                    onChange={(score) => onUpdateMetricScore(field.key, score)}
                  />
                </div>
              ))}
            </div>
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
        </div>
      </div>
    </Card>
  );
}

function StarRating({ compact, disabled, onChange, rating }: { compact?: boolean; disabled?: boolean; onChange: (rating: number) => void; rating: number }) {
  return (
    <div className="tm-review-stars" data-compact={compact ? 'true' : undefined} aria-label={`${rating}점`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          aria-label={`${value}점`}
          className="tm-review-star"
          data-active={value <= rating}
          disabled={disabled}
          onClick={() => onChange(value)}
          type="button"
        >
          ★
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
      <Avatar imageUrl={review.reviewerUser?.imageUrl} initials={(review.reviewerTeam?.name ?? review.reviewerUser?.name ?? '리뷰').slice(0, 2)} size={34} />
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

function ReviewNotice({ onRetry, sub, title }: { onRetry: () => void; sub: string; title: string }) {
  return (
    <Card className="tm-review-notice-error" pad={16}>
      <div className="tm-text-body-lg">{title}</div>
      <div className="tm-text-caption" style={{ marginTop: 4 }}>{sub}</div>
      <button className="tm-btn tm-btn-sm tm-btn-neutral" onClick={onRetry} style={{ marginTop: 12 }} type="button">다시 시도</button>
    </Card>
  );
}

function ReviewEmpty({ sub, title }: { sub: string; title: string }) {
  return (
    <Card pad={18} style={{ textAlign: 'center' }}>
      <div className="tm-text-body-lg">{title}</div>
      <div className="tm-text-caption" style={{ marginTop: 8 }}>{sub}</div>
    </Card>
  );
}

function targetKey(targetType: V1ReviewTargetType, targetUserId: string | null, targetTeamId: string | null) {
  return targetType === 'team' ? `team:${targetTeamId ?? 'unknown'}` : `user:${targetUserId ?? 'unknown'}`;
}

function targetTypeLabel(targetType: V1ReviewTargetType) {
  return targetType === 'team' ? '상대 팀' : '참가자';
}
