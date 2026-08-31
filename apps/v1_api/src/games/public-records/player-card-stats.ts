import type { PrismaService } from '../../prisma/prisma.service';
import type { PlayerCardPosition } from '../../profile/player-card';
import {
  isParticipantOwnerVisible,
  isParticipantPubliclyEligible,
  loadParticipantConsentEligibility,
  type ParticipantConsentEligibility,
} from './public-consent';

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
  readonly position: PlayerCardPosition;
  /**
   * 등번호. 라인업 스냅샷에서 **가장 자주 단 번호**를 쓴다.
   *
   * 팀 고정 등번호(`V1TeamMembership.jerseyNumber`)가 아니라 실제 출전 기록에서 뽑는
   * 이유: 카드의 다른 값이 전부 "실제로 뛴 것"에서 나오는데 등번호만 팀 설정에서
   * 오면, 그 팀을 떠난 뒤에도 옛 번호가 카드에 남는다.
   */
  readonly jerseyNumber: number | null;
  /**
   * **지금 기록 공개 동의를 켜면 실제로 공개될 공식 결과 행이 하나라도 있는가.**
   *
   * "연결이 하나라도 있는가"(옛 `hasAnyLink`)가 아니다 -- 그 질문으로는 카드가 지킬 수
   * 없는 약속을 한다. 연결은 결과보다 먼저 생긴다: 팀장이 라인업을 저장하는 순간
   * (`team-matches/team-match-lineup.service.ts` saveLineup) 그 명단에 오른 사람 전원에게
   * 연결이 만들어지고, 대회는 등록 명단으로 대진을 만들 때
   * (`tournaments/tournament-bracket.service.ts`) 같은 일을 한다. 그 시점엔 공식 결과가
   * 0건이므로, 연결만 보고 "동의를 켜면 골·도움·출전이 열려요"라고 말하면 켜도 아무것도
   * 열리지 않는다 -- 경기가 취소되거나 운영자가 결과를 끝내 입력하지 않으면 영구화된다.
   *
   * 그래서 판정 기준을 **약속이 지켜지는 조건 그대로**로 맞춘다: 개별 숨김이 아닌 연결에
   * 달린, 공식 확정된(`officialAt != null`) 현재 리비전 결과 행이 1건 이상.
   * 2026-08-24 alpha 실측으로 한 번, 2026-08-26 라인업 연결 경로로 또 한 번 재발한
   * '거짓 약속' 결함이 여기서 갈린다.
   */
  readonly hasUnlockableRecords: boolean;
}

