'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
// 리그 수상 페이지(league-awards-page-client.tsx)가 이미 쓰는 cross-import 선례를
// 그대로 따른다 — 공동 순위(표준 경쟁 순위 1,1,3)는 이 함수 하나가 단일 소스다.
import { competitionRanks } from '@/app/league-matches/[leagueId]/league-match-standings-client';
import type { PublicTournamentPlayerRecordRow } from './types';

/**
 * 회고 STATS-1 — 대회 개인 득점·도움 랭킹 섹션(프레젠테이셔널).
 *
 * 데이터를 props로 받는다: `ScheduleContent`처럼 페이지 클라이언트가 훅을 돌리고
 * 내려주는 이 디렉터리의 관례를 따르고, QueryClientProvider 없이도 단위 테스트가
 * 가능하게 유지한다(훅은 `usePublicTournamentPlayerRecords`).
 *
 * `emptyBehavior` — 두 표면의 빈 상태 정책이 다르다:
 * - 일정 화면('hide'): 폴링이 도는 밀도 높은 화면이라 기록이 없으면 섹션 자체를
 *   그리지 않는다(빈 골격이 일정을 밀어내지 않게).
 * - 수상 페이지('empty-state'): 기록을 보러 오는 목적지라 리그 순위 화면과 같은
 *   EmptyState 문구를 보여준다.
 */
export function TournamentPlayerRecordsSections({
  goals,
  assists,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  emptyBehavior,
}: {
  goals: PublicTournamentPlayerRecordRow[] | undefined;
  assists: PublicTournamentPlayerRecordRow[] | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  onRetry: () => void;
  emptyBehavior: 'hide' | 'empty-state';
}) {
  const goalRows = goals ?? [];
  const assistRows = assists ?? [];
  const goalRanks = useMemo(() => competitionRanks(goalRows.map((row) => row.goals)), [goalRows]);
  const assistRanks = useMemo(
    () => competitionRanks(assistRows.map((row) => row.assists)),
    [assistRows],
  );

  if (isError) {
    return <ErrorState message={errorMessage} onRetry={onRetry} />;
  }
  if (isLoading) {
    return emptyBehavior === 'hide' ? null : (
      <div className="tm-skeleton" style={{ height: 80, borderRadius: 12 }} />
    );
  }
  if (goalRows.length === 0 && assistRows.length === 0) {
    return emptyBehavior === 'hide' ? null : (
      <section>
        <h3 className="tm-hub-section-title" style={{ marginBottom: 10 }}>개인 기록</h3>
        <EmptyState title="아직 기록이 없어요" sub="확정된 경기 결과가 쌓이면 득점·도움 순위가 나타나요." />
      </section>
    );
  }

  return (
    <>
      {goalRows.length > 0 ? (
        <RecordList title="득점 순위" rows={goalRows} ranks={goalRanks} unit="골" value={(row) => row.goals} />
      ) : null}
      {assistRows.length > 0 ? (
        <RecordList title="도움 순위" rows={assistRows} ranks={assistRanks} unit="도움" value={(row) => row.assists} />
      ) : null}
    </>
  );
}

function RecordList({
  title,
  rows,
  ranks,
  unit,
  value,
}: {
  title: string;
  rows: PublicTournamentPlayerRecordRow[];
  ranks: number[];
  unit: string;
  value: (row: PublicTournamentPlayerRecordRow) => number;
}) {
  return (
    <section>
      <h3 className="tm-hub-section-title" style={{ marginBottom: 10 }}>{title}</h3>
      <ol style={{ display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
        {rows.map((row, index) => (
          <li
            key={row.userId}
            style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--text-strong)' }}
          >
            <span>
              {ranks[index]}.{' '}
              {/* 랭킹 행은 정의상 전원 동의+계정 연결 — 서버가 내려준 profileHref로
                  공개 프로필에 연결한다(#707/#714 관례: 밑줄 = 링크, 색만으로 구분 금지). */}
              <Link
                href={row.profileHref}
                style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}
              >
                {row.nickname ?? '선수'}
              </Link>
            </span>
            <span>{value(row)}{unit}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
