'use client';

import { EmptyState } from '@/components/v1-ui/primitives';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import type {
  V1LeagueOverallStandingRow,
  V1LeagueOverallStandingsResponse,
} from '@/types/api';

/**
 * 타입은 `@/types/api`가 단일 소스다. 여기서는 이 컴포넌트를 쓰는 쪽이 편하도록
 * 이름만 짧게 별칭을 준다 — 구조를 다시 선언하면 API 계약이 바뀔 때 조용히 어긋난다.
 */
export type LeagueOverallStandingRow = V1LeagueOverallStandingRow;
export type LeagueStandingsTableData = V1LeagueOverallStandingsResponse;

/**
 * §4.1 통합 순위 테이블 — 리그(풀리그) 대회의 공개 상세에서 조별 순위가 아니라
 * 전체 통합 순위를 한 표로 보여준다. 진행률·매직넘버는 색만으로 상태를 전달하지
 * 않도록 항상 숫자/텍스트를 병기한다(규칙: 컬러만으로 정보 전달 금지).
 */
export function LeagueStandingsTable({ data }: { data: LeagueStandingsTableData }) {
  const { standings, progress, magicNumber, recalculatedAt } = data;
  const sorted = [...standings].sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));
  const updatedLabel = formatTournamentDateTimeShort(recalculatedAt ?? undefined);
  const magicNumberRow = magicNumber
    ? sorted.find((row) => row.registrationId === magicNumber.registrationId)
    : null;

  if (sorted.length === 0) {
    return (
      <div className="tm-card" style={{ padding: 20 }}>
        <EmptyState title="아직 순위가 없어요" sub="경기 결과가 등록되면 통합 순위표가 계산돼요." />
      </div>
    );
  }

  return (
    <div className="tm-card" style={{ padding: 0 }}>
      <div style={{ padding: '16px 16px 4px' }}>
        {/* 진행률은 막대 + 숫자(N/M · P%)를 함께 표시한다 — 막대 색만으로 진행 상태를
            전달하지 않는다. */}
        <div
          role="progressbar"
          aria-valuenow={progress.played}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-label={`전체 일정 진행률 ${progress.played} / ${progress.total}경기, ${progress.percent}%`}
        >
          <div
            style={{
              height: 5,
              background: 'var(--grey100)',
              borderRadius: 5,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, progress.percent))}%`,
                height: '100%',
                background: 'var(--blue500)',
              }}
            />
          </div>
          <div
            className="tm-text-caption tab-num"
            style={{ color: 'var(--text-caption)', marginTop: 6 }}
          >
            {progress.played} / {progress.total} · {progress.percent}%
          </div>
        </div>

        {magicNumber ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 10,
              padding: '4px 10px',
              minHeight: 28,
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              background: magicNumber.clinched ? 'var(--blue50)' : 'var(--grey100)',
              color: magicNumber.clinched ? 'var(--blue700)' : 'var(--text)',
            }}
          >
            <span>{magicNumber.clinched ? '우승 확정' : `매직넘버 ${magicNumber.value}`}</span>
            {magicNumberRow ? (
              <span style={{ color: 'var(--text-caption)', fontWeight: 500 }}>
                · {magicNumberRow.teamName}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="tm-standings-table" aria-label="통합 순위표" style={{ minWidth: 296, marginTop: 8 }}>
          <thead className="tm-standings-thead">
            <tr>
              <th scope="col" style={{ width: 36, paddingLeft: 12 }}>#</th>
              <th scope="col">팀</th>
              <th scope="col" className="num" style={{ width: '18%', minWidth: 56 }}>전적</th>
              <th scope="col" className="num" style={{ width: '13%', minWidth: 44 }}>승점</th>
              <th scope="col" className="num" style={{ width: '13%', minWidth: 44, paddingRight: 12 }}>득실</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const diff = row.goalsFor - row.goalsAgainst;
              const diffColor = diff > 0 ? 'var(--blue500)' : diff < 0 ? 'var(--red500)' : 'var(--text-muted)';
              return (
                <tr key={row.registrationId} className="tm-standings-row">
                  <td style={{ paddingLeft: 12 }}>
                    <span
                      className="tm-standings-rank"
                      style={{ minWidth: 44, minHeight: 44, display: 'inline-flex' }}
                    >
                      {row.position ?? '-'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
                        {row.teamName}
                      </span>
                      {row.fairPlayPoints > 0 ? (
                        <span
                          className="tm-text-caption"
                          style={{ marginLeft: 6, color: 'var(--text-caption)' }}
                          aria-label={`페어플레이 벌점 ${row.fairPlayPoints}`}
                        >
                          FP {row.fairPlayPoints}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td
                    className="num tab-num"
                    style={{ fontSize: 12, color: 'var(--text-muted)' }}
                    aria-label={`${row.wins}승 ${row.draws}무 ${row.losses}패`}
                  >
                    {row.wins}-{row.draws}-{row.losses}
                  </td>
                  <td className="num" style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-strong)' }}>
                    {row.points}
                  </td>
                  <td className="num" style={{ paddingRight: 12 }}>
                    <span style={{ color: diffColor, fontWeight: diff !== 0 ? 700 : 400 }}>
                      {diff > 0 ? '+' : ''}
                      {diff}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {updatedLabel ? (
        <div
          className="tm-text-caption"
          style={{ padding: '8px 16px 16px', color: 'var(--text-caption)' }}
        >
          {updatedLabel} 기준
        </div>
      ) : null}
    </div>
  );
}
