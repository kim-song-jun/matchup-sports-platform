'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CalendarDays, MapPin, Users, Trophy, Sparkles } from 'lucide-react';
import { AppChrome } from '@/components/v1-ui/shell';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { getTournamentStatusConfig } from '@/lib/v1-tournament-status';
import { getSportAccent } from '@/lib/v1-sport-accent';
import {
  formatTournamentDateRangeShort,
  formatEntryFee,
} from '@/lib/date-utils';
import { publicAssetPath } from '@/lib/assets';
import { extractErrorMessage } from '@/lib/error-message';
import { useV1TournamentCampaigns } from '@/hooks/use-v1-tournament-campaign';
import { useV1MasterSports } from '@/hooks/use-v1-api';
import type { V1TournamentCampaignListItem } from '@/types/tournament-campaign';

export default function EventsPage() {
  return (
    <AppChrome title="이벤트" activeTab="tournaments" showNotifications>
      <EventsContent />
    </AppChrome>
  );
}

function EventsContent() {
  const [activeSportCode, setActiveSportCode] = useState<string | undefined>(undefined);
  const { data: sportsData } = useV1MasterSports();
  const { data, isLoading, isError, error } = useV1TournamentCampaigns({
    sportCode: activeSportCode,
    limit: 30,
  });

  const filterSports = (sportsData ?? []).filter((s) => s.code).map((s) => ({
    code: s.code as string,
    label: s.name,
  }));

  return (
    <div style={{ padding: '0 0 32px' }}>
      {/* 헤더 */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Sparkles size={18} style={{ color: 'var(--blue500)' }} aria-hidden="true" />
          <h1 className="tm-text-heading" style={{ margin: 0 }}>이벤트 허브</h1>
        </div>
        <p className="tm-text-caption" style={{ marginTop: 4 }}>
          팀밋이 준비한 대회와 이벤트를 한눈에 확인해 보세요.
        </p>
      </div>

      {/* 종목 필터 */}
      {filterSports.length > 0 ? (
        <div
          role="tablist"
          aria-label="종목 필터"
          style={{
            display: 'flex',
            gap: 8,
            padding: '16px 20px 0',
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          <button
            role="tab"
            aria-selected={activeSportCode === undefined}
            type="button"
            onClick={() => setActiveSportCode(undefined)}
            className="tm-chip"
            style={{
              flexShrink: 0,
              background: activeSportCode === undefined ? 'var(--blue500)' : 'var(--grey100)',
              color: activeSportCode === undefined ? '#fff' : 'var(--text-strong)',
            }}
          >
            전체
          </button>
          {filterSports.map((s) => (
            <button
              key={s.code}
              role="tab"
              aria-selected={activeSportCode === s.code}
              type="button"
              onClick={() => setActiveSportCode((prev) => prev === s.code ? undefined : s.code)}
              className="tm-chip"
              style={{
                flexShrink: 0,
                background: activeSportCode === s.code ? 'var(--blue500)' : 'var(--grey100)',
                color: activeSportCode === s.code ? '#fff' : 'var(--text-strong)',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* 목록 */}
      <div style={{ padding: '16px 20px 0' }}>
        {isLoading ? (
          <EventListSkeleton />
        ) : isError ? (
          <ErrorState
            title="이벤트를 불러오지 못했어요"
            message={extractErrorMessage(error, '잠시 후 다시 시도해 주세요.')}
          />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<Sparkles size={36} />}
            title="등록된 이벤트가 없어요"
            sub="진행 예정 대회가 캠페인으로 등록되면 여기에 나타나요."
          />
        ) : (
          <ul
            role="list"
            style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}
            aria-label={`이벤트 목록, ${data.items.length}개`}
          >
            {data.items.map((item) => (
              <li key={item.id} role="listitem">
                <EventCard item={item} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EventCard({ item }: { readonly item: V1TournamentCampaignListItem }) {
  const sportAccent = getSportAccent(item.tournament.sport.code);
  const status = getTournamentStatusConfig(item.tournament.status);
  const dateLabel = formatTournamentDateRangeShort(
    item.tournament.scheduledAt,
    item.tournament.scheduledEndAt,
  );
  const pendingPaymentCount = Math.max(0, item.tournament.pendingPaymentCount);

  return (
    <Link
      href={`/tournaments/campaigns/${item.slug}`}
      className="tm-card tm-pressable"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, textDecoration: 'none', overflow: 'hidden' }}
      aria-label={`${item.heroTitle} — ${item.tournament.sport.name} — ${status.label}`}
    >
      {/* 히어로 이미지 */}
      {item.heroImageUrl ? (
        <div
          aria-hidden="true"
          style={{
            margin: '-16px -16px 0',
            height: 160,
            overflow: 'hidden',
            background: 'var(--grey100)',
          }}
        >
          <img
            src={publicAssetPath(item.heroImageUrl)}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          style={{
            margin: '-16px -16px 0',
            height: 100,
            background: `linear-gradient(135deg, ${sportAccent.dot} 0%, ${sportAccent.gradientTo ?? sportAccent.dot} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Trophy size={40} style={{ color: 'rgba(255,255,255,0.8)' }} aria-hidden="true" />
        </div>
      )}

      {/* 타이틀 + 배지 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          {/* 종목 뱃지 */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 999,
              background: sportAccent.badgeBg,
              marginBottom: 6,
            }}
            aria-label={`종목: ${item.tournament.sport.name}`}
          >
            <span
              aria-hidden="true"
              style={{ width: 6, height: 6, borderRadius: 999, background: sportAccent.dot, flexShrink: 0 }}
            />
            <span style={{ fontSize: 11, fontWeight: 600, color: sportAccent.badgeText, lineHeight: 1 }}>
              {item.tournament.sport.name}
            </span>
          </span>
          <h2 className="tm-text-body-lg" style={{ margin: 0, lineHeight: 1.35 }}>
            {item.heroTitle}
          </h2>
          {item.heroSummary ? (
            <p className="tm-text-caption" style={{ marginTop: 4, lineHeight: 1.4 }}>
              {item.heroSummary}
            </p>
          ) : null}
        </div>
        <span className={`tm-badge ${status.badgeClass}`} style={{ flexShrink: 0 }}>
          {status.label}
        </span>
      </div>

      {/* 메타 정보 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
        {dateLabel ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }} aria-label={`일정: ${dateLabel}`}>
            <CalendarDays size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />
            <span className="tm-text-caption">{dateLabel}</span>
          </span>
        ) : null}
        {item.tournament.venue ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }} aria-label={`장소: ${item.tournament.venue}`}>
            <MapPin size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />
            <span className="tm-text-caption" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
              {item.tournament.venue}
            </span>
          </span>
        ) : null}
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          aria-label={`참가 현황: ${item.tournament.confirmedCount}팀 확정, 총 ${item.tournament.teamCount}팀`}
        >
          <Users size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />
          <span className="tm-text-caption">
            {pendingPaymentCount > 0
              ? `${item.tournament.confirmedCount}팀 확정 · ${pendingPaymentCount}팀 입금 대기 / ${item.tournament.teamCount}팀`
              : `${item.tournament.confirmedCount}/${item.tournament.teamCount}팀`}
          </span>
        </span>
      </div>

      {/* 참가비 + availability 행 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid var(--grey100)',
          paddingTop: 10,
        }}
      >
        <span className="tm-text-body" style={{ fontWeight: 700, color: 'var(--blue500)' }}>
          {formatEntryFee(item.tournament.entryFee)}
        </span>
        {item.tournament.prizeSummary ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Trophy size={13} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
            <span className="tm-text-caption">{item.tournament.prizeSummary}</span>
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function EventListSkeleton() {
  return (
    <ul
      role="list"
      style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}
      aria-label="이벤트 불러오는 중"
      aria-busy="true"
    >
      {[1, 2, 3].map((i) => (
        <li key={i} className="tm-review-skeleton" style={{ height: 260, borderRadius: 16 }} />
      ))}
    </ul>
  );
}
