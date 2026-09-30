import type { Prisma } from '@prisma/client';
import { resolveLineupParticipantUsers } from '../games/roster/team-match-lineup-accounts';
import type { OfficialScore } from './game-result-official-projection.types';
import { resolveTeamRecordResult } from './team-record-result';

type Tx = Prisma.TransactionClient;

export type ResultSide = 'HOME' | 'AWAY';

export interface PersonalRecord {
  readonly goals: number;
  readonly assists: number;
}

/** 리그·대회 결과 확정 알림 한 명. `record` 가 있으면 공식 결과의 출전자다. */
export interface OfficialResultRecipient {
  readonly userId: string;
  readonly side: ResultSide;
  readonly record: PersonalRecord | null;
}

const OUTCOME_LABEL = { WON: '승리', DRAWN: '무승부', LOST: '패배' } as const;

function personalRecordText(record: PersonalRecord | null): string | null {
  if (record === null) return null;
  const parts = [record.goals > 0 ? `${record.goals}골` : null, record.assists > 0 ? `${record.assists}도움` : null];
  const text = parts.filter((part): part is string => part !== null).join(' ');
  return text === '' ? null : text;
}

/**
 * "(경기명) · 마포 FC 2 : 1 합정 유나이티드 · 승리. 내 기록 1골이에요." — 승패는 받는 사람 팀 기준이고
 * 승부차기로 갈린 경기는 승부차기까지 반영한다(`resolveTeamRecordResult` 와 같은 판정). 개인 기록 문장은
 * 출전자에게 골·도움이 있을 때만 붙는다.
 */
export function officialResultNoticeBody(input: {
  label: string;
  homeName: string;
  awayName: string;
  score: OfficialScore;
  side: ResultSide;
  record: PersonalRecord | null;
}): string {
  const { score } = input;
  const home = input.side === 'HOME';
  const outcome = resolveTeamRecordResult(
    home ? score.home : score.away,
    home ? score.away : score.home,
    home ? score.penalties?.home : score.penalties?.away,
    home ? score.penalties?.away : score.penalties?.home,
  );
  const shootout = score.penalties === undefined ? '' : ` (승부차기 ${score.penalties.home} : ${score.penalties.away})`;
  const headline = `${input.label} · ${input.homeName} ${score.home} : ${score.away} ${input.awayName}${shootout} · ${OUTCOME_LABEL[outcome]}.`;
  const record = personalRecordText(input.record);
  // "골"·"도움" 모두 받침으로 끝나 조사는 항상 "이에요"다.
  return record === null ? headline : `${headline} 내 기록 ${record}이에요.`;
}

/** 본문의 양 팀 이름. 팀이 비어 있는 사이드는 기존 대회 알림과 같은 이름으로 쓴다. */
export async function loadResultTeamNames(
  tx: Tx,
  homeTeamId: string | null,
  awayTeamId: string | null,
): Promise<{ homeName: string; awayName: string }> {
  const ids = [homeTeamId, awayTeamId].filter((id): id is string => id !== null);
  const teams = ids.length === 0 ? [] : await tx.v1Team.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const nameOf = (teamId: string | null) => teams.find((team) => team.id === teamId)?.name;
  return { homeName: nameOf(homeTeamId) ?? '홈팀', awayName: nameOf(awayTeamId) ?? '원정팀' };
}

/**
 * 결과 확정 알림 수신자 — 양 팀 팀장·매니저 + 그 공식 결과의 출전자(결과 참가자 행). 발송 시점에 그 팀
 * 활성 멤버인 사람만 받는다(팀을 나간 출전자·비팀원 제외). 결과 행이 없는 선수(명단에서 빠진 선수)는
 * 출전자가 아니다. 참가자 → 계정은 신원 연결 기준(`resolveLineupParticipantUsers`)으로 푼다.
 */
export async function loadOfficialResultRecipients(
  tx: Tx,
  input: { revisionId: string; gameId: string; homeTeamId: string | null; awayTeamId: string | null },
): Promise<OfficialResultRecipient[]> {
  const teams = [
    { teamId: input.homeTeamId, side: 'HOME' as const },
    { teamId: input.awayTeamId, side: 'AWAY' as const },
  ].filter((team): team is { teamId: string; side: ResultSide } => team.teamId !== null);
  if (teams.length === 0) return [];

  const [memberships, sides, resultRows] = await Promise.all([
    tx.v1TeamMembership.findMany({
      where: { teamId: { in: teams.map((team) => team.teamId) }, status: 'active' },
      select: { teamId: true, userId: true, role: true },
    }),
    tx.v1GameSide.findMany({ where: { gameId: input.gameId }, select: { id: true, teamId: true } }),
    tx.v1GameResultParticipant.findMany({
      where: { resultRevisionId: input.revisionId },
      select: { participantId: true, goals: true, assists: true },
    }),
  ]);
  const participants = resultRows.length === 0
    ? []
    : await tx.v1GameParticipant.findMany({
        where: { id: { in: resultRows.map((row) => row.participantId) } },
        select: { id: true, sideId: true, userId: true, displayNameSnapshot: true },
      });
  // 계정으로 풀리지 않는 참가자(계정 없는 폴백 명단 등)는 알림 대상이 아니다.
  const accountByParticipant = new Map((await resolveLineupParticipantUsers(tx, participants)).map((account) => [account.id, account]));
  const teamIdBySideId = new Map(sides.map((side) => [side.id, side.teamId]));

  const recipients = new Map<string, OfficialResultRecipient>();
  for (const team of teams) {
    const members = memberships.filter((membership) => membership.teamId === team.teamId);
    const memberIds = new Set(members.map((membership) => membership.userId));
    const records = new Map<string, PersonalRecord>();
    for (const row of resultRows) {
      const account = accountByParticipant.get(row.participantId);
      if (account === undefined || teamIdBySideId.get(account.sideId) !== team.teamId || !memberIds.has(account.userId)) continue;
      const total = records.get(account.userId) ?? { goals: 0, assists: 0 };
      records.set(account.userId, { goals: total.goals + row.goals, assists: total.assists + row.assists });
    }
    const managers = members.filter((membership) => membership.role === 'owner' || membership.role === 'manager');
    for (const userId of [...records.keys(), ...managers.map((membership) => membership.userId)]) {
      if (!recipients.has(userId)) recipients.set(userId, { userId, side: team.side, record: records.get(userId) ?? null });
    }
  }
  return [...recipients.values()];
}
