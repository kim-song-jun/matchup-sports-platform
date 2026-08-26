'use client';

import Link from 'next/link';
import { formatTournamentDateShort } from '@/lib/date-utils';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import { useV1AuthMe, useV1PublicProfile } from '@/hooks/use-v1-api';
import { cssUrl } from '@/lib/assets';
import { PlayerCard } from './player-card';
import { ShieldCheck, TrendingUp, Activity, Star, AlertCircle, ChevronRight } from 'lucide-react';
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
  /**
   * 본인 여부. 적대 검증(2026-08-25)에서 isOwner=false 하드코딩이 확정됐다 -- 주인이
   * '내 프로필'로 자기 공개 프로필에 와도 남의 시점으로 렌더돼 진행도·해금 안내가
   * 사라졌다. 세션 확인 실패(비로그인 4xx)는 곧 '본인 아님'이므로 재시도하지 않는다.
   */
  const authMe = useV1AuthMe({ retry: false });

  if (profile.isLoading) {
    return (
      <AppChrome title="프로필" activeTab="teams" bottomNav={false} backHref="/teams" desktopHead>
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
      <AppChrome title="프로필" activeTab="teams" bottomNav={false} backHref="/teams" desktopHead>
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
    <AppChrome title="프로필" activeTab="teams" bottomNav={false} backHref="/teams" desktopHead>
      <div className="tm-my-shell">
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
              shareHref={`/users/${userId}/card`}
              belowCardSlot={
                <div className="tm-pcard-identity">
                  <h1 className="tm-pcard-identity-name">{data.displayName}</h1>
                  {data.nickname ? <div className="tm-pcard-identity-meta">@{data.nickname}</div> : null}
                </div>
              }
            />
        ) : (
          <section className="tm-my-profile-head" aria-label="사용자 정보">
            <div className="tm-my-avatar" style={avatarStyle}>{data.profileImageUrl ? null : initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className="tm-text-heading" style={{ margin: 0 }}>{data.displayName}</h1>
              {data.nickname ? (
                <div className="tm-text-caption" style={{ marginTop: 4 }}>@{data.nickname}</div>
              ) : null}
            </div>
          </section>
        )}

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
        {/* 최근 활동 한 줄 (Task 154 P2-3). 새로 공개되는 정보가 아니라 기록 목록에
            이미 있는 값을 앞으로 당긴 것이다 -- 같은 게이트를 통과한 것만 서버가 준다. */}
        {data.recentActivity ? (
          <Card pad={16}>
            <div className="tm-text-label" style={{ marginBottom: 8 }}>최근 활동</div>
            <div className="tm-text-body">
              {data.recentActivity.teamName}
              {data.recentActivity.jerseyNumber !== null ? ` · ${data.recentActivity.jerseyNumber}번` : ''}
              {data.recentActivity.position ? ` · ${data.recentActivity.position}` : ''}
            </div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>
              {formatTournamentDateShort(data.recentActivity.playedAt)}
            </div>
          </Card>
        ) : null}
        {data.teams && data.teams.length > 0 ? (
          <Card pad={16}>
            <div className="tm-text-label" style={{ marginBottom: 12 }}>소속팀</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {data.teams.map((team) => (
                <Link
                  key={team.id}
                  href={`/teams/${team.id}`}
                  className="tm-btn tm-btn-sm tm-btn-neutral"
                  style={{ minHeight: 44, textDecoration: 'none' }}
                >
                  {team.name}
                </Link>
              ))}
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
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              /* 이 박스는 흰 카드(--card-surface) *내부*라 페이지 배경과 무관하다 —
                 --grey50은 다크에서 카드(#1c1e24)와 사실상 같은 값이라 묻힌다. */
              background: 'var(--surface-soft)',
              border: '1px solid var(--border)',
              borderRadius: 12,
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

          {/* 안내 문구 */}
          <p className="tm-text-caption" style={{ marginTop: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            매너 점수는 실제 활동 후기를 기반으로 계산돼요. 이메일·전화·생년월일은 공개되지 않아요.
          </p>
        </Card>

        {/* 활동 요약 */}
        {activitySummary ? (
          <>
            <Card pad={16}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ color: 'var(--text-muted)', display: 'flex' }} aria-hidden="true">
                  <Activity size={16} />
                </span>
                <span className="tm-text-body" style={{ fontWeight: 700 }}>활동 요약</span>
              </div>
              {/* 항목이 3개에서 4개로 늘어 3열 그리드(`tm-my-profile-stats`)로는 마지막 칸이
               * 혼자 다음 줄로 떨어진다. 아래 "이번 달 활동"과 같은 2×2 그리드를 써서 두 카드의
               * 리듬을 맞춘다. */}
              <div className="tm-my-monthly">
                {/* "매치"는 개인 매치만 가리키는 이 플랫폼의 관례어인데, matchCount 는 이제
                 * 개인 매치 + 대회 경기 출전 수를 합친 값이다(GET /users/:id/public-profile
                 * activitySummary.totals.matchCount). 라벨을 그대로 두면 대회에서 뛴 사람의
                 * 숫자가 실제보다 부풀어 보이는 걸 "매치 집계 오류"로 오해할 수 있어 개인
                 * 매치·대회 경기를 모두 포괄하는 "경기"로 바꾼다. */}
                <StatItem label="경기" value={activitySummary.totals.matchCount} unit="회" />
                {/* 경기 수만 보면 "한 대회에서 여러 경기"와 "여러 대회를 한 경기씩"이 구분되지
                 * 않는다. 참가한 **대회 수**(중복 제거)를 따로 보여준다. */}
                <StatItem label="대회" value={activitySummary.totals.tournamentCount} unit="개" />
                <StatItem label="팀" value={activitySummary.totals.teamCount} unit="개" />
                <StatItem label="후기" value={activitySummary.totals.reviewCount} unit="개" />
              </div>
            </Card>

            <Card pad={16}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ color: 'var(--text-muted)', display: 'flex' }} aria-hidden="true">
                  <TrendingUp size={16} />
                </span>
                <span className="tm-text-body" style={{ fontWeight: 700 }}>이번 달 활동</span>
              </div>
              <div className="tm-my-monthly">
                {/* totals와 동일한 이유로 "경기"로 통일 — monthly.matchCount 도 이번 달
                 * 개인 매치 + 대회 경기 출전 수 합산이다. */}
                <StatItem label="경기" value={activitySummary.monthly.matchCount} unit="회" />
                <StatItem label="대회" value={activitySummary.monthly.tournamentCount} unit="개" />
                <StatItem label="팀 가입" value={activitySummary.monthly.teamJoinCount} unit="회" />
                <StatItem label="후기" value={activitySummary.monthly.reviewCount} unit="개" />
              </div>
            </Card>
          </>
        ) : (
          <Card pad={16}>
            <p className="tm-text-body-lg" style={{ marginBottom: 8 }}>활동 요약 없음</p>
            <p className="tm-text-caption" style={{ lineHeight: 1.5 }}>
              아직 공개할 활동 요약이 없어요.
            </p>
          </Card>
        )}

        <Link
          href={`/users/${userId}/records`}
          className="tm-pressable"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '16px 16px',
            background: 'var(--bg)',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <div>
            <div className="tm-text-label">활동 기록 전체 보기</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>참여한 경기와 결과 기록을 자세히 확인해요.</div>
          </div>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
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
