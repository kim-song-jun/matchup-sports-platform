'use client';

import { AppChrome } from '@/components/v1-ui/shell';
import { Card, ErrorState, KPIStat } from '@/components/v1-ui/primitives';
import { useV1PublicProfile } from '@/hooks/use-v1-api';
import { cssUrl } from '@/lib/assets';

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
  const initials = Array.from(data.displayName || data.nickname || '사용자')[0] ?? '?';
  const avatarStyle = data.profileImageUrl ? { backgroundImage: cssUrl(data.profileImageUrl) } : undefined;
  const nickname = data.nickname ? `@${data.nickname}` : '닉네임 없음';
  const activitySummary = data.activitySummary;

  return (
    <AppChrome title="프로필" activeTab="teams" bottomNav={false} backHref="/teams">
      <div className="tm-my-shell">
        <section className="tm-my-profile-head">
          <div className="tm-my-avatar" style={avatarStyle}>{data.profileImageUrl ? null : initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="tm-text-heading" style={{ margin: 0 }}>{data.displayName}</h1>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>{nickname}</div>
            {data.bio ? (
              <div className="tm-text-caption" style={{ marginTop: 8, lineHeight: 1.5 }}>{data.bio}</div>
            ) : null}
          </div>
        </section>

        {data.visibilityStatus === 'private' || !activitySummary ? (
          <Card pad={16}>
            <div className="tm-text-body-lg">비공개 프로필</div>
            <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.5 }}>
              이 사용자는 활동 요약을 공개하지 않았어요.
            </div>
          </Card>
        ) : (
          <>
            <Card pad={16}>
              <div className="tm-text-body-lg">활동 요약</div>
              <div className="tm-my-profile-stats">
                <KPIStat label="매치" value={activitySummary.totals.matchCount} unit="회" />
                <KPIStat label="팀" value={activitySummary.totals.teamCount} unit="개" />
                <KPIStat label="후기" value={activitySummary.totals.reviewCount} unit="개" />
              </div>
            </Card>
            <Card pad={16}>
              <div className="tm-text-body-lg">이번 달 활동</div>
              <div className="tm-my-monthly">
                <KPIStat label="매치" value={activitySummary.monthly.matchCount} unit="회" />
                <KPIStat label="팀 가입" value={activitySummary.monthly.teamJoinCount} unit="회" />
                <KPIStat label="후기" value={activitySummary.monthly.reviewCount} unit="개" />
              </div>
            </Card>
          </>
        )}
      </div>
    </AppChrome>
  );
}
