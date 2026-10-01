/**
 * v1 도메인 상태(enum) → 한국어 라벨 단일 소스.
 *
 * 백엔드 status는 영문 코드(`requested`, `active`, `left` 등)로 내려온다. UI에서
 * `status === 'x' ? '...' : status` 식 삼항으로 직접 렌더하면 매핑 안 된 값이
 * **영문 그대로 노출**된다(WS11 Rank6). 모든 상태 표시는 이 모듈을 거쳐 매핑 안 된
 * 값도 안전한 한글 fallback으로 떨어지게 한다. 새 상태값 추가 시 여기만 갱신한다.
 */

import type { V1InquiryReportReason, V1TournamentRegistrationStatus } from '@/types/api';

/**
 * 팀 가입 신청 상태 — **관리자(검토자) 관점** 라벨.
 *
 * 백엔드 enum(`V1TeamJoinApplicationStatus`)은 requested / approved / rejected /
 * withdrawn / expired 다섯 가지다. active·left·removed는 멤버십(`V1TeamMembership`)
 * 상태값이지만 승인 처리 결과를 멤버십 기준으로 내려주는 응답이 있어 함께 매핑해 둔다.
 */
const TEAM_JOIN_APPLICATION_STATUS: Record<string, string> = {
  requested: '검토 중',
  approved: '승인됨',
  rejected: '거절됨',
  expired: '만료됨',
  active: '승인됨',
  left: '거절됨',
  withdrawn: '철회됨',
  cancelled: '취소됨',
  removed: '거절됨',
};

/**
 * 팀 역할 — 모든 화면이 이 세 낱말을 쓴다(H2). 둘을 함께 말할 땐 '팀장·매니저'라고 쓰고
 * 묶음 이름을 따로 두지 않는다. 'admin' 은 옛 멤버십 값으로 매니저와 같은 권한이다.
 * 역할이 아닌 값(비회원 등)은 null — 호출하는 화면이 자기 맥락의 말로 채운다.
 */
export function teamRoleLabel(role: string | null | undefined): '팀장' | '매니저' | '멤버' | null {
  if (role === 'owner') return '팀장';
  if (role === 'manager' || role === 'admin') return '매니저';
  if (role === 'member') return '멤버';
  return null;
}

export type TeamRecruitmentLabel = '가입 가능' | '가입 닫힘' | '정원 마감';

/**
 * 팀이 가입을 받는 상태 — 폼·배지·표·목록이 이 세 낱말만 쓴다(H2). 팀장이 닫은 것(가입 닫힘)과
 * 정원이 찬 것(정원 마감)은 다른 상태다. 정원은 memberGoalCount 가 있을 때만 찬다.
 */
export function teamRecruitmentLabel(team: { joinPolicy?: string | null; memberCount: number; memberGoalCount?: number | null }): TeamRecruitmentLabel {
  if (team.joinPolicy === 'closed') return '가입 닫힘';
  if (team.memberGoalCount != null && team.memberCount >= team.memberGoalCount) return '정원 마감';
  return '가입 가능';
}

export function teamJoinApplicationStatusLabel(status: string): string {
  return TEAM_JOIN_APPLICATION_STATUS[status] ?? '처리됨';
}

/**
 * 같은 상태의 **신청자 본인 관점** 라벨.
 *
 * 검토자에게 '검토 중'인 신청은 신청자에게는 '승인 대기'이고, 본인이 철회한 건은
 * '철회됨'보다 '취소함'이 행위 주체를 분명히 한다. 관점이 다르면 문구도 달라야
 * 화면에서 "누가 무엇을 한 상태인지"가 흐려지지 않는다.
 */
const MY_JOIN_APPLICATION_STATUS: Record<string, string> = {
  requested: '승인 대기',
  approved: '승인됨',
  rejected: '거절됨',
  withdrawn: '취소함',
  expired: '만료됨',
};

export function myJoinApplicationStatusLabel(status: string): string {
  return MY_JOIN_APPLICATION_STATUS[status] ?? '처리됨';
}

/** 보낸 초대가 끝난 이유(초대 탭 '지난 초대'). 초대에는 만료 상태가 없다. */
const SENT_INVITATION_STATUS: Record<string, string> = {
  pending: '초대 중',
  accepted: '수락',
  declined: '거절',
  cancelled: '취소',
};

export function sentInvitationStatusLabel(status: string): string {
  return SENT_INVITATION_STATUS[status] ?? '종료';
}

