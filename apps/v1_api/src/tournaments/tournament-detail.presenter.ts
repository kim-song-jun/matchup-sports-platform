import type { TournamentDetailRow } from './tournaments-read.query';
import { resolveTournamentFixtureOfficialResult } from './tournament-fixture-official-result';

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

export function presentTournamentDetail(row: TournamentDetailRow, now: Date = new Date()) {
  // Task 109 Track 6: bracketPublishedAt이 null이면 대진표(조/픽스처)를 관리자가 아직
  // 일괄 공개하지 않은 상태 — 공개 조회에서는 groups/fixtures를 빈 배열로 감춘다.
  // 다른 대회 정보(공지·리뷰·수상·스폰서 등)는 이 게이트와 무관하게 그대로 노출한다.
  //
  // 예약 공개는 스케줄러 없이 여기서 판정한다. 예약 시각이 지났으면 아직
  // bracketPublishedAt이 비어 있어도 공개로 간주하므로, 예약 시각과 실제 노출 사이에
  // cron 주기만큼의 지연이 생기지 않는다.
  const bracketPublished = isBracketPublished(row.bracketPublishedAt, row.bracketPublishScheduledAt, now);

  return {
    id: row.id,
    sportId: row.sportId,
    sport: { code: row.sport.code, name: row.sport.name },
    title: row.title,
    status: row.status,
    format: row.format,
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
    participantTeams:
      row.status === 'open'
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
        teamId: groupTeam.registration.team.id,
        teamName: groupTeam.registration.team.name,
        sortOrder: groupTeam.sortOrder,
      })),
      standings: group.standings.map((standing) => ({
        registrationId: standing.registrationId,
        teamId: standing.registration.team.id,
        teamName: standing.registration.team.name,
        teamLogoUrl: standing.registration.team.profile?.logoUrl ?? null,
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
      homeRegistrationId: fixture.homeRegistrationId,
      homeTeamId: fixture.homeRegistration?.team.id ?? null,
      homeTeamName: fixture.homeRegistration?.team.name ?? 'TBD',
      homeTeamLogoUrl: fixture.homeRegistration?.team.profile?.logoUrl ?? null,
      awayRegistrationId: fixture.awayRegistrationId,
      awayTeamId: fixture.awayRegistration?.team.id ?? null,
      awayTeamName: fixture.awayRegistration?.team.name ?? 'TBD',
      awayTeamLogoUrl: fixture.awayRegistration?.team.profile?.logoUrl ?? null,
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
    awards: (row.awards ?? []).map((award) => ({
      id: award.id,
      awardType: award.awardType,
      awardLabel: award.awardLabel,
      recipientName: award.recipientName,
      teamName: award.teamName ?? null,
      note: award.note ?? null,
    })),
  };
}
