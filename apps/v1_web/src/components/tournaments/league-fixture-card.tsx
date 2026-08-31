'use client';

import { fixtureResultLabel, fixtureStatusMeta } from '@/lib/league-fixture-meta';
import { formatTournamentDateMedium, formatKstTime } from '@/lib/date-utils';
import type { V1LeagueFixture } from '@/types/league-match';
import {
  CompetitionFixtureCard,
  CompetitionFixtureVenue,
  type CompetitionFixtureHeader,
} from '@/components/tournaments/competition-fixture-card';

/**
 * 정규 리그 시즌의 경기 카드 — 대회 표면(`/tournaments/:id`)에서 쓴다.
 *
 * 껍데기(배치·간격·정렬 축·다크모드 토큰)는 `CompetitionFixtureCard` 로 대회 카드와
 * 공유하고, **상태·결과 어휘는 리그 자신의 단일 소스**(`lib/league-fixture-meta.ts`)를
 * 그대로 쓴다. 그 모듈이 이미 리그 경기 목록과 경기 상세 두 화면을 맞춰 두고 있어서,
 * 여기서 새로 어휘를 만들면 **같은 경기가 화면마다 다른 상태로 불린다.**
 *
 * 그 소스가 갖고 있고 새로 짜면 잃는 것들 — 실제로 한 번 잃을 뻔했다:
 * - **취소 대진은 점수가 있어도 점수를 안 보여준다.** 순위표는 취소를 통째로 제외하는데
 *   일정에만 "1 : 0" 이 남으면 한 화면 안의 두 집계가 서로 다른 말을 한다(R8).
 * - **킥오프가 지난 `matched` 는 '예정'이 아니라 '결과 대기'** 다. 이 저장소의 리그 대진은
 *   결과가 제출돼야 `completed` 로 바뀌므로, 치렀지만 아직 입력 전인 구간이 매 대진마다
 *   최소 하루는 정상적으로 발생한다.
 * - **몰수는 점수를 지우지 않고 뱃지로 가른다.** 몰수는 1:0 으로 기록돼 실제 1:0 승리와
 *   화면에서 완전히 같아 보인다.
 * - **배지**(`fixtureStatusMeta`)는 상태 6개를 각각 다른 라벨로 적는다
 *   (`recruiting 모집 중 | closed 마감 | matched 매칭됨 | cancelled 취소됨 |
 *   completed 완료 | expired 기한 만료`). 3개만 다루면 나머지가 기본값으로 떨어진다.
 *   반면 **결과 문구**(`fixtureResultLabel`)는 상태로 6분기하지 않는다 — 취소 / 점수 있음 /
 *   그 외(킥오프 지남 여부)의 **세 갈래**다. 두 함수는 답하는 질문이 다르다:
 *   전자는 "대진이 어느 단계인가", 후자는 "결과가 어디까지 왔는가".
 */

/**
 * 헤더 왼쪽 슬롯을 정하는 **유일한 자리.**
 *
 * 대회는 이 자리에 회차(`4강`·`3경기`)를 넣는데 리그 경기엔 회차 개념이 없다 — 서버가
 * `round` 도 `fixtureNumber` 도 주지 않는다. 그래서 **날짜**를 넣는다(2026-09-01 KST 결정).
 * 다른 것(주차 계산·상대팀 강조)으로 바뀔 수 있으므로 카드가 아니라 이 함수만 갈아끼우면
 * 되게 분리해 뒀다.
 */
export function leagueFixtureHeader(fixture: V1LeagueFixture): CompetitionFixtureHeader {
  return {
    label: formatTournamentDateMedium(fixture.startAt) ?? '날짜 미정',
    // 시각 칸을 비우면 "안 정해진 것" 과 "화면이 빠뜨린 것" 을 구분할 수 없다 — 대회 카드가
    // '시간 미정' 을 명시하는 것과 같은 이유다.
    caption: fixture.startAt ? formatKstTime(fixture.startAt) : '시간 미정',
  };
}

/**
 * 팀 이름은 **대진에 실려 오지 않는다** — `V1LeagueFixture` 는 `homeTeamId`/`awayTeamId`
 * 만 준다. 이름은 리그 참가팀 목록에서 붙이는 것이라 **호출부가 해결해 넘긴다**(리그
 * 일정 목록이 `teamLookup` 으로 하는 것과 같다). 카드가 조회하지 않는다.
 *
 * `awayTeamId` 는 null 일 수 있다(상대 미정) — 그때 호출부가 '상대팀 미정' 을 넘긴다.
 */
export function LeagueFixtureCard({
  fixture,
  homeLabel,
  awayLabel,
}: {
  fixture: V1LeagueFixture;
  homeLabel: string;
  awayLabel: string;
}) {
  const statusMeta = fixtureStatusMeta(fixture.status);
  const result = fixtureResultLabel(fixture);

  return (
    <CompetitionFixtureCard
      header={leagueFixtureHeader(fixture)}
      badge={<span className={`tm-badge ${statusMeta.badgeClass}`}>{statusMeta.label}</span>}
      homeLabel={homeLabel}
      awayLabel={awayLabel}
      center={
        result.hasScore ? (
          <div
            className="tm-text-body-lg tab-num"
            // 몰수 스코어는 굵게 강조하지 않는다 — 관례로 붙은 1:0 이 실제 득점과 같은
            // 무게로 읽히면 안 된다(리그 일정 목록과 같은 규칙).
            style={{
              color: 'var(--text-strong)',
              fontWeight: result.isForfeit ? 400 : 700,
            }}
          >
            {result.text}
          </div>
        ) : (
          <div className="tm-text-label" style={{ color: 'var(--text-caption)', letterSpacing: 1 }}>
            vs
          </div>
        )
      }
      caption={<LeagueFixtureCaption fixture={fixture} result={result} />}
    />
  );
}

/**
 * 하단 캡션 — 장소, 그리고 **점수만으로는 안 읽히는 것 한 줄.**
 *
 * 몰수 사유 원문은 싣지 않는다. `V1LeagueFixture` 에 그 필드가 없고(어드민이 쓴 사유는
 * 공개하지 않는 것이 계약이다), 없는 값을 지어내는 대신 리그 일정 목록이 이미 쓰는
 * "(관례 스코어)" 문구를 그대로 쓴다.
 */
function LeagueFixtureCaption({
  fixture,
  result,
}: {
  fixture: V1LeagueFixture;
  result: ReturnType<typeof fixtureResultLabel>;
}) {
  // 점수가 없을 때의 결과 문구('결과 대기'·'집계 제외')는 가운데 칸이 'vs' 를 그리느라
  // 자리를 못 잡는다 — 여기서 싣는다. '예정' 은 뱃지·날짜와 겹치므로 뺀다.
  const note = !result.hasScore && result.text !== '예정' ? result.text : null;
  const venue = fixture.placeName || null;
  if (venue === null && note === null && !result.isForfeit) return undefined;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {venue ? <CompetitionFixtureVenue venue={venue} /> : null}
      {result.isForfeit ? (
        <>
          {/* 컬러만으로 알리지 않는다 — "몰수" 텍스트를 함께 싣는다. */}
          <span className="tm-badge tm-badge-sm tm-badge-grey">몰수</span>
          <span>(관례 스코어)</span>
        </>
      ) : null}
      {note ? <span>{note}</span> : null}
    </span>
  );
}
