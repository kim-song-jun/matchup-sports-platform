import { publicFixtureStatus } from '../games/public-records/public-visibility';
import {
  resolveParticipantDisplayName,
  type ParticipantNameProfileRow,
} from '../games/public-records/participant-name-gating';
import type { TournamentDetailRow } from './tournaments-read.query';
import { resolveTournamentFixtureOfficialResult } from './tournament-fixture-official-result';

/**
 * 어워드 수상자 표시 이름 -- 저장된 `recipientName`(명단 실명 스냅샷, `tournament-reviews.service.ts`의
 * 저장부가 로스터 검증을 위해 강제한 값)을 그대로 내보내지 않고, 대회 경기 기록·랭킹과 동일한
 * 이름 공개 정책(`resolveParticipantDisplayName`, 2026-08-18 닉네임 기본 + 프로필 토글)으로
 * 재해석한다. 이 화면만 실명 정책을 안 거치면 같은 대회 한 화면 안에서 득점왕은 닉네임인데
 * MVP만 실명으로 보이는 불일치가 생긴다(감사 evidence).
 *
 * `resolveParticipantDisplayName`은 `participant.userId`가 null이거나 프로필이 없으면
 * `displayNameSnapshot`으로 그대로 폴백하므로, `recipientUserId`가 없는 레거시 미연동
 * 수상 행(계정 연결이 모호해 backfill이 null로 남긴 경우)도 저장된 스냅샷을 안전하게 유지한다.
 */
function presentAwardRecipientName(award: TournamentDetailRow['awards'][number]): string {
  const profileByUserId = new Map<string, ParticipantNameProfileRow>();
  if (award.recipientUserId !== null && award.recipient?.profile) {
    profileByUserId.set(award.recipientUserId, {
      userId: award.recipientUserId,
      ...award.recipient.profile,
    });
  }
  return (
    resolveParticipantDisplayName(
      { userId: award.recipientUserId, displayNameSnapshot: award.recipientName },
      profileByUserId,
    ) ?? award.recipientName
  );
}

/**
 * 대진표 공개 여부 판정의 단일 소스. 즉시 공개(bracketPublishedAt)와 예약 공개
 * (bracketPublishScheduledAt)를 함께 본다. 공개 경로가 둘로 나뉘면 목록·상세·어드민이
 * 서로 다른 답을 낼 수 있으므로 판정은 반드시 이 함수를 거친다.
 */
export function isBracketPublished(
  publishedAt: Date | null | undefined,
  scheduledAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  // null/undefined 를 함께 받는다. 이 판정이 던지면 대회 상세 조회 전체가 실패하므로
  // 컬럼이 빠진 부분 select 나 구식 fixture 가 들어와도 "비공개"로 안전하게 떨어져야 한다.
  if (publishedAt) return true;
  return Boolean(scheduledAt) && (scheduledAt as Date).getTime() <= now.getTime();
}

/**
 * 참가팀 식별 정보(팀명·로고·팀ID)를 감출지 판정하는 단일 소스.
 *
 * 이전에는 `participantTeams`(참가팀 명단)만 `status === 'open'`(모집 중)에 감췄고,
 * `groups`/`fixtures` 안의 팀명(조 편성·대진표)은 별개 게이트(`isBracketPublished`)만
 * 따랐다 — 운영자가 대진표를 먼저 공개하면 모집 중에도 조 편성 안의 팀명이 그대로
 * 보이는 불일치가 있었다("모집 마감 후 공개" 문구와 어긋남). 이 함수를 두 곳 모두에
 * 적용해 정책을 하나로 통일한다: 대진표 공개 여부(`isBracketPublished`)는 "조/픽스처
 * 구조 자체를 보여줄지"를 판정하고, 이 함수는 그 구조 **안의 팀 식별 정보**를 보여줄지
 * 별도로 판정한다 — 두 게이트는 여전히 독립이다(대진표는 공개하되 모집 중에는 그
 * 안의 팀명만 가리는 것이 가능해야 하므로).
 *
 * `staffBypass=true`(운영자·스태프)는 예외 — 지금도 자신이 운영하는 대회의 참가팀을
 * 봐야 실무가 돌아간다(TournamentStaffAccessService 판정 결과를 그대로 받는다).
 */