/** 여러 명 초대의 항목별 결과(POST /teams/:teamId/invitations/batch). */
const TEAM_INVITATION_BATCH_STATUS: Record<string, string> = {
  invited: '초대를 보냈어요',
  already_invited: '이미 초대했어요',
  already_member: '이미 멤버예요',
  not_found: '가입한 사람을 찾지 못했어요',
  ambiguous: '같은 닉네임이 여럿이에요 · 이메일로 적어 주세요',
  duplicate: '같은 사람이 겹쳐 한 번만 보냈어요',
};

export function teamInvitationBatchStatusLabel(status: string): string {
  return TEAM_INVITATION_BATCH_STATUS[status] ?? '초대하지 못했어요';
}

/** 팀 멤버십 상태. */
const TEAM_MEMBER_STATUS: Record<string, string> = {
  active: '활동 중',
  inactive: '비활성',
  left: '탈퇴',
  removed: '제외됨',
};

export function teamMemberStatusLabel(status: string): string {
  return TEAM_MEMBER_STATUS[status] ?? '—';
}

/**
 * 매치·팀매치 수정 잠금 사유 (lockedReason enum → 한국어). 두 도메인 공용 단일 소스.
 *
 * 백엔드 가능 값:
 *   - team-matches.service.ts: 'terminal_or_matched_status'
 *   - matches.service.ts:      'terminal_status'
 * 미매핑 값은 안전한 한글 폴백으로 대체한다.
 */
const LOCKED_REASON_LABEL: Record<string, string> = {
  expired: '경기 시간이 지난 팀매치는 수정할 수 없어요.',
  terminal_or_matched_status: '이미 매칭이 완료됐거나 종료된 팀매치는 수정할 수 없어요.',
  terminal_status: '완료·취소·종료된 매치는 수정할 수 없어요.',
};

export function lockedReasonLabel(reason: string): string {
  return LOCKED_REASON_LABEL[reason] ?? '지금은 수정할 수 없어요.';
}

/** 온보딩 단계 (V1OnboardingStep). */
const ONBOARDING_STEP_LABEL: Record<string, string> = {
  terms: '약관 동의',
  signup: '회원가입',
  sport: '종목 선택',
  level: '실력 입력',
  region: '지역 선택',
  confirm: '확인',
  done: '완료',
};

export function onboardingStepLabel(step: string): string {
  return ONBOARDING_STEP_LABEL[step] ?? '종목 선택';
}

/**
 * 문의 신고 사유(`V1InquiryReportReason`) — `category: 'report'` 문의에만 실린다.
 * 신고 작성 화면(community/team-contact-status-card.tsx)과 어드민 문의 목록/상세가 공유하는 단일 소스다.
 * 백엔드 순서(`admin.service.ts`의 `INQUIRY_REPORT_REASONS`)와 값을 그대로 맞춘다.
 */
export const INQUIRY_REPORT_REASON_OPTIONS: { value: V1InquiryReportReason; label: string }[] = [
  { value: 'spam', label: '스팸·광고' },
  { value: 'harassment', label: '괴롭힘·욕설' },
  { value: 'impersonation', label: '사칭·허위 팀' },
  { value: 'inappropriate', label: '부적절한 내용' },
  { value: 'other', label: '기타' },
];

const INQUIRY_REPORT_REASON_LABEL: Record<V1InquiryReportReason, string> = INQUIRY_REPORT_REASON_OPTIONS.reduce(
  (acc, option) => ({ ...acc, [option.value]: option.label }),
  {} as Record<V1InquiryReportReason, string>,
);

export function inquiryReportReasonLabel(reason: V1InquiryReportReason): string {
  return INQUIRY_REPORT_REASON_LABEL[reason];
}

/** 취소된 팀매치 — 상세 화면 히어로·하단 상태와 참석명단 배지가 함께 쓴다. */
export const TEAM_MATCH_CANCELLED_LABEL = '취소됨';

/**
 * 팀매치 신청 상태 — 호스트(검토자) 관점. '승인 완료'는 상세 히어로가 상대팀을 찾는 표식이라 바꾸지 않는다.
 * 승인하면 서버가 나머지 대기 신청을 같은 트랜잭션에서 rejected 로 바꾼다 — 그건 `autoClosed` 로 가른다.
 */
