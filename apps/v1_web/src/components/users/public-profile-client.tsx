'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatTournamentDateShort } from '@/lib/date-utils';
import { withFromPath } from '@/lib/session-storage';
import { useCurrentHref } from '@/components/v1-ui/use-current-href';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { ReviewHighlightLine } from '@/components/v1-ui/review-highlight-line';
import { SegmentedTabs } from '@/components/v1-ui/segmented-tabs';
import { useV1AuthMe, useV1PublicProfile } from '@/hooks/use-v1-api';
import { PlayerCard } from './player-card';
import { ShieldCheck, TrendingUp, Activity, Star, AlertCircle, ChevronRight } from 'lucide-react';
import type { TrustState, V1PublicProfile } from '@/types/api';

function trustConfig(trustState: TrustState) {
  switch (trustState) {
    case 'verified':
      return {
        label: '인증 완료',
        description: '실제 활동 기록이 확인됐어요.',
        badgeClass: 'tm-badge tm-badge-green',
        icon: <ShieldCheck size={15} aria-hidden="true" />,
      };
    case 'estimated':
      return {
        label: '누적 중',
        description: '활동 기록이 쌓이고 있어요. 더 많은 활동으로 신뢰 신호를 높일 수 있어요.',
        badgeClass: 'tm-badge tm-badge-blue',
        icon: <TrendingUp size={15} aria-hidden="true" />,
      };
    case 'sample':
    default:
      return {
        label: '샘플',
        // alpha 실화면(2026-08-24)에서 잡은 모순: 이 문구는 "활동이 없다"고 말하는데,
        // 바로 아래 활동 요약 카드가 "2경기 · 2대회 · 3팀"을 보여준다. 한 화면에서 서로
        // 다른 말을 한다. sample 상태의 실제 의미는 **후기가 모자라 신뢰 신호를 계산할 수
        // 없다**는 것이고(이 카드 하단도 "매너 점수는 활동 후기를 기반으로 계산돼요"라고
        // 적고 있다), 활동 유무와는 다른 축이다. 뜻하는 바를 그대로 쓴다.
        description: '아직 받은 후기가 없어 신뢰 신호를 계산할 수 없어요. 경기 후 상호 평가가 쌓이면 표시돼요.',
        badgeClass: 'tm-badge tm-badge-grey',
        icon: <AlertCircle size={15} aria-hidden="true" />,
      };
  }
}

