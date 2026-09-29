'use client';

import Link from 'next/link';
import { Card, EmptyState, ErrorState, KPIStat } from '@/components/v1-ui/primitives';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import { withFromPath } from '@/lib/session-storage';
import { useV1MyMatchesInfinite } from '@/hooks/use-v1-api';
import type { V1Match } from '@/types/api';

type PersonalMatchEntry = {
  id: string;
  startsAt: string;
  title: string;
  whoLabel: string;
};

function wasPlayed(match: V1Match) {
  const ended = (match.displayState ?? match.status) === 'completed';
  return ended && match.viewer?.participantStatus !== 'no_show';
}

function toEntry(match: V1Match, mode: 'joined' | 'created'): PersonalMatchEntry {
  return {
    id: match.matchId ?? match.id,
    startsAt: match.startsAt,
    title: match.title,
    whoLabel: mode === 'created' ? '내가 주최' : `${match.host?.displayName ?? '호스트'}님 매치 참여`,
  };
}

/**
 * 활동 기록의 "개인" 탭 -- 개인매치(V1Match)는 팀 전적 공개 API(usePublicUserRecords)에
 * 아직 연동돼 있지 않다 -- 그 계약(F6, TeamRecordCategory)은 팀 매치 계열만 다룬다.
 * 이 탭은 본인 페이지에서만 노출되므로(UserRecordsContent가 viewerIsOwner일 때만 탭을
 * 보여준다) 이미 있는 "내 매치" 조회(useV1MyMatchesInfinite, /my/matches/* 와 동일)를
 * 그대로 재사용한다 -- 새 백엔드 엔드포인트 없이 참여 이력만 최소하게 보여준다.
 *
 * ponytail: 무한스크롤은 안 붙였다 -- mode당 limit=50(최근 100건). 완료된 개인매치가
 * 그보다 많은 사용자가 생기면 두 커서를 합쳐 넘기는 "더보기"를 추가한다.
 */
export function PersonalMatchRecordsSection({ fromHref }: { fromHref: string }) {
  const joined = useV1MyMatchesInfinite('joined');
  const created = useV1MyMatchesInfinite('created');

  if (joined.isError || created.isError) {
    return (
      <ErrorState
        message="개인매치 기록을 불러오지 못했어요."
        onRetry={() => {
          void joined.refetch();
          void created.refetch();
        }}
      />
    );
  }

  if (joined.isLoading || created.isLoading) {
    return <div className="tm-skeleton" style={{ height: 120, borderRadius: 'var(--radius-control)' }} />;
  }

  const joinedEntries = (joined.data?.pages.flatMap((page) => page.items) ?? [])
    .filter(wasPlayed)
    .map((match) => toEntry(match, 'joined'));
  const createdEntries = (created.data?.pages.flatMap((page) => page.items) ?? [])
    // hostParticipates=false로 만든 매치는 주최자가 직접 뛰지 않았다 -- 참여 기록이 아니다.
    .filter((match) => match.hostParticipates !== false)
    .filter(wasPlayed)
    .map((match) => toEntry(match, 'created'));

  const entries = [...joinedEntries, ...createdEntries].sort(
    (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
  );

  return (
    <>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
          <KPIStat label="참여" value={entries.length} unit="회" />
        </div>
      </Card>

      <section>
        <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>활동 기록</h3>
        {entries.length === 0 ? (
          <EmptyState
            illustration={{ name: 'journey-done' }}
            title="아직 참여한 개인매치가 없어요"
            sub="개인매치에 참여하고 경기가 끝나면 이곳에 표시돼요."
          />
        ) : (
          <Card pad={0}>
            {entries.map((entry) => (
              <Link
                key={entry.id}
                href={withFromPath(`/matches/${entry.id}`, fromHref)}
                style={{ display: 'block', padding: '12px 16px', borderTop: '1px solid var(--grey100)', textDecoration: 'none', color: 'inherit' }}
              >
                <div className="tm-text-caption">
                  {formatTournamentDateTimeShort(entry.startsAt) ?? ''}
                </div>
                <div className="tm-text-card-title" style={{ marginTop: 4 }}>
                  {entry.title}
                </div>
                <div className="tm-text-caption" style={{ marginTop: 2 }}>
                  {entry.whoLabel}
                </div>
              </Link>
            ))}
          </Card>
        )}
      </section>
    </>
  );
}
