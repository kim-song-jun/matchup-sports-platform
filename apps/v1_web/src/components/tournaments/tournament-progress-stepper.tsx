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
        {/* upcoming 상태만 번호 표시 — done/active는 ::after 로 처리 */}
        <div className={dotClass} aria-hidden="true">
          {stage.status === 'upcoming' && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--grey400)', lineHeight: 1 }}>{stepNumber}</span>}
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

import type { V1TournamentDetail } from '@/types/api';

/**
 * 대회 포맷과 경기 결과를 분석해 진행 단계 목록을 자동 생성.
 * - league: 리그 라운드 → (필요 시 플레이오프) → 시상
 * - knockout: 16강/8강/4강 → 결승
 * - group_knockout: 조별리그 → 4강 → 결승
 */
export function buildTournamentStages(tournament: V1TournamentDetail): TournamentStage[] {
  const { format, fixtures, status } = tournament;

  const allDone = status === 'completed';
  const inProgress = status === 'in_progress';

  if (format === 'league') {
    const totalFixtures = fixtures.length;
    const completedFixtures = fixtures.filter((f) => f.status === 'completed').length;
    const pct = totalFixtures > 0 ? completedFixtures / totalFixtures : 0;

    const leagueStatus: StageStatus =
      allDone ? 'done' : pct > 0 ? 'active' : 'upcoming';
    const awardStatus: StageStatus =
      allDone ? 'active' : 'upcoming';

    return [
      { key: 'league', label: '리그전', status: leagueStatus },
      { key: 'awards', label: '시상', status: awardStatus },
    ];
  }

  if (format === 'knockout') {
    const rounds = Array.from(new Set(fixtures.map((f) => f.round)));
    const stages: TournamentStage[] = [];

    // 표준 라운드 순서: semi → final (추가 라운드는 별도 처리)
    const orderedRounds = rounds.filter((r) => r !== 'final' && r !== 'third_place');
    for (const round of orderedRounds) {
      const roundFixtures = fixtures.filter((f) => f.round === round);
      const allCompleted = roundFixtures.every((f) => f.status === 'completed');
      const anyInProgress = roundFixtures.some((f) => f.status === 'in_progress');
      const s: StageStatus = allCompleted ? 'done' : anyInProgress || inProgress ? 'active' : 'upcoming';
      stages.push({ key: round, label: round === 'semi' ? '4강' : round, status: s });
    }

    // 결승
    const finalFixtures = fixtures.filter((f) => f.round === 'final');
    if (finalFixtures.length > 0 || stages.length > 0) {
      const finalCompleted = finalFixtures.every((f) => f.status === 'completed') && finalFixtures.length > 0;
      const finalActive = finalFixtures.some((f) => f.status === 'in_progress') || (inProgress && stages.every((s) => s.status === 'done'));
      stages.push({
        key: 'final',
        label: '결승',
        status: allDone ? 'done' : finalCompleted ? 'done' : finalActive ? 'active' : 'upcoming',
      });
    }

    return stages;
  }

  // group_knockout — round 기준으로 필터 (groupId 기준이면 결선 그룹도 포함되어 오계산)
  const groupFixtures = fixtures.filter((f) => f.round === 'group');
  const semiFixtures = fixtures.filter((f) => f.round === 'semi');
  const finalFixtures2 = fixtures.filter((f) => f.round === 'final');
  const groupAllDone = groupFixtures.length > 0 && groupFixtures.every((f) => f.status === 'completed');
  const groupAny = groupFixtures.some((f) => f.status !== 'scheduled');
  const semiDone = semiFixtures.length > 0 && semiFixtures.every((f) => f.status === 'completed');
  const finalDone = finalFixtures2.length > 0 && finalFixtures2.every((f) => f.status === 'completed');

  return [
    {
      key: 'group',
      label: '조별리그',
      status: groupAllDone ? 'done' : groupAny ? 'active' : 'upcoming',
    },
    {
      key: 'semi',
      label: '4강',
      status: semiDone ? 'done' : groupAllDone ? 'active' : 'upcoming',
    },
    {
      key: 'final',
      label: '결승',
      status: allDone || finalDone ? 'done' : semiDone ? 'active' : 'upcoming',
    },
  ];
}
