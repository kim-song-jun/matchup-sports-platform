import { loadPlayerCardRecordStats } from './player-card-stats';
import { buildPlayerCard, type PlayerCardLockReason } from '../../profile/player-card';

/**
 * 선수 카드가 **지킬 수 있는 약속만 하는지**를 건다.
 *
 * `player-card.spec.ts` 는 `buildPlayerCard` 순수 함수에 `hasUnlockableRecords` 를 손으로
 * 넣는 단위 테스트라, **그 boolean 이 언제 true 가 되는지**는 아무것도 검증하지 않는다.
 * 거짓 약속("기록 공개 동의를 켜면 열려요" → 켜도 0건)은 정확히 그 빈자리에서 두 번
 * 재발했다:
 *   · 2026-08-24 alpha 실측 — 한 경기도 안 뛴 사용자에게 동의 안내가 나갔다.
 *   · 2026-08-26 — 팀 라인업 저장이 신원 연결을 만들게 되면서, 아직 공식 결과가 하나도
 *     없는 사람(첫 명단·경기 취소·운영자 미입력)이 같은 안내를 다시 받게 됐다.
 *
 * 그래서 여기서는 **DB 상태 → 카드 잠금 사유**까지 통째로 본다. 판정은 하나다:
 * 동의를 켜서 실제로 열릴 결과 행이 있을 때만 `consent` 를 안내하고, 없으면
 * `appearances`(경기가 필요하다)를 안내한다.
 */

type ConsentState = 'GRANTED' | 'REVOKED';

interface FakeState {
  /** `V1ParticipantIdentityLinkCurrent` -- 참가자 ↔ 계정 현재 연결. */
  readonly links: ReadonlyArray<{ participantId: string; linkId: string; userId: string }>;
  /** `V1UserRecordConsent` -- 사용자 단위 1회 동의. */
  readonly userConsents: ReadonlyArray<{ userId: string; state: ConsentState }>;
  /** `V1ParticipantConsentSnapshot` -- "이 경기 하나만 숨김" 개별 override. */
  readonly snapshots: ReadonlyArray<{ linkId: string; state: ConsentState; consentVersion: number }>;
  /** `V1GameResultParticipant` + 그 리비전의 공식 확정 상태. */
  readonly results: ReadonlyArray<{
    participantId: string;
    gameId: string;
    revisionId: string;
    /** 이 경기의 현재 공식 리비전. `revisionId` 와 다르면 정정으로 대체된 옛 결과다. */
    currentOfficialRevisionId: string | null;
    officialAt: Date | null;
    goals?: number;
    assists?: number;
    started?: boolean;
    goalkeeper?: boolean;
  }>;
  /** `V1GameParticipant` -- 라인업 스냅샷(포지션·등번호). */
  readonly lineup: ReadonlyArray<{ id: string; position: string | null; jerseyNumber: number | null }>;
}

type IdFilter = { readonly in: readonly string[] };

const USER = 'user-1';

/**
 * where 절을 실제로 해석하는 최소 가짜 DB. 호출 순서를 박제하는 목이 아니라
 * "이 데이터가 있으면 함수가 무엇을 내놓는가"를 보기 위한 것이라, 필터를 직접 돌린다 --
 * 그래야 쿼리 조건을 잘못 바꿨을 때(예: 공개 게이트 참가자만 조회) 테스트가 잡는다.
 */
function fakePrisma(state: Partial<FakeState>) {
  const links = state.links ?? [];
  const userConsents = state.userConsents ?? [];
  const snapshots = state.snapshots ?? [];
  const results = state.results ?? [];
  const lineup = state.lineup ?? [];

  return {
    v1ParticipantIdentityLinkCurrent: {
      findMany: jest.fn(async ({ where }: { where: { userId?: string; participantId?: IdFilter } }) => {
        if (where.userId !== undefined) return links.filter((link) => link.userId === where.userId);
        const ids = where.participantId?.in ?? [];
        return links.filter((link) => ids.includes(link.participantId));
      }),
    },
    v1UserRecordConsent: {
      findMany: jest.fn(async ({ where }: { where: { userId: IdFilter } }) =>
        userConsents.filter((consent) => where.userId.in.includes(consent.userId)),
      ),
    },
    v1ParticipantConsentSnapshot: {
      findMany: jest.fn(async ({ where }: { where: { linkId: IdFilter } }) =>
        snapshots
          .filter((snapshot) => where.linkId.in.includes(snapshot.linkId))
          .sort((a, b) => b.consentVersion - a.consentVersion),
      ),
    },
    v1GameResultParticipant: {
      findMany: jest.fn(async ({ where }: { where: { participantId: IdFilter } }) =>
        results
          .filter((row) => where.participantId.in.includes(row.participantId))
          .map((row) => ({
            participantId: row.participantId,
            goals: row.goals ?? 0,
            assists: row.assists ?? 0,
            started: row.started ?? false,
            goalkeeper: row.goalkeeper ?? false,
            resultRevision: {
              id: row.revisionId,
              officialAt: row.officialAt,
              gameId: row.gameId,
              game: { currentOfficialRevisionId: row.currentOfficialRevisionId },
            },
          })),
      ),
    },
    v1GameParticipant: {
      findMany: jest.fn(async ({ where }: { where: { id: IdFilter } }) =>
        lineup
          .filter((entry) => where.id.in.includes(entry.id))
          .map((entry) => ({ position: entry.position, jerseyNumber: entry.jerseyNumber })),
      ),
    },
  };
}

