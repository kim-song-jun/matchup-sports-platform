'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { useShellOverride } from '@/components/v1-ui/shell-override';
import { AlertBanner, Card, EmptyState, ErrorState, TextField } from '@/components/v1-ui/primitives';
import { ClockIcon } from '@/components/v1-ui/icons';
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
import { randomUuid } from '@/lib/uuid';
import { formatTournamentDateLong } from '@/lib/date-utils';
import type {
  V1GameResultParticipantInput,
  V1GameResultRevision,
  V1TeamMatch,
  V1TeamMatchApiStatus,
} from '@/types/api';
import {
  CARD_TYPE_LABEL,
  RESULT_REVISION_STATE_LABEL,
  hashResultPayload,
  hydrateResultFormFromRevision,
  toResultRosterRows,
  displayRevisionReason,
} from './team-match-result.types';
import type { CardDraft, GoalDraft, ResultRosterRow } from './team-match-result.types';

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
  // game-invariants.ts가 이벤트 없는 팀 매치(TEAM_MATCH, events.length===0)는 이
  // 교차검증 자체를 건너뛰도록 예외 처리를 이미 갖고 있어(팀 매치는 라이브 심판 기록이
  // 없어 이벤트 스트림이 원래 비어 있다) 정상적인 결과 제출에서는 이 에러가 나지 않는다
  // — "0:0만 지원" 메시지는 그 예외가 생기기 전 상태를 설명한 옛 문구였다(실제로는
  // 안 나는데도 사용자에게 거짓 제약을 안내하고 있었음). 이 에러가 실제로 뜬다면
  // 진짜 다른 결함(예: 관리자가 별도로 기록한 이벤트와 불일치)이라 일반 메시지로 안내한다.
  SCORE_EVENT_MISMATCH: '결과 내용에 문제가 있어 저장하지 못했어요. 입력한 득점·카드를 다시 확인해 주세요.',
  LEAGUE_NOT_FOUND: '이 리그의 대진이 아니에요.',
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
 *
 * `score.goals` 는 레거시 백필 스냅샷(`{regulation, goals, ...}`) 에만 존재한다 — 이 화면이
 * 직접 만든 결과의 `score`는 `{home, away}` 로 평평해 `goals` 필드 자체가 없다(타입 정의 참고,
 * `types/api.ts`의 `V1GameResultScore`). 그 경로에서는 타임라인 없이 스코어만 보여주면 된다.
 */
