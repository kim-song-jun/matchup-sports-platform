import { formatTournamentDateShort } from '@/lib/date-utils';
import type { PublicUserRecordItem, PublicUserRecordsSummary } from './types';

/**
 * 경기 기록 공개 동의를 묻는 자리(홈 배너·설정 화면)가 "지금 켜면 무엇이, 어디에 공개되는지"를
 * 사용자의 실제 기록으로 보여 주기 위한 파생값. 서버가 이미 주는 본인 조회(`GET /users/:me/records`,
 * 동의 전에도 items 가 온다)만 쓴다 -- 동의용 API 를 따로 두지 않는다.
 */

/**
 * 행 상단 캡션에 붙일 대회/리그 이름(F6). 대회 경기는 대회명, 정규 리그 대진은 리그명을 같은 자리에
 * 같은 표기로 보여 주고, 리그가 아닌 친선 팀매치는 아무것도 붙지 않는다. 서버 계약상 둘이 동시에
 * 채워지는 행은 없지만 우선순위는 백엔드 `classifyTeamRecordCategory` 와 같은 순서로 고정한다.
 */
export function competitionLabel(item: PublicUserRecordItem): string | null {
  return item.tournamentTitle ?? item.leagueTitle ?? null;
}

/** 팀 vs 상대 표기. 활동 기록 행과 같은 문구를 쓴다. */
export function matchupLabel(item: PublicUserRecordItem): string {
  return `${item.teamName ?? '소속 미상'} vs ${item.opponentTeamName ?? '상대 미상'}`;
}

/** `1골`, `2도움` 처럼 0 이 아닌 것만 골라 붙인다. */
function goalAssistParts(goals: number, assists: number): string[] {
  return [goals > 0 ? `${goals}골` : null, assists > 0 ? `${assists}도움` : null].filter(
    (part): part is string => part !== null,
  );
}

export interface PendingRecordLine {
  /** `9/30 (수) · 마포 주말 리그` -- 날짜 · 대회/리그 이름(친선은 날짜만). */
  readonly caption: string;
  readonly result: PublicUserRecordItem['result'];
  /** `마포 FC vs 합정 유나이티드` */
  readonly matchup: string;
  /** `내 기록 · 1골 · 1도움` -- 득점·도움이 없으면 `내 기록 · 엔트리`. */
  readonly stats: string;
}

export function describePendingRecord(item: PublicUserRecordItem): PendingRecordLine {
  const competition = competitionLabel(item);
  const date = formatTournamentDateShort(item.officialAt);
  const stats = goalAssistParts(item.goals, item.assists);
  return {
    caption: [date, competition].filter((part): part is string => part !== null).join(' · '),
    result: item.result,
    matchup: matchupLabel(item),
    stats: ['내 기록', ...(stats.length > 0 ? stats : ['엔트리'])].join(' · '),
  };
}

/**
 * 리그·대회 득점/도움 순위는 0 기록을 싣지 않고 친선 경기는 순위 대상이 아니다. 그래서 순위에
 * 이름이 오르는 사람은 리그·대회에서 골이나 도움이 하나라도 있는 사람뿐이다.
 */
function rankedTotals(summary: PublicUserRecordsSummary): { goals: number; assists: number } {
  const { league, tournament } = summary.byType;
  return { goals: league.goals + tournament.goals, assists: league.assists + tournament.assists };
}

export function appearsInRanking(summary: PublicUserRecordsSummary): boolean {
  const { goals, assists } = rankedTotals(summary);
  return goals + assists > 0;
}

export interface RecordExposureRow {
  readonly key: 'ranking' | 'activity' | 'matchDetail';
  readonly title: string;
  readonly example: string;
}

/**
 * "공개하면 이렇게 보여요" -- 공개 후 내 기록이 나타나는 곳과 그때의 모습. 순위는 순위에 오를 때만
 * 넣는다(오르지 않는데 오른다고 하면 켜고 나서 화면이 그대로라 신뢰를 잃는다). 경기 상세의 이름은
 * 동의와 무관하게 이미 나가고, 동의가 여는 것은 그 이름에서 이어지는 프로필 링크다.
 */
export function buildRecordExposureRows(
  summary: PublicUserRecordsSummary,
  nickname: string | null,
): RecordExposureRow[] {
  const rows: RecordExposureRow[] = [];
  if (appearsInRanking(summary)) {
    const { goals, assists } = rankedTotals(summary);
    rows.push({
      key: 'ranking',
      title: '리그·대회 득점·도움 순위',
      example: [nickname ?? '내 닉네임', ...goalAssistParts(goals, assists)].join(' · '),
    });
  }
  rows.push({
    key: 'activity',
    title: '선수 활동 기록',
    example: [`엔트리 ${summary.appearances}경기`, ...goalAssistParts(summary.goals, summary.assists)].join(' · '),
  });
  rows.push({
    key: 'matchDetail',
    title: '경기 상세',
    example: '경기 상세에서 내 이름을 누르면 내 활동 기록이 열려요',
  });
  return rows;
}
