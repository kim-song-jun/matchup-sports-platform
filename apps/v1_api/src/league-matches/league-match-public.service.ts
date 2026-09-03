import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isParticipantPubliclyEligible, loadParticipantConsentEligibility } from '../games/public-records/public-consent';
import { LEAGUE_STATE_PRIORITY_ORDER, paginateByStatePriority, sortMyLeaguesByState } from './league-lifecycle-rules';
import { calculateLeagueStandingsWithTieBreakInfo, LeagueTieBreakCriterion, resolveLeagueChampions } from './league-standings';
import {
  classifyPromotionKind,
  resolvePromotionRule,
  resolvePromotionToTier,
  tierSlotCounts,
  type PromotionKind,
} from './league-promotion';
import { ListLeagueMatchesQueryDto } from './dto/league-match.dto';
import { bucketLeagueFixtures } from './league-standings-source';
import {
  LEAGUE_FIXTURE_FACT_SELECT,
  leagueFixtureListOrder,
  LEAGUE_FIXTURE_LIST_SELECT,
  leagueFixtureListWhere,
  toLeagueFixtureList,
} from './league-fixture-list-source';
import {
  LEAGUE_STATE_BY_STATUS,
  STATUSES_BY_LEAGUE_STATE,
  isCompleteLeagueMirror,
} from '../tournaments/league-competition-mirror';
import { LEAGUE_TIE_BREAK_ORDER } from './league-tie-break';
import type { LeagueState } from './league-state';
import { findTournamentOnSurface } from '../tournaments/tournament-surface-lookup';

const PLAYER_RECORDS_LIMIT = 30;
const LEAGUE_LIST_DEFAULT_LIMIT = 20;
const LEAGUE_LIST_MAX_LIMIT = 50;

@Injectable()
export class LeagueMatchPublicService {
  private readonly logger = new Logger(LeagueMatchPublicService.name);

  constructor(private readonly prisma: PrismaService) {}

