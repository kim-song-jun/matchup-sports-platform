import type { PrismaService } from '../../prisma/prisma.service';
import type { PlayerCardPosition } from '../../profile/player-card';
import { isParticipantPubliclyEligible, loadParticipantConsentEligibility } from './public-consent';

/**
 * 선수 카드의 **기록 쪽 입력**을 모은다 (Task 155).
 *
 * 공개 기록 목록(`GET /users/:id/records`)과 **같은 게이트**를 쓴다 --
 * `officialAt != null` + `currentOfficialRevisionId === resultRevisionId` + 동의.
 * 게이트가 갈리면 카드의 "12경기"와 기록 목록의 행 수가 어긋나고, 사용자는 둘 중
 * 무엇이 맞는지 알 수 없게 된다.
 *
 * 이 파일이 `public-records/` 에 있는 이유: 게이트 판정을 아는 곳은 여기다.
 * 산식(`profile/player-card.ts`)은 DB 를 모르는 순수 함수로 남긴다.
 */

export interface PlayerCardRecordStats {
  /** 공개 가능한 출전 경기 수(gameId 중복 제거 후). */
  readonly appearances: number;
  readonly goals: number;
  readonly assists: number;
  readonly startedCount: number;
  readonly position: PlayerCardPosition;
  /**
   * 등번호. 라인업 스냅샷에서 **가장 자주 단 번호**를 쓴다.
   *
   * 팀 고정 등번호(`V1TeamMembership.jerseyNumber`)가 아니라 실제 출전 기록에서 뽑는
   * 이유: 카드의 다른 값이 전부 "실제로 뛴 것"에서 나오는데 등번호만 팀 설정에서
   * 오면, 그 팀을 떠난 뒤에도 옛 번호가 카드에 남는다.
   */
  readonly jerseyNumber: number | null;
  /** 연결된 participant 가 하나라도 있는가 -- 동의만 없는 상태와 애초에 기록이 없는 상태를 가른다. */
  readonly hasAnyLink: boolean;
}

const EMPTY: PlayerCardRecordStats = {
  appearances: 0,
  goals: 0,
  assists: 0,
  startedCount: 0,
  position: null,
  jerseyNumber: null,
  hasAnyLink: false,
};

/**
 * 라인업의 포지션 문자열을 카드 표기(FW/MF/DF/GK)로 접는다.
 *
 * 종목마다 프리셋이 달라 같은 자리를 다르게 부른다(축구 GK, 풋살 GOLEIRO). 스키마도
 * 골키퍼만 별도 `goalkeeper` 플래그로 들고 있어서, 여기서도 플래그를 먼저 본다.
 * 모르는 값은 억지로 분류하지 않고 null 로 둔다 -- 그러면 가중치가 균등해진다.
 */
export function normalizePosition(raw: string | null, goalkeeper: boolean): PlayerCardPosition {
  if (goalkeeper) return 'GK';
  if (raw === null) return null;
  const code = raw.trim().toUpperCase();
  if (code === 'GK' || code === 'GOLEIRO') return 'GK';
  if (code.startsWith('FW') || code === 'ST' || code === 'CF' || code === 'PIVO') return 'FW';
  if (code.startsWith('MF') || code === 'CM' || code === 'ALA') return 'MF';
  if (code.startsWith('DF') || code === 'CB' || code === 'FIXO') return 'DF';
  return null;
}

