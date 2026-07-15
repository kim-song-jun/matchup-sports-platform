'use client';

import { AppChrome } from '@/components/v1-ui/shell';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import { useV1PublicProfile } from '@/hooks/use-v1-api';
import { cssUrl } from '@/lib/assets';
import { ShieldCheck, TrendingUp, Activity, Star, AlertCircle } from 'lucide-react';
import type { TrustState } from '@/types/api';

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
        description: '아직 검증된 활동 기록이 없어요. 매치·팀·대회에 참가해 보세요.',
        badgeClass: 'tm-badge tm-badge-grey',
        icon: <AlertCircle size={15} aria-hidden="true" />,
      };
  }
}

export function PublicProfilePageClient({ userId }: { userId: string }) {
  const profile = useV1PublicProfile(userId);

  if (profile.isLoading) {
    return (
      <AppChrome title="프로필" activeTab="teams" bottomNav={false} backHref="/teams">
        <div className="tm-my-shell" aria-busy="true" aria-label="프로필 불러오는 중">
          <div className="tm-review-skeleton" style={{ minHeight: 156, borderRadius: 16 }} />
          <div className="tm-review-skeleton" style={{ minHeight: 112, borderRadius: 16, marginTop: 12 }} />
          <div className="tm-review-skeleton" style={{ minHeight: 112, borderRadius: 16, marginTop: 12 }} />
        </div>
      </AppChrome>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <AppChrome title="프로필" activeTab="teams" bottomNav={false} backHref="/teams">
        <ErrorState
          title="프로필을 불러오지 못했어요"
          message="사용자를 찾을 수 없거나 잠시 후 다시 확인이 필요해요."
          onRetry={() => profile.refetch()}
        />
      </AppChrome>
    );
  }

  const data = profile.data;
  const { reputation, activitySummary } = data;
  const initials = Array.from(data.displayName || data.nickname || '?')[0] ?? '?';
  const avatarStyle = data.profileImageUrl ? { backgroundImage: cssUrl(data.profileImageUrl) } : undefined;
  const trust = trustConfig(reputation.trustState);
  const mannerDisplay = reputation.mannerScore !== null
    ? reputation.mannerScore.toFixed(1)
    : null;

  return (
    <AppChrome title="프로필" activeTab="teams" bottomNav={false} backHref="/teams">
      <div className="tm-my-shell">
        {/* 헤더 — 아바타 + 이름 */}
        <section className="tm-my-profile-head" aria-label="사용자 정보">
          <div className="tm-my-avatar" style={avatarStyle}>{data.profileImageUrl ? null : initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="tm-text-heading" style={{ margin: 0 }}>{data.displayName}</h1>
            {data.nickname ? (
              <div className="tm-text-caption" style={{ marginTop: 4 }}>@{data.nickname}</div>
            ) : null}
          </div>
        </section>

        {/* 신뢰 신호 카드 */}
        <Card pad={16}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
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
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--grey50)',
              borderRadius: 12,
              padding: '10px 14px',
            }}
            aria-label={mannerDisplay ? `매너 점수 ${mannerDisplay}점 (${trust.label})` : '매너 점수 없음'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Star size={14} style={{ color: mannerDisplay ? 'var(--orange500)' : 'var(--grey300)' }} aria-hidden="true" />
              <span className="tm-text-body" style={{ fontWeight: 600 }}>매너 점수</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
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

          {/* 안내 문구 */}
          <p className="tm-text-caption" style={{ marginTop: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            매너 점수는 실제 활동 후기를 기반으로 계산돼요. 이메일·전화·생년월일은 공개되지 않아요.
          </p>
        </Card>

        {/* 활동 요약 */}
        {activitySummary ? (
          <>
            <Card pad={16}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <span style={{ color: 'var(--text-muted)', display: 'flex' }} aria-hidden="true">
                  <Activity size={16} />
                </span>
                <span className="tm-text-body" style={{ fontWeight: 700 }}>활동 요약</span>
              </div>
              <div className="tm-my-profile-stats">
                <StatItem label="매치" value={activitySummary.totals.matchCount} unit="회" />
                <StatItem label="팀" value={activitySummary.totals.teamCount} unit="개" />
                <StatItem label="후기" value={activitySummary.totals.reviewCount} unit="개" />
              </div>
            </Card>

            <Card pad={16}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <span style={{ color: 'var(--text-muted)', display: 'flex' }} aria-hidden="true">
                  <TrendingUp size={16} />
                </span>
                <span className="tm-text-body" style={{ fontWeight: 700 }}>이번 달 활동</span>
              </div>
              <div className="tm-my-monthly">
                <StatItem label="매치" value={activitySummary.monthly.matchCount} unit="회" />
                <StatItem label="팀 가입" value={activitySummary.monthly.teamJoinCount} unit="회" />
                <StatItem label="후기" value={activitySummary.monthly.reviewCount} unit="개" />
              </div>
            </Card>
          </>
        ) : (
          <Card pad={16}>
            <p className="tm-text-body-lg" style={{ marginBottom: 6 }}>활동 요약 없음</p>
            <p className="tm-text-caption" style={{ lineHeight: 1.5 }}>
              아직 공개할 활동 요약이 없어요.
            </p>
          </Card>
        )}
      </div>
    </AppChrome>
  );
}

function StatItem({ label, value, unit }: { readonly label: string; readonly value: number; readonly unit: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <span
        style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}
        aria-label={`${label} ${value}${unit}`}
      >
        {value}
      </span>
      <span className="tm-text-caption">{label}</span>
    </div>
  );
}
