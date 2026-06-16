import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, KPIStat } from '@/components/v1-ui/primitives';
import type { ReviewSourcePageModel, ReviewsPageModel, ReviewsReceivedPageModel, ReviewsTab, ReviewTargetDraft, ReviewTargetViewModel } from './reviews.types';
import { REVIEW_TAG_OPTIONS, toTargetViewModel } from './reviews.view-model';
import type { V1ReviewDetail, V1ReviewTargetType } from '@/types/api';

type QueryStateProps = {
  errorMessage: string | null;
  loading: boolean;
  onRetry: () => void;
};

export function ReviewsPageView({
  errorMessage,
  loading,
  model,
  onRetry,
  onTabChange,
  receivedModel,
}: QueryStateProps & {
  model: ReviewsPageModel;
  onTabChange: (tab: ReviewsTab) => void;
  receivedModel: ReviewsReceivedPageModel;
}) {
  const isReceivedTab = model.tab === 'received';

  return (
    <AppChrome title="리뷰" activeTab="my" backHref="/my">
      <div className="tm-review-shell">
        <ReviewTabs active={model.tab} onChange={onTabChange} />
        {isReceivedTab ? (
          <ReviewsReceivedContent
            errorMessage={errorMessage}
            loading={loading}
            model={receivedModel}
            onRetry={onRetry}
          />
        ) : (
          <>
            <ReviewStats stats={model.stats} />
            <div style={{ display: 'grid', gap: 10 }}>
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
                  <div className="tm-review-card-foot">
                    <span className="tm-badge tm-badge-grey">{card.kindLabel}</span>
                    <span className="tm-text-label">{card.ctaLabel}</span>
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

function ReviewsReceivedContent({
  errorMessage,
  loading,
  model,
  onRetry,
}: QueryStateProps & {
  model: ReviewsReceivedPageModel;
}) {
  const empty = model.userGroups.length === 0 && model.teamGroups.length === 0;

  return (
    <>
      <ReviewStats stats={model.stats} />
      {loading ? <ReviewSkeleton count={2} /> : null}
      {!loading && errorMessage ? <ReviewNotice title="받은 리뷰를 불러오지 못했어요" sub={errorMessage} onRetry={onRetry} /> : null}
      {!loading && !errorMessage && empty ? <ReviewEmpty title="받은 리뷰가 없어요" sub="상대방이 리뷰를 보내면 경기별로 정리돼서 보여요." /> : null}
      {!loading && !errorMessage && model.userGroups.length > 0 ? <ReceivedGroupSection title="내가 받은 리뷰" groups={model.userGroups} /> : null}
      {!loading && !errorMessage && model.teamGroups.length > 0 ? <ReceivedGroupSection title="내 팀이 받은 리뷰" groups={model.teamGroups} /> : null}
    </>
  );
}

export function ReviewSourcePageView({
  drafts,
  errorMessage,
  loading,
  message,
  model,
  onRetry,
  onSubmit,
  onToggleTag,
  onUpdateRating,
  submitting,
}: QueryStateProps & {
  drafts: Record<string, ReviewTargetDraft>;
  message: string | null;
  model: ReviewSourcePageModel | null;
  onSubmit: () => void;
  onToggleTag: (key: string, tagCode: string) => void;
  onUpdateRating: (key: string, rating: number) => void;
  submitting: boolean;
}) {
  const pendingTargets = model?.targets.filter((target) => !target.locked && !target.alreadySubmitted && !target.review) ?? [];
  const canSubmit = pendingTargets.some((target) => drafts[targetKey(target.targetType, target.targetUserId, target.targetTeamId)]?.tagCodes.length > 0);

  return (
    <AppChrome title="리뷰 남기기" activeTab="my" bottomNav={false} backHref="/my/reviews">
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
                  {model.reviewerTeam ? <div className="tm-text-caption" style={{ marginTop: 4 }}>{model.reviewerTeam.name} 대표로 작성</div> : null}
                </div>
                <span className="tm-badge tm-badge-blue">{model.progressLabel.split(' · ')[0]}</span>
              </div>
            </Card>
            <div className="tm-review-target-stack">
              {model.targets.map((target) => {
                const targetModel = toTargetViewModel(target);
                const key = targetKey(target.targetType, target.targetUserId, target.targetTeamId);
                return (
                  <ReviewTargetCard
                    key={key}
                    draft={drafts[key] ?? { rating: target.review?.rating ?? 4, tagCodes: target.review?.tags.map((tag) => tag.tagCode) ?? [] }}
                    onToggleTag={(tagCode) => onToggleTag(key, tagCode)}
                    onUpdateRating={(rating) => onUpdateRating(key, rating)}
                    target={targetModel}
                  />
                );
              })}
            </div>
            <Card pad={14} style={{ background: message ? 'var(--red50)' : 'var(--grey50)' }}>
              <div className="tm-text-label">{message ?? '작성 현황'}</div>
              <div className="tm-text-caption" style={{ marginTop: 5 }}>{message ? '선택 상태를 확인한 뒤 다시 시도해 주세요.' : model.progressLabel}</div>
            </Card>
          </>
        ) : null}
      </div>
      <div className="tm-fixed-cta">
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" disabled={!canSubmit || submitting || loading || Boolean(errorMessage)} onClick={onSubmit} type="button">
          {submitting ? '전송 중' : '리뷰 보내기'}
        </button>
      </div>
    </AppChrome>
  );
}

export function ReviewsReceivedPageView({
  errorMessage,
  loading,
  model,
  onRetry,
}: QueryStateProps & {
  model: ReviewsReceivedPageModel;
}) {
  return (
    <AppChrome title="받은 리뷰" activeTab="my" bottomNav={false} backHref="/my/reviews">
      <div className="tm-review-shell">
        <ReviewsReceivedContent
          errorMessage={errorMessage}
          loading={loading}
          model={model}
          onRetry={onRetry}
        />
      </div>
    </AppChrome>
  );
}

export function ReviewSubmitCompleteView({ model, onConfirm }: { model: ReviewSourcePageModel; onConfirm: () => void }) {
  const reviewed = model.targets.filter((target) => target.alreadySubmitted || target.review).length;
  const remaining = Math.max(0, model.targets.length - reviewed);

  return (
    <AppChrome title="" activeTab="my" bottomNav={false} backHref="/my/reviews">
      <div className="tm-review-complete">
        <div className="tm-review-complete-icon">✓</div>
        <div className="tm-text-heading" style={{ marginTop: 22 }}>리뷰를 보냈어요</div>
        <Card pad={16} style={{ marginTop: 24, textAlign: 'left' }}>
          <div className="tm-text-label">{model.source.title}</div>
          <div className="tm-review-chip-row">
            <span className="tm-badge tm-badge-blue">{reviewed}명 전송</span>
            <span className="tm-badge tm-badge-blue">별점 완료</span>
            <span className="tm-badge tm-badge-blue">태그 완료</span>
            <span className="tm-badge tm-badge-grey">{remaining}명 남음</span>
          </div>
        </Card>
      </div>
      <div className="tm-fixed-cta">
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" onClick={onConfirm} type="button">확인</button>
      </div>
    </AppChrome>
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
  onUpdateRating,
  target,
}: {
  draft: ReviewTargetDraft;
  onToggleTag: (tagCode: string) => void;
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
            </div>
            <span className={`tm-badge ${target.statusLabel === '작성됨' ? 'tm-badge-green' : target.statusLabel === '잠김' ? 'tm-badge-grey' : active ? 'tm-badge-blue' : 'tm-badge-grey'}`}>
              {target.statusLabel === '대기' && active ? '작성 중' : target.statusLabel}
            </span>
          </div>
          {target.lockReason ? <div className="tm-text-caption" style={{ marginTop: 8 }}>{target.lockReason}</div> : null}
          <StarRating disabled={locked} rating={draft.rating} onChange={onUpdateRating} />
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

function StarRating({ disabled, onChange, rating }: { disabled?: boolean; onChange: (rating: number) => void; rating: number }) {
  return (
    <div className="tm-review-stars" aria-label={`${rating}점`}>
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

function ReceivedReviewRow({ review }: { review: V1ReviewDetail }) {
  const firstTag = review.tags[0]?.label ?? '별점만';
  return (
    <div className="tm-review-received-row">
      <Avatar imageUrl={review.reviewerUser.imageUrl} initials={review.reviewerUser.name.slice(0, 2)} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-text-label">{review.reviewerTeam?.name ?? review.reviewerUser.name}</div>
        <div className="tm-text-caption" style={{ marginTop: 2 }}>{review.rating}점 · {firstTag}</div>
      </div>
    </div>
  );
}

function Avatar({ imageUrl, initials, size = 42 }: { imageUrl: string | null | undefined; initials: string; size?: number }) {
  return imageUrl ? (
    <div className="tm-review-avatar" style={{ width: size, height: size, backgroundImage: `url(${imageUrl})` }} />
  ) : (
    <div className="tm-review-avatar" style={{ width: size, height: size }}>{initials}</div>
  );
}

function ReviewSkeleton({ count }: { count: number }) {
  return Array.from({ length: count }, (_, index) => <div key={index} className="tm-review-skeleton" />);
}

function ReviewNotice({ onRetry, sub, title }: { onRetry: () => void; sub: string; title: string }) {
  return (
    <Card pad={16} style={{ background: 'var(--red50)' }}>
      <div className="tm-text-body-lg">{title}</div>
      <div className="tm-text-caption" style={{ marginTop: 5 }}>{sub}</div>
      <button className="tm-btn tm-btn-sm tm-btn-neutral" onClick={onRetry} style={{ marginTop: 12 }} type="button">다시 시도</button>
    </Card>
  );
}

function ReviewEmpty({ sub, title }: { sub: string; title: string }) {
  return (
    <Card pad={18} style={{ textAlign: 'center' }}>
      <div className="tm-text-body-lg">{title}</div>
      <div className="tm-text-caption" style={{ marginTop: 6 }}>{sub}</div>
    </Card>
  );
}

function targetKey(targetType: V1ReviewTargetType, targetUserId: string | null, targetTeamId: string | null) {
  return targetType === 'team' ? `team:${targetTeamId ?? 'unknown'}` : `user:${targetUserId ?? 'unknown'}`;
}

function targetTypeLabel(targetType: V1ReviewTargetType) {
  return targetType === 'team' ? '상대 팀' : '참가자';
}
