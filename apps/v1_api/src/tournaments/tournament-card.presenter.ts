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
    /**
     * **정원.** 리그에는 이 개념이 없어 생략한다 — `V1League` 모델에 `max`·`capacity`
     * 계열 필드가 **아예 없다**(실측). 그런데 거울 행은 `v1_tournaments` 에 살고
     * `team_count` 는 `@default(8)` 이라, 아무도 안 넣은 리그 거울은 **전부 8** 이다
     * (alpha 실측: 리그 4개 모두 8, 실제 참가팀은 2).
     *
     * ⚠️ **같은 이름이 세 뜻을 갖는다** — 헷갈리기 쉬운 자리라 적어 둔다:
     * ```
     * 대회 teamCount        정원          의미 있음
     * 리그 API teamCount    참가 팀 수     의미 있음(다른 뜻) — /league-matches 응답
     * 거울 teamCount        8            **스키마 기본값. 아무 뜻도 없다**  ← 여기서 지운다
     * ```
     * 앞의 둘은 `league-matches-list-client.tsx:200` 이 이미 다룬다(*"같은 진행바를 그리면
     * 리그는 항상 100% 로 보인다"*). 세 번째는 통합 목록에서 처음 나오는 것이고, 그대로
     * 두면 리그 카드에 **"8팀"** 이 뜨는데 실제는 2팀이다.
     *
     * 리그 카드는 참가 팀 수로 `confirmedCount` 를 쓴다(alpha 실측 2 로 맞다).
     */
    ...(row.kind === 'regular_league' ? {} : { teamCount: row.teamCount }),

    /**
     * 리그 시즌의 티어·시즌·시리즈. **거울 행에 저장돼 있는데 그동안 안 내보냈다**
     * (`leagueMirrorCreateData` 가 쓴다) — 있는데 안 보내는 것은 생략이 아니라 **누락**이다.
     * 안 내보내면 리그 카드가 대회 카드보다 정보가 적어진다.
     *
     * 대회 행에는 없으므로 **optional 이 아니라 아예 안 싣는다** — `null` 로 채우면
     * "티어가 없는 리그"와 "리그가 아님"이 같은 모양이 된다(단발 리그는 tier 가 null 이다).
     */
    ...(row.kind === 'regular_league'
      ? { tier: row.tier, seasonNo: row.seasonNo, seriesId: row.seriesId }
      : {}),
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
