'use client';

import { useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { AppChrome } from '@/components/v1-ui/shell';
import { AlertBanner, Card, EmptyState, ErrorState, TextField } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import {
  useV1CreateGameResultRevision,
  useV1DecideGameResultRevision,
  useV1Game,
  useV1GameResultRevisions,
  useV1SubmitGameResultRevision,
  useV1TeamMatch,
  useV1TeamMatchLineup,
} from '@/hooks/use-v1-api';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import type {
  V1GameResultParticipantInput,
  V1GameResultRevision,
  V1TeamMatch,
  V1TeamMatchApiStatus,
} from '@/types/api';
import {
  RESULT_REVISION_STATE_LABEL,
  hashResultPayload,
  toResultRosterRows,
  type ResultRosterEntryDraft,
} from './team-match-result.types';

// team-matches-client.tsx의 getStatus()와 동일한 캐스팅 관례 — 백엔드 detail()은
// 실제로 V1TeamMatchApiStatus 값을 내려주지만, 공용 V1Match.status는 개인 매치용
// V1Status 타입이라 여기서도 같은 이중 캐스트가 필요하다.
function teamMatchStatus(teamMatch: V1TeamMatch): V1TeamMatchApiStatus {
  return (teamMatch.displayState as V1TeamMatchApiStatus | undefined) ?? (teamMatch.status as unknown as V1TeamMatchApiStatus);
}

const RESULT_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  VERSION_CONFLICT: '그새 경기 상태가 바뀌었어요. 새로고침 후 다시 시도해 주세요.',
  RESULT_REVISION_ALREADY_EXISTS: '이미 작성 중인 결과가 있어요. 새로고침 후 확인해 주세요.',
  RESULT_REVISION_NOT_FOUND: '결과 기록을 찾을 수 없어요. 새로고침 후 다시 시도해 주세요.',
  TEAM_MATCH_NOT_MATCHED: '상대팀이 정해진 이후에 결과를 입력할 수 있어요.',
  TOURNAMENT_RESULT_DERIVED_ONLY: '이 경기는 결과가 자동으로 산출돼요.',
  // Backend never emits MVP_INVALID — game-invariants.ts's
  // validateGameResultInvariants() throws PARTICIPANT_INVALID for the "MVP
  // must be an actual game participant" case, same as every other
  // participant-shape violation (side mismatch, duplicate participant,
  // missing scorer, ...). A dead MVP_INVALID entry here never fired;
  // PARTICIPANT_INVALID is the one real code that reaches this map.
  PARTICIPANT_INVALID: '참가자 정보가 올바르지 않아요. 명단을 다시 확인해 주세요.',
  PERMISSION_DENIED: '이 작업을 수행할 권한이 없어요.',
  COMMAND_IDEMPOTENCY_KEY_MISMATCH: '요청이 중복 처리됐어요. 새로고침 후 다시 시도해 주세요.',
  // Task 17 known gap (docs/api/domains/games.md) — no team match can ever accumulate
  // events, so any nonzero score currently fails this invariant. We surface the real
  // limitation instead of a generic error so the host isn't left guessing.
  SCORE_EVENT_MISMATCH:
    '지금은 무승부(0:0) 기록만 지원돼요. 득점·카드 기록 기능은 곧 추가될 예정이니 잠시만 기다려 주세요.',
};

