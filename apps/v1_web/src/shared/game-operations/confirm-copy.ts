/**
 * 운영 콘솔의 확인 창·기록 토스트 문구를 한 곳에 모은다.
 *
 * 기록(골·카드·파울·교체)은 확인 없이 저장하고 5초 되돌리기로 복구한다. 진행 명령·승부차기 시작·종료는
 * 확인을 거친다. 기록에 확인을 남기는 예외는 셋뿐이다 — 수상한 시계, 퇴장한 선수, 두 번째 옐로 뒤의 레드.
 *
 * 문구 원칙: 무엇이(팀·선수·시각) 기록되는지 보여야 실수를 잡는다. 되돌릴 수 없는 동작은 `tone: 'danger'`.
 */

import type { ConfirmTone } from '@/components/v1-ui/confirm-modal';
import { formatMatchClock } from '@/lib/game-operations-clock';
import { josa } from '@/lib/korean';
import type { GameCommandName, GameLineup, GameSide } from '@/types/game-operations';
import type { EventCaptureCommitInput } from './action-target-picker';
import { periodPrefix } from './period-label';
import { participantIdentityName } from './participant-identity';

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
    if (participant) return participantIdentityName(participant);
  }
  return '선수';
}

/** 시간 정정 시트 요약 한 줄 — 운영 콘솔·어드민 결과 정정이 같이 쓴다. "선수 · 팀", 비면 `fallback`. */
export function eventTimeSummary(
  event: { readonly participantId: string | null; readonly sideId: string | null },
  sides: readonly Pick<GameSide, 'id' | 'displayNameSnapshot'>[],
  lineups: readonly GameLineup[],
  fallback: string,
): string {
  return (
    [
      event.participantId !== null ? playerLabel(event.participantId, lineups) : null,
      sides.find((side) => side.id === event.sideId)?.displayNameSnapshot ?? null,
    ]
      .filter((part): part is string => part !== null && part.length > 0)
      .join(' · ') || fallback
  );
}