const TEAM_MATCH_APPLICATION_STATUS: Record<string, string> = {
  requested: '승인 대기',
  approved: '승인 완료',
  rejected: '거절',
  withdrawn: '신청 취소',
  expired: '마감 종료',
};

export function teamMatchApplicationStatusLabel(status: string, options?: { autoClosed?: boolean }): string {
  if (status === 'rejected' && options?.autoClosed) return '자동 종료';
  return TEAM_MATCH_APPLICATION_STATUS[status] ?? '처리됨';
}

/** 친선 팀매치 공동 기록 상태와 변경 이력. */
const phaseLabel: Record<string, string> = { scheduled: '경기 시작 전', live: '진행 중', official: '경기 종료 · 결과 확정', cancelled: '취소된 경기', legacy: '기존 경기 결과', managed: '운영자 기록 경기' };
const actionLabel: Record<string, string> = { add: '득점 등록', edit: '득점 수정', delete: '득점 삭제', undo: '변경 되돌리기', confirm: '경기 종료 확인', reopen: '종료 확인 취소', submatch_add: '서브매치 추가', submatch_edit: '서브매치 이름 수정', submatch_delete: '서브매치 삭제', participant_add: '늦게 온 선수 추가' };

export function sharedRecordPhaseLabel(phase: string): string { return phaseLabel[phase] ?? "경기 기록"; }
export function sharedRecordActionLabel(action: string): string { return actionLabel[action] ?? "기록 변경"; }

/**
 * 친선 경기 일정의 응답(RSVP) — 참석명단과 이름이 겹치지 않게 "올 수 있어요?"로 부른다(H5 결정 A).
 * 훈련·모임 일정의 "참석/미정/불참"은 그대로다. 일정 화면의 응답 버튼과 참석명단 후보 칩이 같이 쓴다.
 */
const FRIENDLY_RSVP_LABEL: Record<string, string> = {
  GOING: '올 수 있어요',
  MAYBE: '미정',
  NOT_GOING: '못 가요',
  WAITLISTED: '대기',
  NO_RESPONSE: '미응답',
};

export function friendlyRsvpLabel(status: string): string {
  return FRIENDLY_RSVP_LABEL[status] ?? status;
}

/** 개인 매치가 시작된 뒤의 표시 상태(displayState) 라벨. 시작 전·완료 상태는 null — 호출부의 기존 라벨을 쓴다. */
export function personalMatchLifecycleLabel(displayState: string | null | undefined, isHost: boolean): string | null {
  if (displayState === 'on_hold') return '보류';
  if (displayState === 'scheduled') return '진행 확정';
  if (displayState === 'in_progress') return '진행중';
  if (displayState === 'completion_pending') return isHost ? '종료 확인 필요' : '종료 확인 중';
  return null;
}

// ── Task 179 경기별 출전 명단 ────────────────────────────────────────────────
// 서버는 사유·역할을 문자열 컬럼으로 보낸다(DTO 가 enum 으로 검증) — 모르는 값은 null 로 돌려
// 호출부가 빈칸으로 두게 한다(영문 코드 노출 방지).

export const GAME_ROSTER_ADJUSTMENT_REASONS = ['INJURY', 'PERSONAL', 'LATE_OR_EARLY', 'OTHER'] as const;
export type GameRosterAdjustmentReason = (typeof GAME_ROSTER_ADJUSTMENT_REASONS)[number];

/** 결장 기간 사유 — 경기별 사유에서 지각·조퇴만 빠진다(서버 DTO 와 같은 집합). */
export const MEMBER_UNAVAILABILITY_REASONS = ['INJURY', 'PERSONAL', 'OTHER'] as const;
export type MemberUnavailabilityReason = (typeof MEMBER_UNAVAILABILITY_REASONS)[number];

const GAME_ROSTER_REASON: Record<GameRosterAdjustmentReason, string> = {
  INJURY: '부상',
  PERSONAL: '개인 사정',
  LATE_OR_EARLY: '지각·조퇴',
  OTHER: '기타',
};

export const GAME_ROSTER_REASON_OPTIONS = GAME_ROSTER_ADJUSTMENT_REASONS.map((value) => ({
  value,
  label: GAME_ROSTER_REASON[value],
}));

export const MEMBER_UNAVAILABILITY_REASON_OPTIONS = MEMBER_UNAVAILABILITY_REASONS.map((value) => ({
  value,
  label: GAME_ROSTER_REASON[value],
}));

