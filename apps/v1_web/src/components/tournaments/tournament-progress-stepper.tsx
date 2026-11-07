'use client';

import { useEffect, useLayoutEffect, useRef, useState, type Ref } from 'react';

/**
 * TournamentProgressStepper
 *
 * 각 단계는 done / active / upcoming 3가지 상태를 가진다. 진행 중인 단계가 없는 단계 사이 구간에서는
 * 다음에 시작할 단계에 "다음" 표시가 붙는다. 칸이 화면보다 넓으면 가로로 스크롤되고, 가려진 쪽 가장자리가
 * 흐려지며 위쪽 "n / 전체" 가 지금 위치를 알린다.
 */

export type StageStatus = 'done' | 'active' | 'upcoming';

export interface TournamentStage {
  key: string;
  label: string;
  /** 이 단계를 함께 치르는 토너먼트 이름들. 둘 이상일 때만 채운다. */
  parallelTracks?: string[];
  status: StageStatus;
}

interface TournamentProgressStepperProps {
  stages: TournamentStage[];
}

/**
 * 지금 봐야 할 단계 — 진행 중인 단계, 없으면(단계 사이 구간) 첫 미완료 단계, 모두 끝났으면 마지막 단계.
 * 단계가 하나도 없으면 -1(findIndex 와 같은 약속).
 */
export function pickFocusStageIndex(stages: TournamentStage[]): number {
  if (stages.length === 0) return -1;
  const active = stages.findIndex((stage) => stage.status === 'active');
  if (active !== -1) return active;
  const firstOpen = stages.findIndex((stage) => stage.status !== 'done');
  return firstOpen !== -1 ? firstOpen : stages.length - 1;
}

/** 기준 단계를 스크롤 영역 가운데로 두는 scrollLeft. 양 끝에서는 영역 밖으로 밀지 않는다. */
export function stepperScrollLeft({
  viewport,
  content,
  itemStart,
  itemSize,
}: {
  viewport: number;
  content: number;
  itemStart: number;
  itemSize: number;
}): number {
  const centered = itemStart + itemSize / 2 - viewport / 2;
  return Math.min(Math.max(centered, 0), Math.max(content - viewport, 0));
}

/** 가려진 단계가 있는 쪽. 모두 보이면 'none'. */
export type StepperFade = 'none' | 'start' | 'end' | 'both';

// 소수점 스크롤 위치 오차가 끝 판정을 뒤집지 않게 한다.
const FADE_EPSILON = 1;

export function stepperFade({
  scrollLeft,
  scrollWidth,
  clientWidth,
}: {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}): StepperFade {
  const max = scrollWidth - clientWidth;
  if (max <= FADE_EPSILON) return 'none';
  const hiddenBefore = scrollLeft > FADE_EPSILON;
  const hiddenAfter = scrollLeft < max - FADE_EPSILON;
  if (hiddenBefore && hiddenAfter) return 'both';
  if (hiddenBefore) return 'start';
  return hiddenAfter ? 'end' : 'none';
}

// 토너먼트 이름 끝의 "토너먼트"·"결선" 은 안내 문장이 다시 붙이므로 뗀다("상위 토너먼트" → "상위").
const TRACK_NAME_SUFFIX = /\s?(토너먼트|결선)$/;

/** 같은 단계를 함께 치르는 토너먼트가 둘 이상일 때 스텝퍼 위에 띄우는 한 줄. */
export function parallelTracksNote(tracks: string[]): string {
  const stems = tracks.map((track) => track.replace(TRACK_NAME_SUFFIX, '') || track);
  return `${stems.join('·')} 토너먼트가 같은 단계로 진행돼요`;
}