export function PublicProfilePageClient({ userId }: { userId: string }) {
  const profile = useV1PublicProfile(userId);
  // 소속팀 칩에 넘길 출처 — 이 프로필 화면 자기 자신(받은 from까지 포함).
  const selfHref = useCurrentHref();
  /**
   * 본인 여부. 적대 검증(2026-08-25)에서 isOwner=false 하드코딩이 확정됐다 -- 주인이
   * '내 프로필'로 자기 공개 프로필에 와도 남의 시점으로 렌더돼 진행도·해금 안내가
   * 사라졌다. 세션 확인 실패(비로그인 4xx)는 곧 '본인 아님'이므로 재시도하지 않는다.
   */
  const authMe = useV1AuthMe({ retry: false });

  if (profile.isLoading) {
    // 다른 상세 화면과 같은 공용 스켈레톤 — 이 화면만 자체 div 세 개를 쌓고 있었다(2026-09-04 감사).
    return <PageSkeleton variant="detail" />;
  }

  if (profile.isError || !profile.data) {
    return (
      <ErrorState
        title="프로필을 불러오지 못했어요"
        message="사용자를 찾을 수 없거나 잠시 후 다시 확인이 필요해요."
        onRetry={() => profile.refetch()}
      />
    );
  }

  const data = profile.data;
  const { reputation, activitySummary } = data;
  const initials = Array.from(data.displayName || data.nickname || '?')[0] ?? '?';
  const trust = trustConfig(reputation.trustState);
  const mannerDisplay = reputation.mannerScore !== null
    ? reputation.mannerScore.toFixed(1)
    : null;

  return (
    // Desktop: the card stays in the left column, everything else scrolls on the right (desktop/my.css).
    <div className="tm-my-shell tm-public-profile tm-content-enter">
    {/* 선수 카드 + 신원 (Task 155, 신원 통합 스테이지 -- 마이페이지와 같은 규칙).
        카드가 있으면 카드가 곧 프로필이다: 흰 헤더(아바타+이름)와 카드가 같은 말을
        두 번 하지 않도록 이름·핸들은 스테이지 안 카드 아래로 들어간다.
        숨김을 켠 사용자에게는 서버가 null 을 주므로 기존 헤더가 그대로 선다. */}
    {data.playerCard ? (
      <PlayerCard
          card={data.playerCard}
          displayName={data.displayName}
          profileImageUrl={data.profileImageUrl}
          teamName={data.teams?.[0]?.name ?? null}
          isOwner={authMe.data?.user?.id === userId}
          shareHref={withFromPath(`/users/${userId}/card`, selfHref)}
          belowCardSlot={
            <div className="tm-pcard-identity">
              <h1 className="tm-pcard-identity-name">{data.displayName}</h1>
              {/* displayName 이 닉네임에서 나오므로 같을 때 @핸들은 이름을 한 번 더 말할 뿐이다. */}
              {data.nickname && data.nickname !== data.displayName ? (
                <div className="tm-pcard-identity-meta">@{data.nickname}</div>
              ) : null}
            </div>
          }
        />
    ) : (
      <section className="tm-my-profile-head" aria-label="사용자 정보">
        <ProfileAvatar imageUrl={data.profileImageUrl} initials={initials} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="tm-text-heading" style={{ margin: 0 }}>{data.displayName}</h1>
          {data.nickname ? (
            <div className="tm-text-caption" style={{ marginTop: 4 }}>@{data.nickname}</div>
          ) : null}
        </div>
      </section>
    )}

    <div className="tm-public-profile-main">
    {/* 한 줄 소개 · 소속팀 (Task 154 P1)
        기록이 0건인 프로필이 통계 카드 하나만 남아 완전히 비어 보이던 문제를 메운다.
        둘 다 **있을 때만** 렌더한다 -- 빈 카드를 남기면 채우려던 문제를 오히려 키운다. */}
    {data.bio ? (
      <Card pad={16}>
        <div className="tm-text-body" style={{ whiteSpace: 'pre-wrap', wordBreak: 'keep-all' }}>
          {data.bio}
        </div>
      </Card>
    ) : null}

    {/* 신뢰 신호 카드 */}
    <Card pad={16}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ color: 'var(--text-muted)', display: 'flex' }} aria-hidden="true">
              <ShieldCheck size={16} />
            </span>
            <span className="tm-text-body" style={{ fontWeight: 700 }}>신뢰 신호</span>
          </div>
          <p className="tm-text-caption" style={{ lineHeight: 1.5, margin: '0 0 12px' }}>
            {trust.description}
          </p>
        </div>
        <span className={trust.badgeClass} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
          {trust.icon}{trust.label}
        </span>
      </div>

      {/* 매너 점수 */}
      <div
        // 지면에 색을 까므로 그 위 보조 텍스트를 함께 올린다(globals.css .tm-on-tint).
        // --surface-soft 위에서 grey600 이 4.19:1 이었다(alpha 실측, "아직 없음").
        className="tm-on-tint"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          /* 이 박스는 흰 카드(--card-surface) *내부*라 페이지 배경과 무관하다 —
             --grey50은 다크에서 카드(#1c1e24)와 사실상 같은 값이라 묻힌다. */
          background: 'var(--surface-soft)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-control)',
          padding: '12px 16px',
        }}
        aria-label={mannerDisplay ? `매너 점수 ${mannerDisplay}점 (${trust.label})` : '매너 점수 없음'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Star size={14} style={{ color: mannerDisplay ? 'var(--orange500)' : 'var(--grey300)' }} aria-hidden="true" />
          <span className="tm-text-body" style={{ fontWeight: 600 }}>매너 점수</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          {mannerDisplay ? (
            <>
              <span
                style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}
              >
                {mannerDisplay}
              </span>
              <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>/ 5.0</span>
              <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                ({reputation.reviewCount}개 후기 기준, {trust.label})
              </span>
            </>
          ) : (
            <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>아직 없음</span>
          )}
        </div>
      </div>

      {reputation.highlight ? (
        <p className="tm-text-caption" style={{ marginTop: 12, lineHeight: 1.5 }}>
          <ReviewHighlightLine subject="함께 뛴 사람들이" highlight={reputation.highlight} />
        </p>
      ) : null}

      {/* 안내 문구 */}
      <p className="tm-text-caption" style={{ marginTop: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        매너 점수는 실제 활동 후기를 기반으로 계산돼요. 이메일·전화·생년월일은 공개되지 않아요.
      </p>
    </Card>

    {data.teams && data.teams.length > 0 ? (
      <Card pad={16}>
        <div className="tm-text-label" style={{ marginBottom: 12 }}>소속팀</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {data.teams.map((team) => (
            <Link
              key={team.id}
              href={withFromPath(`/teams/${team.id}`, selfHref)}
              className="tm-btn tm-btn-sm tm-btn-neutral"
              style={{ minHeight: 44, textDecoration: 'none' }}
            >
              {team.name}
            </Link>
          ))}
        </div>
      </Card>
    ) : null}

    <ProfileActivityCard
      summary={activitySummary}
      recent={data.recentActivity ?? null}
      recordsHref={withFromPath(`/users/${userId}/records`, selfHref)}
    />
    </div>
    </div>
  );
}