export function gameRosterReasonLabel(reason: string | null | undefined): string | null {
  if (reason === null || reason === undefined) return null;
  return (GAME_ROSTER_REASON as Record<string, string>)[reason] ?? null;
}

/** 출전정지처럼 사람이 아니라 계산이 만든 상태의 주체 라벨. */
export const GAME_ROSTER_AUTO_ACTOR_LABEL = '자동';

/**
 * 조정·결장 기록의 주체. 서버가 사이드 팀 변경으로 자동으로 되돌린 기록(SYSTEM)은 `GAME_ROSTER_AUTO_ACTOR_LABEL`.
 * 역할을 모르면(옛 기록 null) 라벨 없이 이름만 보인다.
 */
export function gameRosterActorRoleLabel(role: string | null | undefined): string | null {
  if (role === 'TEAM_MANAGER') return '팀장';
  if (role === 'ADMIN' || role === 'STAFF') return '운영자';
  if (role === 'SYSTEM') return GAME_ROSTER_AUTO_ACTOR_LABEL;
  return null;
}

/** 경기 명단 화면 머리의 편집 가능 여부 — 시작 전인데 못 바꾸면 권한이 없는 것이다. */
export function gameRosterEditStateLabel(view: { editable: boolean; gameState: string }): string {
  if (view.editable) return '수정 가능';
  switch (view.gameState) {
    case 'SCHEDULED':
      return '보기 전용';
    case 'ENDED':
      return '경기 끝남';
    case 'CANCELLED':
      return '취소된 경기';
    default:
      return '경기 시작됨';
  }
}

/** 선수 한 명의 이 경기 상태. 출전정지는 이번 경기를 포함한 남은 경기 수를 붙인다. */
export function gameRosterStatusLabel(status: string, remainingMatches?: number | null): string {
  switch (status) {
    case 'PARTICIPATING':
      return '출전';
    case 'EXCLUDED':
      return '빠짐';
    case 'UNAVAILABLE':
      return '결장';
    case 'SUSPENDED':
      return remainingMatches !== null && remainingMatches !== undefined && remainingMatches > 0
        ? `출전정지 ${remainingMatches}경기`
        : '출전정지';
    case 'NOT_IN_ROSTER':
      return '명단 밖';
    default:
      return '확인 필요';
  }
}

// ── Task 180 G13 상태 모델 — 리그·경기·종류 ─────────────────────────────────────
// 문구만 여기 둔다. 칩 톤·아이콘·노출 조건은 `lib/competition-status.ts` 가 이 라벨로 만든다.

export type LeagueStateKey = 'draft' | 'active' | 'completed';

const LEAGUE_STATE_LABEL: Record<LeagueStateKey, string> = {
  draft: '준비 중',
  active: '진행 중',
  completed: '종료',
};

/** 리그(시즌) 자체의 상태. 경기 상태와 한 화면에 함께 나오면 `LEAGUE_SUBJECT_LABEL` 을 앞에 붙인다. */
export function leagueStateLabel(state: LeagueStateKey): string {
  return LEAGUE_STATE_LABEL[state];
}

/** 경기 하나의 단계. 공개 화면의 리그 대진·운영 콘솔·결과 검토가 같은 말을 쓴다. */
export type MatchPhase = 'scheduled' | 'awaiting_result' | 'live' | 'paused' | 'ended' | 'cancelled';

const MATCH_PHASE_LABEL: Record<MatchPhase, string> = {
  scheduled: '예정',
  awaiting_result: '결과 대기',
  live: '진행 중',
  paused: '일시 중지',
  ended: '종료',
  cancelled: '취소됨',
};

export function matchPhaseLabel(phase: MatchPhase): string {
  return MATCH_PHASE_LABEL[phase];
}

/** 경기 운영 상태(GameState)는 경기 단계의 부분집합이다 — 킥오프 전·후를 가르는 '결과 대기'는 운영 상태에 없다. */
export const GAME_STATE_MATCH_PHASE: Readonly<Record<string, MatchPhase>> = {
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  PAUSED: 'paused',
  ENDED: 'ended',
  CANCELLED: 'cancelled',
};

export function gameStateLabel(state: string): string {
  const phase = GAME_STATE_MATCH_PHASE[state];
  return phase === undefined ? '확인 필요' : MATCH_PHASE_LABEL[phase];
}