export function TournamentProgressStepper({ stages }: TournamentProgressStepperProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLDivElement>(null);
  const positioned = useRef(false);
  const [fade, setFade] = useState<StepperFade>('none');
  const focusIndex = pickFocusStageIndex(stages);
  const focusKey = stages[focusIndex]?.key;
  const hasStages = stages.length > 0;

  // 좁은 화면에서는 스텝퍼가 자기 안에서 가로로 스크롤되고 항상 맨 앞에서 시작한다.
  // scrollIntoView 는 세로 페이지 스크롤까지 움직이므로 쓰지 않고 이 컨테이너의 scrollLeft 만 맞춘다.
  useLayoutEffect(() => {
    const list = listRef.current;
    const focus = focusRef.current;
    if (!list || !focus) return;

    const listRect = list.getBoundingClientRect();
    const focusRect = focus.getBoundingClientRect();
    const left = stepperScrollLeft({
      viewport: list.clientWidth,
      content: list.scrollWidth,
      itemStart: focusRect.left - listRect.left + list.scrollLeft,
      itemSize: focusRect.width,
    });
    // 처음 자리 잡을 때는 첫 페인트 전이라 움직임이 보이지 않는다 — 이후 단계가 바뀔 때만 부드럽게.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    list.scrollTo({ left, behavior: positioned.current && !reduced ? 'smooth' : 'auto' });
    positioned.current = true;
    setFade(stepperFade(list));
  }, [focusKey, stages.length]);

  // 사용자가 직접 밀거나 화면 폭이 바뀌면 가려진 쪽이 달라진다.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const sync = () => setFade(stepperFade(list));
    list.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      list.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [hasStages]);

  if (!hasStages) return null;

  const activeIndex = stages.findIndex((stage) => stage.status === 'active');
  // 진행 중인 단계가 없으면 기준 단계는 첫 미완료 단계다 — 단계 사이 구간에서 다음에 시작할 단계.
  const nextIndex = stages[focusIndex].status === 'upcoming' ? focusIndex : -1;
  const doneCount = stages.filter((stage) => stage.status === 'done').length;
  const progress = activeIndex !== -1 ? activeIndex + 1 : doneCount;
  const tracks = [...new Set(stages.flatMap((stage) => stage.parallelTracks ?? []))];

  return (
    <div className="tm-hub-stepper">
      <div className="tm-hub-stepper-head">
        {tracks.length > 1 ? <p className="tm-hub-stepper-note">{parallelTracksNote(tracks)}</p> : null}
        <p className="tm-hub-stepper-count">
          <span className="sr-only">{`전체 ${stages.length}단계 중 ${progress}단계 ${activeIndex !== -1 ? '진행 중' : '완료'}`}</span>
          <span aria-hidden="true">
            {progress}
            <span className="tm-hub-stepper-count-total"> / {stages.length}</span>
          </span>
        </p>
      </div>
      <div
        ref={listRef}
        className="tm-hub-stages"
        role="list"
        aria-label="대회 진행 단계"
        data-fade={fade}
        // 넘칠 때만 키보드로 닿게 한다 — 가려진 단계를 방향키로 볼 수 있어야 한다.
        tabIndex={fade === 'none' ? undefined : 0}
      >
        {stages.map((stage, idx) => (
          <StageWithConnector
            key={stage.key}
            stage={stage}
            isLast={idx === stages.length - 1}
            stepNumber={idx + 1}
            isNext={idx === nextIndex}
            stageRef={idx === focusIndex ? focusRef : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function StageWithConnector({
  stage,
  isLast,
  stepNumber,
  isNext,
  stageRef,
}: {
  stage: TournamentStage;
  isLast: boolean;
  stepNumber: number;
  isNext: boolean;
  stageRef?: Ref<HTMLDivElement>;
}) {
  const dotClass = [
    'tm-hub-stage-dot',
    stage.status === 'done' ? 'tm-hub-stage-dot-done' : '',
    stage.status === 'active' ? 'tm-hub-stage-dot-active' : '',
    isNext ? 'tm-hub-stage-dot-next' : '',
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

  const state = stage.status === 'done' ? '완료' : stage.status === 'active' ? '진행 중' : isNext ? '다음 단계' : '예정';
  const marker = stage.status === 'active' ? '진행 중' : isNext ? '다음' : null;

  return (
    <>
      <div
        ref={stageRef}
        className="tm-hub-stage"
        role="listitem"
        aria-current={stage.status === 'active' ? 'step' : undefined}
        aria-label={`${stage.label} (${state})`}
      >
        {/* upcoming 상태만 번호 표시 — done/active는 ::after 로 처리.
            [R-T2] 28px 원(테두리 2px 감안 실질 24px)에 숫자 한 자리라 12px 여유. */}
        <div className={dotClass} aria-hidden="true">
          {stage.status === 'upcoming' && (
            <span style={{ fontSize: 12, fontWeight: 700, color: isNext ? 'var(--blue700)' : 'var(--grey400)', lineHeight: 1 }}>{stepNumber}</span>
          )}
        </div>
        <span className={labelClass}>{stage.label}</span>
        {marker ? <span className="tm-hub-stage-sublabel tm-hub-stage-sublabel-active">{marker}</span> : null}
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
import { isLeagueCompetition } from '@/lib/competition-kind';
import { groupFixturesByRound } from './tournament-bracket';
import { compareTournamentRounds } from '@/lib/tournament-display-order';
import { tournamentRoundLabel } from '@/lib/tournament-round-label';
import { bracketTrackLabel, orderedBracketTracks } from '@/lib/bracket-track';

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

type StageDraft = { key: string; label: string; fixtures: V1TournamentFixture[]; parallelTracks?: string[] };

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
 * 결선 라운드들을 **진행 순서대로** 세운다.
 *
 * `fixtureNumber` 만으로는 못 정한다 — 대회마다 그 값이 **라운드별로 1부터 다시
 * 시작한다**(alpha 실측: 4강 1,2 · 결승 1 · 3·4위전 1, 전역 연번이 아니다). 그래서
 * 동률이 흔하고, 동률일 때 이전 코드는 입력 배열 순서에 기대는 안정 정렬로 떨어졌는데
 * `tournament.fixtures` 는 `round asc` 로 오는 조회라 문자열 알파벳 순('final' <
 * 'group' < 'semi')을 타 **결승이 4강보다 먼저 오는 배열**을 그대로 물려받았다
 * (alpha #ab100000... 실측). 결승은 항상 결선의 마지막이라는 사실(`isFinalRound`)을
 * 1차 기준으로 쓰고, 나머지는 참가 팀 수가 큰 라운드부터 세운다(12강 → 8강 → 4강).
 * fixtureNumber 는 알 수 없는 운영자 입력 라운드 또는 같은 규모의 라운드에만 쓴다.
 */
function knockoutStageDrafts(fixtures: V1TournamentFixture[], groups: V1TournamentDetail['groups'] = []): StageDraft[] {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const knockoutFixtures = fixtures.filter((fixture) => {
    const phase = fixture.groupId ? groupById.get(fixture.groupId)?.phase : undefined;
    return phase !== 'group' && phase !== 'league' && classifyRound(fixture.round) === 'knockout';
  });
  const rounds = groupFixturesByRound(knockoutFixtures, groups).filter((round) => classifyRound(round.key) === 'knockout');
  // 토너먼트 이름은 운영자가 만든 순서로 — 경기 번호나 응답 순서가 아니다.
  const orderedTracks = orderedBracketTracks(groups);
  const tracksOf = (roundFixtures: V1TournamentFixture[]) => {
    const present = new Set(roundFixtures.map((fixture) => (fixture.groupId ? groupById.get(fixture.groupId)?.bracketTrack : undefined)));
    return orderedTracks.filter((track) => present.has(track)).map((track) => bracketTrackLabel(track) ?? track);
  };
  // 토너먼트가 둘 이상이면 단계 이름이 "상위 토너먼트 · 12강 · 하위 토너먼트 · 12강" 처럼 이어붙어 칸이 한 화면보다
  // 넓어진다 — 칸에는 라운드 이름만 쓰고 토너먼트 이름은 따로 알린다. 토너먼트가 하나면 운영자가 정한 조 이름이 단계 이름이다.
  const parallel = new Set(rounds.flatMap((round) => tracksOf(round.fixtures))).size > 1;
  return rounds
    .map((round) => parallel
      ? { key: round.key, label: roundOnlyLabel(round), fixtures: round.fixtures, parallelTracks: tracksOf(round.fixtures) }
      : { key: round.key, label: round.label, fixtures: round.fixtures })
    .sort((a, b) => Number(isFinalRound(a.key)) - Number(isFinalRound(b.key))
      || compareTournamentRounds(a.key, b.key)
      || Math.min(...a.fixtures.map((fixture) => fixture.fixtureNumber)) - Math.min(...b.fixtures.map((fixture) => fixture.fixtureNumber)));
}

/**
 * 라운드 이름만 — 경기에 적힌 이름을 읽는다. 단계 코드(`key`)는 이름과 다를 수 있다: 부전승이 있는 첫 라운드는
 * 코드가 `round16` 이고 경기 이름은 `12강` 이다(alpha 실측). 경기가 아직 없는 단계만 코드를 이름으로 푼다.
 */
function roundOnlyLabel(round: { key: string; fixtures: V1TournamentFixture[] }): string {
  const names = [...new Set(round.fixtures.map((fixture) => tournamentRoundLabel(fixture.round)))].sort(compareTournamentRounds);
  return names.length > 0 ? names.join('·') : tournamentRoundLabel(round.key);
}

/**
 * 모든 형식의 마지막 칸. 결승·풀리그가 끝나도 대회가 끝나기 전에는 "다음" 단계이고,
 * 대회가 끝나면 지금 단계(결과·시상을 확인하는 단계)다.
 */
function awardsStage(tournament: V1TournamentDetail, allDone: boolean): TournamentStage {
  return { key: 'awards', label: tournament.kind === 'regular_league' ? '시즌 종료' : '시상', status: allDone ? 'active' : 'upcoming' };
}

/**
 * 대회 포맷과 경기 결과를 분석해 진행 단계 목록을 자동 생성.
 * - league: 리그전 → 시상
 * - knockout: 실제로 존재하는 결선 라운드들(8강 → 4강 → 결승) → 시상
 * - group_knockout: 조별리그 → 실제 결선 라운드들 → 시상
 */
export function buildTournamentStages(tournament: V1TournamentDetail): TournamentStage[] {
  const { format, fixtures, status } = tournament;
  // 정규 리그 거울 행은 format='group_knockout' 이라 format 만 보면 아래 리그 분기를
  // 못 타고 조별+결선 단계를 그린다.
  const isLeague = isLeagueCompetition(tournament);

  const allDone = status === 'completed';
  const inProgress = status === 'in_progress';

  if (isLeague) {
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
      // 진행 방식 배지("리그 방식")가 같은 헤더에 이미 있다 — 단계 이름까지 같으면 "리그 방식 리그 방식"으로 읽힌다.
      { key: 'league', label: '풀리그', status: leagueStatus },
      awardsStage(tournament, allDone),
    ];
  }

  if (tournament.sixTeamMode || tournament.sixTeamBracket) {
    const namedRounds = groupFixturesByRound(fixtures, tournament.groups ?? []);
    const stageName = (key: string, fallback: string) => namedRounds.find((round) => round.key === key || round.key === fallback)?.label ?? fallback;
    return [
      ...makeMonotonic([
        { key: 'six', label: stageName('quarter', '6강'), fixtures: fixtures.filter(row => row.round === '6강') },
        { key: 'semi', label: stageName('semi', '준결승'), fixtures: fixtures.filter(row => row.round === '준결승') },
        { key: 'final', label: stageName('final', '결승'), fixtures: fixtures.filter(row => row.round === '결승') },
      ].map(stage => ({ key: stage.key, label: stage.label, status: rawStageStatus(stage.fixtures) })), allDone),
      awardsStage(tournament, allDone),
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
  drafts.push(...knockoutStageDrafts(fixtures, tournament.groups));

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

  return [
    ...makeMonotonic(
      drafts.map((draft) => ({
        key: draft.key,
        label: draft.label,
        ...(draft.parallelTracks ? { parallelTracks: draft.parallelTracks } : {}),
        status: rawStageStatus(draft.fixtures),
      })),
      allDone,
    ),
    awardsStage(tournament, allDone),
  ];
}
