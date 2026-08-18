/**
 * 운영 콘솔의 모든 확인 모달 문구를 한 곳에 모은다.
 *
 * 배경(사용자 결정): 이 화면은 원래 `end`(경기 종료) 하나에만 확인 게이트를
 * 걸었다 — "나머지 명령은 되돌릴 수 있으니 확인을 생략한다"는 전제였다.
 * **그 전제는 사실이 아니었다**: 피리어드 종료(`end-period`)를 되돌리는
 * `revert-period`는 "다음 피리어드를 SCHEDULED로 되감는" 명령이라 (a) 다음
 * 피리어드에 이벤트가 하나라도 기록되면 거부되고(PERIOD_REVERT_HAS_EVENTS),
 * (b) 마지막 피리어드 종료(= 후반 종료)는 되감을 다음 피리어드 자체가 없어
 * 아예 되돌릴 수 없다(PERIOD_REVERT_NOT_AVAILABLE). 사용자에게 트레이드오프
 * (경기 중 빠르게 눌러야 하는데 모달이 기록을 늦춘다)를 안내했지만, 사용자는
 * "모달이 떠야하긴해 실수를 막는게 더 중요한거지"라며 예외 없이 전부에 확인을
 * 걸기로 했다 — "빠른 기록 모드" 같은 우회로도 만들지 않기로 했다. 단
 * `revert-period`(되돌리기)만은 그 자체가 이미 교정 행동이라 제외한다
 * (사용자가 고른 목록에도 없다).
 *
 * 문구 원칙: "정말?" 같은 무의미한 문구를 쓰지 않는다 — 무엇이(팀·선수·
 * 시각) 기록되는지 보여야 실수를 실제로 잡는다. 되돌릴 수 없는 액션
 * (`end`, 레드카드, 승부차기 종료)은 `tone: 'danger'`로 나머지와 톤을
 * 구분한다.
 *
 * 시계 경고 병합: alpha "452′" 사고 대응으로 있던 `confirmIfClockSuspicious`
 * 는 시계가 수상할 때만 별도 확인을 띄웠다. 이제 모든 액션이 확인을 거치므로
 * 그 경고를 별도 모달로 다시 띄우면 확인이 두 번 뜬다(나쁜 UX) — 대신 같은
 * 모달 안에 시계 경고 문구를 병합하고, confirmLabel/타이틀을 시계 경고
 * 전용으로 바꿔치기한다(호출부는 `clockWarningPeriodMinutes`로 이 병합
 * 여부를 결정한다).
 */

import type { ConfirmTone } from '@/components/v1-ui/confirm-modal';
import { formatMatchClock } from '@/lib/game-operations-clock';
import type { GameCommandName, GameLineup, GameSide } from '@/types/game-operations';
import type { EventCaptureCommitInput } from './action-target-picker';
import { periodLabel } from './period-label';

export interface ConfirmCopy {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly tone: ConfirmTone;
}

export function sideLabel(sideId: string | null | undefined, sides: readonly GameSide[]): string {
  if (sideId === null || sideId === undefined) return '팀';
  return sides.find((side) => side.id === sideId)?.displayNameSnapshot ?? '팀';
}

/** `assistTarget`/커밋 확인 문구 양쪽이 공유하는 선수 이름 조회 —
 * 원래 operate-console.tsx 하단의 모듈 스코프 함수였다(그대로 옮김). */
export function playerLabel(
  participantId: string | null | undefined,
  lineups: readonly GameLineup[],
): string {
  if (participantId === null || participantId === undefined) return '선수';
  for (const lineup of lineups) {
    const participant = lineup.participants.find((row) => row.id === participantId);
    if (participant) return participant.displayNameSnapshot;
  }
  return '선수';
}

function eventActionNoun(input: Pick<EventCaptureCommitInput, 'type' | 'payload'>): {
  readonly noun: string;
  readonly tone: ConfirmTone;
} {
  switch (input.type) {
    case 'GOAL':
      return { noun: '골', tone: 'default' };
    case 'CARD':
      // 요구사항 3 — 레드카드는 파급이 커서(퇴장) danger, 옐로카드는 기본 톤.
      return input.payload.card === 'RED' ? { noun: '레드카드', tone: 'danger' } : { noun: '옐로카드', tone: 'default' };
    case 'FOUL':
      return { noun: '파울', tone: 'default' };
    case 'SUBSTITUTION':
      return { noun: '교체', tone: 'default' };
    default:
      return { noun: '기록', tone: 'default' };
  }
}

