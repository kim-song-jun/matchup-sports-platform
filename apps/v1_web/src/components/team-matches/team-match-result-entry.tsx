'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TeamMatchResultPageClient, TeamMatchResultApprovalPageClient } from './team-match-result-client';
import { TeamMatchSharedRecord } from './team-match-shared-record';
import { useTeamMatchRecord, type SharedRecord } from '@/hooks/use-team-match-record';
import { useV1ResolveChatRoom, useV1TeamMatch } from '@/hooks/use-v1-api';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { Button } from '@/components/v1-ui/button';
import { ChatIcon } from '@/components/v1-ui/icons';
import { chatRoomHref } from '@/lib/chat-route';
import { extractErrorMessage } from '@/lib/error-message';

export function TeamMatchResultEntry({ teamMatchId, approval = false }: { teamMatchId: string; approval?: boolean }) {
  const query = useTeamMatchRecord(teamMatchId);
  if (!query.data) return query.isError ? <div role="alert">{extractErrorMessage(query.error, '경기 기록을 불러오지 못했어요.')}<Button onClick={() => void query.refetch()}>다시 시도</Button></div> : <PageSkeleton />;
  if (!query.data.lineupReady && query.data.phase !== 'official' && query.data.phase !== 'cancelled') {
    const ownTeamMissing = query.data.missingSides.some((side) => side.sideId === query.data?.ownSideId);
    // 대회·리그(managed) 명단은 참가 명단에서 계산된다 — 참석명단 화면으로 보내면 저장이 409 다(Task 179).
    const managed = query.data.phase === 'managed';
    if (!managed && !ownTeamMissing && query.data.ownSideId !== null) {
      return <OpponentLineupPending teamMatchId={teamMatchId} data={query.data} />;
    }
    return (
      <main className="tm-page-shell">
        <section role="alertdialog" aria-labelledby="result-lineup-gate-title" className="tm-card" style={{ maxWidth: 520, margin: '32px auto', padding: 24 }}>
          <h1 id="result-lineup-gate-title" className="tm-text-title">{managed ? '경기 명단이 비어 있어요' : '참석명단 등록이 필요해요'}</h1>
          <p className="tm-text-body" style={{ marginTop: 12 }}>
            {managed
              ? '대회·리그 경기 명단은 참가 명단에서 정해져요. 양 팀 명단이 모두 있어야 경기 결과를 볼 수 있어요.'
              : '양 팀의 참석명단이 모두 제출되어야 경기 결과를 입력할 수 있어요.'}
          </p>
          <ul style={{ margin: '16px 0 0', paddingLeft: 20 }}>
            {query.data.missingSides.map((side) => <li key={side.sideId}>{side.teamName} · {managed ? '명단 없음' : '미제출'}</li>)}
          </ul>
          {managed ? (
            <p className="tm-text-caption" style={{ marginTop: 20 }}>
              {ownTeamMissing ? '참가 명단에 선수를 등록하면 경기 명단에 들어가요.' : '상대 팀 참가 명단이 채워지길 기다려 주세요.'}
            </p>
          ) : ownTeamMissing ? (
            <Link className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ marginTop: 20 }} href={`/team-matches/${teamMatchId}/lineup`}>
              참석명단 등록하기
            </Link>
          ) : (
            <p className="tm-text-caption" style={{ marginTop: 20 }}>상대 팀의 참석명단 제출을 기다려 주세요.</p>
          )}
        </section>
      </main>
    );
  }
  if (query.data.phase === 'legacy' || query.data.phase === 'managed') return approval ? <TeamMatchResultApprovalPageClient teamMatchId={teamMatchId} /> : <TeamMatchResultPageClient teamMatchId={teamMatchId} />;
  return <TeamMatchSharedRecord teamMatchId={teamMatchId} />;
}

/**
 * 우리는 냈는데 상대가 아직 참석명단을 안 낸 친선(H5 D-3). 기록은 계속 막고(양 팀 명단이 있어야 기록이
 * 매달린다) 다음 행동을 준다. 채팅·참석명단은 팀장·매니저만 쓸 수 있어 그때만 보인다.
 */
function OpponentLineupPending({ teamMatchId, data }: { teamMatchId: string; data: SharedRecord }) {
  const router = useRouter();
  const viewer = useV1TeamMatch(teamMatchId).data?.viewer;
  const manages = viewer?.manageableHostTeam === true || viewer?.manageableOpponentTeam === true;
  const resolveChatRoom = useV1ResolveChatRoom();
  const missing = new Set(data.missingSides.map((side) => side.sideId));
  return (
    <main className="tm-page-shell">
      <section role="alertdialog" aria-labelledby="result-lineup-gate-title" className="tm-card" style={{ maxWidth: 520, margin: '32px auto', padding: 24 }}>
        <h1 id="result-lineup-gate-title" className="tm-text-title">상대 팀 참석명단을 기다리고 있어요</h1>
        <p className="tm-text-body" style={{ marginTop: 12, lineHeight: 1.6 }}>양 팀의 참석명단이 모두 제출되어야 경기 결과를 입력할 수 있어요.</p>
        <ul style={{ margin: '16px 0 0', paddingLeft: 20, lineHeight: 1.8 }}>
          {data.sides.map((side) => <li key={side.id}>{side.name} · {missing.has(side.id) ? '미제출' : '제출 완료'}</li>)}
        </ul>
        <p className="tm-text-caption" style={{ marginTop: 16, lineHeight: 1.6, color: 'var(--text-muted)' }}>상대가 킥오프 뒤에 내도 바로 기록을 시작할 수 있어요.</p>
        {resolveChatRoom.isError ? (
          <p role="alert" className="tm-text-caption" style={{ marginTop: 12, color: 'var(--red700)' }}>
            {extractErrorMessage(resolveChatRoom.error, '채팅방을 열지 못했어요. 다시 시도해 주세요.')}
          </p>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
          {manages ? (
            <Button
              variant="primary"
              size="lg"
              block
              loading={resolveChatRoom.isPending}
              onClick={() => resolveChatRoom.mutate(
                { targetType: 'team_match', targetId: teamMatchId },
                { onSuccess: (room) => router.push(chatRoomHref(room.roomId, room.route)) },
              )}
            >
              <ChatIcon size={18} aria-hidden="true" /> 상대 팀장에게 채팅 보내기
            </Button>
          ) : null}
          {manages ? (
            <Link className="tm-btn tm-btn-lg tm-btn-outline tm-btn-block" href={`/team-matches/${teamMatchId}/lineup`}>우리 참석명단 보기</Link>
          ) : null}
          <Link className="tm-btn tm-btn-lg tm-btn-ghost tm-btn-block" href={`/team-matches/${teamMatchId}?view=detail`}>경기 상세로</Link>
        </div>
      </section>
    </main>
  );
}
