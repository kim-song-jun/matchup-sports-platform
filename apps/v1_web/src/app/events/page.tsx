'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { AppChrome } from '@/components/v1-ui/shell';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';
import { useV1TournamentCampaignsInfinite } from '@/hooks/use-v1-tournament-campaign';
import { useV1MasterSports } from '@/hooks/use-v1-api';
import { EventCampaignCard } from '@/components/tournaments/event-campaign-card';
import styles from './events-page.module.css';

const TRANSPORT_ERROR_MESSAGE = /^(failed to fetch|load failed|network(?: error| request failed| unavailable)?)$/i;

function getEventErrorMessage(error: unknown, fallback: string) {
  const message = extractErrorMessage(error, fallback).trim();
  return TRANSPORT_ERROR_MESSAGE.test(message) ? fallback : message;
}

export default function EventsPage() {
  return (
    <AppChrome title="이벤트" activeTab="tournaments" showNotifications>
      <EventsContent />
    </AppChrome>
  );
}

function EventsContent() {
  const [activeSportCode, setActiveSportCode] = useState<string | undefined>(undefined);
  useEffect(() => {
    const sportCode = new URLSearchParams(window.location.search).get('sport');
    if (sportCode && /^[a-z0-9-]{1,40}$/i.test(sportCode)) {
      setActiveSportCode(sportCode);
    }
  }, []);
  const { data: sportsData } = useV1MasterSports();
  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    refetch,
  } = useV1TournamentCampaignsInfinite({
    sportCode: activeSportCode,
    limit: 30,
  });
  const items = data?.pages.flatMap((page) => page.items) ?? [];

  const filterSports = (sportsData ?? []).filter((s) => s.code).map((s) => ({
    code: s.code as string,
    label: s.name,
  }));

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <div className={styles.titleRow}>
          <Sparkles size={20} aria-hidden="true" />
          <h1 className="tm-text-heading">이벤트 허브</h1>
        </div>
        <p>
          지금 참가할 수 있는 대회부터 결과와 시상까지, 팀밋의 주요 이벤트를 한눈에 확인하세요.
        </p>
      </header>

      {/* 종목 필터 */}
      {filterSports.length > 0 ? (
        <div role="group" aria-label="종목 필터" className={styles.filters}>
          <button
            aria-pressed={activeSportCode === undefined}
            type="button"
            onClick={() => setActiveSportCode(undefined)}
            className={`tm-chip ${styles.filter} ${activeSportCode === undefined ? 'tm-chip-active' : ''}`}
          >
            전체
          </button>
          {filterSports.map((s) => (
            <button
              key={s.code}
              aria-pressed={activeSportCode === s.code}
              type="button"
              onClick={() => setActiveSportCode((prev) => prev === s.code ? undefined : s.code)}
              className={`tm-chip ${styles.filter} ${activeSportCode === s.code ? 'tm-chip-active' : ''}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* 목록 */}
      <div className={styles.listSection}>
        {isLoading ? (
          <EventListSkeleton />
        ) : isError && !data ? (
          <ErrorState
            title="이벤트를 불러오지 못했어요"
            message={getEventErrorMessage(error, '잠시 후 다시 시도해 주세요.')}
            onRetry={() => void refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Sparkles size={36} />}
            title="등록된 이벤트가 없어요"
            sub="진행 예정 대회가 캠페인으로 등록되면 여기에 나타나요."
          />
        ) : (
          <>
            <ul role="list" className={styles.grid} aria-label={`이벤트 목록, ${items.length}개`}>
              {items.map((item) => (
                <li key={item.id} role="listitem">
                  <EventCampaignCard item={item} activeSportCode={activeSportCode} />
                </li>
              ))}
            </ul>
            {isFetchNextPageError ? (
              <div role="alert" className={`tm-card ${styles.paginationError}`}>
                <p className="tm-text-caption" style={{ margin: 0 }}>
                  {getEventErrorMessage(error, '다음 이벤트를 불러오지 못했어요.')}
                </p>
              </div>
            ) : null}
            {hasNextPage ? (
              <button
                type="button"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
                className={`tm-btn tm-btn-md tm-btn-neutral tm-btn-block ${styles.moreButton}`}
              >
                {isFetchingNextPage ? '불러오는 중…' : '더 보기'}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function EventListSkeleton() {
  return (
    <ul role="list" className={styles.grid} aria-label="이벤트 불러오는 중" aria-busy="true">
      {[1, 2, 3].map((i) => (
        <li key={i} className={`tm-review-skeleton ${styles.skeleton}`} />
      ))}
    </ul>
  );
}