function resultErrorMessage(err: unknown): string {
  const code = extractErrorCode(err);
  if (code && RESULT_ERROR_MESSAGES[code]) return RESULT_ERROR_MESSAGES[code];
  return extractErrorMessage(err, '처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
}

/**
 * 확정된 결과에서 득점 타임라인을 보여준다.
 *
 * 예전에는 선수별 기록 블록이 SUBMITTED(승인 대기) 분기 안에만 있어서, 결과가 OFFICIAL 로
 * 확정되는 순간 입력한 득점·카드가 화면에서 통째로 사라졌다 — 실측으로 확인했다(득점 4건·
 * 경고 2건이 DB 와 API 에는 있는데 확정 화면에는 점수만 남음). 기록은 확정 이후에 더 오래
 * 읽히는 값이라 확정 뷰에서 사라지면 안 된다.
 *
 * 득점자는 `score.goals` 에서 읽는다 — `resultParticipants` 행에는 participantId 만 있고
 * 이름이 없어서 "득점 1 · 경고 0" 처럼 누구인지 알 수 없는 줄만 나온다.
 */
function GoalTimeline({ revision, homeName, awayName }: {
  revision: V1GameResultRevision;
  homeName: string;
  awayName: string;
}) {
  const goals = revision.score?.goals ?? [];
  if (goals.length === 0) return null;
  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
      <div className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>득점 기록</div>
      {goals
        .slice()
        .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))
        .map((goal, index) => (
          <div
            key={`${goal.team}-${goal.playerName}-${goal.minute}-${index}`}
            className="tm-text-caption"
            style={{ display: 'flex', gap: 8 }}
          >
            <span style={{ minWidth: 44, color: 'var(--text-caption)' }}>
              {goal.minute === null ? '-' : `${goal.minute}'`}
            </span>
            <span style={{ fontWeight: 600 }}>{goal.playerName}</span>
            <span style={{ color: 'var(--text-caption)' }}>
              {goal.team === 'home' ? homeName : awayName}
            </span>
          </div>
        ))}
    </div>
  );
}