function eventTargetDescription(
  input: EventCaptureCommitInput,
  sides: readonly GameSide[],
  lineups: readonly GameLineup[],
): string {
  const side = sideLabel(input.sideId, sides);
  if (input.type === 'SUBSTITUTION') {
    const outId = typeof input.payload.outParticipantId === 'string' ? input.payload.outParticipantId : null;
    return `${side} · ${playerLabel(outId, lineups)} → ${playerLabel(input.participantId, lineups)}`;
  }
  if (input.participantId === undefined) {
    return `${side} (선수 지정 없이)`;
  }
  return `${side} · ${playerLabel(input.participantId, lineups)}`;
}

/**
 * 골/카드/파울/교체(빠른 교체 포함) 커밋 확인 문구. `clockWarningPeriodMinutes`
 * 가 `null`이 아니면 alpha "452′" 시계 경고를 같은 모달에 병합한다 — 절대
 * 별도 모달을 띄우지 않는다(위 파일 doc 참고).
 */
export function commitActionConfirmCopy(
  input: EventCaptureCommitInput,
  sides: readonly GameSide[],
  lineups: readonly GameLineup[],
  clockWarningPeriodMinutes: number | null,
): ConfirmCopy {
  const { noun, tone } = eventActionNoun(input);
  const target = eventTargetDescription(input, sides, lineups);
  const when = `${periodLabel(input.period)} ${formatMatchClock(input.clockMs)}`;
  if (clockWarningPeriodMinutes !== null) {
    return {
      title: '기록 시각을 확인해주세요',
      message: `${target} · ${when}에 ${noun}을(를) 기록해요. 이 피리어드는 보통 ${clockWarningPeriodMinutes}분이에요 — 경기 종료를 누르지 않은 채 시간이 흘렀을 수 있어요. 그대로 기록할까요?`,
      confirmLabel: '그대로 기록',
      tone: 'danger',
    };
  }
  return {
    title: `${noun}을(를) 기록할까요?`,
    message: `${target} · ${when}에 기록해요.`,
    confirmLabel: `${noun} 기록`,
    tone,
  };
}

/**
 * start/pause/resume/end-period/start-period/end 확인 문구.
 * `revert-period`는 이 함수의 도메인이 아니다(사용자 결정으로 확인 자체가
 * 없다 — 호출부가 `revert-period`는 애초에 이 함수를 거치지 않는다).
 * `label`은 호출부가 이미 계산해 둔 `commandLabel(...)` 결과를 그대로
 * 받는다 — operate-console.tsx의 그 함수를 여기서 다시 import하면 두
 * 파일이 서로를 참조하는 순환 import가 생기기 때문에, 계산된 문자열만
 * 건네받는 형태로 경계를 나눴다.
 */