export type CompetitionKindKey = 'LEAGUE' | 'TOURNAMENT' | 'FRIENDLY';

const COMPETITION_KIND_LABEL: Record<CompetitionKindKey, string> = {
  LEAGUE: '리그',
  TOURNAMENT: '대회',
  FRIENDLY: '친선',
};

export function competitionKindLabel(kind: CompetitionKindKey): string {
  return COMPETITION_KIND_LABEL[kind];
}

/** 한 화면에 리그 상태와 경기 상태가 같이 보일 때 칩 앞에 붙이는 대상 이름("리그 · 진행 중", "경기 · 예정"). */
export const LEAGUE_SUBJECT_LABEL = COMPETITION_KIND_LABEL.LEAGUE;
export const MATCH_SUBJECT_LABEL = '경기';

/** 리그 순위표 자리의 시즌 단계. */
export type LeagueSeasonStage = 'preseason' | 'in_progress' | 'awaiting_result' | 'completed';

const LEAGUE_SEASON_STAGE_LABEL: Record<LeagueSeasonStage, string> = {
  preseason: '시즌 시작 전',
  in_progress: '시즌 진행 중',
  awaiting_result: MATCH_PHASE_LABEL.awaiting_result,
  completed: '시즌 종료',
};

export function leagueSeasonStageLabel(stage: LeagueSeasonStage): string {
  return LEAGUE_SEASON_STAGE_LABEL[stage];
}

/** 운영 콘솔 도착 확인(검인)을 한 경기에서, 아직 도착 확인이 안 된 선수. */
export const ARRIVAL_PENDING_LABEL = '도착 전';
export const ARRIVAL_CONFIRMED_LABEL = '도착 확인';

/** 성별 조건 정본 값(서버 GENDER_RULES 와 같다). 값이 곧 화면 라벨이다. */
export const GENDER_RULE_OPTIONS = ['성별 무관', '남', '여'] as const;

/** 정본이 아닌 값(옛 저장값·내부 코드)은 원문 대신 빈 문자열 — 호출부가 "미정"·배지 생략으로 처리한다. */
export function genderRuleLabel(value: string | null | undefined): string {
  return (GENDER_RULE_OPTIONS as readonly string[]).includes(value ?? '') ? (value as string) : '';
}

type RegistrationTone = 'grey' | 'blue' | 'orange' | 'green' | 'red';

const REGISTRATION_TONE: Record<RegistrationTone, { badgeClass: string; textColor: string }> = {
  grey: { badgeClass: 'tm-badge-grey', textColor: 'var(--text-muted)' },
  blue: { badgeClass: 'tm-badge-blue', textColor: 'var(--blue700)' },
  orange: { badgeClass: 'tm-badge-orange', textColor: 'var(--orange700)' },
  green: { badgeClass: 'tm-badge-green', textColor: 'var(--green700)' },
  red: { badgeClass: 'tm-badge-red', textColor: 'var(--red700)' },
};

const REGISTRATION_STATUS: Record<V1TournamentRegistrationStatus, { tone: RegistrationTone; label: string }> = {
  draft: { tone: 'grey', label: '임시저장' },
  submitted: { tone: 'blue', label: '운영진 확인 중' },
  awaiting_payment: { tone: 'orange', label: '입금 대기' },
  payment_checking: { tone: 'blue', label: '명단 확인 중' },
  paid: { tone: 'blue', label: '결제 완료' },
  confirmed: { tone: 'green', label: '참가 확정' },
  waitlisted: { tone: 'orange', label: '대기 중' },
  cancel_requested: { tone: 'red', label: '취소 요청 중' },
  cancelled: { tone: 'grey', label: '취소' },
};

/**
 * 대회·리그 참가 신청 상태 — 내 신청 화면·대회/리그 상세 "우리 팀 참가" 카드·팀 상세 "참가 중인 대회·리그"가
 * 같은 색·말을 쓴다. 배지는 `badgeClass`, 줄 안의 글자는 `textColor`. 모르는 값은 영문 코드 대신 한글로.
 */
export function tournamentRegistrationStatusConfig(status: V1TournamentRegistrationStatus): {
  badgeClass: string;
  textColor: string;
  label: string;
} {
  const entry: { tone: RegistrationTone; label: string } = REGISTRATION_STATUS[status] ?? { tone: 'grey', label: '상태 확인 중' };
  return { ...REGISTRATION_TONE[entry.tone], label: entry.label };
}