export function scoreLabel(revision: V1GameResultRevision): string {
  // 스코어는 score.regulation 아래에 있다. 예전에는 score.home 을 읽어서 화면에
  // "undefined : undefined" 가 그려졌다(타입이 실제 응답과 달라 tsc 가 못 잡았다).
  // regulation 은 미완 결과에서 null 이므로 그때는 점수 대신 상태를 보여준다.
  const regulation = revision.score?.regulation;
  if (!regulation) return '기록 없음';
  return `${regulation.home} : ${regulation.away}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function revisionBadgeTone(state: V1GameResultRevision['state']) {
  if (state === 'OFFICIAL') return 'tm-badge-green';
  if (state === 'CHANGE_REQUESTED' || state === 'REJECTED' || state === 'VOID') return 'tm-badge-red';
  if (state === 'SUBMITTED' || state === 'SUPPLEMENT_REQUESTED') return 'tm-badge-blue';
  return 'tm-badge-grey';
}

/** Shared loading/error/not-ready gate for both the entry and approval screens. */
function useResultScreenBase(teamMatchId: string, options: { needsOwnLineup: boolean }) {
  const teamMatch = useV1TeamMatch(teamMatchId);
  const gameId = teamMatch.data?.gameId ?? null;
  const game = useV1Game(gameId, { enabled: Boolean(teamMatch.data) });
  const revisions = useV1GameResultRevisions(gameId, { enabled: Boolean(teamMatch.data) });
  const lineup = useV1TeamMatchLineup(teamMatchId, {
    enabled: options.needsOwnLineup && Boolean(teamMatch.data),
  });

  const isError = teamMatch.isError || game.isError || revisions.isError || (options.needsOwnLineup && lineup.isError);
  const isLoading =
    teamMatch.isLoading ||
    (Boolean(gameId) && (game.isLoading || revisions.isLoading)) ||
    (options.needsOwnLineup && Boolean(teamMatch.data) && lineup.isLoading);

  return { teamMatch, game, revisions, lineup, isError, isLoading, gameId };
}

function retryAll(...queries: Array<{ refetch: () => unknown }>) {
  queries.forEach((query) => query.refetch());
}

// ─────────────────────────────────────────────────────────────────────────────
// Host: entry + draft + submit
// ─────────────────────────────────────────────────────────────────────────────

export function TeamMatchResultPageClient({ teamMatchId }: { teamMatchId: string }) {
  const { teamMatch, game, revisions, lineup, isError, isLoading, gameId } = useResultScreenBase(teamMatchId, {
    needsOwnLineup: true,
  });
  const createRevision = useV1CreateGameResultRevision(gameId ?? '', teamMatchId);
  const submitRevision = useV1SubmitGameResultRevision(gameId ?? '', teamMatchId);
  const [entries, setEntries] = useState<Record<string, ResultRosterEntryDraft>>({});
  const [awayGoals, setAwayGoals] = useState(0);
  const [mvpParticipantId, setMvpParticipantId] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const isHost = teamMatch.data?.viewer?.manageableHostTeam === true;

  if (isError) {
    return (
      <AppChrome title="경기 결과 입력" activeTab="matches" bottomNav={false} backHref={`/team-matches/${teamMatchId}`} desktopHead>
        <ErrorState
          message="결과 정보를 불러오지 못했어요."
          onRetry={() => retryAll(teamMatch, game, revisions, lineup)}
        />
      </AppChrome>
    );
  }

  if (isLoading || !teamMatch.data) {
    return (
      <AppChrome title="경기 결과 입력" activeTab="matches" bottomNav={false} backHref={`/team-matches/${teamMatchId}`} desktopHead>
        <PageSkeleton variant="detail" />
      </AppChrome>
    );
  }

  if (!isHost) {
    return (
      <AppChrome title="경기 결과 입력" activeTab="matches" bottomNav={false} backHref={`/team-matches/${teamMatchId}`} desktopHead>
        <EmptyState title="호스트만 결과를 입력할 수 있어요" sub="상대팀은 제출된 결과를 승인하거나 정정을 요청할 수 있어요." />
      </AppChrome>
    );
  }

  const status = teamMatchStatus(teamMatch.data);
  if (status !== 'matched' && status !== 'completed') {
    return (
      <AppChrome title="경기 결과 입력" activeTab="matches" bottomNav={false} backHref={`/team-matches/${teamMatchId}`} desktopHead>
        <EmptyState title="아직 결과를 입력할 수 없어요" sub="상대팀이 정해진 이후(매칭 완료)부터 결과를 입력할 수 있어요." />
      </AppChrome>
    );
  }

  const homeSide = game.data?.sides.find((side) => side.sideKey === 'HOME');
  const awaySide = game.data?.sides.find((side) => side.sideKey === 'AWAY');
  const roster = toResultRosterRows(lineup.data?.starters ?? [], lineup.data?.bench ?? []);
  const latest = revisions.data?.[0] ?? null;
  const hostName = teamMatch.data.hostTeam?.name ?? '홈팀';
  const opponentName = teamMatch.data.approvedOpponentTeam?.name ?? '상대팀';
  const canDraft = latest === null || latest.state === 'CHANGE_REQUESTED';
  const canSubmit = latest?.state === 'DRAFT';

  function updateEntry(participantId: string, patch: Partial<ResultRosterEntryDraft>) {
    setEntries((prev) => ({
      ...prev,
      [participantId]: {
        participantId,
        goals: prev[participantId]?.goals ?? 0,
        cards: prev[participantId]?.cards ?? { yellow: 0, red: 0 },
        ...patch,
      },
    }));
  }

  async function handleCreateDraft() {
    if (!homeSide || !awaySide || !game.data) return;
    setFormError(null);
    try {
      const homeGoals = roster.reduce((sum, row) => sum + (entries[row.participantId]?.goals ?? 0), 0);
      const score = { home: homeGoals, away: Math.max(0, awayGoals) };
      const actualParticipants: V1GameResultParticipantInput[] = roster.map((row) => ({
        participantId: row.participantId,
        sideId: homeSide.id,
        started: row.started,
        goals: entries[row.participantId]?.goals ?? 0,
        cards: entries[row.participantId]?.cards ?? { yellow: 0, red: 0 },
        goalkeeper: row.goalkeeper,
      }));
      await createRevision.mutateAsync({
        expectedVersion: game.data.version,
        score,
        actualParticipants,
        eventsHash: hashResultPayload({ score, actualParticipants }),
        ...(mvpParticipantId ? { mvpParticipantId } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
    } catch (err) {
      setFormError(resultErrorMessage(err));
    }
  }

  async function handleSubmit() {
    if (!latest || !game.data) return;
    setFormError(null);
    try {
      await submitRevision.mutateAsync({ revisionId: latest.id, expectedVersion: game.data.version });
    } catch (err) {
      setFormError(resultErrorMessage(err));
    }
  }

  return (
    <AppChrome title="경기 결과 입력" activeTab="matches" bottomNav={false} backHref={`/team-matches/${teamMatchId}`} desktopHead>
      <div style={{ display: 'grid', gap: 14, padding: '0 16px 24px' }}>
        <Card pad={16}>
          <div className="tm-text-body-lg">
            {hostName} <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>(홈)</span>
            {' vs '}
            {opponentName} <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>(원정)</span>
          </div>
          {latest ? (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`tm-badge ${revisionBadgeTone(latest.state)}`}>
                {RESULT_REVISION_STATE_LABEL[latest.state]}
              </span>
              <span className="tm-text-label">{scoreLabel(latest)}</span>
            </div>
          ) : null}
        </Card>

        {formError ? <AlertBanner message={formError} tone="error" /> : null}

        {latest?.state === 'SUBMITTED' ? (
          <Card pad={16}>
            <div className="tm-text-body-lg">상대팀 승인을 기다리고 있어요</div>
            <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-muted)' }}>
              {opponentName}이(가) 결과를 확인하면 공식 기록으로 확정되거나 정정 요청이 도착해요. 48시간 이내에
              응답이 없으면 운영팀이 대신 검토해요.
            </div>
          </Card>
        ) : null}

        {latest?.state === 'OFFICIAL' ? (
          <Card pad={16}>
            <div className="tm-text-body-lg">공식 결과로 확정됐어요</div>
            <div className="tm-text-subhead" style={{ marginTop: 10, fontWeight: 700 }}>{scoreLabel(latest)}</div>
            <GoalTimeline revision={latest} homeName={hostName} awayName={opponentName} />
            {latest.missingScorer ? (
              <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-caption)' }}>
                일부 득점은 선수 지정 없이 기록됐어요.
              </div>
            ) : null}
            <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-muted)' }}>
              {/* Task 17 QA scenario: projection-pending state */}
              개인 기록·팀 전적 반영에는 잠시 시간이 걸릴 수 있어요. 아직 반영 전이어도 결과 자체는 확정된 상태예요.
            </div>
          </Card>
        ) : null}

        {latest?.state === 'VOID' ? (
          <Card pad={16} style={{ background: 'var(--red50)' }}>
            <div className="tm-text-body-lg">이 결과는 무효 처리됐어요</div>
            {latest.reason ? (
              <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-muted)' }}>{latest.reason}</div>
            ) : null}
          </Card>
        ) : null}

        {canSubmit && latest ? (
          <Card pad={16}>
            <div className="tm-text-body-lg">작성한 결과를 확인해 주세요</div>
            <div className="tm-text-label" style={{ marginTop: 10 }}>스코어 {scoreLabel(latest)}</div>
            {latest.reason ? (
              <div className="tm-text-caption" style={{ marginTop: 6, color: 'var(--text-muted)' }}>{latest.reason}</div>
            ) : null}
            <div className="tm-text-caption" style={{ marginTop: 10, color: 'var(--text-caption)' }}>
              제출하면 되돌릴 수 없어요. {opponentName}이(가) 확인 후 승인하거나 정정을 요청할 수 있어요.
            </div>
            <Button
              variant="primary"
              size="lg"
              block
              style={{ marginTop: 14 }}
              loading={submitRevision.isPending}
              onClick={handleSubmit}
            >
              결과 제출하기
            </Button>
          </Card>
        ) : null}

        {canDraft ? (
          <Card pad={16}>
            {latest?.state === 'CHANGE_REQUESTED' && latest.reason ? (
              <AlertBanner tone="warning" message={`상대팀 정정 요청: ${latest.reason}`} />
            ) : null}
            <div className="tm-text-body-lg" style={{ marginTop: latest?.state === 'CHANGE_REQUESTED' ? 12 : 0 }}>
              스코어
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'flex-end' }}>
              <TextField
                label={`${hostName} (홈)`}
                type="number"
                min={0}
                inputMode="numeric"
                value={String(roster.reduce((sum, row) => sum + (entries[row.participantId]?.goals ?? 0), 0))}
                readOnly
                fieldId="result-home-score"
              />
              <TextField
                label={`${opponentName} (원정)`}
                type="number"
                min={0}
                inputMode="numeric"
                value={String(awayGoals)}
                onChange={(event) => setAwayGoals(Math.max(0, Number(event.target.value) || 0))}
                fieldId="result-away-score"
              />
            </div>
            <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-caption)' }}>
              {opponentName}의 득점은 선수 지정 없이 합계로만 기록돼요. 우리 팀 선수 기록은 아래에서 입력해 주세요.
            </div>

            <div className="tm-text-body-lg" style={{ marginTop: 20 }}>우리 팀 선수 기록</div>
            {roster.length === 0 ? (
              <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-muted)' }}>
                제출된 라인업이 없어요. 라인업을 먼저 등록하면 선수별 득점/카드를 기록할 수 있어요.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                {roster.map((row) => (
                  <div key={row.participantId} style={{ border: '1px solid var(--grey100)', borderRadius: 12, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="tm-text-label">
                        {row.jerseyNumber ? `#${row.jerseyNumber} ` : ''}
                        {row.displayName}
                        {row.goalkeeper ? <span className="tm-badge tm-badge-grey" style={{ marginLeft: 6 }}>GK</span> : null}
                        {!row.started ? <span className="tm-badge tm-badge-grey" style={{ marginLeft: 6 }}>후보</span> : null}
                      </div>
                      <label className="tm-text-micro" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="radio"
                          name="result-mvp"
                          checked={mvpParticipantId === row.participantId}
                          onChange={() => setMvpParticipantId(row.participantId)}
                        />
                        MVP
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <TextField
                        label="득점"
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={String(entries[row.participantId]?.goals ?? 0)}
                        onChange={(event) =>
                          updateEntry(row.participantId, { goals: Math.max(0, Number(event.target.value) || 0) })
                        }
                        fieldId={`result-goals-${row.participantId}`}
                      />
                      <TextField
                        label="경고"
                        type="number"
                        min={0}
                        max={2}
                        inputMode="numeric"
                        value={String(entries[row.participantId]?.cards.yellow ?? 0)}
                        onChange={(event) =>
                          updateEntry(row.participantId, {
                            cards: {
                              yellow: Math.max(0, Number(event.target.value) || 0),
                              red: entries[row.participantId]?.cards.red ?? 0,
                            },
                          })
                        }
                        fieldId={`result-yellow-${row.participantId}`}
                      />
                      <TextField
                        label="퇴장"
                        type="number"
                        min={0}
                        max={1}
                        inputMode="numeric"
                        value={String(entries[row.participantId]?.cards.red ?? 0)}
                        onChange={(event) =>
                          updateEntry(row.participantId, {
                            cards: {
                              yellow: entries[row.participantId]?.cards.yellow ?? 0,
                              red: Math.max(0, Number(event.target.value) || 0),
                            },
                          })
                        }
                        fieldId={`result-red-${row.participantId}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <TextField
                label="메모"
                optional
                multiline
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                fieldId="result-reason"
              />
            </div>

            <Button
              variant="primary"
              size="lg"
              block
              style={{ marginTop: 16 }}
              loading={createRevision.isPending}
              onClick={handleCreateDraft}
            >
              결과 작성 완료
            </Button>
          </Card>
        ) : null}

        <ResultRevisionHistory history={revisions.data ?? []} />
      </div>
    </AppChrome>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Opponent: approve / request change
// ─────────────────────────────────────────────────────────────────────────────

export function TeamMatchResultApprovalPageClient({ teamMatchId }: { teamMatchId: string }) {
  const { teamMatch, game, revisions, isError, isLoading, gameId } = useResultScreenBase(teamMatchId, {
    needsOwnLineup: false,
  });
  const decideRevision = useV1DecideGameResultRevision(gameId ?? '', teamMatchId);
  const [changeReason, setChangeReason] = useState('');
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isOpponent = teamMatch.data?.viewer?.state === 'approved';

  if (isError) {
    return (
      <AppChrome title="경기 결과 승인" activeTab="matches" bottomNav={false} backHref={`/team-matches/${teamMatchId}`} desktopHead>
        <ErrorState message="결과 정보를 불러오지 못했어요." onRetry={() => retryAll(teamMatch, game, revisions)} />
      </AppChrome>
    );
  }

  if (isLoading || !teamMatch.data) {
    return (
      <AppChrome title="경기 결과 승인" activeTab="matches" bottomNav={false} backHref={`/team-matches/${teamMatchId}`} desktopHead>
        <PageSkeleton variant="detail" />
      </AppChrome>
    );
  }

  if (!isOpponent) {
    return (
      <AppChrome title="경기 결과 승인" activeTab="matches" bottomNav={false} backHref={`/team-matches/${teamMatchId}`} desktopHead>
        <EmptyState title="상대팀만 결과를 승인할 수 있어요" sub="결과 작성/제출은 홈팀 담당자만 할 수 있어요." />
      </AppChrome>
    );
  }

  const latest = revisions.data?.[0] ?? null;
  const hostName = teamMatch.data.hostTeam?.name ?? '홈팀';
  const opponentName = teamMatch.data.approvedOpponentTeam?.name ?? '상대팀';

  async function handleApprove() {
    if (!latest || !game.data) return;
    setFormError(null);
    try {
      await decideRevision.mutateAsync({ revisionId: latest.id, expectedVersion: game.data.version, decision: 'approve' });
    } catch (err) {
      setFormError(resultErrorMessage(err));
    }
  }

  async function handleRequestChange() {
    if (!latest || !game.data || !changeReason.trim()) return;
    setFormError(null);
    try {
      await decideRevision.mutateAsync({
        revisionId: latest.id,
        expectedVersion: game.data.version,
        decision: 'change_request',
        reason: changeReason.trim(),
      });
      setShowChangeForm(false);
      setChangeReason('');
    } catch (err) {
      setFormError(resultErrorMessage(err));
    }
  }

  return (
    <AppChrome title="경기 결과 승인" activeTab="matches" bottomNav={false} backHref={`/team-matches/${teamMatchId}`} desktopHead>
      <div style={{ display: 'grid', gap: 14, padding: '0 16px 24px' }}>
        <Card pad={16}>
          <div className="tm-text-body-lg">
            {hostName} <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>(홈)</span>
            {' vs '}
            {opponentName} <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>(원정)</span>
          </div>
        </Card>

        {formError ? <AlertBanner message={formError} tone="error" /> : null}

        {latest === null ? (
          <EmptyState title="아직 제출된 결과가 없어요" sub={`${hostName}이(가) 결과를 제출하면 여기서 확인할 수 있어요.`} />
        ) : latest.state === 'SUBMITTED' ? (
          <Card pad={16}>
            <div className="tm-text-body-lg">제출된 결과예요. 확인 후 승인해 주세요</div>
            <div className="tm-text-subhead" style={{ marginTop: 10, fontWeight: 700 }}>{scoreLabel(latest)}</div>
            <GoalTimeline revision={latest} homeName={hostName} awayName={opponentName} />
            {latest.missingScorer ? (
              <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-caption)' }}>
                일부 득점은 선수 지정 없이 기록됐어요.
              </div>
            ) : null}

            {!showChangeForm ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <Button variant="primary" size="lg" loading={decideRevision.isPending} onClick={handleApprove}>
                  승인하기
                </Button>
                <Button variant="outline" size="lg" onClick={() => setShowChangeForm(true)} disabled={decideRevision.isPending}>
                  정정 요청
                </Button>
              </div>
            ) : (
              <div style={{ marginTop: 16 }}>
                <TextField
                  label="정정 요청 사유"
                  multiline
                  rows={3}
                  value={changeReason}
                  onChange={(event) => setChangeReason(event.target.value)}
                  fieldId="result-change-reason"
                  placeholder="어떤 부분이 다른지 알려주세요"
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <Button
                    variant="danger"
                    disabled={!changeReason.trim()}
                    loading={decideRevision.isPending}
                    onClick={handleRequestChange}
                  >
                    정정 요청 보내기
                  </Button>
                  <Button variant="neutral" onClick={() => setShowChangeForm(false)} disabled={decideRevision.isPending}>
                    취소
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ) : latest.state === 'OFFICIAL' ? (
          <Card pad={16}>
            <div className="tm-text-body-lg">공식 결과로 확정됐어요</div>
            <div className="tm-text-subhead" style={{ marginTop: 10, fontWeight: 700 }}>{scoreLabel(latest)}</div>
            <GoalTimeline revision={latest} homeName={hostName} awayName={opponentName} />
            {latest.missingScorer ? (
              <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-caption)' }}>
                일부 득점은 선수 지정 없이 기록됐어요.
              </div>
            ) : null}
            <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-muted)' }}>
              개인 기록·팀 전적 반영에는 잠시 시간이 걸릴 수 있어요.
            </div>
          </Card>
        ) : latest.state === 'CHANGE_REQUESTED' ? (
          <Card pad={16}>
            <div className="tm-text-body-lg">정정을 요청했어요</div>
            <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-muted)' }}>
              {hostName}이(가) 새 결과를 작성하면 다시 확인 요청이 와요.
            </div>
          </Card>
        ) : (
          <Card pad={16}>
            <div className="tm-text-body-lg">{RESULT_REVISION_STATE_LABEL[latest.state]}</div>
          </Card>
        )}

        <ResultRevisionHistory history={revisions.data ?? []} />
      </div>
    </AppChrome>
  );
}

function ResultRevisionHistory({ history }: { history: V1GameResultRevision[] }) {
  if (history.length === 0) return null;
  return (
    <Card pad={16}>
      <div className="tm-text-body-lg">변경 이력</div>
      <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
        {history.map((revision) => (
          <div key={revision.id} style={{ borderTop: '1px solid var(--grey100)', paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="tm-text-label">
                {revision.revision}차 · {scoreLabel(revision)}
                {revision.supersedesId ? <span className="tm-badge tm-badge-grey" style={{ marginLeft: 6 }}>정정</span> : null}
              </span>
              <span className={`tm-badge ${revisionBadgeTone(revision.state)}`}>
                {RESULT_REVISION_STATE_LABEL[revision.state]}
              </span>
            </div>
            {revision.reason ? (
              <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>{revision.reason}</div>
            ) : null}
            <div className="tm-text-micro" style={{ marginTop: 4, color: 'var(--text-caption)' }}>
              제출 {formatDateTime(revision.submittedAt)}
              {revision.officialAt ? ` · 확정 ${formatDateTime(revision.officialAt)}` : ''}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