function GoalTimeline({ revision, homeName, awayName }: {
  revision: V1GameResultRevision;
  homeName: string;
  awayName: string;
}) {
  const score = revision.score;
  const goals = score && 'goals' in score ? score.goals ?? [] : [];
  if (goals.length === 0) return null;
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
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
  // 스코어 응답은 두 형태가 실제로 공존한다(types/api.ts의 V1GameResultScore 참고) —
  // 레거시 백필 경기는 score.regulation 아래, 이 화면이 만든 team-match 결과는
  // score.home/score.away 로 평평하다. regulation만 가정하면 새로 작성한 결과가 실제
  // DB에 점수가 있는데도 "기록 없음"으로 보였다(2026-08 QA에서 3:1 저장 확인, 실제 버그).
  const score = revision.score;
  if (!score) return '기록 없음';
  if ('regulation' in score) {
    // 미완 결과(TEAM_MATCH_COMPLETION_ONLY 등)는 regulation이 null일 수 있다.
    if (!score.regulation) return '기록 없음';
    return `${score.regulation.home} : ${score.regulation.away}`;
  }
  return `${score.home} : ${score.away}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function revisionBadgeTone(state: V1GameResultRevision['state']) {
  if (state === 'OFFICIAL') return 'tm-badge-green';
  if (state === 'CHANGE_REQUESTED' || state === 'VOID') return 'tm-badge-red';
  if (state === 'SUBMITTED') return 'tm-badge-orange';
  return 'tm-badge-grey';
}

/**
 * Shared loading/error/not-ready gate for both the entry and approval screens.
 *
 * U3: 리그 대진에서는 라인업 조회를 아예 건너뛴다. 리그전은 참가팀의 **모든 active
 * 멤버**가 결과 영수증을 볼 수 있는데(participantMember), `GET /team-matches/:id/lineup`은
 * owner/manager가 아니면 403을 던진다(team-match-lineup.service.ts loadContext) — 일반
 * 멤버가 리그 결과 화면에 들어오면 needsOwnLineup=true 그대로는 이 403이 `isError`를
 * 덮어써서 정상적인 영수증 대신 에러 화면을 보게 된다. 리그 결과는 애초에 라인업을
 * 쓰지 않는다(LeagueMatchResultEntryService는 항상 actualParticipants=[]).
 */
function useResultScreenBase(teamMatchId: string, options: { needsOwnLineup: boolean }) {
  const teamMatch = useV1TeamMatch(teamMatchId);
  const gameId = teamMatch.data?.gameId ?? null;
  const isLeague = teamMatch.data?.league != null;
  const shouldFetchLineup = options.needsOwnLineup && !isLeague;
  const game = useV1Game(gameId, { enabled: Boolean(teamMatch.data) });
  const revisions = useV1GameResultRevisions(gameId, { enabled: Boolean(teamMatch.data) });
  const lineup = useV1TeamMatchLineup(teamMatchId, {
    enabled: shouldFetchLineup && Boolean(teamMatch.data),
  });

  const isError = teamMatch.isError || game.isError || revisions.isError || (shouldFetchLineup && lineup.isError);
  const isLoading =
    teamMatch.isLoading ||
    (Boolean(gameId) && (game.isLoading || revisions.isLoading)) ||
    (shouldFetchLineup && Boolean(teamMatch.data) && lineup.isLoading);

  return { teamMatch, game, revisions, lineup, isError, isLoading, gameId };
}

function retryAll(...queries: Array<{ refetch: () => unknown }>) {
  queries.forEach((query) => query.refetch());
}

/**
 * P0-4: 상대팀 승인 화면 + 호스트의 SUBMITTED/OFFICIAL 화면에서 득점자·카드·MVP를 보여준다.
 *
 * `resultParticipants`에는 이름이 없다(participantId만 있음, `V1GameResultParticipantRow`
 * 참고). 상대팀 승인 화면은 애초에 이름을 가져올 방법이 없다 — `TeamMatchLineupService.getLineup`도
 * `GamesService.listLineups`도 참가팀 액터에게는 항상 자기 팀(ownSideId) 라인업만 돌려주고,
 * 상대팀(호스트) 라인업을 조회하는 엔드포인트는 존재하지 않는다(공정성 원칙 — 정정 요청은
 * blind action). 그래서 `roster`가 없으면 이름 대신 participantId 앞 8자를 노출한다 —
 * "완전히 안 보이는 것"보다는 선수를 구분할 수 있는 만큼은 낫다.
 *
 * 호스트는 자기 팀 라인업(`roster`)을 항상 조회할 수 있으므로, 호스트 화면에서는 이 컴포넌트에
 * `roster`를 넘겨 실명 표시로 격상한다 — SUBMITTED 승인 대기 중과 OFFICIAL 확정 후에도(감사
 * 백로그 M-E) 제출 직후 입력한 득점자·카드·MVP가 화면에서 사라지면 안 된다.
 */
function ApprovalParticipantSummary({
  resultParticipants,
  mvpParticipantId,
  roster,
}: {
  resultParticipants: V1GameResultRevision['resultParticipants'];
  mvpParticipantId: string | null;
  roster?: ResultRosterRow[];
}) {
  const scorers = resultParticipants.filter((row) => row.goals > 0);
  const carded = resultParticipants.filter((row) => row.cards.yellow > 0 || row.cards.red > 0);
  if (scorers.length === 0 && carded.length === 0 && !mvpParticipantId) return null;

  const label = (participantId: string) => {
    const rosterRow = roster?.find((row) => row.participantId === participantId);
    if (rosterRow) return `${rosterRow.jerseyNumber ? `#${rosterRow.jerseyNumber} ` : ''}${rosterRow.displayName}`;
    return `선수 #${participantId.slice(0, 8)}`;
  };

  return (
    <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
      {scorers.length > 0 ? (
        <div>
          <div className="tm-text-label">득점자</div>
          <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
            {scorers.map((row) => (
              <div key={row.id} className="tm-text-caption">{label(row.participantId)} · {row.goals}골</div>
            ))}
          </div>
        </div>
      ) : null}
      {carded.length > 0 ? (
        <div>
          <div className="tm-text-label">옐로카드·레드카드</div>
          <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
            {carded.map((row) => (
              <div key={row.id} className="tm-text-caption">
                {label(row.participantId)}
                {row.cards.yellow > 0 ? ` · ${CARD_TYPE_LABEL.yellow} ${row.cards.yellow}` : ''}
                {row.cards.red > 0 ? ` · ${CARD_TYPE_LABEL.red} ${row.cards.red}` : ''}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {mvpParticipantId ? (
        <div>
          <div className="tm-text-label">MVP</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>{label(mvpParticipantId)}</div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 호스트의 "제출 전 검토" 단계에서 보여주는 요약 — 스코어 · 골별 득점자 · 경고/퇴장 ·
 * MVP · 메모를 한 화면에 모아서, 제출 직전에 되돌아가 고칠 수 있게 한다(P0-3).
 *
 * `roster`(호스트 자신의 라인업)로 participantId -> 이름을 그대로 매핑할 수 있다 —
 * 상대팀 승인 화면과 달리 호스트는 자기 팀 라인업을 항상 조회할 수 있기 때문이다.
 */
function ResultDraftSummary({
  roster,
  homeGoals,
  cardDrafts,
  mvpParticipantId,
  reason,
  hostName,
  awayGoals,
  opponentName,
}: {
  roster: ResultRosterRow[];
  homeGoals: GoalDraft[];
  cardDrafts: CardDraft[];
  mvpParticipantId: string;
  reason: string;
  hostName: string;
  awayGoals: number;
  opponentName: string;
}) {
  function nameFor(participantId: string | null): string {
    if (!participantId) return '익명';
    const row = roster.find((r) => r.participantId === participantId);
    if (!row) return participantId;
    return `${row.jerseyNumber ? `#${row.jerseyNumber} ` : ''}${row.displayName}`;
  }

  return (
    <div style={{ display: 'grid', gap: 16, marginTop: 12 }}>
      <div>
        <div className="tm-text-label">스코어</div>
        <div className="tm-text-subhead" style={{ marginTop: 4, fontWeight: 700 }}>
          {hostName} {homeGoals.length} : {Math.max(0, awayGoals)} {opponentName}
        </div>
      </div>
      {homeGoals.length > 0 ? (
        <div>
          <div className="tm-text-label">득점자</div>
          <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
            {homeGoals.map((goal, index) => (
              <div key={goal.key} className="tm-text-caption">
                {index + 1}번 골 · {nameFor(goal.participantId)}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {cardDrafts.length > 0 ? (
        <div>
          <div className="tm-text-label">옐로카드·레드카드</div>
          <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
            {cardDrafts.map((card) => (
              <div key={card.key} className="tm-text-caption">
                {nameFor(card.participantId)} · {CARD_TYPE_LABEL[card.type]}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <div className="tm-text-label">MVP</div>
        <div className="tm-text-caption" style={{ marginTop: 8 }}>
          {mvpParticipantId ? nameFor(mvpParticipantId) : '선택 안 함'}
        </div>
      </div>
      {reason.trim() ? (
        <div>
          <div className="tm-text-label">메모</div>
          <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-muted)' }}>{displayRevisionReason(reason)}</div>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// League fixtures: 확정 영수증
//
// Task 166: 여기 있던 "이의 D-day 카드"(U3, 2026-08-24 A안)를 없앴다 — 정본 §4 가
// 이의 경로 자체를 제거했다(2026-09-02 사용자 확정). 팀이 결과에 문제를 발견하면
// 운영자에게 연락하고, 운영자가 콘솔에서 정정·무효한다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * U3-A안(2026-08-24 사용자 확정): 리그 대진의 결과 화면은 "확정 영수증"이 최상단이고
 * 이의는 그 아래 D-day 카드다 — "승인" 프레이밍이 없다. 호스트 진입점
 * (`TeamMatchResultPageClient`)과 상대팀 진입점(`TeamMatchResultApprovalPageClient`)
 * 양쪽 다 이 컴포넌트로 합류한다: 리그 결과는 운영자가 입력·즉시 확정하므로(E1) 두
 * 팀이 서로 승인할 대상 자체가 없다.
 */
function LeagueTeamMatchResultPage({
  teamMatchId,
  teamMatch,
  revisions,
}: {
  teamMatchId: string;
  teamMatch: V1TeamMatch;
  revisions: V1GameResultRevision[];
}) {
  const league = teamMatch.league;
  const hostName = teamMatch.hostTeam?.name ?? '홈팀';
  const opponentName = teamMatch.approvedOpponentTeam?.name ?? '상대팀';
  const latest = revisions[0] ?? null;
  const participantMember = teamMatch.viewer?.participantMember === true;
  // 리그 대진일 때만 아는 값(teamMatch.league는 fetch 이후에만 존재) — 이 함수는
  // TeamMatchResultPageClient/TeamMatchResultApprovalPageClient 양쪽에서 진입하는데
  // 두 라우트 모두 route-chrome 테이블 기본 제목은 "경기 결과 입력"/"경기 결과 승인"이라
  // 이 화면에서만 "경기 결과"로 덮어써야 한다(fragments/team-matches.ts 주석 참고).
  useShellOverride({ title: '경기 결과' });

  return (
    <>
      <div style={{ display: 'grid', gap: 16, padding: '16px 20px 24px' }}>
        <Card pad={16}>
          <div className="tm-text-body-lg">
            {hostName} <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>(홈)</span>
            {' vs '}
            {opponentName} <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>(원정)</span>
          </div>
        </Card>

        {!participantMember ? (
          <EmptyState title="참가팀만 볼 수 있어요" sub="이 리그 대진에 참가한 팀의 멤버만 결과를 확인할 수 있어요." />
        ) : (
          <>
            {latest?.state === 'OFFICIAL' ? (
              <Card pad={16}>
                <div className="tm-text-body-lg">공식 결과로 확정됐어요</div>
                <div className="tm-text-subhead" style={{ marginTop: 12, fontWeight: 700 }}>{scoreLabel(latest)}</div>
                <GoalTimeline revision={latest} homeName={hostName} awayName={opponentName} />
                <ApprovalParticipantSummary
                  resultParticipants={latest.resultParticipants}
                  mvpParticipantId={latest.mvpParticipantId}
                />
                {latest.reason ? (
                  <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-muted)' }}>{displayRevisionReason(latest.reason)}</div>
                ) : null}
              </Card>
            ) : latest?.state === 'VOID' ? (
              <Card pad={16} style={{ background: 'var(--red50)' }}>
                <div className="tm-text-body-lg">이 결과는 무효 처리됐어요</div>
                {latest.reason ? (
                  <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-muted)' }}>{displayRevisionReason(latest.reason)}</div>
                ) : null}
              </Card>
            ) : (
              <EmptyState title="아직 결과가 없어요" sub="운영자가 결과를 입력하면 여기에 표시돼요." />
            )}

          </>
        )}

        <ResultRevisionHistory history={revisions} />
      </div>
    </>
  );
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
  // 점수 먼저 입력 -> 그 개수만큼 득점자 드롭다운이 생기는 흐름(QA 지적으로 재설계) —
  // 선수 11명 전원에게 득점/카드 숫자칸을 하나씩 주는 대신, "몇 골 넣었는지"를 먼저
  // 정하고 그 골 하나하나에 누가 넣었는지(미지정 허용)를 드롭다운으로 배정한다.
  // 카드도 동일하게 "카드 추가" 버튼으로 [선수, 경고/퇴장] 행을 늘려가는 방식이다.
  // 제출 시점에 이 이벤트 목록을 선수별 합계(goals/cards)로 접어서 기존 백엔드
  // 계약(actualParticipants)에 그대로 실어 보낸다 — 백엔드 변경은 없다.
  const [homeGoals, setHomeGoals] = useState<GoalDraft[]>([]);
  const [cardDrafts, setCardDrafts] = useState<CardDraft[]>([]);
  const [awayGoals, setAwayGoals] = useState(0);
  const [mvpParticipantId, setMvpParticipantId] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  // 벤치 선수 중 실제로 교체 투입된 사람. 라인업에 이름이 올랐다는 것과 경기에 나갔다는
  // 것은 다르고, 결과에 실리는 선수만 개인 기록의 "출전"으로 집계되므로(백엔드
  // PublicUserRecordsService.summary.appearances) 끝까지 벤치를 지킨 선수는 여기서
  // 빠진 채 제출된다. 대회 경기는 운영 콘솔의 SUBSTITUTION 이벤트가 같은 판정을
  // 대신하지만(games.service.ts#deriveTournamentRevision), 팀 매치에는 라이브 이벤트
  // 스트림이 없어 이 화면이 그 입력을 받는 유일한 곳이다.
  const [substituteIds, setSubstituteIds] = useState<string[]>([]);
  // P0-3: "결과 작성 완료"는 더 이상 그 자리에서 서버에 DRAFT를 만들지 않는다 — 로컬
  // 단계만 'reviewing'으로 넘어가고, 실제 제출(createRevision -> submitRevision 순차 호출)은
  // 검토 화면의 "제출하기"를 눌러야 일어난다. 그래야 득점자를 잘못 골랐을 때 "수정하기"로
  // 언제든 되돌아갈 수 있다(예전에는 서버에 DRAFT가 생기는 순간 입력 폼이 통째로 사라졌다).
  const [stage, setStage] = useState<'editing' | 'reviewing'>('editing');
  // P0-2: 스코어 입력창은 이제 실제 득점자 배열(homeGoals)과 분리된 로컬 문자열 버퍼를 가진다.
  // 그래야 입력 도중(백스페이스로 잠깐 ''가 되는 순간 등) 배열이 즉시 잘려나가지 않는다.
  const [homeGoalsInput, setHomeGoalsInput] = useState('0');
  const [awayGoalsInput, setAwayGoalsInput] = useState('0');
  // 골 수를 줄였다가 다시 늘리는 흔한 케이스(오타 정정 등)에서 방금 지운 득점자 선택이
  // 그대로 복원되도록 하는 버퍼. 완벽한 undo는 아니고, "줄였다 다시 늘리면 원래대로"만 보장한다.
  const removedGoalsRef = useRef<GoalDraft[]>([]);
  // 같은 CHANGE_REQUESTED revision을 두 번 재수화하지 않기 위한 가드 — 없으면 사용자가
  // 폼을 고치는 중에도 매 렌더(revisions.data 참조가 바뀔 때마다)마다 서버 값으로 덮어써버린다.
  const hydratedRevisionIdRef = useRef<string | null>(null);

  // 상대팀이 정정을 요청하면(state가 CHANGE_REQUESTED로 바뀌면) 이전 세션에서 검토 단계에
  // 머물러 있던 상태가 그대로 남아있으면 안 되므로 입력 단계로 되돌린다. 같은 세션에서 방금
  // "결과 작성 완료"를 누른 경우라면 로컬 state가 이미 값을 갖고 있으니 재수화가 필요 없지만,
  // 새로고침 후 재진입한 경우(로컬 state는 비어있고 서버에만 정정요청 revision이 있는 경우)엔
  // hydrateResultFormFromRevision으로 이전에 작성했던 득점자·카드·MVP·메모를 복원한다.
  useEffect(() => {
    const rev = revisions.data?.[0];
    if (!rev || rev.state !== 'CHANGE_REQUESTED') return;
    setStage('editing');
    if (hydratedRevisionIdRef.current === rev.id) return;
    hydratedRevisionIdRef.current = rev.id;
    const hydrated = hydrateResultFormFromRevision(rev);
    setHomeGoals(hydrated.homeGoals);
    setHomeGoalsInput(String(hydrated.homeGoals.length));
    setAwayGoals(hydrated.awayGoals);
    setAwayGoalsInput(String(hydrated.awayGoals));
    setCardDrafts(hydrated.cardDrafts);
    setMvpParticipantId(hydrated.mvpParticipantId);
    setReason(hydrated.reason);
    setSubstituteIds(hydrated.substituteIds);
    removedGoalsRef.current = [];
  }, [revisions.data]);

  function commitHomeGoalCount(count: number) {
    const clamped = Math.max(0, Math.min(99, count));
    if (clamped > homeGoals.length) {
      const need = clamped - homeGoals.length;
      const restored: GoalDraft[] = [];
      for (let i = 0; i < need; i += 1) {
        const fromBuffer = removedGoalsRef.current.shift();
        restored.push(fromBuffer ?? { key: randomUuid(), participantId: null });
      }
      setHomeGoals([...homeGoals, ...restored]);
    } else if (clamped < homeGoals.length) {
      const removed = homeGoals.slice(clamped);
      removedGoalsRef.current = [...removedGoalsRef.current, ...removed];
      setHomeGoals(homeGoals.slice(0, clamped));
    }
    setHomeGoalsInput(String(clamped));
  }

  function handleHomeGoalsInputChange(value: string) {
    setHomeGoalsInput(value);
    // 빈 문자열(백스페이스로 지우는 중)이나 아직 완결되지 않은 입력은 커밋하지 않는다 —
    // 여기서 즉시 0으로 확정해버리면 지정해둔 득점자가 전부 사라진다(P0-2 재현 조건).
    if (value.trim() === '') return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    commitHomeGoalCount(parsed);
  }

  function handleHomeGoalsBlur() {
    const parsed = Number(homeGoalsInput);
    commitHomeGoalCount(Number.isFinite(parsed) ? parsed : 0);
  }

  function handleAwayGoalsInputChange(value: string) {
    setAwayGoalsInput(value);
    if (value.trim() === '') return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setAwayGoals(Math.max(0, parsed));
  }

  function handleAwayGoalsBlur() {
    const parsed = Number(awayGoalsInput);
    const safe = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    setAwayGoals(safe);
    setAwayGoalsInput(String(safe));
  }

  function setGoalScorer(key: string, participantId: string | null) {
    setHomeGoals((prev) => prev.map((goal) => (goal.key === key ? { ...goal, participantId } : goal)));
  }

  // P1: 카드는 "누구 카드인지" 실수로 잘못 고르는 게 득점자 미지정보다 더 위험하다(경고 누적
  // 퇴장·다음 경기 출전정지 같은 실제 페널티로 이어짐) — 그래서 첫 번째 선수를 자동 선택하지
  // 않고 미지정(participantId: '') placeholder로 추가한다. 제출 시점에 이 상태가 남아있으면
  // handleReviewClick에서 막는다.
  function addCard() {
    setCardDrafts((prev) => [...prev, { key: randomUuid(), participantId: '', type: 'yellow' }]);
  }

  function updateCard(key: string, patch: Partial<Pick<CardDraft, 'participantId' | 'type'>>) {
    setCardDrafts((prev) => prev.map((card) => (card.key === key ? { ...card, ...patch } : card)));
  }

  function removeCard(key: string) {
    setCardDrafts((prev) => prev.filter((card) => card.key !== key));
  }

  const isHost = teamMatch.data?.viewer?.manageableHostTeam === true;

  if (isError) {
    return (
      <>
        <ErrorState
          message="결과 정보를 불러오지 못했어요."
          onRetry={() => retryAll(teamMatch, game, revisions, lineup)}
        />
      </>
    );
  }

  if (isLoading || !teamMatch.data) {
    return (
      <>
        <PageSkeleton variant="detail" />
      </>
    );
  }

  // U3-A안: 리그 대진은 "호스트만 입력" 프레이밍이 아예 없다 — 운영자가 결과를
  // 입력·즉시 확정하므로(E1) 양 팀 참가자 전원이 같은 확정 영수증 뷰로 합류한다.
  if (teamMatch.data.league) {
    return (
      <LeagueTeamMatchResultPage teamMatchId={teamMatchId} teamMatch={teamMatch.data} revisions={revisions.data ?? []} />
    );
  }

  if (!isHost) {
    return (
      <>
        <EmptyState title="호스트만 결과를 입력할 수 있어요" sub="상대팀은 제출된 결과를 승인하거나 정정을 요청할 수 있어요." />
      </>
    );
  }

  const status = teamMatchStatus(teamMatch.data);
  if (status !== 'matched' && status !== 'completed') {
    return (
      <>
        <EmptyState title="아직 결과를 입력할 수 없어요" sub="상대팀이 정해진 이후(매칭 완료)부터 결과를 입력할 수 있어요." />
      </>
    );
  }

  const homeSide = game.data?.sides.find((side) => side.sideKey === 'HOME');
  const awaySide = game.data?.sides.find((side) => side.sideKey === 'AWAY');
  const roster = toResultRosterRows(lineup.data?.starters ?? [], lineup.data?.bench ?? []);
  // 득점자·카드·MVP를 고를 수 있는 대상이자 결과에 실릴 대상 — 선발 전원 + 교체 투입으로
  // 체크된 벤치 선수. 출전하지 않은 선수에게 골을 붙일 수 있으면 그 자체가 모순이므로
  // 드롭다운도 이 목록만 쓴다.
  const appearedRoster = roster.filter((row) => row.started || substituteIds.includes(row.participantId));
  const benchRoster = roster.filter((row) => !row.started);
  const latest = revisions.data?.[0] ?? null;

  // 체크를 해제하면 그 선수에게 이미 붙어 있던 골·카드·MVP도 함께 걷어낸다 — 남겨두면
  // 결과에 없는 선수를 가리키는 득점자가 그대로 제출된다(골 개수는 유지하고 "미지정"으로
  // 되돌려, 호스트가 스코어를 다시 맞출 필요는 없게 한다).
  function toggleSubstitute(participantId: string, cameOn: boolean) {
    setSubstituteIds((current) =>
      cameOn
        ? current.includes(participantId)
          ? current
          : [...current, participantId]
        : current.filter((id) => id !== participantId),
    );
    if (cameOn) return;
    setHomeGoals((current) =>
      current.map((goal) => (goal.participantId === participantId ? { ...goal, participantId: null } : goal)),
    );
    setCardDrafts((current) => current.filter((card) => card.participantId !== participantId));
    setMvpParticipantId((current) => (current === participantId ? '' : current));
  }
  const hostName = teamMatch.data.hostTeam?.name ?? '홈팀';
  const opponentName = teamMatch.data.approvedOpponentTeam?.name ?? '상대팀';
  const canDraft = latest === null || latest.state === 'CHANGE_REQUESTED';
  const canSubmit = latest?.state === 'DRAFT';

  // P0-3: 검토 화면의 "제출하기"에서만 호출된다 — createRevision과 submitRevision을
  // 순차로 호출해, 사용자 입장에서는 "제출"이라는 단일 액션으로 끝난다. 그 전까지는
  // 서버에 아무것도 만들어지지 않으므로 "수정하기"로 몇 번이든 되돌아갈 수 있다.
  async function handleConfirmSubmit() {
    if (!homeSide || !awaySide || !game.data) return;
    setFormError(null);
    try {
      const score = { home: homeGoals.length, away: Math.max(0, awayGoals) };
      const goalsByParticipant = new Map<string, number>();
      for (const goal of homeGoals) {
        if (goal.participantId === null) continue;
        goalsByParticipant.set(goal.participantId, (goalsByParticipant.get(goal.participantId) ?? 0) + 1);
      }
      const cardsByParticipant = new Map<string, { yellow: number; red: number }>();
      for (const card of cardDrafts) {
        const current = cardsByParticipant.get(card.participantId) ?? { yellow: 0, red: 0 };
        if (card.type === 'yellow') current.yellow += 1;
        else current.red += 1;
        cardsByParticipant.set(card.participantId, current);
      }
      // 출전자만 싣는다 — 벤치를 지킨 선수까지 보내면 서버가 그 row를 그대로 저장하고
      // 개인 프로필의 "출전 N경기"가 뛰지 않은 경기까지 세게 된다.
      const actualParticipants: V1GameResultParticipantInput[] = appearedRoster.map((row) => ({
        participantId: row.participantId,
        sideId: homeSide.id,
        started: row.started,
        goals: goalsByParticipant.get(row.participantId) ?? 0,
        // 이 자가 제출 폼은 아직 선수별 도움/파울 입력을 받지 않는다(라이브 기록
        // 콘솔에서만 수집 — T3). 이벤트가 없는 팀매치는 game-invariants.ts의
        // teamMatchWithoutEvents 예외로 검증이 스킵되므로 0으로 보내도 안전하다.
        assists: 0,
        fouls: 0,
        cards: cardsByParticipant.get(row.participantId) ?? { yellow: 0, red: 0 },
        goalkeeper: row.goalkeeper,
      }));
      const created = await createRevision.mutateAsync({
        expectedVersion: game.data.version,
        score,
        actualParticipants,
        eventsHash: hashResultPayload({ score, actualParticipants }),
        ...(mvpParticipantId ? { mvpParticipantId } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      await submitRevision.mutateAsync({ revisionId: created.revisionId, expectedVersion: created.version });
    } catch (err) {
      setFormError(resultErrorMessage(err));
    }
  }

  // 드물게(제출 순차 호출 중 두 번째 단계인 submit만 실패하는 등) 서버에 DRAFT가 이미
  // 만들어진 채로 화면을 다시 열게 되는 경우에 대비한 재제출 경로 — 새로 만들지 않고
  // 이미 있는 DRAFT를 그대로 제출한다.
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
    <>
      {/* 상단 여백이 0이라 헤더 바로 아래 카드가 붙어 답답해 보인다는 지적(QA) — 다른
          화면(예: 라인업 페이지)의 16px 20px 관례를 그대로 맞춘다. */}
      <div className="tm-content-enter" style={{ display: 'grid', gap: 16, padding: '16px 20px 24px' }}>
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
            {/* 감사 백로그 M-E: 제출 직후(SUBMITTED)에도 방금 입력한 득점자·카드·MVP가 그대로
                남아 있어야 한다 — roster를 넘겨 실명으로 보여준다. */}
            <ApprovalParticipantSummary resultParticipants={latest.resultParticipants} mvpParticipantId={latest.mvpParticipantId} roster={roster} />
            {latest.missingScorer ? (
              <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-caption)' }}>
                일부 득점은 선수 지정 없이 기록됐어요.
              </div>
            ) : null}
          </Card>
        ) : null}

        {latest?.state === 'OFFICIAL' ? (
          <Card pad={16}>
            <div className="tm-text-body-lg">공식 결과로 확정됐어요</div>
            <div className="tm-text-subhead" style={{ marginTop: 12, fontWeight: 700 }}>{scoreLabel(latest)}</div>
            <GoalTimeline revision={latest} homeName={hostName} awayName={opponentName} />
            {/* 감사 백로그 M-E: GoalTimeline은 레거시 백필 score({goals:[...]})에서만 렌더된다
                (docblock 참고) — 이 화면이 만드는 평평한 score({home,away})에서는 항상 null이라
                득점자·카드·MVP를 보여줄 방법이 없었다. resultParticipants + roster로 실명 요약을 보여준다. */}
            <ApprovalParticipantSummary resultParticipants={latest.resultParticipants} mvpParticipantId={latest.mvpParticipantId} roster={roster} />
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
              <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-muted)' }}>{displayRevisionReason(latest.reason)}</div>
            ) : null}
          </Card>
        ) : null}

        {canSubmit && latest ? (
          <Card pad={16}>
            <div className="tm-text-body-lg">작성한 결과를 확인해 주세요</div>
            <div className="tm-text-label" style={{ marginTop: 12 }}>스코어 {scoreLabel(latest)}</div>
            {/* 카드(옐로/레드)는 이전에 이 블록에서 누락돼 있었다 — ApprovalParticipantSummary로
                통일해 득점자·카드·MVP를 빠짐없이 보여준다(감사 백로그 M-E). */}
            <ApprovalParticipantSummary resultParticipants={latest.resultParticipants} mvpParticipantId={latest.mvpParticipantId} roster={roster} />
            {latest.reason ? (
              <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-muted)' }}>{displayRevisionReason(latest.reason)}</div>
            ) : null}
            <div className="tm-text-caption" style={{ marginTop: 12, color: 'var(--text-caption)' }}>
              제출하면 되돌릴 수 없어요. {opponentName}이(가) 확인 후 승인하거나 정정을 요청할 수 있어요.
            </div>
            <Button
              variant="primary"
              size="lg"
              block
              style={{ marginTop: 16 }}
              loading={submitRevision.isPending}
              onClick={handleSubmit}
            >
              결과 제출하기
            </Button>
          </Card>
        ) : null}

        {canDraft && stage === 'reviewing' ? (
          <Card pad={16}>
            <div className="tm-text-body-lg">작성한 결과를 확인해 주세요</div>
            <ResultDraftSummary
              roster={roster}
              homeGoals={homeGoals}
              cardDrafts={cardDrafts}
              mvpParticipantId={mvpParticipantId}
              reason={reason}
              hostName={hostName}
              awayGoals={awayGoals}
              opponentName={opponentName}
            />
            <div className="tm-text-caption" style={{ marginTop: 12, color: 'var(--text-caption)' }}>
              제출하면 되돌릴 수 없어요. {opponentName}이(가) 확인 후 승인하거나 정정을 요청할 수 있어요.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <Button
                variant="outline"
                size="lg"
                disabled={createRevision.isPending || submitRevision.isPending}
                onClick={() => {
                  setFormError(null);
                  setStage('editing');
                }}
              >
                수정하기
              </Button>
              <Button
                variant="primary"
                size="lg"
                style={{ flex: 1 }}
                loading={createRevision.isPending || submitRevision.isPending}
                onClick={handleConfirmSubmit}
              >
                제출하기
              </Button>
            </div>
          </Card>
        ) : null}

        {canDraft && stage === 'editing' ? (
          <Card pad={16}>
            {latest?.state === 'CHANGE_REQUESTED' && latest.reason ? (
              <AlertBanner tone="warning" message={`상대팀 정정 요청: ${displayRevisionReason(latest.reason)}`} />
            ) : null}
            <div className="tm-text-body-lg" style={{ marginTop: latest?.state === 'CHANGE_REQUESTED' ? 12 : 0 }}>
              1. 스코어
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'flex-end' }}>
              <TextField
                label={`${hostName} (홈)`}
                type="number"
                min={0}
                inputMode="numeric"
                value={homeGoalsInput}
                onChange={(event) => handleHomeGoalsInputChange(event.target.value)}
                onBlur={handleHomeGoalsBlur}
                fieldId="result-home-score"
              />
              <TextField
                label={`${opponentName} (원정)`}
                type="number"
                min={0}
                inputMode="numeric"
                value={awayGoalsInput}
                onChange={(event) => handleAwayGoalsInputChange(event.target.value)}
                onBlur={handleAwayGoalsBlur}
                fieldId="result-away-score"
              />
            </div>
            <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-caption)' }}>
              {opponentName}의 득점은 선수 지정 없이 합계로만 기록돼요.
            </div>

            {roster.length === 0 ? (
              <div className="tm-text-caption" style={{ marginTop: 20, color: 'var(--text-muted)' }}>
                제출된 라인업이 없어요. 라인업을 먼저 등록하면 득점자·카드를 기록할 수 있어요.
              </div>
            ) : (
              <>
                <div className="tm-text-body-lg" style={{ marginTop: 20 }}>2. 출전 선수</div>
                <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-caption)' }}>
                  선발 {roster.length - benchRoster.length}명은 자동으로 출전 처리돼요. 교체로 들어간
                  선수만 체크해 주세요 — 체크하지 않은 선수는 이 경기에 출전한 것으로 기록되지 않아요.
                </div>
                {benchRoster.length === 0 ? (
                  <div className="tm-text-caption" style={{ marginTop: 12, color: 'var(--text-muted)' }}>
                    교체 명단이 비어 있어요.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 4, marginTop: 12 }}>
                    {benchRoster.map((row) => (
                      <label
                        key={row.participantId}
                        className="tm-text-body"
                        style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, cursor: 'pointer' }}
                      >
                        <input
                          type="checkbox"
                          checked={substituteIds.includes(row.participantId)}
                          onChange={(event) => toggleSubstitute(row.participantId, event.target.checked)}
                        />
                        <span>
                          {row.jerseyNumber ? `#${row.jerseyNumber} ` : ''}
                          {row.displayName}
                        </span>
                        <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                          교체 출전
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                <div className="tm-text-body-lg" style={{ marginTop: 20 }}>3. 득점자</div>
                {homeGoals.length === 0 ? (
                  <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-muted)' }}>
                    위에서 홈 득점 수를 입력하면 골마다 득점자를 고를 수 있어요.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                    {homeGoals.map((goal, index) => (
                      <div key={goal.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* 프로젝트 컨벤션(label htmlFor + input id)에 맞춘다 — 예전엔 시각 라벨(span)과
                            select가 접근성 이름만 aria-label로 따로 갖고 있어 스크린리더용 이름과
                            눈에 보이는 텍스트가 서로 다른 엘리먼트였다(QA 지적). */}
                        <label htmlFor={`goal-scorer-${goal.key}`} className="tm-text-label" style={{ minWidth: 52 }}>
                          {index + 1}번 골
                        </label>
                        <select
                          id={`goal-scorer-${goal.key}`}
                          className="tm-input"
                          style={{ flex: 1 }}
                          value={goal.participantId ?? ''}
                          onChange={(event) => setGoalScorer(goal.key, event.target.value === '' ? null : event.target.value)}
                        >
                          <option value="">익명</option>
                          {appearedRoster.map((row) => (
                            <option key={row.participantId} value={row.participantId}>
                              {row.jerseyNumber ? `#${row.jerseyNumber} ` : ''}
                              {row.displayName}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}

                <div className="tm-text-body-lg" style={{ marginTop: 20 }}>4. 옐로카드·레드카드</div>
                <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                  {cardDrafts.map((card) => (
                    <div key={card.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label htmlFor={`card-player-${card.key}`} className="sr-only">
                        카드 대상 선수
                      </label>
                      <select
                        id={`card-player-${card.key}`}
                        className="tm-input"
                        style={{ flex: 1 }}
                        value={card.participantId}
                        onChange={(event) => updateCard(card.key, { participantId: event.target.value })}
                      >
                        <option value="">선수를 선택해 주세요</option>
                        {appearedRoster.map((row) => (
                          <option key={row.participantId} value={row.participantId}>
                            {row.jerseyNumber ? `#${row.jerseyNumber} ` : ''}
                            {row.displayName}
                          </option>
                        ))}
                      </select>
                      <label htmlFor={`card-type-${card.key}`} className="sr-only">
                        카드 종류
                      </label>
                      <select
                        id={`card-type-${card.key}`}
                        className="tm-input"
                        style={{ width: 116 }}
                        value={card.type}
                        onChange={(event) => updateCard(card.key, { type: event.target.value as 'yellow' | 'red' })}
                      >
                        <option value="yellow">{CARD_TYPE_LABEL.yellow}</option>
                        <option value="red">{CARD_TYPE_LABEL.red}</option>
                      </select>
                      <button
                        type="button"
                        className="tm-btn tm-btn-sm tm-btn-outline"
                        aria-label="이 카드 기록 제거"
                        onClick={() => removeCard(card.key)}
                      >
                        제거
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="tm-btn tm-btn-sm tm-btn-outline"
                    style={{ justifySelf: 'start' }}
                    onClick={() => addCard()}
                  >
                    + 카드 추가
                  </button>
                </div>

                <label htmlFor="result-mvp-select" className="tm-text-body-lg" style={{ display: 'block', marginTop: 20 }}>
                  5. MVP
                </label>
                <select
                  id="result-mvp-select"
                  className="tm-input"
                  style={{ marginTop: 12, width: '100%' }}
                  value={mvpParticipantId}
                  onChange={(event) => setMvpParticipantId(event.target.value)}
                >
                  <option value="">선택 안 함</option>
                  {appearedRoster.map((row) => (
                    <option key={row.participantId} value={row.participantId}>
                      {row.jerseyNumber ? `#${row.jerseyNumber} ` : ''}
                      {row.displayName}
                    </option>
                  ))}
                </select>
              </>
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
              onClick={() => {
                if (cardDrafts.some((card) => card.participantId === '')) {
                  setFormError('카드 기록에 아직 선수를 선택하지 않은 항목이 있어요.');
                  return;
                }
                setFormError(null);
                setStage('reviewing');
              }}
            >
              결과 작성 완료
            </Button>
          </Card>
        ) : null}

        <ResultRevisionHistory history={revisions.data ?? []} />
      </div>
    </>
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
  // P0-4: 승인은 원클릭이 아니라 확인 단계를 한 번 거친다 — 이 화면은 상대팀 라인업을
  // 조회할 방법이 없어(TeamMatchLineupService.getLineup은 항상 ownSideId만 조회) 선수 이름을
  // 보여줄 수 없다. participantId라도 노출해 "스코어만 보고 원클릭 승인"을 막는다.
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 홈팀 게이트(isHost)와 대칭으로 팀 멤버십을 본다. `state === 'approved'` 는 신청서를 낸
  // 사람 한 명만 통과해서, 운영자가 대진을 만드는 리그전에서는 상대팀 전원이 이 화면에서
  // "상대팀만 결과를 승인할 수 있어요" 로 튕겨 나갔다.
  const isOpponent = teamMatch.data?.viewer?.manageableOpponentTeam === true;

  if (isError) {
    return (
      <>
        <ErrorState message="결과 정보를 불러오지 못했어요." onRetry={() => retryAll(teamMatch, game, revisions)} />
      </>
    );
  }

  if (isLoading || !teamMatch.data) {
    return (
      <>
        <PageSkeleton variant="detail" />
      </>
    );
  }

  // U3-A안: 리그 대진은 "상대팀만 승인" 프레이밍이 아예 없다 — 위 주석이 설명하는
  // alpha 실측 결함(상대팀 전원이 튕겨 나감)도 애초에 이 분기로 우회된다. 운영자가
  // 결과를 입력·즉시 확정하므로(E1) 양 팀 참가자 전원이 같은 확정 영수증 뷰로 합류한다.
  if (teamMatch.data.league) {
    return (
      <LeagueTeamMatchResultPage teamMatchId={teamMatchId} teamMatch={teamMatch.data} revisions={revisions.data ?? []} />
    );
  }

  if (!isOpponent) {
    return (
      <>
        <EmptyState title="상대팀만 결과를 승인할 수 있어요" sub="결과 작성/제출은 홈팀 담당자만 할 수 있어요." />
      </>
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
    <>
      {/* 상단 여백이 0이라 헤더 바로 아래 카드가 붙어 답답해 보인다는 지적(QA) — 다른
          화면(예: 라인업 페이지)의 16px 20px 관례를 그대로 맞춘다. */}
      <div className="tm-content-enter" style={{ display: 'grid', gap: 16, padding: '16px 20px 24px' }}>
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
            <div className="tm-text-subhead" style={{ marginTop: 12, fontWeight: 700 }}>{scoreLabel(latest)}</div>
            <GoalTimeline revision={latest} homeName={hostName} awayName={opponentName} />
            <ApprovalParticipantSummary resultParticipants={latest.resultParticipants} mvpParticipantId={latest.mvpParticipantId} />
            {latest.missingScorer ? (
              <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-caption)' }}>
                일부 득점은 선수 지정 없이 기록됐어요.
              </div>
            ) : null}
            {showChangeForm ? (
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
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
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
            ) : showApproveConfirm ? (
              <div style={{ marginTop: 16 }}>
                <AlertBanner
                  tone="warning"
                  message={`${scoreLabel(latest)} 결과와 선수 기록을 공식 기록으로 승인할까요? 승인 후에는 직접 수정할 수 없어요.`}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <Button variant="primary" size="lg" loading={decideRevision.isPending} onClick={handleApprove}>
                    승인 확정
                  </Button>
                  <Button
                    variant="neutral"
                    size="lg"
                    onClick={() => setShowApproveConfirm(false)}
                    disabled={decideRevision.isPending}
                  >
                    취소
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <Button variant="primary" size="lg" onClick={() => setShowApproveConfirm(true)}>
                  승인하기
                </Button>
                <Button variant="outline" size="lg" onClick={() => setShowChangeForm(true)}>
                  정정 요청
                </Button>
              </div>
            )}
          </Card>
        ) : latest.state === 'OFFICIAL' ? (
          <Card pad={16}>
            <div className="tm-text-body-lg">공식 결과로 확정됐어요</div>
            <div className="tm-text-subhead" style={{ marginTop: 12, fontWeight: 700 }}>{scoreLabel(latest)}</div>
            <GoalTimeline revision={latest} homeName={hostName} awayName={opponentName} />
            {/* 감사 백로그 M-E: 승인 전(SUBMITTED)에는 보이던 득점자·카드·MVP 요약이 승인 버튼을
                누른 순간(OFFICIAL) 사라지고 있었다 — 상대팀은 호스트 라인업이 없어 roster 없이
                호출한다(참가자 #앞 8자 표시, 위 docblock 참고). */}
            <ApprovalParticipantSummary resultParticipants={latest.resultParticipants} mvpParticipantId={latest.mvpParticipantId} />
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
    </>
  );
}

function ResultRevisionHistory({ history }: { history: V1GameResultRevision[] }) {
  if (history.length === 0) return null;
  return (
    <Card pad={16}>
      <div className="tm-text-body-lg">변경 이력</div>
      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        {history.map((revision) => (
          <div key={revision.id} style={{ borderTop: '1px solid var(--grey100)', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="tm-text-label">
                {revision.revision}차 · {scoreLabel(revision)}
                {revision.supersedesId ? <span className="tm-badge tm-badge-grey" style={{ marginLeft: 8 }}>정정</span> : null}
              </span>
              <span className={`tm-badge ${revisionBadgeTone(revision.state)}`}>
                {RESULT_REVISION_STATE_LABEL[revision.state]}
              </span>
            </div>
            {revision.reason ? (
              <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>{displayRevisionReason(revision.reason)}</div>
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
