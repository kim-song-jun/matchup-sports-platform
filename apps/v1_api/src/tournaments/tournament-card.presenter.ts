import type { TournamentListRow } from './tournaments-read.query';

export function presentTournamentCard(row: TournamentListRow) {
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
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    scheduledEndAt: row.scheduledEndAt?.toISOString() ?? null,
    venue: row.venue,
    coverImageUrl: row.coverImageUrl,
    teamCount: row.teamCount,
    genderCategory: row.genderCategory,
    entryFee: row.entryFee,
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
    pendingPaymentCount: row.registrations.length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
