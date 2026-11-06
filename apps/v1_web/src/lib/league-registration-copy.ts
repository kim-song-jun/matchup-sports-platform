import { formatTournamentDateTimeShort } from './date-utils';

/**
 * 리그 참가 신청 창을 사람이 읽는 한 문장으로 만든다. 어드민의 두 화면(대진 화면의 요약 카드 ·
 * 신청 관리 화면)에 같은 모양으로 나오므로 판정을 여기 한 곳에 둔다 — 각자 갖고 있으면 한쪽만 고쳐진다.
 *
 * 신청은 대회처럼 접수 중(`open`)이고 마감 전일 때만 받는다(2026-10-27). 닫혀 있으면 저장 상태가
 * 닫힌 이유를 가르고, 이유마다 운영자가 할 일이 다르다:
 *
 * | 저장 상태 | 화면이 말해야 하는 것 | 운영자의 다음 행동 |
 * |---|---|---|
 * | 초안 | 아직 접수를 시작하지 않았다 | '접수 시작하기' |
 * | 접수 중인데 닫힘 | 마감 시각이 지났다 | 마감을 미래로 바꿔 다시 연다 |
 * | 마감 | 운영자가 접수를 마감했다 | 시작 전이면 '접수 시작하기'로 다시 연다 |
 * | 시즌 진행 중 | 시작한 리그다 | 팀을 직접 넣는다 — 신청은 다시 열 수 없다 |
 * | 보류 · 종료 | 받지 않는다 | — |
 */
export function describeLeagueRegistrationWindow(input: {
  /** 리그 저장 상태(`lifecycleStatus`). */
  status: string | undefined;
  /** 지금 신청을 받는가 — **서버 판정값**을 그대로 받는다(화면이 다시 계산하지 않는다). */
  registrationOpen: boolean;
  registrationDeadlineAt: string | null;
}): string {
  const { status, registrationOpen, registrationDeadlineAt } = input;
  const deadlineText = registrationDeadlineAt
    ? formatTournamentDateTimeShort(registrationDeadlineAt) ?? registrationDeadlineAt
    : null;
  if (registrationOpen) {
    return deadlineText === null
      ? "마감 없이 신청을 받아요. '접수 마감하기'를 누르면 닫혀요."
      : `${deadlineText}까지 신청을 받아요.`;
  }
  switch (status) {
    case 'draft':
      return "아직 접수를 시작하지 않았어요. 리그 위의 '접수 시작하기'를 누르면 신청을 받아요.";
    case 'open':
      return `신청이 마감됐어요. 마감은 ${deadlineText ?? '-'} 였어요.`;
    case 'closed':
      return "접수를 마감했어요. 리그를 시작하기 전에는 '접수 시작하기'로 다시 열 수 있어요.";
    case 'in_progress':
      return '시작한 리그라 신청을 받지 않아요. 팀은 참가팀 관리에서 직접 넣어 주세요.';
    case 'on_hold':
      return '보류 중이라 신청을 받지 않아요.';
    default:
      return '끝났거나 취소된 리그라 신청을 받지 않아요.';
  }
}
