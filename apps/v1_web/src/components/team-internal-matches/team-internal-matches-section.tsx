'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Card, SectionTitle } from '@/components/v1-ui/primitives';
import { PlusIcon } from '@/components/v1-ui/icons';
import { useTeamInternalMatches, type InternalMatchListItem } from '@/hooks/use-team-internal-matches';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';

const LIST_LIMIT = 20;
const COLLAPSED_COUNT = 3;

export function internalMatchScoreText(match: Pick<InternalMatchListItem, 'resultRecorded' | 'sides'>): string {
  if (!match.resultRecorded) return '결과 미입력';
  return match.sides.map((side) => `${side.name} ${side.score ?? 0}`).join(' : ');
}

/**
 * 팀 상세의 "팀 내 경기" — 우리 팀원끼리 나눠 뛴 경기 기록. **팀원에게만** 그려진다(호출하는 쪽이 mine 모드에서만 둔다).
 * 서버도 팀원이 아니면 403 이라, 이 화면을 억지로 열어도 아무것도 안 보인다.
 * 기록이 없고 운영진도 아니면 섹션 자체를 띄우지 않는다 — 팀 상세는 이미 길다.
 */
export function TeamInternalMatchesSection({ teamId, canManage }: { teamId: string; canManage: boolean }) {
  const query = useTeamInternalMatches(teamId, LIST_LIMIT);
  const [expanded, setExpanded] = useState(false);
  const items = query.data?.items ?? [];
  if (query.isLoading || query.isError) return null;
  if (items.length === 0 && !canManage) return null;
  const shown = expanded ? items : items.slice(0, COLLAPSED_COUNT);

  return (
    <section aria-label="팀 내 경기">
      <SectionTitle title="팀 내 경기" sub="우리 팀원끼리 나눠 뛴 경기 기록이에요. 팀원만 볼 수 있어요." />
      {canManage ? (
        <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href={`/teams/${teamId}/internal-matches/new`} style={{ marginBottom: 8 }}>
          <PlusIcon size={18} strokeWidth={2.4} aria-hidden="true" />
          팀 내 경기 만들기
        </Link>
      ) : null}
      {items.length === 0 ? (
        <Card pad={16}><p className="tm-text-caption">아직 기록이 없어요. 팀원을 나눠 경기를 만들어 보세요.</p></Card>
      ) : (
        <Card pad={16} style={{ paddingTop: 4, paddingBottom: 4 }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {shown.map((match, index) => (
              <li key={match.id} style={{ borderBottom: index === shown.length - 1 ? 'none' : '1px solid var(--border)' }}>
                <Link href={`/teams/${teamId}/internal-matches/${match.id}`} className="tm-pressable" style={{ display: 'block', padding: '12px 0', color: 'inherit', textDecoration: 'none' }}>
                  <div className="tm-text-caption">
                    {formatTournamentDateTimeShort(match.playedAt)}
                    {match.viewerSideNumber ? ` · 내 팀 ${match.viewerSideNumber}팀` : ''}
                  </div>
                  <div className="tm-text-body-lg tab-num" style={{ marginTop: 2 }}>{internalMatchScoreText(match)}</div>
                </Link>
              </li>
            ))}
          </ul>
          {items.length > COLLAPSED_COUNT ? (
            <button type="button" className="tm-btn tm-btn-sm tm-btn-neutral tm-btn-block" onClick={() => setExpanded((value) => !value)} style={{ margin: '4px 0 12px' }}>
              {expanded ? '접기' : `더 보기 (${items.length - COLLAPSED_COUNT})`}
            </button>
          ) : null}
          {query.data?.hasMore ? <p className="tm-text-caption" style={{ paddingBottom: 12 }}>최근 {LIST_LIMIT}경기까지 보여요.</p> : null}
        </Card>
      )}
    </section>
  );
}