/**
 * `ProfileService.buildPlayerCardFor` 와 **같은 배선**으로 카드를 만든다.
 * 후기 쪽 입력은 카드의 기록 3항목 잠금과 무관하므로 전부 비운다.
 */
async function loadCard(state: Partial<FakeState>, consented: boolean) {
  const records = await loadPlayerCardRecordStats(fakePrisma(state) as never, USER);
  const card = buildPlayerCard({
    appearances: records.appearances,
    goals: records.goals,
    assists: records.assists,
    startedCount: records.startedCount,
    position: records.position,
    jerseyNumber: records.jerseyNumber,
    skillScore: null,
    mannerScore: null,
    punctualityScore: null,
    reviewCount: 0,
    recordsConsented: consented,
    hasUnlockableRecords: records.hasUnlockableRecords,
  });
  return { records, card };
}

const recordLocks = (card: ReturnType<typeof buildPlayerCard>): (PlayerCardLockReason | null)[] =>
  ['SHO', 'PAS', 'APP'].map((code) => card.stats.find((s) => s.code === code)!.lockedBy);

const linkedRoster = {
  links: [{ participantId: 'participant-1', linkId: 'link-1', userId: USER }],
  lineup: [{ id: 'participant-1', position: 'FW', jerseyNumber: 9 }],
};