export async function loadPlayerCardRecordStats(
  prisma: PrismaService,
  userId: string,
): Promise<PlayerCardRecordStats> {
  const links = await prisma.v1ParticipantIdentityLinkCurrent.findMany({
    where: { userId },
    select: { participantId: true },
  });
  if (links.length === 0) return EMPTY;
  const participantIds = links.map((link) => link.participantId);

  const eligibility = await loadParticipantConsentEligibility(prisma, participantIds);
  const visible = participantIds.filter((participantId) => {
    const row = eligibility.get(participantId);
    return row !== undefined && isParticipantPubliclyEligible(row);
  });
  if (visible.length === 0) return { ...EMPTY, hasAnyLink: true };

  const rows = await prisma.v1GameResultParticipant.findMany({
    where: { participantId: { in: visible } },
    select: {
      goals: true,
      assists: true,
      started: true,
      goalkeeper: true,
      resultRevision: {
        select: {
          id: true,
          officialAt: true,
          gameId: true,
          game: { select: { currentOfficialRevisionId: true } },
        },
      },
    },
  });

  // 같은 경기가 여러 participant 행으로 잡힐 수 있다(대회 도중 로스터 갱신 등).
  // gameId 로 접지 않으면 한 경기가 두 번 세어져 경기당 골이 절반으로 희석된다.
  const byGame = new Map<string, { goals: number; assists: number; started: boolean; goalkeeper: boolean }>();
  for (const row of rows) {
    const revision = row.resultRevision;
    if (revision.officialAt === null) continue;
    if (revision.game.currentOfficialRevisionId !== revision.id) continue;
    const existing = byGame.get(revision.gameId);
    if (existing === undefined) {
      byGame.set(revision.gameId, {
        goals: row.goals,
        assists: row.assists,
        started: row.started,
        goalkeeper: row.goalkeeper,
      });
      continue;
    }
    // 한 경기 안의 여러 행은 합산한다 -- 교체로 두 행이 생겨도 골은 둘 다 그 선수 것이다.
    existing.goals += row.goals;
    existing.assists += row.assists;
    existing.started = existing.started || row.started;
    existing.goalkeeper = existing.goalkeeper || row.goalkeeper;
  }

  let goals = 0;
  let assists = 0;
  let startedCount = 0;
  let goalkeeperGames = 0;
  for (const game of byGame.values()) {
    goals += game.goals;
    assists += game.assists;
    if (game.started) startedCount += 1;
    if (game.goalkeeper) goalkeeperGames += 1;
  }

  // 포지션은 라인업 스냅샷에서 읽는다. 가장 많이 선 자리를 쓴다 -- 한 번 골키퍼를
  // 본 필드 플레이어가 골키퍼 카드가 되면 안 된다.
  // 주의: 골키퍼 플래그는 라인업(V1GameParticipant)이 아니라 **결과 행**
  // (V1GameResultParticipant.goalkeeper)에 있다. 라인업에는 position 문자열만 있고,
  // 종목 프리셋에 따라 그 값이 'GK'(축구) 또는 'GOLEIRO'(풋살)로 들어온다.
  const lineup = await prisma.v1GameParticipant.findMany({
    where: { id: { in: visible } },
    select: { position: true, jerseyNumber: true },
  });
  const tally = new Map<string, number>();
  const jerseyTally = new Map<number, number>();
  for (const entry of lineup) {
    const code = normalizePosition(entry.position, false);
    if (code !== null) tally.set(code, (tally.get(code) ?? 0) + 1);
    if (entry.jerseyNumber !== null) {
      jerseyTally.set(entry.jerseyNumber, (jerseyTally.get(entry.jerseyNumber) ?? 0) + 1);
    }
  }
  let position: PlayerCardPosition = null;
  let best = 0;
  for (const [code, count] of tally) {
    if (count > best) {
      best = count;
      position = code as PlayerCardPosition;
    }
  }
  // 라인업에 포지션이 하나도 안 적혀 있어도, 결과 행에서 골키퍼로 뛴 경기가 과반이면 GK 다.
  if (position === null && byGame.size > 0 && goalkeeperGames * 2 > byGame.size) {
    position = 'GK';
  }

  // 등번호도 포지션과 같은 규칙 -- 가장 자주 단 번호. 한 경기 빌린 번호가 카드에
  // 박히면 안 된다. 동률이면 작은 번호를 쓴다(Map 순회 순서에 결과가 좌우되지 않게).
  let jerseyNumber: number | null = null;
  let jerseyBest = 0;
  for (const [number, count] of [...jerseyTally.entries()].sort((a, b) => a[0] - b[0])) {
    if (count > jerseyBest) {
      jerseyBest = count;
      jerseyNumber = number;
    }
  }

  return {
    appearances: byGame.size,
    goals,
    assists,
    startedCount,
    position,
    jerseyNumber,
    hasAnyLink: true,
  };
}