function eventActionNoun(input: Pick<EventCaptureCommitInput, 'type' | 'payload'>): string {
  switch (input.type) {
    case 'GOAL':
      return '골';
    case 'OWN_GOAL':
      return '자책골';
    case 'CARD':
      return input.payload.card === 'RED' ? '레드카드' : '옐로카드';
    case 'FOUL':
      return '파울';
    case 'SUBSTITUTION':
      return '교체';
    default:
      return '기록';
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
  if (input.type === 'OWN_GOAL') {
    // sideId는 점수를 받는 상대 팀이다(action-target-picker가 귀속을 뒤집는다) —
    // 자책골을 넣은 선수는 반대편 팀 소속이라 그 팀명을 앞에 붙인다.
    const ownSide = sideLabel(sides.find((candidate) => candidate.id !== input.sideId)?.id, sides);
    return input.participantId === undefined
      ? `${ownSide} (선수 모름, ${side} 득점)`
      : `${ownSide} · ${playerLabel(input.participantId, lineups)} (${side} 득점)`;
  }
  if (input.participantId === undefined) {
    return `${side} (선수 모름)`;
  }
  return `${side} · ${playerLabel(input.participantId, lineups)}`;
}

/**
 * 기록 시각이 이 경기 시간의 보통 길이를 크게 넘을 때만 띄우는 확인. 취소하면 기록하지 않는다.
 */
export function clockCheckConfirmCopy(
  input: EventCaptureCommitInput,
  sides: readonly GameSide[],
  lineups: readonly GameLineup[],
  clockWarningPeriodMinutes: number,
  periodCount?: number | null,
): ConfirmCopy {
  const noun = eventActionNoun(input);
  const target = eventTargetDescription(input, sides, lineups);
  const when = `${periodPrefix(input.period, periodCount)}${formatMatchClock(input.clockMs)}`;
  return {
    title: '기록 시각을 확인해주세요',
    message: `${target} · ${when}에 ${josa(noun, ['을', '를'])} 기록해요. 이 경기 시간은 보통 ${clockWarningPeriodMinutes}분이에요 — 경기 종료를 누르지 않은 채 시간이 흘렀을 수 있어요. 그대로 기록할까요?`,
    confirmLabel: '그대로 기록',
    tone: 'danger',
  };
}

/**
 * 기록 직후 토스트. 끊긴 동안에는 서버에 아직 없으므로 `offlineMessage` 를 쓴다.
 * `noun` 은 한 번에 묶어 알릴 때의 이름(경고 누적 퇴장)이다.
 */
export function recordedToastCopy(
  input: EventCaptureCommitInput,
  sides: readonly GameSide[],
  lineups: readonly GameLineup[],
  noun: string = eventActionNoun(input),
): { readonly message: string; readonly offlineMessage: string } {
  const what = `${noun} · ${eventTargetDescription(input, sides, lineups)}`;
  return { message: `${what} 기록했어요`, offlineMessage: `${what} 이 기기에 기록해 뒀어요` };
}

/** 선수를 골랐을 때 "그래도 ○○을 기록할까요?"에 들어가는 기록 이름(골·자책골·파울·옐로카드·레드카드). */
export function recordNounOf(input: Pick<EventCaptureCommitInput, 'type' | 'payload'>): string {
  return eventActionNoun(input);
}

export interface SentOffPlayerNoticeCopy {
  readonly title: string;
  readonly message: string;
  readonly backLabel: string;
  readonly continueLabel: string;
}

/**
 * 이미 퇴장(레드카드)한 선수를 골랐을 때 선택 화면 안에서 한 번 더 묻는 문구.
 *
 * 습관적으로 넘기지 않게 제목이 "퇴장한 선수"라는 사실을 먼저 말하고 왜 그런지(몇 분에 레드카드)를
 * 보여 준다. 되돌아갈 길("다른 선수 고르기")이 첫째 버튼이다.
 * `verb`는 새 이벤트 기록은 `기록`, 이미 기록된 골에 붙이는 어시스트는 `추가`.
 */
export function sentOffPlayerNoticeCopy(input: {
  readonly playerName: string;
  /** 레드카드를 받은 시각("후반 8:12"). 모르면 null. */
  readonly sentOffWhen: string | null;
  /** 기록 이름("골"·"레드카드"·"어시스트" …). */
  readonly noun: string;
  readonly verb?: '기록' | '추가';
}): SentOffPlayerNoticeCopy {
  const when = input.sentOffWhen === null ? '' : `${input.sentOffWhen}에 `;
  return {
    title: `${josa(input.playerName, ['은', '는'])} 퇴장한 선수예요`,
    message: `${when}레드카드를 받고 퇴장했어요. 그래도 ${josa(input.noun, ['을', '를'])} ${input.verb ?? '기록'}할까요?`,
    backLabel: '다른 선수 고르기',
    continueLabel: '그래도 계속',
  };
}

/** 같은 경기에서 같은 선수에게 두 번째 옐로를 기록한 직후, 레드(경고 누적 퇴장)도 남길지 묻는 시트. */
export function secondYellowConfirmCopy(
  input: EventCaptureCommitInput,
  sides: readonly GameSide[],
  lineups: readonly GameLineup[],
  periodCount?: number | null,
): ConfirmCopy & { readonly cancelLabel: string } {
  const when = `${periodPrefix(input.period, periodCount)}${formatMatchClock(input.clockMs)}`;
  return {
    title: `${josa(playerLabel(input.participantId, lineups), ['이', '가'])} 이 경기에서 옐로 2장이에요`,
    message: `${sideLabel(input.sideId, sides)} · ${when}. 경고 누적 퇴장으로 레드카드도 기록할까요?`,
    confirmLabel: '레드도 기록',
    cancelLabel: '옐로만 둘게요',
    tone: 'danger',
  };
}

/**
 * start/pause/resume/end-period/start-period/end 확인 문구.
 * `revert-period`는 그 자체가 되돌리기라 확인이 없어 이 함수를 거치지 않는다.
 * `label`은 호출부가 이미 계산해 둔 `commandLabel(...)` 결과를 그대로
 * 받는다 — operate-console.tsx의 그 함수를 여기서 다시 import하면 두
 * 파일이 서로를 참조하는 순환 import가 생기기 때문에, 계산된 문자열만
 * 건네받는 형태로 경계를 나눴다.
 */
export function commandConfirmCopy(
  command: Exclude<GameCommandName, 'revert-period' | 'revert-start'>,
  label: string,
  ctx: {
    readonly sides: readonly GameSide[];
    readonly scoreBySideId: ReadonlyMap<string, number>;
    /** `end-period`가 마지막 피리어드를 닫는가(= "후반 종료"). 같은 커맨드지만
     * 결과가 전혀 다르다 — 전반 종료는 하프타임으로 넘어가고 되돌릴 수 있는
     * 반면, 마지막 피리어드 종료는 정규 시간을 끝내고 되돌릴 수 없다. 다른
     * 커맨드에서는 무시된다. */
    readonly isFinalPeriod?: boolean;
    /** 정규 시간이 끝나도 지금 스코어로 승부차기가 열리는가(토너먼트 knockout 동점).
     * 리그·조별 경기는 동점이어도 승부차기가 없으니 문구에서 승부차기를 빼야 한다. */
    readonly penaltyShootoutPossible: boolean;
    /** 이 경기가 교체를 기록하는가. 롤링 교체 종목은 기록하지 않아 "교체 확인"이 헛말이다. */
    readonly substitutionTracked: boolean;
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
            message: `${josa(scoreText ?? '현재 스코어', ['으로', '로'])} 정규 시간을 마쳐요. 이 단계는 되돌릴 수 없어요 — 다만 경기 결과는 아직 확정되지 않아요(다음 단계에서 ${ctx.penaltyShootoutPossible ? '승부차기 입력 또는 ' : ''}경기 종료).`,
            confirmLabel: label,
            tone: 'danger',
          }
        : {
            title: `${label}할까요?`,
            message: `${josa(scoreText ?? '현재 스코어', ['으로', '로'])} 종료하고 하프타임으로 넘어가요. 다음 경기 시간에 기록이 생기기 전까지는 되돌릴 수 있어요.`,
            confirmLabel: label,
            tone: 'default',
          };
    case 'start-period':
      return {
        title: `${label}할까요?`,
        message: '하프타임을 마치고 다음 경기 시간을 시작해요.',
        confirmLabel: label,
        tone: 'default',
      };
    case 'end':
      return {
        title: '경기를 종료할까요?',
        message: `${josa(scoreText ?? '지금 스코어', ['으로', '로'])} 경기를 종료해요. 종료하면 되돌릴 수 없어요 — 기록한 ${ctx.substitutionTracked ? '골·카드·교체' : '골·카드'}를 먼저 확인해주세요.`,
        confirmLabel: label,
        tone: 'danger',
      };
  }
}

