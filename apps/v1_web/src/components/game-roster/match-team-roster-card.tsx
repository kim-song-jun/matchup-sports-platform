'use client';

import { useState } from 'react';
import { AlertBanner, Card } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { useV1GameRoster, type V1GameRosterView } from '@/hooks/use-v1-game-roster';
import { V1ApiError } from '@/lib/api-client';
import { gameRosterErrorMessage } from '@/lib/game-roster-errors';
import { gameRosterReasonLabel } from '@/lib/v1-status-labels';
import { GameRosterQuickSheet } from './game-roster-quick-sheet';
import type { MyMatchRosterSide } from './use-my-match-roster-side';

/** 칩으로 이름을 보여 줄 인원 — 나머지는 "+N". */
const CHIP_LIMIT = 3;

/** 명단이 없거나(404) 볼 수 없는(401·403) 경우는 이 경기에 우리 팀 카드가 없는 게 정상이다. */
function isExpectedAbsence(error: unknown): boolean {
  return error instanceof V1ApiError && [401, 403, 404].includes(error.statusCode);
}

/**
 * 경기 상세의 "우리 팀 출전" 카드(Task 176 ①) — 대회·리그 경기 상세가 같이 쓴다.
 * 출전 인원·빠진 사람 요약은 우리 팀 팀원 모두, "명단 조정"(빠른 선택 시트 ③)은 서버가 편집 가능하다고 한
 * 사람(팀장·매니저·운영자)에게만. 상대팀 명단은 여기서 다루지 않는다 — 공개 기록 본문의 라인업이 그 몫이다.
 */
export function MatchTeamRosterCard({ side }: { side: MyMatchRosterSide }) {
  if (side.status === 'none' || side.status === 'loading') return null;
  if (side.status === 'error') {
    if (isExpectedAbsence(side.error)) return null;
    return (
      <Card pad={16}>
        <h2 className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0 }}>
          우리 팀 출전
        </h2>
        <p className="tm-text-caption" style={{ margin: '4px 0 0' }}>
          {gameRosterErrorMessage(side.error, '우리 팀 경기 정보를 불러오지 못했어요.')}
        </p>
      </Card>
    );
  }
  return <ResolvedRosterCard teamId={side.teamId} gameId={side.gameId} sideId={side.sideId} />;
}

function ResolvedRosterCard({ teamId, gameId, sideId }: { teamId: string; gameId: string; sideId: string }) {
  const roster = useV1GameRoster(gameId, sideId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (roster.isError) {
    if (isExpectedAbsence(roster.error)) return null;
    return (
      <Card pad={16}>
        <h2 className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0 }}>
          우리 팀 출전
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <p className="tm-text-caption" style={{ margin: 0 }}>
            {gameRosterErrorMessage(roster.error, '우리 팀 출전 명단을 불러오지 못했어요.')}
          </p>
          <Button variant="outline" size="sm" onClick={() => void roster.refetch()}>
            다시 불러오기
          </Button>
        </div>
      </Card>
    );
  }
  const data = roster.data;
  if (data === undefined) {
    return <div className="tm-skeleton" style={{ height: 120, borderRadius: 'var(--radius-control)' }} />;
  }

  const shown = data.participants.slice(0, CHIP_LIMIT);
  const rest = data.participants.length - shown.length;
  return (
    <Card pad={16}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0 }}>
          우리 팀 출전
        </h2>
        <span className="tm-badge tm-badge-sm tm-badge-green">{data.counts.participating}명</span>
      </div>
      {data.participants.length > 0 ? (
        <ul
          aria-label="우리 팀 출전 선수"
          style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}
        >
          {shown.map((row) => (
            <li key={row.userId} className="tm-badge tm-badge-grey">
              {row.jerseyNumber === null ? row.displayName : `${row.jerseyNumber} ${row.displayName}`}
            </li>
          ))}
          {rest > 0 ? (
            <li className="tm-badge tm-badge-grey">
              <span aria-hidden="true">+{rest}</span>
              <span className="sr-only">외 {rest}명</span>
            </li>
          ) : null}
        </ul>
      ) : null}
      <p className="tm-text-caption" style={{ margin: '8px 0 0' }}>
        {rosterSummaryLine(data)}
      </p>
      {data.legacyLineupPending ? (
        <p className="tm-text-caption" style={{ margin: '4px 0 0' }}>
          예전에 저장한 참석명단이 아직 경기 기록에 쓰이고 있어요.
        </p>
      ) : null}
      {notice !== null ? (
        <div style={{ marginTop: 8 }}>
          <AlertBanner tone="info" message={notice} />
        </div>
      ) : null}
      <RosterFooter
        view={data}
        onAdjust={() => {
          setNotice(null);
          setSheetOpen(true);
        }}
      />
      {/* 시트는 늘 마운트해 둔다 — 저장 중 마감(409)으로 editable 이 꺼져도 시트가 그 안내를 보여 줘야 한다. */}
      <GameRosterQuickSheet
        open={sheetOpen}
        teamId={teamId}
        roster={data}
        onClose={() => setSheetOpen(false)}
        onSaved={(count) => {
          setSheetOpen(false);
          setNotice(`${count}명을 이번 경기에서 뺐어요.`);
        }}
        onStale={() => void roster.refetch()}
      />
    </Card>
  );
}

function RosterFooter({ view, onAdjust }: { view: V1GameRosterView; onAdjust: () => void }) {
  if (view.editable) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
        <span className="tm-text-caption">경기 시작 전까지 바꿀 수 있어요</span>
        <Button variant="outline" size="sm" onClick={onAdjust}>
          명단 조정
        </Button>
      </div>
    );
  }
  if (view.gameState === 'SCHEDULED') return null;
  return (
    <p className="tm-text-caption" style={{ margin: '4px 0 0' }}>
      경기가 시작돼 명단을 바꿀 수 없어요.
    </p>
  );
}

/** "참가 명단 기준 · 1명 빠짐(박서준, 부상)" — 결장·출전정지는 따로 센다(계산이 뺀 사람이라 사유가 다르다). */
export function rosterSummaryLine(view: V1GameRosterView): string {
  const basis = view.baseSource === 'TEAM_MEMBERS' ? '팀원 기준' : '참가 명단 기준';
  const parts = [basis];
  if (view.excluded.length === 0) {
    parts.push('빠진 선수 없음');
  } else {
    const names = view.excluded.map((row) => {
      const reason = gameRosterReasonLabel(row.reason);
      return reason === null ? row.displayName : `${row.displayName}, ${reason}`;
    });
    parts.push(`${view.excluded.length}명 빠짐(${names.join(' · ')})`);
  }
  if (view.unavailable.length > 0) parts.push(`결장 ${view.unavailable.length}명`);
  if (view.suspended.length > 0) parts.push(`출전정지 ${view.suspended.length}명`);
  return parts.join(' · ');
}