export function commandConfirmCopy(
  command: Exclude<GameCommandName, 'revert-period'>,
  label: string,
  ctx: {
    readonly sides: readonly GameSide[];
    readonly scoreBySideId: ReadonlyMap<string, number>;
    /** `end-period`가 마지막 피리어드를 닫는가(= "후반 종료"). 같은 커맨드지만
     * 결과가 전혀 다르다 — 전반 종료는 하프타임으로 넘어가고 되돌릴 수 있는
     * 반면, 마지막 피리어드 종료는 정규 시간을 끝내고 되돌릴 수 없다. 다른
     * 커맨드에서는 무시된다. */
    readonly isFinalPeriod?: boolean;
  },
): ConfirmCopy {
  const teamNames = ctx.sides.map((side) => side.displayNameSnapshot).join(' vs ') || '경기';
  const scoreText =
    ctx.sides.length > 0
      ? ctx.sides.map((side) => `${side.displayNameSnapshot} ${ctx.scoreBySideId.get(side.id) ?? 0}`).join(' : ')
      : null;
  switch (command) {
    case 'start':
      return { title: '경기를 시작할까요?', message: `${teamNames} 경기를 지금 시작해요.`, confirmLabel: label, tone: 'default' };
    case 'pause':
      return { title: '일시 중지할까요?', message: '진행 중인 경기를 잠시 멈춰요.', confirmLabel: label, tone: 'default' };
    case 'resume':
      return { title: '경기를 재개할까요?', message: '일시 중지된 경기를 다시 진행해요.', confirmLabel: label, tone: 'default' };
    case 'end-period':
      // 마지막 피리어드 종료 = 정규 시간 종료. 되돌릴 수 없다는 사실을
      // 정확히 말해야 한다(서버에 이 전환을 되감는 경로가 없다 —
      // `revertPeriodTransition`은 되감을 "다음 피리어드"를 전제한다).
      // 다만 경기 자체가 끝나는 것은 아니라는 것도 함께 알려야 한다 —
      // 결과 확정(스코어 산출·결과 제출)은 그다음 "경기 종료"에서 일어난다.
      return ctx.isFinalPeriod === true
        ? {
            title: `${label}할까요?`,
            message: `${scoreText ?? '현재 스코어'}로 정규 시간을 마쳐요. 이 단계는 되돌릴 수 없어요 — 다만 경기 결과는 아직 확정되지 않아요(다음 단계에서 승부차기 입력 또는 경기 종료).`,
            confirmLabel: label,
            tone: 'danger',
          }
        : {
            title: `${label}할까요?`,
            message: `${scoreText ?? '현재 스코어'}로 종료하고 하프타임으로 넘어가요. 다음 피리어드에 기록이 생기기 전까지는 되돌릴 수 있어요.`,
            confirmLabel: label,
            tone: 'default',
          };
    case 'start-period':
      return {
        title: `${label}할까요?`,
        message: '하프타임을 마치고 다음 피리어드를 시작해요.',
        confirmLabel: label,
        tone: 'default',
      };
    case 'end':
      return {
        title: '경기를 종료할까요?',
        message: `${scoreText ?? '지금 스코어'}로 경기를 종료해요. 종료하면 되돌릴 수 없어요 — 기록한 골·카드·교체를 먼저 확인해주세요.`,
        confirmLabel: label,
        tone: 'danger',
      };
  }
}

/**
 * 승부차기 시작 확인 — 아직 아무것도 서버에 보내지 않는다(패널을 여는
 * 로컬 상태 전환일 뿐). 그래도 사용자 결정("예외 없이 전부")에 따라 확인을
 * 거친다.
 */
export function penaltyShootoutStartConfirmCopy(
  sides: readonly GameSide[],
  scoreBySideId: ReadonlyMap<string, number>,
): ConfirmCopy {
  const scoreText =
    sides.length > 0 ? sides.map((side) => `${side.displayNameSnapshot} ${scoreBySideId.get(side.id) ?? 0}`).join(' : ') : '동점';
  return {
    title: '승부차기를 시작할까요?',
    message: `정규 시간이 ${scoreText}로 끝났어요. 승부차기로 승자를 가려요.`,
    confirmLabel: '승부차기 시작',
    tone: 'default',
  };
}

/** 승부차기 종료 확인 — `end` 커맨드를 실제로 실행하는 마지막 단계라
 * `end`와 같은 danger 톤을 쓴다(되돌릴 수 없음은 동일하다).
 *
 * 선축도 함께 보여준다: 이 확인을 지나면 `firstKickSideKey`가 리비전 `score.penalties`에
 * **영구히** 박히는데, 선축 라디오는 첫 킥이 기록되는 순간 잠기므로 운영자가 잘못 고른
 * 선축을 알아챌 마지막 기회가 이 모달이다(저장된 뒤에는 정정 폼에 선축 입력란이 없어
 * 되살릴 수단이 없다). */
export function penaltyShootoutFinishConfirmCopy(
  homeSide: GameSide,
  awaySide: GameSide,
  homeScore: number,
  awayScore: number,
  firstKickSide: GameSide,
): ConfirmCopy {
  return {
    title: '승부차기를 종료할까요?',
    message: `${homeSide.displayNameSnapshot} ${homeScore} : ${awayScore} ${awaySide.displayNameSnapshot} 승부차기로 경기를 종료해요. 선축은 ${firstKickSide.displayNameSnapshot}이에요. 종료하면 되돌릴 수 없어요.`,
    confirmLabel: '승부차기 종료',
    tone: 'danger',
  };
}