/**
 * 승부차기 시작 확인 — 아직 아무것도 서버에 보내지 않지만(패널을 여는 로컬 상태 전환)
 * 진행 단계를 바꾸는 동작이라 확인을 거친다.
 */
export function penaltyShootoutStartConfirmCopy(
  sides: readonly GameSide[],
  scoreBySideId: ReadonlyMap<string, number>,
): ConfirmCopy {
  const scoreText =
    sides.length > 0 ? sides.map((side) => `${side.displayNameSnapshot} ${scoreBySideId.get(side.id) ?? 0}`).join(' : ') : '동점';
  return {
    title: '승부차기를 시작할까요?',
    message: `정규 시간이 ${josa(scoreText, ['으로', '로'])} 끝났어요. 승부차기로 승자를 가려요.`,
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
    message: `${homeSide.displayNameSnapshot} ${homeScore} : ${awayScore} ${awaySide.displayNameSnapshot} 승부차기로 경기를 종료해요. 선축은 ${josa(firstKickSide.displayNameSnapshot, ['이에요', '예요'])}. 종료하면 되돌릴 수 없어요.`,
    confirmLabel: '승부차기 종료',
    tone: 'danger',
  };
}

/**
 * 규칙상 아직 결판이 안 났는데 운영자가 그대로 닫으려 할 때의 확인 문구
 * (`penaltyFinishAvailability`가 `OVERRIDABLE`인 경우).
 *
 * 일반 종료 문구와 갈라 두는 이유: 이 확인은 "예상대로 끝났는지 확인"이 아니라
 * **"자동 판정과 다른 결론을 내린다"**는 선언이다. 그래서 ① 제목이 아직 안 끝났음을
 * 먼저 말하고, ② 점수만이 아니라 **각 팀이 몇 번 찼는지**까지 보여준다 — 킥 수가
 * 어긋난 것이 바로 자동 판정이 멈춘 이유이고, 운영자가 오조작을 알아채는 지점도
 * 거기다(예: 되돌리기를 한 번 덜 눌러 원정 킥이 하나 모자란 상태).
 *
 * 점수 뒤 조사는 붙이지 않고 `승부차기`에 붙인다 — 문장이 점수로 끝나지 않게 짠 것이다.
 */
export function penaltyShootoutOverrideFinishConfirmCopy(
  homeSide: GameSide,
  awaySide: GameSide,
  homeScore: number,
  awayScore: number,
  homeKicks: number,
  awayKicks: number,
  firstKickSide: GameSide,
): ConfirmCopy {
  return {
    title: '아직 안 끝난 승부차기예요',
    message: `${homeSide.displayNameSnapshot} ${homeKicks}킥 ${homeScore}점 · ${awaySide.displayNameSnapshot} ${awayKicks}킥 ${awayScore}점 — 규칙상 아직 결판이 나지 않았어요. 이대로 ${homeScore} : ${awayScore} 승부차기로 종료할까요? 선축은 ${josa(firstKickSide.displayNameSnapshot, ['이에요', '예요'])}. 종료하면 되돌릴 수 없어요.`,
    confirmLabel: '그래도 종료',
    tone: 'danger',
  };
}