export function shouldHideParticipantIdentity(
  status: TournamentDetailRow['status'],
  staffBypass: boolean,
): boolean {
  return status === 'open' && !staffBypass;
}

/**
 * 공개 상세의 fixtures[].result 조립 -- 응답 필드 형태(homeScore/awayScore/hasPenalty/
 * homePenaltyScore/awayPenaltyScore/note/recordedAt/goals[])는 레거시와 동일하게 유지한다.
 * 신규 경로(`V1Game.currentOfficialRevision`)를 우선하고, OFFICIAL 리비전이 없을 때만
 * (game 백필 전 등) 레거시 `V1TournamentFixtureResult`로 폴백한다(R3 §4-3~§4-4단계 사이
 * 한시적 — resolveTournamentFixtureOfficialResult() 참고). `note`는 새 경로에서 조립된
 * 결과일 때만 항상 null이고, 레거시 폴백 결과는 레거시 note를 그대로 보존한다.
 */
function presentOfficialResult(
  game: TournamentDetailRow['fixtures'][number]['game'],
  legacyResult: TournamentDetailRow['fixtures'][number]['result'],
) {
  const resolved = resolveTournamentFixtureOfficialResult(game, legacyResult ?? undefined);
  if (!resolved) return null;
  return {
    homeScore: resolved.score.homeScore,
    awayScore: resolved.score.awayScore,
    hasPenalty: resolved.score.hasPenalty,
    homePenaltyScore: resolved.score.homePenaltyScore,
    awayPenaltyScore: resolved.score.awayPenaltyScore,
    note: resolved.note,
    recordedAt: (resolved.officialAt ?? resolved.createdAt).toISOString(),
    goals: resolved.goals,
  };
}

