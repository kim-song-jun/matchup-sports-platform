'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { competitionRanks } from '@/lib/competition-ranks';
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
  containerStyle,
}: {
  goals: readonly PublicTournamentPlayerRecordRow[] | undefined;
  assists: readonly PublicTournamentPlayerRecordRow[] | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  onRetry: () => void;
  emptyBehavior: 'hide' | 'empty-state';
  /**
   * 실제로 그릴 내용이 있을 때만 적용되는 래퍼 스타일. 일정 화면(hide 정책)이
   * 바깥에서 패딩 div로 감싸면 null 반환 시에도 빈 여백이 남는다(리뷰 지적) —
   * 래퍼를 컴포넌트 안으로 들여 내용과 운명을 같이하게 한다.
   */
  containerStyle?: React.CSSProperties;
}) {
  const goalRows = goals ?? [];
  const assistRows = assists ?? [];
  const goalRanks = useMemo(() => competitionRanks(goalRows.map((row) => row.goals)), [goalRows]);
  const assistRanks = useMemo(
    () => competitionRanks(assistRows.map((row) => row.assists)),
    [assistRows],
  );

  const wrap = (content: React.ReactNode) =>
    containerStyle === undefined ? <>{content}</> : <div style={containerStyle}>{content}</div>;

  if (isError) {
    return wrap(<ErrorState message={errorMessage} onRetry={onRetry} />);
  }
  if (isLoading) {
    return emptyBehavior === 'hide' ? null : wrap(
      <div className="tm-skeleton" style={{ height: 80, borderRadius: 'var(--radius-control)' }} />,
    );
  }
  if (goalRows.length === 0 && assistRows.length === 0) {
    return emptyBehavior === 'hide' ? null : wrap(
      <section>
        <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>개인 기록</h3>
        <EmptyState title="아직 기록이 없어요" sub="확정된 경기 결과가 쌓이면 득점·도움 순위가 나타나요." />
      </section>,
    );
  }

  return wrap(
    <>
      {goalRows.length > 0 ? (
        <RecordList title="득점 순위" rows={goalRows} ranks={goalRanks} unit="골" value={(row) => row.goals} />
      ) : null}
      {assistRows.length > 0 ? (
        <RecordList title="도움 순위" rows={assistRows} ranks={assistRanks} unit="도움" value={(row) => row.assists} />
      ) : null}
    </>,
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
  rows: readonly PublicTournamentPlayerRecordRow[];
  ranks: number[];
  unit: string;
  value: (row: PublicTournamentPlayerRecordRow) => number;
}) {
  return (
    <section>
      <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>{title}</h3>
      <ol style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
        {rows.map((row, index) => (
          <li
            key={row.userId}
            style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--text-strong)' }}
          >
            <span>
              {ranks[index]}.{' '}
              {/* 랭킹 행은 정의상 전원 동의+계정 연결 — 서버가 내려준 profileHref로
                  공개 프로필에 연결한다(#707/#714 관례: 밑줄 = 링크, 색만으로 구분 금지). */}
              {/* 닉네임 null 행은 링크 텍스트가 전부 '선수'가 된다 — 스크린리더가
                  같은 이름의 링크를 구분할 수 있게 순위·기록을 aria-label에 싣는다. */}
              <Link
                href={row.profileHref}
                aria-label={`${title} ${ranks[index]}위 ${row.nickname ?? '선수'} ${value(row)}${unit} — 공개 프로필 보기`}
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