type ActivityPeriod = 'total' | 'monthly';

/**
 * 활동 수치·최근 경기·기록 입구를 한 카드에 모은다. 누적과 이번 달은 같은 네 칸이라 두 카드로
 * 나란히 두지 않고 탭으로 바꿔 보여 준다. 이번 달의 세 번째 칸은 "팀 가입"이다(누적은 소속 팀 수).
 */
function ProfileActivityCard({
  summary,
  recent,
  recordsHref,
}: {
  readonly summary: V1PublicProfile['activitySummary'];
  readonly recent: V1PublicProfile['recentActivity'] | null;
  readonly recordsHref: string;
}) {
  const [period, setPeriod] = useState<ActivityPeriod>('total');
  const stats = summary
    ? period === 'total'
      ? [
          // "경기"는 개인 매치 + 대회 경기 출전 합산이다("매치"는 개인 매치만 가리키는 관례어).
          { label: '경기', value: summary.totals.matchCount, unit: '회' },
          { label: '대회', value: summary.totals.tournamentCount, unit: '개' },
          { label: '팀', value: summary.totals.teamCount, unit: '개' },
          { label: '후기', value: summary.totals.reviewCount, unit: '개' },
        ]
      : [
          { label: '경기', value: summary.monthly.matchCount, unit: '회' },
          { label: '대회', value: summary.monthly.tournamentCount, unit: '개' },
          { label: '팀 가입', value: summary.monthly.teamJoinCount, unit: '회' },
          { label: '후기', value: summary.monthly.reviewCount, unit: '개' },
        ]
    : null;
  return (
    <Card pad={16}>
      <div className="tm-profile-activity-head">
        <span className="tm-profile-activity-title">
          <Activity size={16} aria-hidden="true" />
          활동
        </span>
        {summary ? (
          <SegmentedTabs
            className="tm-profile-activity-tabs"
            role="tablist"
            ariaLabel="활동 기간"
            activeId={period}
            onSelect={(id) => setPeriod(id as ActivityPeriod)}
            items={[
              { id: 'total', label: '전체' },
              { id: 'monthly', label: '이번 달' },
            ]}
          />
        ) : null}
      </div>
      {stats ? (
        <div className="tm-profile-activity-stats">
          {stats.map((stat) => (
            <div key={stat.label} className="tm-profile-stat">
              <span className="tm-profile-stat-value" aria-label={`${stat.label} ${stat.value}${stat.unit}`}>
                {stat.value}
              </span>
              <span className="tm-text-caption">{stat.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="tm-text-caption" style={{ margin: '12px 0 0', lineHeight: 1.5 }}>
          아직 공개할 활동 요약이 없어요.
        </p>
      )}
      {recent ? (
        <p className="tm-profile-activity-recent tm-text-caption">
          <span style={{ color: 'var(--text-muted)' }}>최근 경기</span>
          {' · '}
          <strong className="tm-profile-activity-recent-team">{recent.teamName}</strong>
          {recent.jerseyNumber !== null ? ` · ${recent.jerseyNumber}번` : ''}
          {recent.position ? ` · ${recent.position}` : ''}
          {' · '}
          {formatTournamentDateShort(recent.playedAt)}
        </p>
      ) : null}
      <Link href={recordsHref} className="tm-pressable tm-profile-activity-link">
        활동 기록 전체 보기
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
    </Card>
  );
}

/**
 * 프로필 사진은 배경 이미지로만 깔려 있어서 URL 이 깨지면 이니셜도 없이 빈 원이 남았다
 * (2026-09-04 감사). 실제 <img> 로 그려 onError 때 이니셜로 되돌린다.
 */
export function ProfileAvatar({
  imageUrl,
  initials,
  size,
}: {
  imageUrl?: string | null;
  initials: string;
  /** px 지정 시 기본 64px(.tm-my-avatar) 대신 이 크기로 그린다 — 폰트도 같은 비율로 줄인다. */
  size?: number;
}) {
  // 실패는 URL 단위로 기억한다 — boolean 하나면 프로필을 갱신해 새 사진을 받아도
  // 이전 실패가 남아 계속 이니셜만 보인다(#1027 Copilot).
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(imageUrl) && failedUrl !== imageUrl;
  const style = size ? { width: size, height: size, fontSize: Math.round(size * 0.375) } : undefined;
  return (
    <div className="tm-my-avatar" style={style}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- 업로드 원본 URL 이 외부 호스트일 수 있어 최적화 로더를 태우지 않는다.
        <img src={imageUrl ?? ''} alt="" aria-hidden="true" onError={() => setFailedUrl(imageUrl ?? null)} />
      ) : (
        initials
      )}
    </div>
  );
}
