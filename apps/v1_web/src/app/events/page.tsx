'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';
import { useV1TournamentCampaignsInfinite } from '@/hooks/use-v1-tournament-campaign';
import { useV1MasterSports } from '@/hooks/use-v1-api';
import { EventCampaignCard } from '@/components/tournaments/event-campaign-card';
import styles from './events-page.module.css';

const TRANSPORT_ERROR_MESSAGE = /^(failed to fetch|load failed|network(?: error| request failed| unavailable)?)$/i;
const NO_LOCAL_SPORT_DRAFT = Symbol('no-local-sport-draft');

function getEventErrorMessage(error: unknown, fallback: string) {
  const message = extractErrorMessage(error, fallback).trim();
  return TRANSPORT_ERROR_MESSAGE.test(message) ? fallback : message;
}

export default function EventsPage() {
  return (
    <Suspense fallback={<EventListSkeleton />}>
      <EventsContent />
    </Suspense>
  );
}

function EventsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedSportCode = searchParams.get('sport');
  const requestedSportHasValidSyntax = requestedSportCode !== null && /^[a-z0-9-]{1,40}$/i.test(requestedSportCode);
  const [, setActiveSportCode] = useState<string | undefined>(undefined);
  const observedUrlSportCode = useRef<string | null>(requestedSportCode);
  const pendingLocalSportCode = useRef<string | undefined | typeof NO_LOCAL_SPORT_DRAFT>(NO_LOCAL_SPORT_DRAFT);
  const { data: sportsData, isError: isSportsError, refetch: refetchSports } = useV1MasterSports();
  const validatedSportCode = requestedSportHasValidSyntax && sportsData?.some((sport) => sport.code === requestedSportCode)
    ? requestedSportCode
    : undefined;
  const requestedSportIsUnknown = requestedSportHasValidSyntax && sportsData !== undefined && validatedSportCode === undefined;
  // A local click must win until the router acknowledges that same URL. A different URL
  // means browser back/forward or an external navigation; the effect clears that draft.
  const urlChanged = requestedSportCode !== observedUrlSportCode.current;
  const localDraftIsPending = pendingLocalSportCode.current !== NO_LOCAL_SPORT_DRAFT
    && pendingLocalSportCode.current !== (requestedSportCode ?? undefined)
    && !urlChanged;
  const localDraftIsValid = localDraftIsPending && typeof pendingLocalSportCode.current === 'string'
    && /^[a-z0-9-]{1,40}$/i.test(pendingLocalSportCode.current);
  const campaignsQueryEnabled = isSportsError || requestedSportCode === null || !requestedSportHasValidSyntax
    || (requestedSportHasValidSyntax && !requestedSportIsUnknown && sportsData !== undefined)
    || (localDraftIsValid && sportsData !== undefined);
  const masterSportResolutionPending = requestedSportHasValidSyntax && !isSportsError && (sportsData === undefined || requestedSportIsUnknown);
  const effectiveSportCode: string | undefined = localDraftIsPending
    ? (typeof pendingLocalSportCode.current === 'string' ? pendingLocalSportCode.current : undefined)
    : validatedSportCode;
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
    sportCode: isSportsError && sportsData === undefined ? undefined : effectiveSportCode,
    enabled: campaignsQueryEnabled,
    limit: 30,
  });
  const items = data?.pages.flatMap((page) => page.items) ?? [];

  const filterSports = (sportsData ?? []).filter((s) => s.code).map((s) => ({
    code: s.code as string,
    label: s.name,
  }));

  useEffect(() => {
    const requestedSport = searchParams.get('sport');
    if (urlChanged) {
      observedUrlSportCode.current = requestedSport;
      pendingLocalSportCode.current = NO_LOCAL_SPORT_DRAFT;
    } else if (localDraftIsPending) {
      return;
    }
    if (!sportsData) return;
    const validSyntax = requestedSport === null || /^[a-z0-9-]{1,40}$/i.test(requestedSport);
    const validMasterSport = requestedSport === null || sportsData.some((sport) => sport.code === requestedSport);
    if (!validSyntax || !validMasterSport) {
      setActiveSportCode(undefined);
      pendingLocalSportCode.current = NO_LOCAL_SPORT_DRAFT;
      router.replace('/events', { scroll: false });
      return;
    }
    setActiveSportCode(requestedSport ?? undefined);
    observedUrlSportCode.current = requestedSport;
  }, [router, searchParams, sportsData]);

  const updateSportFilter = (sportCode: string | undefined) => {
    const nextCode = sportCode && filterSports.some((sport) => sport.code === sportCode)
      ? sportCode
      : undefined;
    setActiveSportCode(nextCode);
    pendingLocalSportCode.current = nextCode;
    router.replace(nextCode ? `/events?sport=${encodeURIComponent(nextCode)}` : '/events', { scroll: false });
  };

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <div className={styles.titleRow}>
          <Sparkles size={20} aria-hidden="true" />
          <h1 className="tm-text-heading">팀밋이 여는 대회</h1>
        </div>
        <p>
          팀밋이 직접 기획해 여는 대회예요. 지금 참가할 수 있는 대회부터 결과와 시상까지 한눈에 확인하세요.
        </p>
      </header>

      {/* 종목 필터 */}
      {filterSports.length > 0 ? (
        <div role="group" aria-label="종목 필터" className={styles.filters}>
          <button
            aria-pressed={effectiveSportCode === undefined}
            type="button"
            onClick={() => updateSportFilter(undefined)}
            className={`tm-chip ${styles.filter} ${effectiveSportCode === undefined ? 'tm-chip-active' : ''}`}
          >
            전체
          </button>
          {filterSports.map((s) => (
            <button
              key={s.code}
              aria-pressed={effectiveSportCode === s.code}
              type="button"
              onClick={() => updateSportFilter(effectiveSportCode === s.code ? undefined : s.code)}
              className={`tm-chip ${styles.filter} ${effectiveSportCode === s.code ? 'tm-chip-active' : ''}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : isSportsError ? (
        <ErrorState
          message="종목 필터를 불러오지 못했어요. 이벤트 목록은 계속 확인할 수 있어요."
          onRetry={() => void refetchSports()}
        />
      ) : null}

      {/* 목록 */}
      <div className={styles.listSection}>
        {masterSportResolutionPending || isLoading ? (
          <EventListSkeleton />
        ) : isError && !data ? (
          <ErrorState
            title="이벤트를 불러오지 못했어요"
            message={getEventErrorMessage(error, '잠시 후 다시 시도해 주세요.')}
            onRetry={() => void refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            illustration={{ name: 'journey-done' }}
            title="등록된 이벤트가 없어요"
            sub="진행 예정 대회가 캠페인으로 등록되면 여기에 나타나요."
            cta="대회 목록 보기"
            ctaHref="/tournaments"
          />
        ) : (
          <>
            <ul role="list" className={styles.grid} aria-label={`이벤트 목록, ${items.length}개`}>
              {items.map((item) => (
                <li key={item.id} role="listitem">
                  <EventCampaignCard item={item} activeSportCode={effectiveSportCode} />
                </li>
              ))}
            </ul>
            {isFetchNextPageError ? (
              <ErrorState
                message={getEventErrorMessage(error, '다음 이벤트를 불러오지 못했어요.')}
                onRetry={() => void fetchNextPage()}
              />
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
