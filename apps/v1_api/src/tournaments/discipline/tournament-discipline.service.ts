import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  evaluateSuspension,
  suspensionRulesEnabled,
  type PlayedGameCards,
  type SuspensionRules,
  type SuspensionVerdict,
} from './card-suspension';

/**
 * 대회 범위 카드 누적 → 출전정지 판정을 DB에 붙인다. 규칙 자체는
 * `card-suspension.ts`(순수 함수, DB 없이 전수 테스트)에 있고 여기서는 조회만 한다.
 *
 * **판정 단위는 사용자(userId)다.** 참가자 행(`V1GameParticipant`)은 경기마다 새로
 * 생기므로 그것으로는 대회 전체를 가로지르는 누적을 셀 수 없다. userId 가 연결되지
 * 않은 참가자(계정 없이 이름만 적힌 옛 데이터·team-match 경로)는 **판정 대상에서
 * 빠진다** — 억지로 이름 문자열로 묶으면 동명이인이 서로의 카드를 뒤집어쓴다.
 */
@Injectable()
export class TournamentDisciplineService {
  constructor(private readonly prisma: PrismaService) {}

  async rulesFor(tournamentId: string): Promise<SuspensionRules> {
    const tournament = await this.prisma.v1Tournament.findUnique({
      where: { id: tournamentId },
      select: { yellowAccumulationLimit: true, redCardSuspensionMatches: true },
    });
    return {
      yellowAccumulationLimit: tournament?.yellowAccumulationLimit ?? null,
      redCardSuspensionMatches: tournament?.redCardSuspensionMatches ?? null,
    };
  }

  /**
   * `fixtureId` 경기에 대해, 그 대회에서 카드가 누적된 선수들의 정지 여부를 낸다.
   * 규정이 꺼져 있으면 **조회조차 하지 않고** 빈 맵을 준다 — 대다수 대회가 그렇다.
   *
   * 반환: userId → 판정. 판정이 `suspended:false` 인 사람도 포함한다(누적 장수를
   * 화면에 보여줘야 "이번에 한 장 더 받으면 정지"를 미리 알 수 있다).
   */
  async verdictsForFixture(
    tournamentId: string,
    fixtureId: string,
  ): Promise<Map<string, SuspensionVerdict>> {
    const rules = await this.rulesFor(tournamentId);
    if (!suspensionRulesEnabled(rules)) return new Map();

    // 일정 순서 = 정지가 "다음 경기"에 걸린다는 규칙의 기준틀. scheduledAt 이 없는
    // 픽스처는 라운드·번호로 이어 정렬한다 — 순서를 못 정하면 판정 자체가 불가능하다.
    const fixtures = await this.prisma.v1TournamentFixture.findMany({
      where: { tournamentId },
      orderBy: [{ scheduledAt: 'asc' }, { round: 'asc' }, { fixtureNumber: 'asc' }],
      select: { id: true, game: { select: { id: true, currentOfficialRevisionId: true } } },
    });
    const orderByFixtureId = new Map(fixtures.map((fixture, index) => [fixture.id, index + 1]));
    const upcomingGameOrder = orderByFixtureId.get(fixtureId);
    if (upcomingGameOrder === undefined) return new Map();

    // **현재 공식 리비전만** 센다. 초안·이전 리비전까지 세면 정정 이력이 카드로
    // 중복 집계돼 멀쩡한 선수가 정지된다.
    const revisionToOrder = new Map<string, number>();
    for (const fixture of fixtures) {
      const revisionId = fixture.game?.currentOfficialRevisionId ?? null;
      if (revisionId === null) continue;
      const order = orderByFixtureId.get(fixture.id);
      if (order !== undefined) revisionToOrder.set(revisionId, order);
    }
    if (revisionToOrder.size === 0) return new Map();

    const resultParticipants = await this.prisma.v1GameResultParticipant.findMany({
      where: { resultRevisionId: { in: [...revisionToOrder.keys()] } },
      select: { resultRevisionId: true, participantId: true, cards: true },
    });
    if (resultParticipants.length === 0) return new Map();

    const participants = await this.prisma.v1GameParticipant.findMany({
      where: { id: { in: resultParticipants.map((row) => row.participantId) } },
      select: { id: true, userId: true },
    });
    const userByParticipantId = new Map(participants.map((row) => [row.id, row.userId]));

    const playedByUserId = new Map<string, PlayedGameCards[]>();
    for (const row of resultParticipants) {
      const userId = userByParticipantId.get(row.participantId) ?? null;
      if (userId === null) continue; // 계정 미연결 참가자는 대회 누적을 셀 수 없다.
      const gameOrder = revisionToOrder.get(row.resultRevisionId);
      if (gameOrder === undefined) continue;
      const bucket = playedByUserId.get(userId) ?? [];
      bucket.push({ gameOrder, cards: readCards(row.cards) });
      playedByUserId.set(userId, bucket);
    }

    const verdicts = new Map<string, SuspensionVerdict>();
    for (const [userId, played] of playedByUserId) {
      verdicts.set(userId, evaluateSuspension({ rules, played, upcomingGameOrder }));
    }
    return verdicts;
  }
}

/**
 * `V1GameResultParticipant.cards`(Json)에서 카드 수를 읽는다. 저장 모양은
 * `{ yellow: number, red: number }` 뿐이다(`parseFairPlayCards` 의 주석 참고 —
 * 경고 누적 퇴장과 직접 퇴장을 구분하는 필드가 데이터 모델에 없다).
 * 모양이 다르면 0으로 본다 — 판정을 못 하는 것이 잘못 막는 것보다 낫다.
 */
function readCards(value: unknown): { yellow: number; red: number } {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { yellow?: unknown }).yellow === 'number' &&
    typeof (value as { red?: unknown }).red === 'number'
  ) {
    const record = value as { yellow: number; red: number };
    return { yellow: record.yellow, red: record.red };
  }
  return { yellow: 0, red: 0 };
}