describe('loadPlayerCardRecordStats -- 언제 "동의를 켜면 열려요" 라고 말해도 되는가', () => {
  describe('약속하면 안 되는 상태', () => {
    it('명단에만 이름이 올랐고 결과가 아직 하나도 없으면 동의가 아니라 출전을 안내한다', async () => {
      // 팀장이 내일 경기 라인업을 저장하면 그 자리에서 신원 연결이 생긴다. 연결만 보고
      // 동의를 안내하면, 경기가 취소되거나 결과가 끝내 입력되지 않는 한 영구히 거짓말이다.
      const { card } = await loadCard({ ...linkedRoster, results: [] }, false);

      expect(card.nextUnlock?.reason.type).toBe('appearances');
      for (const lock of recordLocks(card)) expect(lock).not.toEqual({ type: 'consent' });
    });

    it('결과가 아직 공식 확정 전(officialAt=null)이면 약속하지 않는다', async () => {
      const { card } = await loadCard(
        {
          ...linkedRoster,
          results: [
            {
              participantId: 'participant-1',
              gameId: 'game-1',
              revisionId: 'revision-1',
              currentOfficialRevisionId: 'revision-1',
              officialAt: null,
            },
          ],
        },
        false,
      );

      expect(card.nextUnlock?.reason.type).toBe('appearances');
      for (const lock of recordLocks(card)) expect(lock).not.toEqual({ type: 'consent' });
    });

    it('정정으로 대체된 옛 리비전만 남았으면 약속하지 않는다', async () => {
      const { card } = await loadCard(
        {
          ...linkedRoster,
          results: [
            {
              participantId: 'participant-1',
              gameId: 'game-1',
              revisionId: 'revision-1-old',
              currentOfficialRevisionId: 'revision-1-new',
              officialAt: new Date('2026-08-20T10:00:00Z'),
            },
          ],
        },
        false,
      );

      expect(card.nextUnlock?.reason.type).toBe('appearances');
      for (const lock of recordLocks(card)) expect(lock).not.toEqual({ type: 'consent' });
    });

    it('그 경기를 개별적으로 숨겨 뒀으면 사용자 단위 동의로는 안 열리므로 약속하지 않는다', async () => {
      // participant 단위 REVOKED 는 사용자 단위 동의를 켜도 그대로 숨겨진다
      // (isParticipantPubliclyEligible). 그러니 동의를 안내하면 켜도 0건이다.
      const { card } = await loadCard(
        {
          ...linkedRoster,
          snapshots: [{ linkId: 'link-1', state: 'REVOKED', consentVersion: 1 }],
          results: [
            {
              participantId: 'participant-1',
              gameId: 'game-1',
              revisionId: 'revision-1',
              currentOfficialRevisionId: 'revision-1',
              officialAt: new Date('2026-08-20T10:00:00Z'),
              goals: 2,
            },
          ],
        },
        false,
      );

      expect(card.nextUnlock?.reason.type).toBe('appearances');
      for (const lock of recordLocks(card)) expect(lock).not.toEqual({ type: 'consent' });
    });
  });

  describe('약속해도 되는 상태', () => {
    it('공식 확정된 현재 리비전 결과가 있으면 동의를 안내한다 -- 켜면 실제로 열린다', async () => {
      const { card, records } = await loadCard(
        {
          ...linkedRoster,
          results: [
            {
              participantId: 'participant-1',
              gameId: 'game-1',
              revisionId: 'revision-1',
              currentOfficialRevisionId: 'revision-1',
              officialAt: new Date('2026-08-20T10:00:00Z'),
              goals: 1,
              started: true,
            },
          ],
        },
        false,
      );

      expect(card.nextUnlock?.reason).toEqual({ type: 'consent' });
      for (const lock of recordLocks(card)) expect(lock).toEqual({ type: 'consent' });
      // 동의 전이라 숫자 자체는 여전히 감춰져 있다 -- 약속만 하고 값은 내주지 않는다.
      expect(records.appearances).toBe(0);
      expect(records.goals).toBe(0);
    });

    it('약속대로 동의를 켜면 같은 데이터에서 실제로 값이 열린다', async () => {
      const results = [1, 2, 3].map((n) => ({
        participantId: 'participant-1',
        gameId: `game-${n}`,
        revisionId: `revision-${n}`,
        currentOfficialRevisionId: `revision-${n}`,
        officialAt: new Date('2026-08-20T10:00:00Z'),
        goals: 1,
        started: true,
      }));

      const before = await loadCard({ ...linkedRoster, results }, false);
      // 동의를 켠다 = 사용자 단위 동의 행이 GRANTED 가 된다. 카드 입력의 boolean 만
      // 뒤집고 DB 를 그대로 두면 "켠 뒤"를 재현한 것이 아니다.
      const after = await loadCard(
        { ...linkedRoster, results, userConsents: [{ userId: USER, state: 'GRANTED' }] },
        true,
      );

      expect(before.card.nextUnlock?.reason).toEqual({ type: 'consent' });
      expect(after.records.appearances).toBe(3);
      expect(after.card.stats.find((s) => s.code === 'APP')!.unlocked).toBe(true);
      expect(after.card.stats.find((s) => s.code === 'SHO')!.unlocked).toBe(true);
    });
  });

  describe('집계', () => {
    it('동의를 켠 사용자의 출전 수는 공식 확정 + 현재 리비전만 센다', async () => {
      const { records } = await loadCard(
        {
          ...linkedRoster,
          userConsents: [{ userId: USER, state: 'GRANTED' }],
          results: [
            {
              participantId: 'participant-1',
              gameId: 'game-1',
              revisionId: 'revision-1',
              currentOfficialRevisionId: 'revision-1',
              officialAt: new Date('2026-08-20T10:00:00Z'),
              goals: 2,
              assists: 1,
              started: true,
            },
            {
              participantId: 'participant-1',
              gameId: 'game-2',
              revisionId: 'revision-2',
              currentOfficialRevisionId: 'revision-2',
              officialAt: new Date('2026-08-21T10:00:00Z'),
              goals: 1,
            },
            // 정정으로 대체된 옛 리비전 -- 세지 않는다.
            {
              participantId: 'participant-1',
              gameId: 'game-3',
              revisionId: 'revision-3-old',
              currentOfficialRevisionId: 'revision-3-new',
              officialAt: new Date('2026-08-22T10:00:00Z'),
              goals: 5,
            },
          ],
        },
        true,
      );

      expect(records.appearances).toBe(2);
      expect(records.goals).toBe(3);
      expect(records.assists).toBe(1);
      expect(records.startedCount).toBe(1);
      expect(records.position).toBe('FW');
      expect(records.jerseyNumber).toBe(9);
    });

    it('한 경기가 두 참가 행으로 잡혀도 출전 1회로 접고 골은 합산한다', async () => {
      // 교체로 행이 둘 생겼을 때 2경기로 세면 경기당 골이 절반으로 희석된다.
      const { records } = await loadCard(
        {
          links: [
            { participantId: 'participant-1', linkId: 'link-1', userId: USER },
            { participantId: 'participant-2', linkId: 'link-2', userId: USER },
          ],
          lineup: [
            { id: 'participant-1', position: 'FW', jerseyNumber: 9 },
            { id: 'participant-2', position: 'FW', jerseyNumber: 9 },
          ],
          userConsents: [{ userId: USER, state: 'GRANTED' }],
          results: [
            {
              participantId: 'participant-1',
              gameId: 'game-1',
              revisionId: 'revision-1',
              currentOfficialRevisionId: 'revision-1',
              officialAt: new Date('2026-08-20T10:00:00Z'),
              goals: 1,
              started: true,
            },
            {
              participantId: 'participant-2',
              gameId: 'game-1',
              revisionId: 'revision-1',
              currentOfficialRevisionId: 'revision-1',
              officialAt: new Date('2026-08-20T10:00:00Z'),
              goals: 2,
            },
          ],
        },
        true,
      );

      expect(records.appearances).toBe(1);
      expect(records.goals).toBe(3);
      expect(records.startedCount).toBe(1);
    });

    it('신원 연결이 아예 없으면 결과를 조회하지도 않는다', async () => {
      const prisma = fakePrisma({});

      const records = await loadPlayerCardRecordStats(prisma as never, USER);

      expect(records.appearances).toBe(0);
      expect(prisma.v1GameResultParticipant.findMany).not.toHaveBeenCalled();
    });
  });
});
