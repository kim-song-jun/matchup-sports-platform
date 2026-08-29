'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppChrome } from '@/components/v1-ui/shell';
import { AlertBanner, Card, ErrorState } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { PitchFormationEditor, type PitchDropResolver } from '@/components/lineup/pitch-formation-editor';
import type { LineupEntryDraft } from '@/app/team-matches/[id]/lineup/lineup.view-model';
import {
  useV1SaveTacticsBoard,
  useV1TacticsBoard,
  useV1TeamMembers,
  type V1TacticsBoard,
} from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';

/**
 * 팀 전술보드 — 그 팀의 이 경기 배치.
 *
 * 경기 기록과 **책임이 다르다.** 여기서 짜는 선발/후보·배치는 경기 결과에 들어가지 않고
 * 그 팀 밖으로도 나가지 않는다. 그래서 몇 번을 고쳐도 안전하고, 라인업처럼 "제출" 개념이
 * 없다 — 저장만 있다.
 *
 * 선수 출처는 **팀 멤버**다. 대회 등록 명단이 아니라 팀 멤버를 쓰는 이유: 이 화면은 팀의
 * 물건이고 대회 경기·친선 팀매치 어느 쪽에서 왔든 같은 목록이어야 한다. 명단이 참가자의
 * 유일한 출처가 되는 것은 다음 단계(참가자 행을 명단 스냅샷으로 고정)의 일이고, 그때
 * 이 출처도 함께 옮겨온다.
 *
 * 지금 없는 것: **포메이션 프리셋**. 프리셋 좌표는 서버 경기 설정(lineupConfig)이 내려주는데
 * 그 값을 대회 경기·친선 양쪽에서 같은 방법으로 가져오는 경로가 아직 없다. 화면에
 * 하드코딩하지 않는다는 규칙(D-17)이 있어 지금은 **자유 배치**만 연다 — 피치 위 아무 곳에나
 * 놓을 수 있고, 프리셋은 그 경로가 생기면 붙인다.
 */
/**
 * 화면이 들고 있는 한 사람. `LineupEntryDraft` 에는 `started` 가 없다 — 그쪽 편집기는
 * 선발/후보를 **배열 두 개**로 가르기 때문이다. 전술보드는 한 배열에 담고 플래그로 가르는
 * 편이 "후보로 내렸다 다시 선발로" 같은 조작에서 순서를 잃지 않아, 여기서만 한 칸 얹는다.
 */
type BoardEntryDraft = LineupEntryDraft & { started: boolean };