const EMPTY: PlayerCardRecordStats = {
  appearances: 0,
  goals: 0,
  assists: 0,
  position: null,
  jerseyNumber: null,
  hasUnlockableRecords: false,
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
  // 동의를 켰을 때 공개 후보가 되는 참가 기록. 개별 숨김(participant 단위 REVOKED)은
  // 사용자 단위 동의로 풀리지 않으므로(`isParticipantPubliclyEligible`) 여기서 미리 뺀다 --
  // 그걸 후보에 남기면 "켜면 열려요"가 다시 거짓말이 된다.
  const unlockable = participantIds.filter((participantId) => {
    const row = eligibility.get(participantId);
    return row !== undefined && isParticipantOwnerVisible(row);
  });
  if (unlockable.length === 0) return EMPTY;
  // 지금 이미 공개되는 것 = 카드에 숫자를 채울 수 있는 것. 동의 전이면 빈 집합이다.
  const visible = new Set(
    unlockable.filter((participantId) =>
      isParticipantPubliclyEligible(eligibility.get(participantId) as ParticipantConsentEligibility),
    ),
  );

  // 후보 전체를 조회한다. 동의 전(visible 이 빈 집합)에도 "켜면 열릴 것이 있는지"를
  // 알아야 하므로 공개 게이트를 통과한 것만 조회할 수 없다.
  const rows = await prisma.v1GameResultParticipant.findMany({
    where: { participantId: { in: unlockable } },
    select: {
      participantId: true,
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
  // 동의를 켜면 열릴 경기(공개 여부와 무관하게 공식 게이트만 통과한 것).
  const unlockableGameIds = new Set<string>();
  for (const row of rows) {
    const revision = row.resultRevision;
    if (revision.officialAt === null) continue;
    if (revision.game.currentOfficialRevisionId !== revision.id) continue;
    unlockableGameIds.add(revision.gameId);
    // 아직 공개 게이트를 통과하지 않은 행은 약속의 근거일 뿐, 카드 숫자에는 넣지 않는다.
    if (!visible.has(row.participantId)) continue;
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

  // 연결은 있어도 공개될 공식 결과가 0건이면 동의는 해결책이 아니다 -- 그 사람에게
  // 필요한 건 경기다. 여기서 EMPTY 로 돌려야 카드가 `appearances` 잠금을 안내한다.
  //
  // **이 조기 반환이 끊는 것은 숫자만이 아니다 -- 아래 라인업 조회
  // (`v1GameParticipant.findMany`)까지 건너뛰므로 `position`·`jerseyNumber` 도 null 로
  // 나가고, 그 결과 `profile/player-card.ts` 의 `POSITION_WEIGHTS` 가 FW/MF/DF/GK 대신
  // DEFAULT 를 쓴다(후기 3건 이상이면 `overall` 이 1점 안팎 달라진다). 의도한 동작이니
  // 되돌리지 말 것.** 근거 셋:
  //   · 이 파일이 `jerseyNumber` 주석에서 약속한 대로 카드의 값은 전부 "실제로 뛴 것"에서
  //     나온다. 라인업에 이름만 올랐고 공식 출전이 0건인 사람에게 포지션·등번호를 주면
  //     그 약속이 다시 깨진다 -- 아직 치르지도 않은 예정 라인업이 "이 선수의 포지션"으로
  //     굳고, 경기가 취소되면 근거 없는 채로 영구히 남는다.
  //   · 화면은 이 null 을 이미 처리한다(v1_web `components/users/player-card.tsx` -- 포지션은
  //     '포지션 미정' 으로 표시하고 등번호 칩은 통째로 숨긴다). 깨진 화면이 아니다.
  //   · 관측 가능한 변화인 것은 맞다 -- "회귀 아님"으로 넘기지 말 것. 대회 라인업 저장
  //     경로(`games/games.service.ts` saveLineup)는 이 변경 전에도 position·jerseyNumber 가
  //     실린 participant 에 신원 연결을 만들었으므로, 동의를 켜 두고 결과가 아직 없는
  //     사람은 전에는 'FW·9번'이 보였고 지금은 안 보인다(대진 생성 경로
  //     `tournaments/tournament-bracket.service.ts` 는 애초에 둘을 싣지 않아 원래부터
  //     null 이었다). 그래도 이 방향이 옳다: 되돌리면 `hasUnlockableRecords` 가 막은
  //     '거짓 약속'을 포지션·등번호가 뒷문으로 다시 연다 -- 공식 출전이 0건인데 카드가
  //     "이 사람은 FW 9번"이라고 단언하게 된다. 가중치가 DEFAULT 로 떨어지는 것도 같은
  //     이유로 옳다: 근거가 없는 포지션으로 총점을 기울이지 않는다.
  if (unlockableGameIds.size === 0) return EMPTY;
  // 동의 전이라 아직 아무것도 공개되지 않는다. 약속만 남기고 숫자는 내주지 않는다.
  if (visible.size === 0) return { ...EMPTY, hasUnlockableRecords: true };

  let goals = 0;
  let assists = 0;
  let goalkeeperGames = 0;
  for (const game of byGame.values()) {
    goals += game.goals;
    assists += game.assists;
    if (game.goalkeeper) goalkeeperGames += 1;
  }

  // 포지션은 라인업 스냅샷에서 읽는다. 가장 많이 선 자리를 쓴다 -- 한 번 골키퍼를
  // 본 필드 플레이어가 골키퍼 카드가 되면 안 된다.
  // 주의: 골키퍼 플래그는 라인업(V1GameParticipant)이 아니라 **결과 행**
  // (V1GameResultParticipant.goalkeeper)에 있다. 라인업에는 position 문자열만 있고,
  // 종목 프리셋에 따라 그 값이 'GK'(축구) 또는 'GOLEIRO'(풋살)로 들어온다.
  const lineup = await prisma.v1GameParticipant.findMany({
    where: { id: { in: [...visible] } },
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
    position,
    jerseyNumber,
    hasUnlockableRecords: true,
  };
}