  // R5: 공개 리그 목록. team-matches.service.ts list()와 동일한 cursor 관례(take: limit+1,
  // 마지막 행을 잘라 hasNext 판정)를 기본으로 삼되, 정렬 1순위가 상태 우선순위(진행 중 ->
  // 준비 중 -> 종료, LEAGUE_STATE_PRIORITY_ORDER)라 단일 쿼리로는 못 만든다.
  //
  // [정책 변경 이력 — 2026-08-22 재감사] 원래는 createdAt desc(최근 개설순) 단일 정렬이었다
  // (tournaments-read.service.ts list()의 기본 정렬과 동일하게 맞춘 것). 하지만 alpha 실측
  // 41건의 상태 분포가 draft 61%(25/41)라, 리그 tab을 열면 대진도 없는 draft 리그가 화면을
  // 덮고 정작 진행 중인 리그는 아래로 밀렸다. "내 리그"(listMine)는 같은 문제를 이미 상태
  // 우선순위 정렬로 고쳐 놓았는데(league-lifecycle-rules.ts sortMyLeaguesByState) 공개
  // 목록만 옛 정렬로 남아 한 제품 안에서 두 화면이 다른 규칙을 쓰고 있었다.
  //
  // state 우선순위는 리그 상태 선언 순서(draft -> active -> completed)와 달라
  // Prisma의 `orderBy: { state: 'asc' }`로 표현할 수 없다(listMine과 동일한 제약). 그래서
  // 상태별로 where 절을 나눠 우선순위 순서대로 순회하며 필요한 개수만큼만 채운다 --
  // 최악의 경우(query.state 미지정 + 앞쪽 그룹에 행이 얼마 없을 때) 페이지당 최대 3개
  // 쿼리가 나가지만, 공개 목록은 페이지당 최대 50건(LEAGUE_LIST_MAX_LIMIT)이라 N+1 스캔
  // 규모가 아니다. 이 "그룹을 순회하며 커서를 이어 붙이는" 로직은 Prisma 와 무관한 순수
  // 페이지네이션 문제라 `paginateByStatePriority`(league-lifecycle-rules.ts)로 뽑아
  // DB 없이도 로컬에서 검증할 수 있게 했다 -- 로직·근거·불변식은 그 함수의 doc 참고.
  // teamCount는 각 리그마다 별도 COUNT 쿼리를 날리는 대신 findMany의 _count select로
  // 한 번에 집계한다(N+1 없음) -- admin list()의 동일 패턴 재사용.
  async list(query: ListLeagueMatchesQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? LEAGUE_LIST_DEFAULT_LIMIT, 1), LEAGUE_LIST_MAX_LIMIT);

    const baseWhere: Prisma.V1TournamentWhereInput = {
      kind: 'regular_league',
      deletedAt: null,
      ...(query.sportId ? { sportId: query.sportId } : {}),
      ...(query.regionId ? { regionId: query.regionId } : {}),
      ...(query.teamId ? { registrations: { some: { teamId: query.teamId, status: 'confirmed' } } } : {}),
    };

    // query.state 필터가 있으면 애초에 상태 하나만 보므로 그룹핑이 필요 없다 -- 그
    // 상태 하나짜리 순서로 순회한다(paginateByStatePriority 안에서 자연히 기존과 동일한
    // 단일 쿼리 커서 페이지네이션으로 축소된다).
    const stateGroups = query.state ? [query.state] : LEAGUE_STATE_PRIORITY_ORDER;

    const leagueSelect = {
      id: true,
      title: true,
      // BE-5: 거울은 state→status, startsOn→scheduledAt, endsOn→scheduledEndAt 으로 담는다.
      status: true,
      scheduledAt: true,
      scheduledEndAt: true,
      // code는 프론트의 getSportAccent(code)/SportGlyph가 요구하는 키다 --
      // 대회 목록(V1TournamentListItem.sport)이 이미 같은 { code, name } 모양을
      // 쓰고 있어(apps/v1_web/src/types/api.ts) 같은 관례를 그대로 맞춘다.
      sport: { select: { id: true, code: true, name: true } },
      // `isCompleteLeagueMirror` 가 본다 — 지역이 빈 거울은 깨진 것이다.
      regionId: true,
      region: { select: { id: true, name: true } },
      // 티어는 목록에서도 필요하다 -- 이 목록은 "자기 수준의 리그를 고르는" 화면이라
      // 상세에 들어가야만 몇 부인지 알 수 있으면 고를 수가 없다(Task 153 시나리오 3).
      // 제목에 "1부"가 들어 있어서 읽히는 것에 기대면 안 된다: 제목은 운영자 자유입력이다.
      tier: true,
      seasonNo: true,
      seriesId: true,
      series: { select: { id: true, title: true } },
      // 로스터 = confirmed 등록.
      _count: { select: { registrations: { where: { status: 'confirmed' as const } } } },
    } satisfies Prisma.V1TournamentSelect;

    const { items: pageItems, hasNext, nextCursor } = await paginateByStatePriority({
      stateGroups,
      limit,
      cursor: query.cursor,
      fetchGroup: (state, page) =>
        this.prisma.v1Tournament
          .findMany({
          // 리그 state 하나가 통합 축 status 여럿에 대응한다(draft ← draft·open·closed).
          where: { ...baseWhere, status: { in: STATUSES_BY_LEAGUE_STATE[state as LeagueState] } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: page.take,
          ...(page.cursorId ? { cursor: { id: page.cursorId }, skip: 1 } : {}),
          select: leagueSelect,
          })
          // 커서 페이지네이터는 `state` 로 그룹을 가른다 — 저장 모양(`status`)을 여기서
          // 응답 어휘로 되돌려 준다.
          .then((rows) => rows.map((row) => ({ ...row, state: LEAGUE_STATE_BY_STATUS[row.status] }))),
    });

    return {
      items: pageItems
        // 어드민 목록과 **같은 기준**이다(`isCompleteLeagueMirror`) — 한쪽에만 보이는 리그를
        // 만들지 않는다. 깨진 거울은 끊지 않고 제외하되 몇 건인지 로그로 남긴다.
        .filter((league) => {
          if (isCompleteLeagueMirror(league)) return true;
          this.logger.warn(`public league list: 통합 축 일정·지역이 빈 리그 ${league.id} 를 제외했다`);
          return false;
        })
        .map((league) => ({
        leagueId: league.id,
        title: league.title,
        state: league.state,
        startsOn: league.scheduledAt,
        endsOn: league.scheduledEndAt,
        sport: { sportId: league.sport.id, code: league.sport.code, name: league.sport.name },
        // 거울의 `regionId` 는 nullable 이지만 리그는 항상 채운다(원본 non-null). 그래도
        // 타입을 눌러 통과시키지 않고, 비면 목록에서 빼서 화면이 빈 지역을 그리지 않게
        // 한다(아래 filter).
        region: { regionId: league.region!.id, name: league.region!.name },
        // 단발 리그는 넷 다 null -- 티어가 "1부"인 게 아니라 티어 개념 자체가 없다는
        // 뜻이므로 상세 응답과 같은 규칙으로 null 을 유지하고, 화면은 null 이면 뱃지를
        // 아예 띄우지 않는다.
        seriesId: league.seriesId,
        tier: league.tier,
        tierLabel: league.tier === null ? null : `${league.tier}부`,
        seasonNo: league.seasonNo,
        seriesTitle: league.series?.title ?? null,
        teamCount: league._count.registrations,
      })),
      // nextCursor는 "<state>:<id>" 복합값이다 -- 다음 요청이 어느 상태 그룹의 어디부터
      // 이어가야 하는지를 커서 하나로 복원할 수 있어야 한다(paginateByStatePriority 참고).
      pageInfo: { nextCursor, hasNext },
    };
  }

  /**
   * 내가 속한 팀들이 참가한 리그 (R4 -- 마이 화면 "내 리그").
   *
   * `V1LeagueTeam` 을 직접 보므로 **대진이 아직 없는 draft 리그도 나온다.** 팀 상세의
   * 기존 "내 리그" 는 `GET /team-matches?teamId=` 결과에서 distinct 로 리그를 뽑았는데,
   * 그건 대진이 생겨야만 보인다 -- 운영자가 팀을 리그에 넣은 시점부터 대진을 만들 때까지
   * 팀은 자기가 리그에 들어간 걸 알 방법이 없었다(2026-08-21 재감사, alpha 에서 draft
   * 티어 리그의 참가팀이 team-matches 0건인 것으로 확인). D-2("참가팀은 운영자 지정")가
   * 그 대가로 약속한 "노출로 푼다" 를 성립시키려면 이 경로가 참가 테이블을 봐야 한다.
   *
   * 페이지네이션을 두지 않는다 -- 한 사용자가 속한 팀 수가 곧 상한이고, 그 팀들이 동시에
   * 참가 중인 리그는 현실적으로 한 화면에 들어간다. 목록이 길어지면 그때 커서를 붙인다.
   */
  async listMine(userId: string) {
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: { userId, status: 'active' },
      select: { teamId: true },
    });
    const teamIds = memberships.map((row) => row.teamId);
    if (teamIds.length === 0) return { items: [] };

    // ── R4-a read-swap: 이 목록은 **통합 축**(V1Tournament + V1TournamentRegistration)에서 읽는다 ──
    //
    // **두 축 동등성을 코드 전에 실측으로 증명했다**(2026-08-31, alpha captain A):
    //   리그 축 30개 · 통합 축 30개 · 차집합 양방향 0 · teamCount 합 70 == 70
    // 집합만으로는 부족해서 **상태 분포까지** 맞춘 뒤에야 이 전환을 켠다 —
    // 백필 `--apply` 전에는 거울이 전부 `draft` 라 아래 `state !== 'draft'` 게이트가
    // 30개 중 21개의 순위·다음 경기를 **에러 없이** 날린다(`docs/ops/read-swap-preflight.md` 9절).
    //
    // 대진·결과는 **아직 리그 축**이다. 그래서 아래 `standings()` 는 그대로 리그 id 로 부른다 —
    // 거울 id 가 리그 id 와 같아서 성립한다(대응표를 두지 않은 설계의 값).
    const mirrors = await this.prisma.v1Tournament.findMany({
      where: {
        kind: 'regular_league',
        deletedAt: null,
        // 참가 판정이 **확정 등록** 기준이다 — 리그 축의 `V1LeagueTeam` 은 상태가 없어
        // 전부 참가였고, 백필이 그것을 `confirmed` 로 옮겼다(88개 리그 전부 1:1 실측).
        registrations: { some: { teamId: { in: teamIds }, status: 'confirmed' } },
      },
      // 같은 상태 안에서는 최근 개설순. 상태 우선순위는 DB 정렬로 표현할 수 없어 아래에서
      // 다시 정렬한다.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        title: true,
        status: true,
        scheduledAt: true,
        scheduledEndAt: true,
        tier: true,
        seasonNo: true,
        sport: { select: { id: true, code: true, name: true } },
        region: { select: { id: true, name: true } },
        series: { select: { title: true } },
        // 내 팀만 가져온다 — 화면이 쓰는 건 "내 어느 팀이 이 리그에 있나" 뿐이다.
        registrations: {
          where: { teamId: { in: teamIds }, status: 'confirmed' },
          select: { teamId: true, team: { select: { name: true } } },
        },
        // **`confirmed` 만 센다.** 필터 없이 세면 리그 축의 `teams` 개수와 어긋난다 —
        // 지금은 전부 confirmed 라 같지만, 신청제(D7)가 들어오면 pending 이 섞인다.
        _count: { select: { registrations: { where: { status: 'confirmed' } } } },
      },
    });

    // ── 거울의 nullable 세 필드는 **전부 같은 불변식**이다 ─────────────────
    // `region`·`scheduledAt`·`scheduledEndAt` 은 스키마상 nullable 인데, 그건 **기존 대회
    // 행에 그 값이 없어서**지 리그에 없어서가 아니다:
    // ```
    // V1League.regionId / startsOn / endsOn   전부 NOT NULL — 원본에 항상 있다
    // dual-write                              그대로 복사한다
    // --apply (R4-a)                          88행을 채웠다
    // ```
    // **그래서 여기서 null 은 "값이 없는 경우" 가 아니라 "불변식이 깨진 경우" 다.**
    //
    // 세 필드를 **같은 방식으로** 다룬다 — 하나는 던지고 하나는 `as Date` 로 단언하면
    // 다음 사람도 또 다르게 다룬다. **단언은 검사가 아니다**: null 이 섞이면 그대로
    // 내려가거나 직렬화에서 터지고, 어느 쪽이든 원인이 안 보인다.
    //
    // **`where` 에서 거르지 않는 이유**: 거르면 그 리그가 목록에서 조용히 사라지고,
    // 그게 이 작업 전체가 막으려는 실패 모습이다.
    //
    // **`new Error` 를 쓰지 않는 이유**: `HttpException` 이 아니면 전역 필터가
    // **500 + "Internal server error"** 로 정규화해 **리그 id 도 code 도 전부 유실된다.**
    // 그러면 "어느 리그인지 대며 실패한다" 가 소스에만 참이고 응답에서는 거짓이 된다.
    // (클래스명은 `AllExceptionsFilter` 다 — 파일은 `common/filters/http-exception.filter.ts`
    // 인데 **파일명과 클래스명이 다르다.** 그 이름으로 적으면 검색해도 안 나온다.
    // `HttpExceptionFilter` 라는 클래스는 없다 — 의도적 언급, 지우지 말 것)
    // 한 번만 순회해 나눈다. 술어(`isComplete`)가 "완전하다"의 **유일한 정의**이고,
    // 타입 술어라서 통과한 행은 아래에서 단언 없이 non-null 로 쓸 수 있다.
    type LeagueMirrorRow = (typeof mirrors)[number];
    type CompleteLeagueMirror = LeagueMirrorRow & {
      region: NonNullable<LeagueMirrorRow['region']>;
      scheduledAt: Date;
      scheduledEndAt: Date;
    };
    // 세 검사를 **한 곳에만** 적는다. 술어와 아래 `missing` 목록을 따로 적으면 어긋날 수
    // 있고(한쪽만 고치면 "불완전한데 빠진 필드는 없다"는 응답이 나온다), 그건 원인을
    // 가장 못 찾게 만드는 모양이다.
    const REQUIRED: ReadonlyArray<readonly [string, (row: LeagueMirrorRow) => boolean]> = [
      ['region', (row) => row.region === null],
      ['scheduledAt', (row) => row.scheduledAt === null],
      ['scheduledEndAt', (row) => row.scheduledEndAt === null],
    ];
    const missingOf = (row: LeagueMirrorRow) =>
      REQUIRED.filter(([, isMissing]) => isMissing(row)).map(([field]) => field);
    const isComplete = (mirror: LeagueMirrorRow): mirror is CompleteLeagueMirror =>
      missingOf(mirror).length === 0;

    const complete: CompleteLeagueMirror[] = [];
    const incomplete: Array<{ leagueId: string; missing: string[] }> = [];
    for (const mirror of mirrors) {
      if (isComplete(mirror)) {
        complete.push(mirror);
        continue;
      }
      incomplete.push({ leagueId: mirror.id, missing: missingOf(mirror) });
    }
    if (incomplete.length > 0) {
      // 어느 리그의 어느 필드가 비었는지 전부 싣는다 — 운영자가 고칠 대상이 그것이다.
      //
      // **키는 반드시 `details`(복수) 다.** `AllExceptionsFilter` 는 payload 에서
      // `code`·`message`·**`details`** 만 응답으로 옮기고 **나머지 최상위 필드는 버린다.**
      // `detail`(단수)로 쓰면 예외 객체에는 담기는데 **응답에서는 사라진다** — 이 PR 이
      // 고치던 실패(진단 정보가 클라이언트까지 못 감)를 한 겹 안쪽에서 그대로 반복하는
      // 것이다. 실제로 그렇게 썼고 Copilot #876 재리뷰가 잡았다.
      throw new InternalServerErrorException({
        code: 'LEAGUE_MIRROR_INCOMPLETE',
        message: '리그 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
        details: incomplete,
      });
    }

    // 응답의 `state` 계약은 그대로 둔다 — 웹이 `LEAGUE_STATE_META[item.state]` 로
    // **인덱싱**해서, 세 값 밖이 나오면 목록 페이지가 통째로 죽는다.
    const leagues = complete.map((mirror) => ({
      id: mirror.id,
      title: mirror.title,
      state: LEAGUE_STATE_BY_STATUS[mirror.status],
      // 거울의 날짜는 리그의 `startsOn`/`endsOn` 이 그대로 옮겨온 것이다. nullable 인 이유는
      // **기존 대회 행**에 기간이 없어서지 리그에 없어서가 아니다(원본이 NOT NULL).
      // 위 불변식 검사를 통과했으므로 non-null 이다 — 근거는 단언이 아니라 검사다.
      startsOn: mirror.scheduledAt,
      endsOn: mirror.scheduledEndAt,
      tier: mirror.tier,
      seasonNo: mirror.seasonNo,
      sport: mirror.sport,
      region: mirror.region,
      series: mirror.series,
      teams: mirror.registrations,
      _count: { teams: mirror._count.registrations },
    }));

    // 진행 중 -> 준비 중 -> 종료. 목록이 사용자의 소속 팀 수로 묶여 있어(페이지네이션 없음)
    // 메모리 정렬로 충분하다. 규칙과 근거는 sortMyLeaguesByState 참고.
    const ordered = sortMyLeaguesByState(leagues);

    // 감사 보통 — "우리 팀 몇 등?" / "다음 경기 언제?" 가 없어서 참가 중인 리그마다
    // 상세로 들어가야 했다. draft 리그(대진이 아직 없는 상태 -- V1League.state 는
    // "draft -> active 는 대진 생성 시"의 정확한 투영이다, league-lifecycle-rules.ts 참고)는
    // 순위·다음 경기 자체가 존재할 수 없어 계산에서 아예 뺀다 -- N+1 을 줄이는 첫 단계.
    // 남은 리그(active/completed)에 대해서만 standings() 를 병렬 호출한다: 이 목록은
    // 사용자의 소속 팀 수가 상한이고 페이지네이션이 없어(위 listMine 문서 참고) 최악의
    // 경우에도 "팀 수" 규모지 "전체 리그 수" 규모가 아니다. standings() 가 이미 계산해
    // 둔 pendingFixtures 를 다음 경기 후보로 그대로 재사용한다 -- "다음 경기"만을 위한
    // 별도 쿼리를 새로 만들면 리그당 왕복이 하나 더 늘어난다.
    const computable = ordered.filter((league) => league.state !== 'draft');
    const standingsResults = await Promise.all(computable.map((league) => this.standings(league.id)));
    const standingsByLeagueId = new Map(computable.map((league, index) => [league.id, standingsResults[index]]));
    // 감사 L-E finding 6 — 아래 nextFixture 선택에서 "아직 시작 안 한 대진"만 후보로
    // 삼기 위한 기준 시각. map 클로저 밖에서 한 번만 고정해 항목마다 값이 흔들리지 않게 한다.
    const now = new Date();

    return {
      items: ordered.map((league) => {
        // league.teams 는 위에서 이미 내 팀으로 좁혀져 있다. 한 리그에 내 팀이 둘 이상
        // 있을 수 있어(같은 사용자가 두 팀 소속) 배열 그대로 싣는다 -- 하나만 고르면
        // 화면이 "왜 내 다른 팀은 안 보이지"가 된다.
        const mine = league.teams;
        const result = standingsByLeagueId.get(league.id) ?? null;
        // 상대팀 이름 조회용 -- result.standings 는 이 리그의 전체 참가팀을 담고 있어
        // pendingFixtures 의 상대팀 id 를 항상 여기서 찾을 수 있다(같은 리그 내 대진이므로).
        const teamNameById = new Map((result?.standings ?? []).map((row) => [row.teamId, row.teamName]));

        return {
          leagueId: league.id,
          title: league.title,
          state: league.state,
          startsOn: league.startsOn,
          endsOn: league.endsOn,
          sport: { sportId: league.sport.id, code: league.sport.code, name: league.sport.name },
          region: { regionId: league.region.id, name: league.region.name },
          tier: league.tier,
          tierLabel: league.tier === null ? null : `${league.tier}부`,
          seasonNo: league.seasonNo,
          seriesTitle: league.series?.title ?? null,
          teamCount: league._count.teams,
          myTeams: mine.map((entry) => {
            const standingRow = result?.standings.find((row) => row.teamId === entry.teamId) ?? null;
            // 취소·무효는 standings() 안에서 이미 pendingFixtures 대상에서 빠져 있다(R8,
            // 감사 L-E finding 2/5) -- 여기서 다시 필터링할 필요가 없다.
            //
            // 감사 L-E finding 6 수정: pendingFixtures는 "결과가 아직 안 들어온 대진"일 뿐
            // 시각 비교가 없다 -- 운영자 수동 입력 + 지연이 정상 경로인 이 리그에서는
            // 이미 지난 대진(결과 대기 중)도 여기 섞여 있다. 시작 시각 오름차순으로 그냥
            // 첫 항목을 고르면 "다음 경기"가 며칠 지난 과거 경기를 가리킨다(타입 계약은
            // "다음 예정 경기"다). 아직 시작하지 않은 대진 중 가장 이른 것만 후보로 삼고,
            // 없으면 null -- 진짜 다음 경기가 없다는 뜻이지 지난 미확정 경기로 대체하지 않는다.
            const nextFixture = (result?.pendingFixtures ?? [])
              .filter(
                (fixture) =>
                  (fixture.homeTeamId === entry.teamId || fixture.awayTeamId === entry.teamId) &&
                  fixture.startAt.getTime() >= now.getTime(),
              )
              .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
              .at(0) ?? null;
            const opponentTeamId =
              nextFixture === null ? null : nextFixture.homeTeamId === entry.teamId ? nextFixture.awayTeamId : nextFixture.homeTeamId;

            return {
              teamId: entry.teamId,
              name: entry.team.name,
              // draft 리그거나(result=null) 이 팀이 어떤 이유로든 순위표에 없으면 null.
              standing: standingRow === null ? null : {
                position: standingRow.position,
                points: standingRow.points,
                played: standingRow.played,
                wins: standingRow.wins,
                draws: standingRow.draws,
                losses: standingRow.losses,
                goalDifference: standingRow.goalsFor - standingRow.goalsAgainst,
              },
              // completed 리그는 남은 대진이 없어(D-3) 자연히 null -- "이미 끝난 리그"와
              // "아직 대진 자체가 없는 리그" 양쪽 다 여기서 별도 분기 없이 null로 처리된다.
              nextFixture: nextFixture === null ? null : {
                teamMatchId: nextFixture.teamMatchId,
                startAt: nextFixture.startAt,
                opponentTeamId,
                opponentTeamName: opponentTeamId === null ? null : teamNameById.get(opponentTeamId) ?? null,
              },
            };
          }),
        };
      }),
    };
  }

  async detail(leagueId: string) {
    const league = await this.loadLeague(leagueId);
    const fixtures = await this.prisma.v1TeamMatch.findMany({
      where: leagueFixtureListWhere(leagueId),
      orderBy: leagueFixtureListOrder(),
      // select 를 손으로 적지 않는다 — 대회 표면의 리그 경로가 같은 목록을 만들어야 하고,
      // 두 곳이 서로 다른 select 를 쓰면 같은 대진이 화면마다 다른 모양으로 나온다.
      select: LEAGUE_FIXTURE_LIST_SELECT,
    });

    // standings()와 동일한 패턴: 확정 리비전 id를 모아 v1_game_official_fact를
    // 단일 IN 조회로 가져온다(대진 수만큼 반복 조회하는 N+1을 만들지 않는다).
    const currentRevisionIds = fixtures
      .map((fixture) => fixture.game?.currentOfficialRevisionId ?? null)
      .filter((id): id is string => id !== null);
    const facts = currentRevisionIds.length === 0
      ? []
      : await this.prisma.v1GameOfficialFact.findMany({
          where: { revisionId: { in: currentRevisionIds } },
          // 감사 L-E finding 4 수정: 몰수 여부의 1차 판정 근거는 이제 전용 컬럼
          // `outcomeReason`이다(`league-match-forfeit.service.ts`가 생성 시점에 쓴다).
          // `reason`은 컬럼이 생기기 전에 만들어진 레거시 리비전을 위한 fallback으로만
          // 계속 읽는다 — 사유 원문은 운영자가 쓴 자유 텍스트라 공개 응답에 절대 싣지
          // 않고, 아래에서 boolean 으로만 환산한다.
          select: LEAGUE_FIXTURE_FACT_SELECT,
        });
    const factByGameId = new Map(facts.map((fact) => [fact.gameId, fact]));

    // 이슈 1(감사 보통) — seriesId 는 응답에 이미 있었지만 "같은 시리즈의 다른 시즌·
    // 티어로 이동"할 링크가 어디에도 없었다. 새 엔드포인트 대신 이 상세 응답을
    // 확장한다 — 형제 리그 목록은 상세 화면 하나에서만 쓰이고, 별도 조회로 쪼개면
    // 왕복이 하나 늘 뿐 얻는 게 없다. 단발 리그(seriesId === null)는 쿼리 자체를
    // 건너뛰어 빈 배열조차 만들지 않는다 — 무의미한 쿼리를 매 상세 조회마다 날리지 않는다.
    const siblings = league.seriesId === null
      ? []
      : await this.prisma.v1Tournament
          .findMany({
            where: {
              kind: 'regular_league',
              deletedAt: null,
              seriesId: league.seriesId,
              id: { not: league.id },
            },
            // 최신 시즌이 먼저, 같은 시즌 안에서는 1부부터 — 사용자가 "지금 시즌의 다른
            // 티어"를 가장 먼저 찾는다는 전제(승강 체계는 시즌 단위로 갱신되므로).
            orderBy: [{ seasonNo: 'desc' }, { tier: 'asc' }],
            select: { id: true, tier: true, seasonNo: true, status: true },
          })
          .then((rows) =>
            rows.map(({ status, ...rest }) => ({ ...rest, state: LEAGUE_STATE_BY_STATUS[status] })),
          );

    return {
      leagueId: league.id,
      title: league.title,
      state: league.state,
      startsOn: league.startsOn,
      endsOn: league.endsOn,
      // 시리즈에 속하지 않은 단발 리그는 셋 다 null 이다 — 화면은 null 이면 티어 뱃지를 띄우지 않는다.
      seriesId: league.seriesId,
      seriesTitle: league.series?.title ?? null,
      tier: league.tier,
      tierLabel: league.tier === null ? null : `${league.tier}부`,
      seasonNo: league.seasonNo,
      // 단발 리그는 항상 빈 배열 — 화면은 길이 0이면 탐색 섹션을 아예 그리지 않는다.
      // 티어·시즌은 시리즈에 속한 리그라면(위 모델 불변식) 항상 채워져 있어 non-null.
      seriesSiblings: siblings.map((sibling) => ({
        leagueId: sibling.id,
        tier: sibling.tier as number,
        tierLabel: `${sibling.tier}부`,
        seasonNo: sibling.seasonNo as number,
        state: sibling.state,
      })),
      teamIds: league.teams.map((entry) => entry.teamId),
      // 미확정 대진의 점수를 null 로 두는 것, 몰수를 boolean 하나로만 내보내는 것(사유
      // 원문 비공개)은 `league-fixture-list-source.ts` 가 지킨다 — 대회 표면의 리그
      // 경로도 같은 함수를 쓴다.
      fixtures: toLeagueFixtureList(fixtures, factByGameId),
    };
  }

  async standings(leagueId: string) {
    const league = await this.loadLeague(leagueId);
    const teamIds = league.teams.map((entry) => entry.teamId);
    const teamMatches = await this.prisma.v1TeamMatch.findMany({
      where: { leagueId },
      select: {
        id: true,
        hostTeamId: true,
        approvedApplicantTeamId: true,
        startAt: true,
        status: true,
        // 감사 L-E finding 2/5 수정: 무효(VOID) 처리된 대진은 currentOfficialRevisionId가
        // null로 풀리는 게 아니라 VOID 리비전 자신을 계속 가리킨다(voidTeamMatchResult,
        // games.service.ts). fact 유무만으로는 "아직 결과가 없어 미확정"과 "결과가 있었지만
        // 무효 처리됨"을 구분할 수 없으므로(둘 다 fact가 없다) 포인터가 가리키는 리비전의
        // state를 직접 읽어야 한다.
        game: { select: { id: true, currentOfficialRevisionId: true, currentOfficialRevision: { select: { state: true } } } },
      },
    });

    const currentRevisionIds = teamMatches
      .map((tm) => tm.game?.currentOfficialRevisionId ?? null)
      .filter((id): id is string => id !== null);
    const facts = currentRevisionIds.length === 0
      ? []
      : await this.prisma.v1GameOfficialFact.findMany({
          where: { revisionId: { in: currentRevisionIds } },
          select: { gameId: true, homeScore: true, awayScore: true },
        });
    const factByGameId = new Map(facts.map((fact) => [fact.gameId, fact]));

    // 분류 규칙(취소·VOID·pending·confirmed)은 `league-standings-source.ts` 로 뽑았다 —
    // 통합 화면의 `getOverallStandings` 가 거울 행에서 **같은 계산**을 해야 하는데, 여기 두면
    // 두 벌이 되고 한쪽만 고쳐지는 날이 온다. 규칙의 근거(R8 · 감사 L-E)는 그 파일 주석에 있다.
    const {
      confirmed: confirmedFixtures,
      pending: pendingFixtures,
      cancelledCount: cancelledFixtureCount,
    } = bucketLeagueFixtures(teamMatches, factByGameId);

    const tieBreakOrder = LEAGUE_TIE_BREAK_ORDER;
    // calculateLeagueStandingsWithTieBreakInfo 는 calculateLeagueStandings 와 완전히 같은
    // 정렬을 하면서 tie-break 가 전부 소진돼 팀ID 사전순 폴백으로 갈린 그룹도 함께
    // 돌려준다(감사 H-5) -- "강등당한 팀이 왜 강등인지 납득할 근거가 없다"는 문제를
    // 승강 확정 화면뿐 아니라 이 공개 순위표에서도 같은 계산 한 번으로 함께 해결한다.
    const { standings, tieGroups } = calculateLeagueStandingsWithTieBreakInfo({ teamIds, fixtures: confirmedFixtures, tieBreakOrder });
    const teamNameById = new Map(league.teams.map((entry) => [entry.teamId, entry.team.name]));
    const teamLogoById = new Map(league.teams.map((entry) => [entry.teamId, entry.team.profile?.logoUrl ?? null]));

    // 확정된 승강 결과를 순위표에 얹는다(Task 153 시나리오 4). V1LeaguePromotion 은
    // 그동안 createMany 로 쓰기만 하고 아무도 읽지 않는 테이블이었다 — 감사 추적을 위해
    // 만들었는데 정작 어디에도 드러나지 않았다. preview 단계에서는 행이 아예 만들어지지
    // 않으므로, 여기 값이 있다는 것은 곧 어드민이 최종 승인했다는 뜻이고, 확정 전(행 0건)
    // 에는 전부 null 이라 순위표 모양이 바뀌지 않는다.
    // 어드민 전용 필드(computedKind/overriddenByAdmin/overrideNote/결정자)는 노출하지 않는다 --
    // "왜 규칙과 다르게 조정했는지"는 운영 판단이라 공개 대상이 아니다(153 Security Notes).
    const promotions = await this.prisma.v1LeaguePromotion.findMany({
      where: { fromLeagueId: league.id },
      select: { teamId: true, kind: true, toTier: true },
    });
    const promotionByTeamId = new Map(promotions.map((row) => [row.teamId, row]));
    const promotionDecided = promotions.length > 0;

    // 예상 승강 경계(감사 H-2) — 지금까지는 어드민이 시즌 끝에 최종 확정한 뒤(V1LeaguePromotion
    // 행이 생긴 뒤)에만 승강 정보가 보였다. 2부 3위 팀 선수는 시즌 내내 자기가 승격권인지
    // 강등권인지 모른 채 뛴 것 — 이 리그가 시리즈(티어 체계)에 속할 때만 의미가 있다(단발
    // 리그는 티어 개념 자체가 없다). 슬롯 수 계산은 tierSlotCounts(league-promotion.ts)를
    // 그대로 재사용한다 — 승강 확정 preview 와 같은 단일 소스라 20%/올림/최소1 같은 규칙이
    // 두 화면에서 어긋날 일이 없다. 1티어 시리즈·최상위/최하위 티어의 경계 조건도
    // tierSlotCounts 안에서 이미 처리된다(canPromote=tier>1, canRelegate=tier<tierCount).
    //
    // 확정 전(promotionDecided=false)에만 계산한다 — 확정 뒤에는 promotionKind 가 진실이고
    // "예상"은 그 순간부터 무의미해진다(순위가 그새 바뀔 일이 없으니 다시 계산해도 값은
    // 같겠지만, 두 필드가 동시에 화면에 노출되면 어느 쪽을 믿어야 하는지 헷갈린다). 필드
    // 이름에 항상 "expected"를 붙여 확정 필드(promotionKind)와 타입 수준에서 섞이지 않게 한다.
    // 지역 const 로 뽑아 두는 이유: `league.tier`(property access)는 아래 .map 클로저
    // 안에서 narrowing 이 유지되지 않는다 — 지역 변수(`tier`)라야 TS 가 null 아님을
    // 클로저 경계 너머로도 신뢰한다.
    const tier = league.tier;
    const promotionRule = league.series === null ? null : resolvePromotionRule(league.series.promotionRuleJson);
    const promotionForecast =
      promotionRule === null || tier === null || promotionDecided
        ? null
        : tierSlotCounts(promotionRule, tier, league.series!.tierCount, standings.length);

    const standingsWithTeamName = standings.map((row, index) => {
      const promotion = promotionByTeamId.get(row.teamId);
      let expectedPromotionKind: PromotionKind | null = null;
      let expectedPromotionToTier: number | null = null;
      let expectedPromotionToTierLabel: string | null = null;
      if (promotionForecast !== null && tier !== null) {
        expectedPromotionKind = promotionForecast.skippedByMajorityGuard
          ? 'stayed'
          : classifyPromotionKind(index, standings.length, promotionForecast.promoteCount, promotionForecast.relegateCount);
        expectedPromotionToTier = resolvePromotionToTier(tier, expectedPromotionKind);
        expectedPromotionToTierLabel = `${expectedPromotionToTier}부`;
      }
      return {
        ...row,
        teamName: teamNameById.get(row.teamId) ?? '',
        teamLogoUrl: teamLogoById.get(row.teamId) ?? null,
        promotionKind: promotion?.kind ?? null,
        promotionToTier: promotion?.toTier ?? null,
        promotionToTierLabel: promotion === undefined ? null : `${promotion.toTier}부`,
        expectedPromotionKind,
        expectedPromotionToTier,
        expectedPromotionToTierLabel,
      };
    });

    // 그룹 B(시즌 결산·시상 화면 감사) — 우승팀(공동 우승 가능, resolveLeagueChampions
    // 참고 — league-standings.ts, 이미 계산된 tieGroups 를 재사용하는 순수 함수라 jest로
    // 별도 검증). state가 completed가 아니면(진행 중·준비 중) "우승"이 아직 성립하지
    // 않으므로 항상 빈 배열이다(사용자 확정 2026-08-23 — 종료된 리그에만 의미가 있음).
    const champions = league.state !== 'completed' ? [] : resolveLeagueChampions(standingsWithTeamName, tieGroups);

    return {
      leagueId: league.id,
      tier: league.tier,
      tierLabel: league.tier === null ? null : `${league.tier}부`,
      tieBreakOrder,
      standings: standingsWithTeamName,
      pendingFixtures,
      // 그룹 B — 종료된 리그의 우승팀(공동 우승 가능). 위 champions 계산 참고.
      champions,
      // 이슈 3 — 팀마다 치른 경기 수가 다른 이유(취소된 대진은 집계에서 빠진다)를
      // 순위표 화면이 스스로 설명할 수 있게 한다. 취소가 0건이면 0 그대로 내려주고,
      // 화면은 0이면 안내 자체를 그리지 않는다.
      cancelledFixtureCount,
      // 이름은 dev 에 이미 머지된 #628 계약을 따른다(promotionDecided). 이 브랜치는
      // 한때 promotionsDecided 로 바꿨었지만, 그 사이 #628 이 dev 에 들어가 배포된
      // 계약이 되었으므로 새로 이름을 바꿀 이유가 없다 -- 통합 테스트도 이 이름을 본다.
      promotionDecided,
      // 이 시즌·티어에 적용되는 승강 슬롯 수(확정 전에만 값 있음). 개별 팀 행의
      // expectedPromotionKind 와 짝이다 -- 시리즈에 속하지 않거나 이미 확정됐으면 null.
      promotionForecast: promotionForecast === null ? null : {
        promoteSlots: promotionForecast.promoteCount,
        relegateSlots: promotionForecast.relegateCount,
        skippedByMajorityGuard: promotionForecast.skippedByMajorityGuard,
      },
      // 감사 H-5 — tie-break 기준을 전부 소진하고도 갈리지 않아 팀ID 사전순 폴백으로
      // 순위가 결정된 팀 그룹. 대부분의 시즌은 빈 배열이다.
      tieBreakGroups: tieGroups.map((group) => ({
        teamIds: group.teamIds,
        teamNames: group.teamIds.map((teamId) => teamNameById.get(teamId) ?? ''),
      })),
    };
  }

  async playerRecords(leagueId: string) {
    const league = await this.loadLeague(leagueId);
    // 취소된 대진은 standings()와 동일한 기준으로 제외한다(R8). 이 필터가 없으면
    // "순위표에서는 빠진 경기의 득점이 득점 순위에는 남아 있는" 상태가 만들어져
    // 같은 화면 안에서 두 집계가 서로 다른 경기 집합을 쓰게 된다.
    const teamMatchIds = (
      await this.prisma.v1TeamMatch.findMany({
        where: { leagueId, status: { not: 'cancelled' } },
        select: { id: true },
      })
    ).map((tm) => tm.id);
    if (teamMatchIds.length === 0) return { leagueId: league.id, goals: [], assists: [], hiddenByEligibility: false };

    const games = await this.prisma.v1Game.findMany({
      where: { teamMatchId: { in: teamMatchIds }, currentOfficialRevisionId: { not: null } },
      select: { currentOfficialRevisionId: true },
    });
    const revisionIds = games.map((g) => g.currentOfficialRevisionId!).filter(Boolean);
    if (revisionIds.length === 0) return { leagueId: league.id, goals: [], assists: [], hiddenByEligibility: false };

    const participantRows = await this.prisma.v1GameResultParticipant.findMany({
      where: { resultRevisionId: { in: revisionIds } },
      select: { participantId: true, goals: true, assists: true, resultRevision: { select: { officialAt: true } } },
    });

    const eligibility = await loadParticipantConsentEligibility(this.prisma, participantRows.map((row) => row.participantId));
    const totalsByUserId = new Map<string, { goals: number; assists: number }>();
    // "기록은 있는데 공개 자격(신원 연동 + 기록 공개 동의)을 못 갖춰 집계에서 빠진 행"이
    // 하나라도 있었는가 — 화면이 이 값으로 빈 상태 문구를 가른다("결과가 쌓이면 나타나요"는
    // 이 경우 거짓 안내가 된다). 이름을 consent 가 아니라 eligibility 로 둔 이유:
    // 연동 자체가 없는 경우(eligibility 행 부재)도 여기에 포함되므로 "동의만"으로 좁히면
    // 필드명이 실제 의미를 오도한다(Copilot 리뷰). officialAt null 로 빠진 행은 공개 자격과
    // 무관한 별개 게이트라 세지 않는다.
    let hiddenByEligibility = false;
    for (const row of participantRows) {
      // officialAt이 null이면(공식 확정 안 됨) 이 행은 애초에 집계 대상이 아니다 --
      // 동의 판정(isParticipantPubliclyEligible)은 시간 비교를 하지 않으므로
      // 이 null 체크는 그 판정과 무관한 별개의 "공식 결과인가" 게이트다.
      if (row.resultRevision.officialAt === null) continue;
      const eligibilityRow = eligibility.get(row.participantId);
      if (eligibilityRow === undefined || !isParticipantPubliclyEligible(eligibilityRow)) {
        if (row.goals > 0 || row.assists > 0) hiddenByEligibility = true;
        continue;
      }
      const userId = eligibilityRow.linkedUserId!;
      const current = totalsByUserId.get(userId) ?? { goals: 0, assists: 0 };
      current.goals += row.goals;
      current.assists += row.assists;
      totalsByUserId.set(userId, current);
    }

    const userIds = [...totalsByUserId.keys()];
    const users = userIds.length === 0 ? [] : await this.prisma.v1User.findMany({ where: { id: { in: userIds } }, select: { id: true, profile: { select: { nickname: true } } } });
    const nicknameByUserId = new Map(users.map((u) => [u.id, u.profile?.nickname ?? null]));

    const rows = userIds.map((userId) => ({ userId, nickname: nicknameByUserId.get(userId) ?? null, ...totalsByUserId.get(userId)! }));
    // 각 순위는 해당 기록이 1 이상인 선수만 노출한다 — 골 0개 선수가 득점 순위에 뜨면 안 된다.
    return {
      leagueId: league.id,
      goals: rows.filter((row) => row.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, PLAYER_RECORDS_LIMIT),
      assists: rows.filter((row) => row.assists > 0).sort((a, b) => b.assists - a.assists).slice(0, PLAYER_RECORDS_LIMIT),
      hiddenByEligibility,
    };
  }

  private async loadLeague(leagueId: string) {
    const row = await findTournamentOnSurface(this.prisma, ['regular_league'], {
      where: { id: leagueId, deletedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        scheduledAt: true,
        scheduledEndAt: true,
        seriesId: true,
        tier: true,
        seasonNo: true,
        sport: { select: { id: true, code: true, name: true } },
        region: { select: { id: true, name: true } },
        // 로스터 = confirmed 등록.
        registrations: {
          where: { status: 'confirmed' },
          select: { teamId: true, team: { select: { name: true, profile: { select: { logoUrl: true } } } } },
        },
        // promotionRuleJson 은 예상 승강 경계(감사 H-2) 계산에 쓴다 -- 시즌 중에도
        // "지금 순위라면 승격/강등권인가"를 알려주려면 확정 순위표뿐 아니라 이 시리즈의
        // 승강 규칙까지 필요하다.
        series: { select: { id: true, title: true, tierCount: true, promotionRuleJson: true } },
      },
    });
    if (row === null) {
      throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
    }
    if (row.scheduledAt === null || row.scheduledEndAt === null || row.region === null) {
      // 거울이 깨졌다 — 일정·지역 없이 상세를 그리면 화면이 빈 값을 사실처럼 보여준다.
      throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
    }
    // 호출부의 어휘(`state`·`startsOn`·`endsOn`·`teams`)는 그대로 둔다 — 응답 계약 불변.
    const { registrations, scheduledAt, scheduledEndAt, status, ...rest } = row;
    return {
      ...rest,
      state: LEAGUE_STATE_BY_STATUS[status],
      startsOn: scheduledAt,
      endsOn: scheduledEndAt,
      teams: registrations,
    };
  }
}