export function TacticsBoardClient({ teamId, gameId }: { teamId: string; gameId: string }) {
  const board = useV1TacticsBoard(teamId, gameId);
  const members = useV1TeamMembers(teamId, { limit: 100 });
  const save = useV1SaveTacticsBoard(teamId, gameId);

  const [entries, setEntries] = useState<BoardEntryDraft[] | null>(null);
  const [formation] = useState<string | null>(null);
  const [baseVersion, setBaseVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dropResolverRef = useRef<PitchDropResolver | null>(null);

  const viewerRole = members.data?.viewerRole;
  const canEdit = viewerRole === 'owner' || viewerRole === 'manager';

  /**
   * 서버 판 → 화면 상태. **편집 중이 아닐 때만** 다시 심는다.
   *
   * 두 실패가 서로 반대 방향이라 조건이 필요하다.
   * - 매번 덮어쓰면: `refetchOnWindowFocus`(providers.tsx)가 창을 다시 볼 때마다 도는데,
   *   그때 저장 안 한 편집이 통째로 사라진다.
   * - 한 번만 심으면: 그 refetch 가 최신 판을 받아와도 화면은 옛 판 그대로고 `baseVersion`
   *   도 옛 값이라, 사용자가 아무 잘못 없이 첫 저장에서 409 를 맞는다.
   * `dirty` 가 그 둘을 가른다 — 잃을 편집이 없을 때만 최신으로 맞춘다.
   */
  useEffect(() => {
    if (board.data === undefined) return;
    if (entries !== null && dirty) return;
    if (entries !== null && board.data.version === baseVersion) return;
    setEntries(hydrate(board.data));
    setBaseVersion(board.data.version);
  }, [board.data, entries, dirty, baseVersion]);

  const starters = useMemo(() => (entries ?? []).filter((entry) => entry.started), [entries]);
  const bench = useMemo(() => (entries ?? []).filter((entry) => !entry.started), [entries]);
  /**
   * 아직 보드에 없는 팀원 — 여기서 골라 넣는다.
   *
   * `userId` 만으로 거르면 **이미 올라간 사람이 목록에 또 뜬다.** 보드 엔트리는 게스트를
   * 위해 `userId` 가 nullable 이라(설계상 이름이 유일한 신원인 사람이 있다), 그런 엔트리는
   * 어떤 userId 와도 안 맞는다. 실제 alpha 화면에서 선발 3명이 "팀원 추가" 목록에 그대로
   * 남아 있는 것을 확인했다. 이름으로도 대조해 같은 사람을 두 번 올리지 않게 한다.
   */
  const available = useMemo(() => {
    const takenUserIds = new Set(
      (entries ?? []).map((entry) => entry.userId).filter((id): id is string => id !== null),
    );
    const takenNames = new Set((entries ?? []).map((entry) => entry.displayName));
    return (members.data?.items ?? []).filter(
      (member) => !takenUserIds.has(member.userId) && !takenNames.has(member.displayName),
    );
  }, [members.data, entries]);

  function mutate(next: (current: BoardEntryDraft[]) => BoardEntryDraft[]) {
    setEntries((current) => (current === null ? current : next(current)));
    setDirty(true);
    setNotice(null);
  }

  const handlers = {
    place: (key: string, positionX: number, positionY: number) =>
      mutate((current) =>
        current.map((entry) =>
          entry.key === key ? { ...entry, started: true, positionX, positionY } : entry,
        ),
      ),
    unplace: (key: string) =>
      mutate((current) =>
        current.map((entry) => (entry.key === key ? { ...entry, positionX: null, positionY: null } : entry)),
      ),
  };

  async function onSave() {
    if (entries === null) return;
    setError(null);
    try {
      const saved = await save.mutateAsync({
        formation,
        expectedVersion: baseVersion,
        entries: entries.map((entry) => ({
          userId: entry.userId,
          displayName: entry.displayName,
          jerseyNumber: entry.jerseyNumber,
          position: entry.position,
          positionX: entry.positionX,
          positionY: entry.positionY,
          started: entry.started,
          goalkeeper: entry.goalkeeper,
        })),
      });
      setBaseVersion(saved.version);
      setDirty(false);
      setNotice('전술을 저장했어요.');
    } catch (caught) {
      // 다른 운영진이 먼저 저장한 경우. 자동으로 다시 불러오지 않는다 — 지금 화면에는
      // 저장하지 못한 편집이 남아 있어서, 조용히 덮으면 그게 사라진다.
      if (caught instanceof V1ApiError && caught.statusCode === 409) {
        setError('다른 운영진이 먼저 저장했어요. 새로고침해서 최신 배치를 불러온 뒤 다시 저장해 주세요.');
        return;
      }
      setError(extractErrorMessage(caught, '전술을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'));
    }
  }

  if (board.isLoading || members.isLoading || entries === null) {
    return (
      <AppChrome title="우리 팀 전술" activeTab="teams" bottomNav={false} backHref={`/teams/${teamId}`}>
        <PageSkeleton />
      </AppChrome>
    );
  }

  if (board.isError) {
    const status = board.error instanceof V1ApiError ? board.error.statusCode : null;
    return (
      <AppChrome title="우리 팀 전술" activeTab="teams" bottomNav={false} backHref={`/teams/${teamId}`}>
        <ErrorState
          title={status === 403 ? '이 팀의 전술은 볼 수 없어요' : '전술을 불러오지 못했어요'}
          message={
            status === 403
              ? '전술보드는 그 팀의 팀원만 볼 수 있어요.'
              : status === 404
                ? '이 경기에서 팀을 찾을 수 없어요. 대진이 바뀌었을 수 있어요.'
                : '잠시 후 다시 시도해 주세요.'
          }
          onRetry={status === 403 || status === 404 ? undefined : () => void board.refetch()}
        />
      </AppChrome>
    );
  }

  return (
    <AppChrome title="우리 팀 전술" activeTab="teams" bottomNav={false} backHref={`/teams/${teamId}`}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          // 화면 하단에 고정된 저장 바(.tm-fixed-cta)가 본문 마지막 카드를 덮는다 —
          // 실제 alpha 렌더에서 명단 카드의 마지막 줄이 가려지는 것을 확인했다.
          // 라인업 화면(team-matches/[id]/lineup)도 같은 사고를 겪고 같은 방식으로 막았다.
          paddingBottom: canEdit ? 112 : 16,
        }}
      >
        <AlertBanner
          tone="info"
          message={`${board.data?.teamNameSnapshot ?? '우리 팀'} 팀원만 볼 수 있어요. 상대 팀과 관중에게는 등번호와 이름만 공개되고, 선발·후보와 배치는 나가지 않아요.`}
        />

        {notice !== null ? <AlertBanner tone="info" message={notice} /> : null}
        {error !== null ? <AlertBanner tone="error" message={error} /> : null}

        <PitchFormationEditor
          starters={starters}
          formation={formation}
          formationOptions={[]}
          slots={null}
          outfieldGuidance="지금은 자유 배치예요. 선수를 피치 위 원하는 자리에 놓아 주세요."
          editable={canEdit}
          onSelectFormation={() => undefined}
          onPlacePlayer={handlers.place}
          onUnplacePlayer={handlers.unplace}
          onPlaceInSlot={() => undefined}
          onUnplaceFromSlot={handlers.unplace}
          dropResolverRef={dropResolverRef}
          teamName={board.data?.teamNameSnapshot ?? null}
        />

        {/* 명단 카드 — 선발과 후보를 한 카드에 두고 **양쪽으로 오갈 수 있게** 한다.
            예전에는 "선발로"만 있어서 한 번 올린 선수를 되돌릴 방법이 없었다(피치에서
            빼도 좌표만 지워질 뿐 선발 그대로였다). QA 에서 30초 안에 부딪히는 종류다. */}
        <Card>
          <h2 className="tm-text-body-lg" style={{ fontWeight: 700, margin: '0 0 8px' }}>
            선발 {starters.length}명 · 후보 {bench.length}명
          </h2>
          {starters.length === 0 && bench.length === 0 ? (
            <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: 0 }}>
              아래에서 팀원을 골라 보드에 올려 주세요.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {[...starters, ...bench].map((entry) => (
                <li key={entry.key} style={rowStyle}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {entry.jerseyNumber !== null ? `${entry.jerseyNumber}. ` : ''}
                    {entry.displayName}
                  </span>
                  <span
                    className="tm-text-caption"
                    style={{ flex: '0 0 auto', color: 'var(--text-muted)' }}
                  >
                    {!entry.started
                      ? '후보'
                      : entry.positionX === null
                        ? '선발 · 배치 전'
                        : '선발 · 배치됨'}
                  </span>
                  {canEdit ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        mutate((current) =>
                          current.map((row) =>
                            row.key === entry.key
                              ? entry.started
                                // 후보로 내리면 좌표도 함께 지운다 — 후보가 피치 좌표를
                                // 들고 있으면 다시 선발로 올릴 때 옛 자리로 되살아난다.
                                ? { ...row, started: false, positionX: null, positionY: null }
                                : { ...row, started: true }
                              : row,
                          ),
                        )
                      }
                      aria-label={`${entry.displayName} ${entry.started ? '후보로 내리기' : '선발로 올리기'}`}
                    >
                      {entry.started ? '후보로' : '선발로'}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {canEdit ? (
          <Card>
            <h2 className="tm-text-body-lg" style={{ fontWeight: 700, margin: '0 0 8px' }}>
              팀원 추가
            </h2>
            {members.isError ? (
              // 조회가 실패했는데 "전원이 이미 보드에 있어요"를 띄우면 거짓말이 된다 —
              // 목록이 비어서가 아니라 못 불러온 것이므로 그렇게 말하고 다시 시도하게 한다.
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: 0, flex: 1 }}>
                  팀원 목록을 불러오지 못했어요.
                </p>
                <Button variant="outline" size="sm" onClick={() => void members.refetch()}>
                  다시 시도
                </Button>
              </div>
            ) : available.length === 0 ? (
              <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: 0 }}>
                팀원 전원이 이미 보드에 있어요.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {available.map((member) => (
                  <li key={member.userId} style={rowStyle}>
                    <span style={{ flex: 1, minWidth: 0 }}>{member.displayName}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        mutate((current) => [
                          ...current,
                          {
                            key: `member-${member.userId}`,
                            userId: member.userId,
                            displayName: member.displayName,
                            jerseyNumber: member.jerseyNumber ?? null,
                            goalkeeper: false,
                            position: null,
                            positionX: null,
                            positionY: null,
                            started: false,
                          } satisfies BoardEntryDraft,
                        ])
                      }
                      aria-label={`${member.displayName} 보드에 추가`}
                    >
                      추가
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        {canEdit ? (
          <div className="tm-fixed-cta">
            <Button
              variant="primary"
              size="lg"
              block
              loading={save.isPending}
              disabled={!dirty}
              onClick={() => void onSave()}
            >
              {dirty ? '전술 저장' : '저장됨'}
            </Button>
          </div>
        ) : null}
      </div>
    </AppChrome>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '9px 0',
  borderBottom: '1px solid var(--border)',
  fontSize: 'var(--font-size-body-sm)',
};

/**
 * 서버 판 → 화면 초안. 저장된 엔트리에는 안정적인 로컬 키가 없으므로(서버는 엔트리 id 를
 * 돌려주지 않는다) 자리 순서로 만든다 — 같은 사람을 두 번 넣을 수 없으니 충돌하지 않는다.
 */
export function hydrate(board: V1TacticsBoard): BoardEntryDraft[] {
  return board.entries.map((entry, index) => ({
    key: entry.userId !== null ? `member-${entry.userId}` : `guest-${index}`,
    userId: entry.userId,
    displayName: entry.displayName,
    jerseyNumber: entry.jerseyNumber,
    goalkeeper: entry.goalkeeper,
    position: entry.position,
    positionX: entry.positionX,
    positionY: entry.positionY,
    started: entry.started,
  }));
}
