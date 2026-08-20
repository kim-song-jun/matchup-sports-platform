'use client';

/**
 * TournamentProgressStepper
 *
 * 이미지 레퍼런스 (V21-11): 리그 3R 종료 → 준결승 종료 → 결승 (오늘 20:00)
 * 각 단계는 done / active / upcoming 3가지 상태를 가짐.
 */

export type StageStatus = 'done' | 'active' | 'upcoming';

export interface TournamentStage {
  key: string;
  label: string;
  /** 날짜/시간 표시 (예: "5.12 (일)", "오늘 20:00") */
  subLabel?: string;
  status: StageStatus;
}

interface TournamentProgressStepperProps {
  stages: TournamentStage[];
}

export function TournamentProgressStepper({ stages }: TournamentProgressStepperProps) {
  if (!stages.length) return null;

  return (
    <div className="tm-hub-stages" role="list" aria-label="대회 진행 단계">
      {stages.map((stage, idx) => (
        <StageWithConnector
          key={stage.key}
          stage={stage}
          isLast={idx === stages.length - 1}
          prevDone={idx > 0 && stages[idx - 1].status === 'done'}
          stepNumber={idx + 1}
        />
      ))}
    </div>
  );
}

function StageWithConnector({
  stage,
  isLast,
  prevDone,
  stepNumber,
}: {
  stage: TournamentStage;
  isLast: boolean;
  prevDone: boolean;
  stepNumber: number;
}) {
  const dotClass = [
    'tm-hub-stage-dot',
    stage.status === 'done' ? 'tm-hub-stage-dot-done' : '',
    stage.status === 'active' ? 'tm-hub-stage-dot-active' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const labelClass = [
    'tm-hub-stage-label',
    stage.status === 'done' ? 'tm-hub-stage-label-done' : '',
    stage.status === 'active' ? 'tm-hub-stage-label-active' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const subLabelClass = [
    'tm-hub-stage-sublabel',
    stage.status === 'active' ? 'tm-hub-stage-sublabel-active' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <div
        className="tm-hub-stage"
        role="listitem"
        aria-label={`${stage.label}${stage.status === 'done' ? ' (완료)' : stage.status === 'active' ? ' (진행 중)' : ' (예정)'}`}
      >
        {/* upcoming 상태만 번호 표시 — done/active는 ::after 로 처리.
            [R-T2] 28px 원(테두리 2px 감안 실질 24px)에 숫자 한 자리라 12px 여유. */}
        <div className={dotClass} aria-hidden="true">
          {stage.status === 'upcoming' && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--grey400)', lineHeight: 1 }}>{stepNumber}</span>}
        </div>
        <span className={labelClass}>{stage.label}</span>
        {stage.subLabel ? <span className={subLabelClass}>{stage.subLabel}</span> : null}
      </div>
      {!isLast && (
        <div
          className={`tm-hub-stage-connector${stage.status === 'done' ? ' tm-hub-stage-connector-done' : ''}`}
          aria-hidden="true"
        />
      )}
    </>
  );
}

/* ── 헬퍼: V1TournamentDetail → stages 자동 생성 ── */

import type { V1TournamentDetail, V1TournamentFixture } from '@/types/api';

/**
 * 라운드 이름 한 개를 단계 분류로 접는다.
 *
 * 이 필드는 **자유 문자열**이다 — 어드민이 대진을 만들 때 직접 적는다. 실제 데이터에는
 * 두 어휘가 섞여 있다(alpha 실측):
 *   · 영문 키   `group` / `semi` / `final` / `third_place`  (QA 시드)
 *   · 한국어 라벨 `조별 1라운드` / `4강` / `결승` / `3·4위전`  (목업 시드 · 운영자 입력)
 *
 * 예전 코드는 영문 키만 비교해서(`f.round === 'group'`) 한국어 라벨 대회에서는 필터가
 * **전부 빈 배열**이 됐고, 그래서 조별리그·4강이 영원히 "예정"(번호)으로 남고 결승만
 * 대회 status 로 체크됐다(오너 지적: "결승 갔을 때 조별리그, 4강이 check가 안되는").
 */
type RoundKind = 'group' | 'third_place' | 'knockout' | 'unknown';

/**
 * 라운드 이름이 비었으면 어느 단계로도 세지 않는다(`unknown`). 이름이 없는 픽스처를
 * 억지로 결선으로 분류하면 제목 없는 빈 스텝이 하나 생기고, 그게 "다음 단계"처럼
 * 읽힌다. 값 자체를 못 믿는 이유는 이 필드가 운영자가 직접 적는 자유 문자열이기
 * 때문이다 — 스테퍼 하나가 대회 상세·운영 보드 전체를 못 그리게 만들면 안 된다.
 */
function classifyRound(round: string | null | undefined): RoundKind {
  if (typeof round !== 'string') return 'unknown';
  const r = round.trim();
  if (r === '') return 'unknown';
  // 3·4위전은 진행 단계가 아니다 — 결승과 같은 시점에 치르는 곁가지라 스텝에 넣으면
  // "결승 다음 단계"처럼 읽힌다.
  if (r === 'third_place' || (r.includes('3') && r.includes('위'))) return 'third_place';
  if (r === 'group' || r.startsWith('조별') || r.startsWith('league_r')) return 'group';
  return 'knockout';
}

/** 영문 키로 들어온 라운드는 화면에 그대로 쓸 수 없다 — 한국어 라벨로 바꾼다. */
const ROUND_LABEL: Record<string, string> = {
  group: '조별리그',
  semi: '4강',
  quarter: '8강',
  final: '결승',
};

function roundLabel(round: string): string {
  return ROUND_LABEL[round.trim()] ?? round.trim();
}

/**
 * 픽스처 하나의 진행 상태. **`status` 컬럼이 아니라 `liveStatus`** 를 본다 — 타입 주석에
 * 적힌 대로 `status` 는 `scheduled`/`completed` 두 값만 기록돼 경기 중에도 `scheduled` 다.
 */
function isEnded(f: { liveStatus: string }): boolean {
  return f.liveStatus === 'ended';
}
function isStarted(f: { liveStatus: string }): boolean {
  return f.liveStatus !== 'scheduled';
}

type StageDraft = { key: string; label: string; fixtures: V1TournamentFixture[] };

/** 픽스처 묶음 하나의 상태. 취소된 경기는 단계 완료를 막지 않는다(치를 수 없게 된 경기다). */
function rawStageStatus(fixtures: V1TournamentFixture[]): StageStatus {
  if (fixtures.length === 0) return 'upcoming';
  const playable = fixtures.filter((f) => f.liveStatus !== 'cancelled');
  if (playable.length > 0 && playable.every(isEnded)) return 'done';
  if (fixtures.some(isStarted)) return 'active';
  return 'upcoming';
}

/**
 * 스텝은 **단조(monotonic)** 여야 한다 — 뒤 단계가 시작됐다면 앞 단계는 끝난 것이다.
 * 라운드 이름을 못 알아보거나 일부 경기가 취소돼 앞 단계가 `done` 으로 접히지 않아도,
 * 이 보정이 "결승을 하는 중인데 조별리그가 예정"인 화면을 막는다. 대회 자체가 종료면
 * 전 단계가 완료다.
 */
function makeMonotonic(stages: TournamentStage[], allDone: boolean): TournamentStage[] {
  if (allDone) return stages.map((stage) => ({ ...stage, status: 'done' as const }));

  const lastTouched = stages.reduce(
    (acc, stage, idx) => (stage.status === 'done' || stage.status === 'active' ? idx : acc),
    -1,
  );
  return stages.map((stage, idx) =>
    idx < lastTouched && stage.status !== 'done' ? { ...stage, status: 'done' as const } : stage,
  );
}

/**
 * 이 라운드가 **결승**인가. 대회의 목적지를 판정한다 — 스텝의 마지막 칸이 되고,
 * 픽스처가 아직 없으면 이 이름으로 빈 칸을 만들어 세운다.
 *
 * `준결승` 이 `결승` 을 부분 문자열로 포함하는 것이 함정이다. 그래서 포함 여부만 보지 않고
 * 준결승 계열(`준결승`/`세미`)을 먼저 걸러낸다.
 */
function isFinalRound(round: string): boolean {
  const r = round.trim();
  if (r === 'semi' || r.includes('준결승') || r.includes('세미')) return false;
  return r === 'final' || r.includes('결승') || r.toUpperCase() === 'FINAL';
}

/**
 * 결선 라운드들을 **진행 순서대로** 세운다. `fixtureNumber` 가 그 순서를 이미 갖고 있다
 * (alpha 실측: 조별 1,2 → 4강 3,4 → 결승 5 → 3·4위전 6). 라운드 이름 사전순이나
 * 서버 배열 순서로 정렬하면 결승이 4강 앞에 오는 대회가 나온다.
 */
function knockoutStageDrafts(fixtures: V1TournamentFixture[]): StageDraft[] {
  const byRound = new Map<string, V1TournamentFixture[]>();
  for (const fixture of fixtures) {
    if (classifyRound(fixture.round) !== 'knockout') continue;
    const list = byRound.get(fixture.round);
    if (list === undefined) byRound.set(fixture.round, [fixture]);
    else list.push(fixture);
  }

  return [...byRound.entries()]
    .map(([round, list]) => ({ key: round, label: roundLabel(round), fixtures: list }))
    .sort(
      (a, b) =>
        Math.min(...a.fixtures.map((f) => f.fixtureNumber)) -
        Math.min(...b.fixtures.map((f) => f.fixtureNumber)),
    );
}

/**
 * 대회 포맷과 경기 결과를 분석해 진행 단계 목록을 자동 생성.
 * - league: 리그전 → 시상
 * - knockout: 실제로 존재하는 결선 라운드들(8강 → 4강 → 결승)
 * - group_knockout: 조별리그 → 실제 결선 라운드들
 */
export function buildTournamentStages(tournament: V1TournamentDetail): TournamentStage[] {
  const { format, fixtures, status } = tournament;

  const allDone = status === 'completed';
  const inProgress = status === 'in_progress';

  if (format === 'league') {
    const playable = fixtures.filter((f) => f.liveStatus !== 'cancelled');
    const anyStarted = fixtures.some(isStarted);

    const leagueStatus: StageStatus = allDone
      ? 'done'
      : playable.length > 0 && playable.every(isEnded)
        ? 'done'
        : anyStarted || inProgress
          ? 'active'
          : 'upcoming';

    return [
      { key: 'league', label: '리그전', status: leagueStatus },
      { key: 'awards', label: '시상', status: allDone ? 'active' : 'upcoming' },
    ];
  }

  const drafts: StageDraft[] = [];

  // 조별리그는 이 포맷의 **출발점**이라 픽스처가 아직 없어도 칸을 세운다 — 대진이 나오기
  // 전에 들어온 사람도 "조별리그부터 시작하는 대회"라는 걸 알아야 한다.
  if (format !== 'knockout') {
    drafts.push({
      key: 'group',
      label: '조별리그',
      fixtures: fixtures.filter((f) => classifyRound(f.round) === 'group'),
    });
  }
  drafts.push(...knockoutStageDrafts(fixtures));

  // 결승은 이 대회의 **목적지**다. 실제 결승 픽스처는 4강이 끝나야 생기는 경우가 많은데
  // (alpha 실측: 진행 중인 조별+토너먼트 대회의 라운드가 `['조별 리그','4강']` 뿐),
  // 존재하는 라운드만 세우면 스텝이 4강에서 끊겨 "이 대회는 4강이 끝"처럼 읽힌다
  // (오너 지적: "결승까지도 항상 나와야하는거 아니야? 왜 이제는 4강까지밖에 안나오는거지").
  // 없으면 빈 칸으로 만들어 마지막에 세운다 — 픽스처가 생기면 위 루프가 이미 넣었으므로
  // 여기서 중복으로 붙지 않는다.
  // (league 는 위에서 이미 반환했으므로 여기 남는 포맷은 knockout · group_knockout 뿐이다.)
  if (!drafts.some((draft) => isFinalRound(draft.key))) {
    drafts.push({ key: 'final', label: '결승', fixtures: [] });
  }

  if (drafts.length === 0) return [];

  return makeMonotonic(
    drafts.map((draft) => ({
      key: draft.key,
      label: draft.label,
      status: rawStageStatus(draft.fixtures),
    })),
    allDone,
  );
}