export function presentTournamentDetail(
  row: TournamentDetailRow,
  now: Date = new Date(),
  staffBypass = false,
) {
  // Task 109 Track 6: bracketPublishedAt이 null이면 대진표(조/픽스처)를 관리자가 아직
  // 일괄 공개하지 않은 상태 — 공개 조회에서는 groups/fixtures를 빈 배열로 감춘다.
  // 다른 대회 정보(공지·리뷰·수상·스폰서 등)는 이 게이트와 무관하게 그대로 노출한다.
  //
  // 예약 공개는 스케줄러 없이 여기서 판정한다. 예약 시각이 지났으면 아직
  // bracketPublishedAt이 비어 있어도 공개로 간주하므로, 예약 시각과 실제 노출 사이에
  // cron 주기만큼의 지연이 생기지 않는다.
  const bracketPublished = isBracketPublished(row.bracketPublishedAt, row.bracketPublishScheduledAt, now);
  // 참가팀 공개 정책 통일(fix/v1-publish) — participantTeams와 groups/fixtures의 팀명이
  // 같은 조건으로 감춰진다. 대진표 공개 여부(bracketPublished)와는 독립 — 대진표는
  // 공개돼도(구조는 보여도) 모집 중이면 그 안의 팀 식별 정보만 별도로 가려진다.
  const hideIdentity = shouldHideParticipantIdentity(row.status, staffBypass);

  return {
    id: row.id,
    sportId: row.sportId,
    sport: { code: row.sport.code, name: row.sport.name },
    title: row.title,
    status: row.status,
    // ⚠️ `format` 은 **종류 판별자가 아니다.** "어떤 방식으로 치르나"(리그전/토너먼트)를
    // 말할 뿐이고, 대회가 리그 방식으로 치러질 수 있다(alpha 실측 7건 — 전부
    // registrationDeadlineAt 이 있는 진짜 대회다). `format === 'league'` 로 정규 리그를
    // 가려내면 그 7건이 신청·참가등록을 잃는다. **종류는 아래 `kind` 를 쓴다.**
    format: row.format,
    /**
     * 단발 대회(regular_tournament) / 정규 리그 시즌(regular_league) 구분.
     *
     * nullable 인 채로 내려보낸다 — DB 가 아직 nullable 이라서다(R5 에서 NOT NULL 승격).
     * `?? 'regular_tournament'` 로 메우지 않는다: null 은 "채워지지 않은 행"이라는 사실이고,
     * 그걸 대회라고 단언하면 리그를 대회로 잘못 그리게 된다 — 지금 이 필드가 막으려는
     * 사고와 정확히 같은 모양이다. 소비처가 null 을 직접 다루게 둔다.
     */
    kind: row.kind,
    registrationDeadlineAt: row.registrationDeadlineAt?.toISOString() ?? null,
    rosterDeadlineAt: row.rosterDeadlineAt?.toISOString() ?? null,
    bracketPublishedAt: row.bracketPublishedAt?.toISOString() ?? null,
    // 아직 공개 전이면 "언제 공개되는지"를 참가팀에게 안내하기 위해 함께 내려준다.
    // 이미 공개된 뒤에는 안내할 대상이 없으므로 null 로 감춘다.
    bracketPublishScheduledAt: bracketPublished
      ? null
      : row.bracketPublishScheduledAt?.toISOString() ?? null,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    scheduledEndAt: row.scheduledEndAt?.toISOString() ?? null,
    venue: row.venue,
    parkingInfo: row.parkingInfo,
    latitude: row.latitude,
    longitude: row.longitude,
    coverImageUrl: row.coverImageUrl,
    teamCount: row.teamCount,
    minPlayers: row.minPlayers,
    maxPlayers: row.maxPlayers,
    genderCategory: row.genderCategory,
    genderMinMale: row.genderMinMale,
    genderMaxMale: row.genderMaxMale,
    genderMinFemale: row.genderMinFemale,
    genderMaxFemale: row.genderMaxFemale,
    entryFee: row.entryFee,
    rulesText: row.rulesText,
    refundPolicyText: row.refundPolicyText,
    prizePool: row.prizePool,
    prizeSummary: row.prizeSummary,
    prizeBreakdown: row.prizeBreakdown,
    promoHomeEnabled: row.promoHomeEnabled,
    promoHomeTitle: row.promoHomeTitle,
    promoHomeSubtitle: row.promoHomeSubtitle,
    promoHomeImageUrl: row.promoHomeImageUrl,
    promoHomeBadgeText: row.promoHomeBadgeText,
    promoHomeDateText: row.promoHomeDateText,
    promoHomeTeamsText: row.promoHomeTeamsText,
    promoHomeLocationText: row.promoHomeLocationText,
    promoHomePrizeText: row.promoHomePrizeText,
    promoHomePriority: row.promoHomePriority,
    promoListEnabled: row.promoListEnabled,
    promoListTitle: row.promoListTitle,
    promoListSubtitle: row.promoListSubtitle,
    promoListImageUrl: row.promoListImageUrl,
    promoListBadgeText: row.promoListBadgeText,
    promoListDateText: row.promoListDateText,
    promoListTeamsText: row.promoListTeamsText,
    promoListLocationText: row.promoListLocationText,
    promoListPrizeText: row.promoListPrizeText,
    promoListPriority: row.promoListPriority,
    campaignSlug: row.campaign?.status === 'published' ? row.campaign.slug : null,
    confirmedCount: row._count.registrations,
    // 모집 중(open)에는 참가팀 명단(팀명·로고·지역)을 비공개한다. 확정 인원수(confirmedCount)는
    // 위에서 status와 무관하게 항상 노출되므로 "몇 팀이 참가하는지"는 계속 보여준다.
    // 운영자·스태프(staffBypass)는 예외 — hideIdentity가 이미 그 조건을 반영한다.
    participantTeams: hideIdentity
      ? []
      : row.registrations
            .filter((registration) => ['confirmed', 'waitlisted'].includes(registration.status))
            .sort((a, b) => {
              const aRank = a.status === 'confirmed' ? 0 : 1;
              const bRank = b.status === 'confirmed' ? 0 : 1;
              return aRank - bRank;
            })
            .map((registration) => ({
              registrationId: registration.id,
              teamId: registration.team.id,
              teamName: registration.team.name,
              teamLogoUrl: registration.team.profile?.logoUrl ?? null,
              teamRegionName: registration.team.region?.name ?? null,
              status: registration.status,
              confirmedAt: registration.confirmedAt?.toISOString() ?? null,
            })),
    pendingPaymentCount: row.registrations.filter((registration) =>
      ['awaiting_payment', 'payment_checking', 'paid'].includes(registration.status),
    ).length,
    // 대진표 구조(조 이름·조 수·팀 수·경기 일정)는 bracketPublished 게이트만 따른다 —
    // "관전자가 언제 무슨 경기가 있는지는 알아야 한다"는 판단(조별 편성 자체를 감추면
    // 일정 정보까지 사라진다). 그 구조 **안의 팀 식별 정보**(teamId/teamName/
    // teamLogoUrl)만 hideIdentity로 별도로 가린다 — registrationId·sortOrder·경기
    // 성적(points/wins/...)·일정·장소는 집계/구조 정보이므로 계속 노출한다("감출 때
    // 없는 척하지 마라": 이름만 가리되 몇 팀·몇 경기인지는 정직하게 보여준다).
    groups: !bracketPublished
      ? []
      : row.groups.map((group) => ({
      id: group.id,
      name: group.name,
      phase: group.phase,
      sortOrder: group.sortOrder,
      advanceCount: group.advanceCount,
      groupTeams: group.groupTeams.map((groupTeam) => ({
        id: groupTeam.id,
        registrationId: groupTeam.registrationId,
        teamId: hideIdentity ? null : groupTeam.registration.team.id,
        teamName: hideIdentity ? null : groupTeam.registration.team.name,
        // 순위 행이 아직 없을 때 이 편성 목록만으로 순위표를 그리므로(#374), 순위 행과
        // 같은 아바타가 나오도록 로고도 함께 내려 준다.
        teamLogoUrl: hideIdentity ? null : (groupTeam.registration.team.profile?.logoUrl ?? null),
        sortOrder: groupTeam.sortOrder,
      })),
      standings: group.standings.map((standing) => ({
        registrationId: standing.registrationId,
        teamId: hideIdentity ? null : standing.registration.team.id,
        teamName: hideIdentity ? null : standing.registration.team.name,
        teamLogoUrl: hideIdentity ? null : (standing.registration.team.profile?.logoUrl ?? null),
        position: standing.position,
        points: standing.points,
        wins: standing.wins,
        draws: standing.draws,
        losses: standing.losses,
        goalsFor: standing.goalsFor,
        goalsAgainst: standing.goalsAgainst,
        recalculatedAt: standing.recalculatedAt?.toISOString() ?? null,
      })),
    })),
    fixtures: !bracketPublished
      ? []
      : row.fixtures.map((fixture) => ({
      id: fixture.id,
      groupId: fixture.groupId,
      round: fixture.round,
      fixtureNumber: fixture.fixtureNumber,
      legNumber: fixture.legNumber,
      scheduledAt: fixture.scheduledAt?.toISOString() ?? null,
      venue: fixture.venue,
      status: fixture.status,
      /**
       * 라이브 여부를 말할 수 있는 유일한 필드. `status`는 아래 이유로 그 답을 낼 수
       * 없어서 남겨두되 손대지 않는다(어드민 화면이 원본 컬럼 어휘에 의존한다).
       *
       * `V1TournamentFixture.status`는 `scheduled`로 생성돼(tournament-bracket.service.ts)
       * 결과 확정 시 `completed`로 한 번 움직이는 것이 전부다 — 어디에서도
       * `in_progress`로 전이시키지 않는다(tournament-result-review.service.ts의
       * "no other writer ever advances it once the Game model became authoritative").
       * 그래서 이 컬럼만 보는 소비자는 경기가 진행 중인 순간에도 영영 `scheduled`를 본다.
       * 실제 진행 상태는 `V1Game.state`가 authoritative하며, 공개 일정·경기 상세 API가
       * 이미 `publicFixtureStatus()`로 같은 판정을 하고 있다 — 여기서 같은 함수를 써서
       * 대회 상세 응답도 그 어휘(`scheduled|live|ended|cancelled`)를 함께 내려준다.
       */
      liveStatus: publicFixtureStatus({
        gameState: fixture.game?.state ?? null,
        fixtureStatus: fixture.status,
      }),
      homeRegistrationId: fixture.homeRegistrationId,
      // homeTeamName은 세 갈래: 슬롯에 팀이 아직 배정 안 됐으면 'TBD'(기존 동작 유지),
      // 배정은 됐지만 모집 중이라 가려야 하면 null(진짜 미배정과 구분되는 값 —
      // 프런트가 null이면 "비공개", 'TBD'면 "미배정"으로 다르게 안내한다), 그 외엔 실명.
      homeTeamId: hideIdentity ? null : (fixture.homeRegistration?.team.id ?? null),
      homeTeamName:
        fixture.homeRegistration === null ? 'TBD' : hideIdentity ? null : fixture.homeRegistration.team.name,
      homeTeamLogoUrl: hideIdentity ? null : (fixture.homeRegistration?.team.profile?.logoUrl ?? null),
      awayRegistrationId: fixture.awayRegistrationId,
      awayTeamId: hideIdentity ? null : (fixture.awayRegistration?.team.id ?? null),
      awayTeamName:
        fixture.awayRegistration === null ? 'TBD' : hideIdentity ? null : fixture.awayRegistration.team.name,
      awayTeamLogoUrl: hideIdentity ? null : (fixture.awayRegistration?.team.profile?.logoUrl ?? null),
      // R3 §4-3단계: 공개 스코어보드를 신규 경로(V1Game.currentOfficialRevision) 우선으로
      // 조립하고, OFFICIAL 리비전이 없을 때만(game 백필 전) 레거시 V1TournamentFixtureResult로
      // 폴백한다 -- 문서 §1-2/§4 참고. §4-4단계에서 result 조인과 함께 폴백을 제거한다.
      result: presentOfficialResult(fixture.game, fixture.result),
      videos: fixture.videos.map((video) => ({
        id: video.id,
        title: video.title,
        url: video.url,
      })),
    })),
    announcements: row.announcements.map((announcement) => {
      if (!announcement.publishedAt) {
        throw new TypeError('Public tournament announcement is missing publishedAt');
      }
      return {
        id: announcement.id,
        title: announcement.title,
        body: announcement.body,
        category: announcement.category,
        audience: announcement.audience,
        publishedAt: announcement.publishedAt.toISOString(),
        createdAt: announcement.createdAt.toISOString(),
      };
    }),
    sponsors: row.sponsors.map((sponsor) => ({
      id: sponsor.id,
      name: sponsor.name,
      description: sponsor.description,
      logoUrl: sponsor.logoUrl,
      websiteUrl: sponsor.websiteUrl,
      instagramUrl: sponsor.instagramUrl,
      benefitText: sponsor.benefitText,
      boothText: sponsor.boothText,
      eventTitle: sponsor.eventTitle,
      eventDescription: sponsor.eventDescription,
      eventResultText: sponsor.eventResultText,
      sortOrder: sponsor.sortOrder,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reviews: (row.reviews ?? []).map((review) => ({
      id: review.id,
      authorId: review.authorUserId,
      authorNickname: review.author?.profile?.nickname ?? '익명',
      authorProfileImageUrl: review.author?.profile?.profileImageUrl ?? null,
      teamName: review.teamName ?? null,
      rating: review.rating,
      comment: review.comment ?? null,
      photoUrls: review.photoUrls,
      createdAt: review.createdAt.toISOString(),
    })),
    // `reviews` 배열은 take:30으로 잘려 있다 — 개수 배지는 이 잘리지 않은 전체
    // 카운트를 써야 `/tournaments/:id/reviews` 전용 목록 화면의 total과 일치한다
    // (감사 evidence: 두 화면이 31건째부터 서로 다른 숫자를 보여줌).
    reviewsTotalCount: row._count.reviews,
    awards: (row.awards ?? []).map((award) => ({
      id: award.id,
      awardType: award.awardType,
      awardLabel: award.awardLabel,
      iconKey: award.iconKey ?? null,
      recipientName: presentAwardRecipientName(award),
      teamName: award.teamName ?? null,
      note: award.note ?? null,
    })),
  };
}
