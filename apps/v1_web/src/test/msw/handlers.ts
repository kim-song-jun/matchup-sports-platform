import { http, HttpResponse } from 'msw';
import isISO8601 from 'validator/lib/isISO8601';
import isEmail from 'validator/lib/isEmail';
import { toKstDateString } from '@/lib/kst-calendar';
import { randomUuid } from '@/lib/uuid';
import type { V1TournamentField, V1PlaceView } from '@/types/api';
import type { SharedRecord } from '@/hooks/use-team-match-record';
import type { GameLineup } from '@/types/game-operations';
import {
  getSignupProfileIssue,
  SIGNUP_PROFILE_ERROR_MESSAGES,
} from '@/components/auth/signup-profile-validation';
import type {
  SignupProfileDraft,
  SignupProfileField,
} from '@/components/auth/signup-profile-validation';
import type {
  V1AdminNoticeCreatePayload,
  V1AdminNoticeRow,
  V1AdminNoticeUpdatePayload,
  V1AdminPopupCreatePayload,
  V1AdminPopupRow,
  V1AdminPopupUpdatePayload,
  V1CancelScheduleDto,
  V1CreateGameResultRevisionPayload,
  V1CreateGuestApplicationDto,
  V1CreateGuestRecruitmentDto,
  V1CreateScheduleDto,
  V1DecideGameResultRevisionPayload,
  V1GameResultRevision,
  V1GameState,
  V1GrantTournamentStaffPayload,
  V1Inquiry,
  V1SetScheduleAttendanceDto,
  V1MyTeamMatch,
  V1TeamMatchLineup,
  V1TeamMatchLineupSavePayload,
  V1TeamScheduleDetail,
  V1TournamentOperationsBoardItem,
  V1TournamentStaffAssignment,
  V1TriggerScheduleReminderDto,
  V1UpdateGuestRecruitmentDto,
  V1UpdateScheduleDto,
} from '@/types/api';
import {
  v1AdminLogsFixture,
  v1AdminNoticesFixture,
  v1AdminPopupsFixture,
  v1AdminOverviewFixture,
  v1ChatMessagesByRoomFixture,
  v1ChatMessagesFixture,
  v1ChatRoomsFixture,
  v1HomeFixture,
  v1InquiriesFixture,
  v1MatchesFixture,
  v1PlaceSearchFixture,
  v1NoticesFixture,
  v1NotificationsFixture,
  v1ProfileFixture,
  v1RecentSearchesFixture,
  v1RegionsFixture,
  v1ReviewMatchSourceFixture,
  v1ReviewsPendingFixture,
  v1ReviewsReceivedFixture,
  v1ReviewsWrittenFixture,
  v1ReviewSubmitFixture,
  v1ReportedTeamsFixture,
  v1ReportedTeamsWindowDays,
  v1ReviewTeamMatchSourceFixture,
  v1SettingsFixture,
  v1SportsFixture,
  v1TeamMatchesFixture,
  v1TeamCompetitionEntriesFixture,
  v1TeamsFixture,
  v1UserFixture,
  getReportedTeamIdForInquiry,
  toAdminInquiryDetail,
  toAdminInquiryRow,
} from './fixtures';
import { v1GameRosterMswHandlers } from './game-roster-handlers';
import { v1TeamDissolutionMswHandlers } from './team-dissolution-handlers';
import { v1TeamInviteLinkMswHandlers } from './team-invite-link-handlers';
import { v1LeagueVisibilityMswHandlers } from './league-visibility-handlers';
import { createV1TeamMatchRulesMswHandlers } from './team-match-rules-handlers';

export const v1TeamMatchRulesMsw = createV1TeamMatchRulesMswHandlers(v1TeamMatchesFixture);

const api = '*/api/v1';

// `/admin/inquiries/:inquiryId/block-reported-team` 멱등 상태 — 같은 문의를 두 번 차단해도
// 두 번째부터는 alreadyBlocked: true 로 200 이 온다(에러 아님, admin.service.ts 실측).
const blockedInquiryIds = new Set<string>();

type RegisterField = SignupProfileField | 'nickname' | 'email' | 'password' | 'requiredTermsAccepted';

const REGISTER_ERROR_MESSAGES: Readonly<Record<RegisterField, string>> = {
  ...SIGNUP_PROFILE_ERROR_MESSAGES,
  nickname: '닉네임은 2자 이상 입력해 주세요.',
  email: '이메일을 입력해 주세요.',
  password: '비밀번호는 8자 이상 입력해 주세요.',
  requiredTermsAccepted: '필수 약관에 동의해 주세요.',
};

function ok<T>(data: T) {
  return HttpResponse.json({
    status: 'success',
    data,
    timestamp: '2026-05-18T00:00:00.000Z',
  });
}

const authAccountPhoneFixture = '01012345678';
type PhoneProofPurpose = 'signup' | 'password_reset' | 'social_link';
type PhoneProof = {
  readonly phone: string;
  readonly channel: 'phone';
  readonly purpose: PhoneProofPurpose;
  readonly expiresAt: number;
};

type RecoveryEmailChallenge = {
  readonly expiresAt: number;
  readonly attemptCount: number;
};
type PhoneProofChallenge = RecoveryEmailChallenge & { readonly verified: boolean };
type RecoveryEmailProof = {
  readonly email: string;
  readonly channel: 'email';
  readonly purpose: 'password_reset';
  readonly expiresAt: number;
};

// These maps model the verification adapter's mutable challenge/proof state, not account data.
const recoveryEmailChallenges = new Map<string, RecoveryEmailChallenge>();
const recoveryEmailProofs = new Map<string, RecoveryEmailProof>();
const authPhoneChallenges = new Map<string, PhoneProofChallenge>();
const authPhoneProofs = new Map<string, PhoneProof>();

function authProofError(code: string, message: string, statusCode = 400) {
  return HttpResponse.json({
    status: 'error', statusCode, code, message, timestamp: new Date().toISOString(),
  }, { status: statusCode });
}

function parseAuthProofInput(value: unknown, allowedFields: readonly string[]): Readonly<Record<string, string>> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const fields: Record<string, string> = {};
  for (const [key, field] of Object.entries(value)) {
    if (!allowedFields.includes(key) || typeof field !== 'string') return null;
    fields[key] = field;
  }
  return fields;
}

function recoveryEmail(body: Readonly<Record<string, string>> | null): string | null {
  const email = body?.email;
  return email && email.length <= 254 && isEmail(email) ? email.trim().toLowerCase() : null;
}

function sweepRecoveryEmailState() {
  const now = Date.now();
  for (const [email, challenge] of recoveryEmailChallenges) {
    if (challenge.expiresAt < now) recoveryEmailChallenges.delete(email);
  }
  for (const [token, proof] of recoveryEmailProofs) {
    if (proof.expiresAt < now) recoveryEmailProofs.delete(token);
  }
}

function sweepAuthPhoneState() {
  const now = Date.now();
  for (const [phone, challenge] of authPhoneChallenges) {
    // The backend retains verified challenge metadata while the separately issued proof is valid.
    const retainUntil = challenge.expiresAt + (challenge.verified ? 10 * 60 * 1000 : 0);
    if (retainUntil < now) authPhoneChallenges.delete(phone);
  }
  for (const [token, proof] of authPhoneProofs) {
    if (proof.expiresAt < now) authPhoneProofs.delete(token);
  }
}

function isPhoneProofPurpose(value: string): value is PhoneProofPurpose {
  return value === 'signup' || value === 'password_reset' || value === 'social_link';
}

function hasPhoneProof(phone: string, proofToken: string, purpose: PhoneProofPurpose): boolean {
  sweepAuthPhoneState();
  const proof = authPhoneProofs.get(proofToken);
  return Boolean(proof && proof.phone === phone && proof.channel === 'phone' && proof.purpose === purpose);
}

async function issueAuthPhone(request: Request) {
  const body = parseAuthProofInput(await request.json(), ['phone']);
  if (!body || !/^\d{11}$/.test(body.phone ?? '')) {
    return authProofError('VALIDATION_ERROR', '휴대폰 번호는 숫자 11자리예요.');
  }
  sweepAuthPhoneState();
  const expiresAt = Date.now() + 5 * 60 * 1000;
  authPhoneChallenges.set(body.phone, { expiresAt, attemptCount: 0, verified: false });
  return ok({ expiresAt: new Date(expiresAt).toISOString(), devCode: '123456' });
}

async function verifyAuthPhone(request: Request) {
  const body = parseAuthProofInput(await request.json(), ['phone', 'code', 'purpose']);
  const purpose = body?.purpose ?? 'signup';
  if (!body || !/^\d{11}$/.test(body.phone ?? '') || body.code?.length !== 6 || !isPhoneProofPurpose(purpose)) {
    return authProofError('VALIDATION_ERROR', '입력값을 다시 확인해 주세요.');
  }
  sweepAuthPhoneState();
  const challenge = authPhoneChallenges.get(body.phone);
  if (!challenge || challenge.expiresAt < Date.now()) return authProofError('VERIFICATION_NO_PENDING', '유효한 인증 요청이 없어요. 인증번호를 다시 받아 주세요.');
  if (body.code !== '123456') {
    if (challenge.attemptCount >= 5) return authProofError('VERIFICATION_TOO_MANY_ATTEMPTS', '시도 횟수를 초과했어요. 인증번호를 다시 받아 주세요.');
    authPhoneChallenges.set(body.phone, { ...challenge, attemptCount: challenge.attemptCount + 1 });
    return authProofError('VERIFICATION_CODE_MISMATCH', '인증번호가 올바르지 않아요.');
  }
  authPhoneChallenges.set(body.phone, { ...challenge, verified: true });
  const proofToken = `msw-phone-${purpose}-${randomUuid()}`;
  authPhoneProofs.set(proofToken, { phone: body.phone, channel: 'phone', purpose, expiresAt: Date.now() + 10 * 60 * 1000 });
  return ok({ verified: true, proofToken });
}

async function socialLinkAccountProofRequired(request: Request) {
  const body = parseAuthProofInput(await request.json(), ['phone', 'proofToken']);
  if (!body || !/^\d{11}$/.test(body.phone ?? '') || !body.proofToken || body.proofToken.length > 512) {
    return authProofError('VALIDATION_ERROR', '입력값을 다시 확인해 주세요.');
  }
  if (!hasPhoneProof(body.phone, body.proofToken, 'social_link') || !authPhoneChallenges.get(body.phone)?.verified) {
    return authProofError('PHONE_NOT_VERIFIED', '휴대폰 본인인증을 다시 진행해 주세요.');
  }
  if (body.phone !== authAccountPhoneFixture) {
    return authProofError('ACCOUNT_NOT_FOUND', '이 번호로 가입된 계정을 찾지 못했어요.', 404);
  }
  return authProofError('SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF',
    '휴대폰 번호 인증만으로 기존 계정에 연결할 수 없어요. 처음 가입한 방법으로 로그인해 주세요. 비밀번호를 잊었다면 로그인 화면에서 이메일로 재설정해 주세요.', 409);
}

async function requestRecoveryEmail(request: Request) {
  const email = recoveryEmail(parseAuthProofInput(await request.json(), ['email']));
  if (!email) return authProofError('VALIDATION_ERROR', '이메일 형식이 올바르지 않아요.');
  sweepRecoveryEmailState();
  const expiresAt = Date.now() + 5 * 60 * 1000;
  recoveryEmailChallenges.set(email, { expiresAt, attemptCount: 0 });
  // Registered and absent addresses receive the same public response; no account metadata is exposed.
  return ok({ sent: true, expiresAt: new Date(expiresAt).toISOString() });
}

async function confirmRecoveryEmail(request: Request) {
  const body = parseAuthProofInput(await request.json(), ['email', 'code']);
  const email = recoveryEmail(body);
  if (!email || body?.code?.length !== 6) return authProofError('VALIDATION_ERROR', '입력값을 다시 확인해 주세요.');
  sweepRecoveryEmailState();
  const challenge = recoveryEmailChallenges.get(email);
  if (!challenge) return authProofError('VERIFICATION_NO_PENDING', '유효한 인증 요청이 없어요. 인증번호를 다시 받아 주세요.');
  if (body.code !== '123456') {
    if (challenge.attemptCount >= 5) return authProofError('VERIFICATION_TOO_MANY_ATTEMPTS', '시도 횟수를 초과했어요. 인증번호를 다시 받아 주세요.');
    recoveryEmailChallenges.set(email, { ...challenge, attemptCount: challenge.attemptCount + 1 });
    return authProofError('VERIFICATION_CODE_MISMATCH', '인증번호가 올바르지 않아요.');
  }
  const proofToken = `msw-email-password-reset-${randomUuid()}`;
  recoveryEmailProofs.set(proofToken, { email, channel: 'email', purpose: 'password_reset', expiresAt: Date.now() + 10 * 60 * 1000 });
  return ok({ verified: true, proofToken });
}

async function resetPasswordByRecoveryEmail(request: Request) {
  const body = parseAuthProofInput(await request.json(), ['email', 'proofToken', 'newPassword']);
  const email = recoveryEmail(body);
  if (!email || typeof body?.proofToken !== 'string' || (body.newPassword?.length ?? 0) < 8) {
    return authProofError('VALIDATION_ERROR', '입력값을 다시 확인해 주세요.');
  }
  sweepRecoveryEmailState();
  const proof = recoveryEmailProofs.get(body.proofToken);
  if (!proof || proof.email !== email || proof.channel !== 'email' || proof.purpose !== 'password_reset') {
    return authProofError('EMAIL_NOT_VERIFIED', '이메일 본인인증을 다시 진행해 주세요.');
  }
  if (email !== v1UserFixture.email?.trim().toLowerCase()) {
    return authProofError('ACCOUNT_NOT_FOUND', '이 이메일로 가입된 계정을 찾지 못했어요.', 404);
  }
  return ok({ ok: true });
}

async function resetPasswordByRecoveryPhone(request: Request) {
  const body = parseAuthProofInput(await request.json(), ['phone', 'proofToken', 'newPassword']);
  if (!body || !/^\d{11}$/.test(body.phone ?? '') || typeof body.proofToken !== 'string' || (body.newPassword?.length ?? 0) < 8) {
    return authProofError('VALIDATION_ERROR', '입력값을 다시 확인해 주세요.');
  }
  if (!hasPhoneProof(body.phone, body.proofToken, 'password_reset')) {
    return authProofError('PHONE_NOT_VERIFIED', '휴대폰 본인인증을 다시 진행해 주세요.');
  }
  if (body.phone !== authAccountPhoneFixture) {
    return authProofError('ACCOUNT_NOT_FOUND', '이 번호로 가입된 계정을 찾지 못했어요.', 404);
  }
  return authProofError('ACCOUNT_RECOVERY_REQUIRES_EMAIL',
    '휴대폰 번호 인증만으로 기존 계정의 비밀번호를 바꿀 수 없어요. 이메일 본인 확인으로 재설정하거나 처음 가입한 방법으로 로그인해 주세요.', 409);
}

async function findAccountByRecoveryPhone(request: Request) {
  const body = parseAuthProofInput(await request.json(), ['phone', 'proofToken']);
  if (!body || !/^\d{11}$/.test(body.phone ?? '') || typeof body.proofToken !== 'string') {
    return authProofError('VALIDATION_ERROR', '입력값을 다시 확인해 주세요.');
  }
  if (!hasPhoneProof(body.phone, body.proofToken, 'password_reset')) {
    return authProofError('PHONE_NOT_VERIFIED', '휴대폰 본인인증을 다시 진행해 주세요.');
  }
  if (body.phone !== authAccountPhoneFixture) {
    return authProofError('ACCOUNT_NOT_FOUND', '이 번호로 가입된 계정을 찾지 못했어요.', 404);
  }
  const email = v1UserFixture.email;
  const [local = '', domain] = email?.split('@') ?? [];
  const maskedEmail = email ? (domain ? `${local.length > 2 ? local.slice(0, 2) : ''}***@${domain}` : '***') : null;
  return ok({ maskedEmail, providers: ['email'], hasPassword: true });
}

function notFound(message: string) {
  return HttpResponse.json(
    {
      status: 'error',
      statusCode: 404,
      code: 'NOT_FOUND',
      message,
      timestamp: '2026-05-18T00:00:00.000Z',
    },
    { status: 404 },
  );
}

function validationError(field: RegisterField) {
  return HttpResponse.json(
    {
      status: 'error',
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: '입력값을 다시 확인해 주세요.',
      details: [{ field, messages: [REGISTER_ERROR_MESSAGES[field]] }],
      timestamp: '2026-05-18T00:00:00.000Z',
    },
    { status: 400 },
  );
}

function toSignupProfileDraft(value: unknown): SignupProfileDraft {
  const body = typeof value === 'object' && value !== null ? value : {};
  const displayName = 'displayName' in body && typeof body.displayName === 'string' ? body.displayName : '';
  const phone = 'phone' in body && typeof body.phone === 'string' ? body.phone : '';
  const birthDate = 'birthDate' in body && typeof body.birthDate === 'string' ? body.birthDate : '';
  const gender = 'gender' in body && (body.gender === 'male' || body.gender === 'female') ? body.gender : '';

  return { displayName, phone, birthDate, gender };
}

function getRegisterIssue(value: unknown): RegisterField | null {
  const profileIssue = getSignupProfileIssue(toSignupProfileDraft(value));
  if (profileIssue) return profileIssue;

  const body = typeof value === 'object' && value !== null ? value : {};
  const nickname = 'nickname' in body && typeof body.nickname === 'string' ? body.nickname : '';
  const email = 'email' in body && typeof body.email === 'string' ? body.email : '';
  const password = 'password' in body && typeof body.password === 'string' ? body.password : '';
  const requiredTermsAccepted = 'requiredTermsAccepted' in body && body.requiredTermsAccepted === true;

  if (nickname.length < 2) return 'nickname';
  if (email.length < 3) return 'email';
  if (password.length < 8) return 'password';
  if (!requiredTermsAccepted) return 'requiredTermsAccepted';
  return null;
}

function page<T>(items: T[]) {
  return { items, nextCursor: null };
}

/** 서버 첫 페이지 응답처럼 totalCount·facets 를 싣는다. 종목 건수는 종목 필터를 뺀 목록(`ignoringSport`)으로 센다. */
function pageWithCounts<T extends { sport?: { sportId: string }; sportName?: string }>(
  request: Request,
  items: T[],
  ignoringSport: T[],
  toggles?: { today: number; recruiting: number },
) {
  // 서버 계약: includeFacets=true 를 보낸 첫 페이지에만 건수를 싣는다.
  const params = new URL(request.url).searchParams;
  if (params.get('cursor') || params.get('includeFacets') !== 'true') return page(items);
  const counts = new Map<string, number>();
  for (const item of ignoringSport) {
    // 목록 필터와 같은 방식으로 종목을 푼다 — sport 객체가 없는 픽스처 행은 sportName 으로 마스터 종목을 찾는다.
    const sportId = item.sport?.sportId ?? v1SportsFixture.find((sport) => sport.name === item.sportName)?.id;
    if (sportId) counts.set(sportId, (counts.get(sportId) ?? 0) + 1);
  }
  return {
    items,
    nextCursor: null,
    pageInfo: { nextCursor: null, hasNext: false, totalCount: items.length },
    facets: { sports: [...counts].map(([sportId, count]) => ({ sportId, count })).sort((a, b) => b.count - a.count), ...toggles },
  };
}

type ToggleRow = { startsAt: string; status: string; deadlineAt?: string | null; capacityText?: string };
type ToggleFlags = { today: boolean; recruitingOnly: boolean };

function readToggles(request: Request): ToggleFlags {
  const params = new URL(request.url).searchParams;
  return { today: params.get('today') === 'true', recruitingOnly: params.get('recruitingOnly') === 'true' };
}

/**
 * 서버 토글 규칙(`list-facets.ts`)을 따른다. today = KST 오늘 시작, recruitingOnly = 지금 신청 가능
 * (모집 중 · 시작 전 · 마감 전). `excludeFull` 은 매치만 — 정원이 찬 글(`n/m` 에서 n>=m)을 뺀다.
 */
function applyToggles<T extends ToggleRow>(items: T[], flags: ToggleFlags, excludeFull: boolean, now = new Date()): T[] {
  return items.filter((item) => {
    if (flags.today && toKstDateString(new Date(item.startsAt)) !== toKstDateString(now)) return false;
    if (!flags.recruitingOnly) return true;
    if (item.status !== 'open' && item.status !== 'recruiting') return false;
    if (new Date(item.startsAt) < now) return false;
    if (item.deadlineAt && new Date(item.deadlineAt) < now) return false;
    if (excludeFull) {
      const fill = /(\d+)\s*\/\s*(\d+)/.exec(item.capacityText ?? '');
      if (fill && Number(fill[1]) >= Number(fill[2])) return false;
    }
    return true;
  });
}

/** 각 칩 건수는 자기 토글만 빼고(다른 토글은 유지) 센다. */
function toggleFacets<T extends ToggleRow>(base: T[], flags: ToggleFlags, excludeFull: boolean) {
  return {
    today: applyToggles(base, { ...flags, today: true }, excludeFull).length,
    recruiting: applyToggles(base, { ...flags, recruitingOnly: true }, excludeFull).length,
  };
}

function countFacet<T>(items: T[], values: readonly string[], read: (item: T) => string) {
  return Object.fromEntries(values.map((value) => [value, items.filter((item) => read(item) === value).length]));
}

function teamDetail(teamId: string) {
  const team = v1TeamsFixture.find((item) => item.id === teamId) ?? v1TeamsFixture[0];
  return {
    ...team,
    teamId: team.id,
    status: 'active',
    visibility: 'public',
    membersVisibilityEnabled: false,
    canViewMembers: false,
    version: '2026-05-18T00:00:00.000Z',
    sport: team.sport ?? { sportId: 'sport-badminton', name: team.sportName },
    region: team.region ?? { regionId: 'region-seoul-gangdong', name: team.regionName },
    profile: {
      logoUrl: team.logoUrl ?? null,
      coverImageUrl: team.coverImageUrl ?? null,
      introduction: team.introductionPreview ?? null,
      activityAreaText: null,
      skillLevelText: team.skillLevelText ?? team.levelLabel ?? null,
      levelLabel: team.levelLabel ?? null,
      minLevel: team.minLevel ?? null,
      maxLevel: team.maxLevel ?? null,
      genderRule: team.genderRule ?? null,
      joinPolicy: team.joinPolicy,
      memberGoalCount: null,
    },
    owner: {
      userId: 'user-1',
      displayName: '팀장',
      profileImageUrl: null,
    },
    membersPreview: [],
    managerCount: 0,
    trust: {
      trustState: team.trustState === 'none' ? 'sample' : team.trustState,
      score: null,
    },
    viewer: {
      role: 'none',
      membershipId: null,
      joinState: 'none',
      canRequestJoin: team.joinPolicy === 'approval_required',
      disabledReason: null,
      manageRoute: null,
    },
    dissolution: null,
  };
}

// ── Team schedules mock state (Task 12 backend / Task 13 frontend) ─────────
// Single mutable schedule keeps GET (list/detail/me-schedule) and every mutation
// (create/update/cancel/complete/attendance/guest-recruitment) cross-consistent —
// tests exercising one mutation observe it on the very next GET, matching the
// server's read-your-write contract for a single-user MSW harness.
let v1ScheduleFixture = {
  id: 'schedule-1',
  teamId: 'team-1',
  title: '주말 정기 훈련',
  type: 'TRAINING' as 'MATCH' | 'TRAINING' | 'EVENT',
  startAt: '2026-05-24T09:00:00.000Z',
  endAt: '2026-05-24T11:00:00.000Z',
  timezone: 'Asia/Seoul',
  capacity: 16 as number | null,
  rsvpDeadlineAt: '2026-05-23T15:00:00.000Z' as string | null,
  visibility: 'TEAM' as 'TEAM' | 'MEMBERS' | 'PUBLIC',
  state: 'SCHEDULED' as 'SCHEDULED' | 'CANCELLED' | 'COMPLETED',
  version: 1,
  teamMatchId: null as string | null,
  linkedMatch: null as { teamMatchId: string; tournamentId: string | null; leagueId: string | null } | null,
  matchConfirmed: null as boolean | null,
  cancelReason: null as string | null,
  cancelledAt: null as string | null,
};

let v1ScheduleAttendanceCounts = { going: 10, maybe: 2, notGoing: 1, waitlisted: 0 };

let v1MyAttendance: {
  status: 'GOING' | 'MAYBE' | 'NOT_GOING' | 'WAITLISTED' | null;
  version: number;
  waitlistPosition: number | null;
} = { status: 'GOING', version: 1, waitlistPosition: null };

let v1GuestRecruitmentFixture: {
  id: string;
  scheduleId: string;
  slots: number;
  closesAt: string;
  note: string | null;
  visibility: 'MEMBERS' | 'PUBLIC';
  state: 'OPEN' | 'CLOSED' | 'FILLED';
  version: number;
  applicantCount: number;
  approvedCount: number;
} | null = {
  id: 'guest-rec-1',
  scheduleId: 'schedule-1',
  slots: 3,
  closesAt: '2026-05-23T12:00:00.000Z',
  note: '포지션 무관 환영해요',
  visibility: 'MEMBERS',
  state: 'OPEN',
  version: 1,
  applicantCount: 1,
  approvedCount: 0,
};

let v1GuestApplications: Array<{
  applicationId: string;
  state: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  displayName: string;
  note: string | null;
}> = [{ applicationId: 'guest-app-1', state: 'PENDING', displayName: '게스트1', note: null }];

function scheduleSummary() {
  return {
    id: v1ScheduleFixture.id,
    title: v1ScheduleFixture.title,
    type: v1ScheduleFixture.type,
    startAt: v1ScheduleFixture.startAt,
    endAt: v1ScheduleFixture.endAt,
    timezone: v1ScheduleFixture.timezone,
    capacity: v1ScheduleFixture.capacity,
    rsvpDeadlineAt: v1ScheduleFixture.rsvpDeadlineAt,
    visibility: v1ScheduleFixture.visibility,
    state: v1ScheduleFixture.state,
    version: v1ScheduleFixture.version,
    teamMatchId: v1ScheduleFixture.teamMatchId,
    linkedMatch: v1ScheduleFixture.linkedMatch,
    matchConfirmed: v1ScheduleFixture.matchConfirmed,
    goingCount: v1ScheduleAttendanceCounts.going,
    waitlistedCount: v1ScheduleAttendanceCounts.waitlisted,
  };
}

const v1ScheduleAttendeesFixture: V1TeamScheduleDetail['attendees'] = [
  { userId: 'user-owner', nickname: '팀장원', profileImageUrl: null, status: 'GOING', waitlistPosition: null },
  { userId: 'user-manager', nickname: '매니저준', profileImageUrl: null, status: 'GOING', waitlistPosition: null },
  { userId: 'user-member', nickname: '멤버현', profileImageUrl: null, status: 'MAYBE', waitlistPosition: null },
  { userId: 'user-host', nickname: '호스트민', profileImageUrl: null, status: 'NO_RESPONSE', waitlistPosition: null },
];

function scheduleDetail(): V1TeamScheduleDetail {
  return {
    ...scheduleSummary(),
    cancelReason: v1ScheduleFixture.cancelReason,
    cancelledAt: v1ScheduleFixture.cancelledAt,
    guestRecruitment: v1GuestRecruitmentFixture,
    myAttendance: v1MyAttendance.status
      ? { status: v1MyAttendance.status, version: v1MyAttendance.version, waitlistPosition: v1MyAttendance.waitlistPosition }
      : null,
    attendees: v1ScheduleAttendeesFixture,
  };
}

function scheduleMutationResult(replayed = false) {
  return {
    id: v1ScheduleFixture.id,
    teamId: v1ScheduleFixture.teamId,
    title: v1ScheduleFixture.title,
    type: v1ScheduleFixture.type,
    startAt: v1ScheduleFixture.startAt,
    endAt: v1ScheduleFixture.endAt,
    timezone: v1ScheduleFixture.timezone,
    capacity: v1ScheduleFixture.capacity,
    rsvpDeadlineAt: v1ScheduleFixture.rsvpDeadlineAt,
    visibility: v1ScheduleFixture.visibility,
    state: v1ScheduleFixture.state,
    version: v1ScheduleFixture.version,
    teamMatchId: v1ScheduleFixture.teamMatchId,
    matchConfirmed: v1ScheduleFixture.matchConfirmed,
    replayed,
  };
}

// ── Task 17: game + team-match lineup mock state ────────────────────────────
// gameId 'game-1' cross-references v1TeamMatchesFixture's 'team-match-1' (fixtures.ts
// leaves V1TeamMatch.gameId undefined — this file cannot touch fixtures.ts, so the
// cross-reference lives here only) and v1TournamentOperationsBoardItems below.
let v1GameFixture = {
  id: 'game-1',
  sourceType: 'TEAM_MATCH' as 'TEAM_MATCH' | 'TOURNAMENT_FIXTURE',
  state: 'SCHEDULED' as V1GameState,
  version: 1,
  lastSequence: 0,
  competitionConfigVersionId: 'competition-config-v1',
  currentOfficialRevisionId: null as string | null,
  sides: [
    { id: 'side-home-1', gameId: 'game-1', sideKey: 'HOME' as const, teamId: 'team-1', displayNameSnapshot: '성수 볼러즈' },
    { id: 'side-away-1', gameId: 'game-1', sideKey: 'AWAY' as const, teamId: 'team-2', displayNameSnapshot: '마포 FC' },
  ],
  periods: [] as unknown[],
  lineups: [] as { id: string; gameId: string; sideId: string; revision: number; state: string; version: number; submittedAt: string | null; supersedesId: string | null; invalidatedAt: string | null }[],
  actorRole: 'team_owner',
};

let v1GameResultRevisions: V1GameResultRevision[] = [];

function defaultLineupFixture(): V1TeamMatchLineup & { lineupId: string } {
  return {
    teamMatchId: 'team-match-1',
    gameId: 'game-1',
    sideId: 'side-home-1',
    role: 'team_owner',
    lineupId: 'lineup-1',
    revision: 1,
    state: 'DRAFT',
    effectiveRosterSource: 'DEFAULT_PREVIEW',
    hasSavedDraft: false,
    editable: true,
    lockReason: null,
    lateAdditionAllowed: false,
    ownTeamName: '홈 FC',
    opponent: { teamName: '원정 FC', submitted: false, published: false, participantCount: null },
    version: 1,
    formation: null,
    publicLineupAt: null,
    starters: [
      { id: '14600000-0000-4000-8000-000000001001', userId: 'user-1', displayName: '김도윤', jerseyNumber: 7, position: null, goalkeeper: false, positionX: null, positionY: null },
      { id: '14600000-0000-4000-8000-000000001002', userId: 'user-2', displayName: '박서준', jerseyNumber: 1, position: null, goalkeeper: false, positionX: null, positionY: null },
    ],
    bench: [],
    eligibleMembers: [
      { userId: 'user-1', displayName: '김도윤', jerseyNumber: 7, attending: true, rsvpStatus: null, alsoOpponentMember: false },
      { userId: 'user-2', displayName: '박서준', jerseyNumber: 1, attending: true, rsvpStatus: null, alsoOpponentMember: true },
    ],
  };
}

let v1TeamMatchLineupFixture = defaultLineupFixture();
let v1FriendlyDefaultParticipants = v1TeamMatchLineupFixture.starters;

function friendlyGameLineup(lineup: typeof v1TeamMatchLineupFixture, supersedesId: string | null, now = new Date().toISOString()): GameLineup {
  return {
    id: lineup.lineupId, gameId: lineup.gameId, sideId: lineup.sideId,
    revision: lineup.revision, state: lineup.state, version: 0, supersedesId,
    formation: lineup.formation, submittedAt: lineup.state === 'DRAFT' ? null : now,
    createdAt: now, updatedAt: now, invalidatedAt: null,
    participants: lineup.starters.map((participant) => ({
      id: participant.id, gameId: lineup.gameId, sideId: lineup.sideId, lineupId: lineup.lineupId,
      userId: participant.userId, displayNameSnapshot: participant.displayName,
      jerseyNumber: participant.jerseyNumber, position: participant.goalkeeper ? 'GK' : participant.position,
      positionX: participant.positionX ?? null, positionY: participant.positionY ?? null,
      started: true, arrivedAt: null, createdAt: now, updatedAt: now,
    })),
  };
}

const v1FriendlyGameLineups = [friendlyGameLineup(v1TeamMatchLineupFixture, null)];

function friendlyLineupVersionFailure(rawVersion: unknown) {
  const expectedVersion = rawVersion == null || typeof rawVersion === 'object' ? rawVersion : Number(rawVersion);
  if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return HttpResponse.json({ status: 'error', statusCode: 400, code: 'VALIDATION_ERROR', message: '입력값을 다시 확인해 주세요.' }, { status: 400 });
  }
  if (expectedVersion !== v1TeamMatchLineupFixture.revision) {
    return HttpResponse.json({
      status: 'error', statusCode: 409, code: 'VERSION_CONFLICT',
      message: '참석명단이 그새 변경됐어요. 새로고침 후 다시 시도해 주세요.',
      details: { expectedVersion, currentVersion: v1TeamMatchLineupFixture.revision },
    }, { status: 409 });
  }
  return null;
}

// ── Tournament operations mock state (Task 18/19 backend, Task 19 frontend) ─
let v1TournamentOperationsBoardItems: V1TournamentOperationsBoardItem[] = [
  {
    fixtureId: 'fixture-1',
    tournamentId: 'tournament-1',
    round: '8강',
    fixtureNumber: 1,
    legNumber: 1,
    groupName: null,
    gameId: 'game-1',
    gameState: 'SCHEDULED',
    fieldId: 'field-1',
    fieldName: '1번 코트',
    homeRegistrationId: 'registration-1',
    awayRegistrationId: 'registration-2',
    scheduledAt: '2026-05-25T09:00:00.000Z',
    currentScore: null,
    currentRevisionState: null,
    warnings: [],
    version: 1,
    revisionId: null,
    stableRevision: 'stable-1',
  },
];

let v1TournamentStaffAssignments: V1TournamentStaffAssignment[] = [
  {
    id: 'staff-1',
    tournamentId: 'tournament-1',
    userId: 'user-2',
    role: 'FIELD_OPERATOR',
    fieldId: 'field-1',
    fixtureIds: [],
    version: 1,
    expiresAt: null,
    revokedAt: null,
    grantedByUserId: 'user-1',
    createdAt: '2026-05-18T00:00:00.000Z',
  },
];

// Shared field catalogue and fixture places mirror the real selection/import contract.
const v1TournamentFields: Array<V1TournamentField & { place: V1PlaceView }> = [
  { id: 'field-1', tournamentId: 'tournament-1', scopeKey: 'court-1', name: '1번 코트', sortOrder: 1, active: true, version: 1,
    place: { name: '서울 풋살파크', address: '서울', latitude: null, longitude: null, provider: null, providerPlaceId: null } },
  { id: 'field-2', tournamentId: 'tournament-1', scopeKey: 'court-2', name: '2번 코트', sortOrder: 2, active: true, version: 1,
    place: { name: '2번 코트', address: null, latitude: null, longitude: null, provider: null, providerPlaceId: null } },
];
const v1CompetitionFixturePlaces: Array<{ fixtureId: string; tournamentId: string; fieldId: string | null; place: V1PlaceView }> = [{ fixtureId: 'fixture-1', tournamentId: 'tournament-1', fieldId: 'field-1' as string | null,
  place: { name: '서울 풋살파크', address: '서울' as string | null, latitude: null, longitude: null, provider: null, providerPlaceId: null } }];

export const v1MswHandlers = [
  ...v1GameRosterMswHandlers,
  ...v1TeamDissolutionMswHandlers,
  ...v1TeamInviteLinkMswHandlers,
  ...v1LeagueVisibilityMswHandlers,
  ...v1TeamMatchRulesMsw.handlers,
  http.get(`${api}/auth/me`, () => ok(v1UserFixture)),
  http.post(`${api}/auth/phone/issue`, ({ request }) => issueAuthPhone(request)),
  http.post(`${api}/auth/phone/verify`, ({ request }) => verifyAuthPhone(request)),
  http.post(`${api}/auth/social-link/preview`, ({ request }) => socialLinkAccountProofRequired(request)),
  http.post(`${api}/auth/social-link`, ({ request }) => socialLinkAccountProofRequired(request)),
  http.post(`${api}/auth/recovery/find-account`, ({ request }) => findAccountByRecoveryPhone(request)),
  http.post(`${api}/auth/recovery/reset-password`, ({ request }) => resetPasswordByRecoveryPhone(request)),
  http.post(`${api}/auth/recovery/email/request`, ({ request }) => requestRecoveryEmail(request)),
  http.post(`${api}/auth/recovery/email/confirm`, ({ request }) => confirmRecoveryEmail(request)),
  http.post(`${api}/auth/recovery/email/reset-password`, ({ request }) => resetPasswordByRecoveryEmail(request)),
  http.post(`${api}/auth/login`, () => ok({ session: { userId: v1UserFixture.id, userEmail: v1UserFixture.email }, ...v1UserFixture })),
  http.post(`${api}/auth/register`, async ({ request }) => {
    const body = await request.json();
    const issue = getRegisterIssue(body);
    if (issue) return validationError(issue);
    return ok({ session: { userId: v1UserFixture.id, userEmail: v1UserFixture.email }, ...v1UserFixture });
  }),
  http.post(`${api}/auth/social-terms`, async ({ request }) => {
    const body = (await request.json()) as { ageConfirmed?: unknown };
    if (body.ageConfirmed !== true) {
      return HttpResponse.json(
        { status: 'error', statusCode: 400, code: 'VALIDATION_ERROR', message: '만 14세 이상 확인이 필요해요.', timestamp: '2026-05-18T00:00:00.000Z' },
        { status: 400 },
      );
    }
    return ok({ session: { userId: v1UserFixture.id, userEmail: v1UserFixture.email }, ...v1UserFixture, next: { route: '/signup/social' } });
  }),
  http.post(`${api}/auth/social-profile/defer`, () =>
    ok({ session: { userId: v1UserFixture.id, userEmail: v1UserFixture.email }, ...v1UserFixture })),
  http.get(`${api}/onboarding`, () => ok({ status: 'signup_done', currentStep: 'sport', canResume: true, missing: ['sports'], sports: [], regions: [], regionOptional: true })),
  http.patch(`${api}/onboarding/preferences`, async ({ request }) => ok(await request.json())),
  http.post(`${api}/onboarding/complete`, () => ok({ completed: true })),
  http.post(`${api}/onboarding/defer`, () => ok({ status: 'deferred', next: { route: '/home', reason: 'onboarding_deferred' }, missing: ['sports'], limited: true })),
  http.get(`${api}/master/sports`, () => ok(v1SportsFixture)),
  http.get(`${api}/master/regions`, () => ok(v1RegionsFixture)),
  http.get(`${api}/public/integrations/kakao-maps-key`, () => ok({ kakaoMapsJsKey: null })),
  http.get(`${api}/places/search`, ({ request }) => {
    const tokens = (new URL(request.url).searchParams.get('query') ?? '').trim().split(/\s+/).filter(Boolean);
    const items = tokens.length === 0
      ? []
      : v1PlaceSearchFixture.items.filter((item) => tokens.some((token) => item.name.includes(token)));
    return ok({ items, hasMore: false });
  }),
  http.get(`${api}/search/recent`, () => ok({ items: v1RecentSearchesFixture })),
  http.post(`${api}/search/recent`, async ({ request }) => {
    const body = await request.json() as { query: string; filters?: unknown };
    return ok({ id: 'recent-new', ...body, searchedAt: '2026-05-18T10:00:00.000Z' });
  }),
  http.get(`${api}/home`, () => ok(v1HomeFixture)),
  http.get(`${api}/popups/active`, ({ request }) => {
    const url = new URL(request.url);
    const screen = url.searchParams.get('screen');
    const path = url.searchParams.get('path');
    const exactRow = path ? v1AdminPopupsFixture.find((popup) =>
      popup.status === 'published' && popup.targetPaths?.includes(path),
    ) : undefined;
    const row = exactRow ?? v1AdminPopupsFixture.find((popup) =>
      popup.status === 'published' && Boolean(screen) && popup.targetScreens.includes(screen as never),
    );
    return ok({
      popup: row ? {
        popupId: row.popupId,
        title: row.title,
        body: row.body,
        targetScreens: row.targetScreens,
        targetPaths: row.targetPaths ?? [],
        linkUrl: row.linkUrl,
        linkLabel: row.linkLabel,
        publishedAt: row.publishedAt,
      } : null,
    });
  }),
  http.get(`${api}/notices`, ({ request }) => {
    const category = new URL(request.url).searchParams.get('category');
    const notices = category ? v1NoticesFixture.filter((item) => item.category === category) : v1NoticesFixture;
    return ok({ notices, pageInfo: { hasNextPage: false, nextCursor: null } });
  }),
  http.get(`${api}/notices/:noticeId`, ({ params }) => ok({ notice: v1NoticesFixture.find((item) => item.id === params.noticeId) ?? v1NoticesFixture[0] })),
  http.get(`${api}/inquiries`, () => ok(v1InquiriesFixture)),
  http.post(`${api}/inquiries`, async ({ request }) => {
    const body = await request.json() as {
      category: string;
      title: string;
      body: string;
      contact?: string;
      relatedType?: string;
      relatedId?: string;
    };
    const now = new Date().toISOString();
    const inquiry: V1Inquiry = {
      inquiryId: `inquiry-${v1InquiriesFixture.items.length + 1}`,
      category: body.category as V1Inquiry['category'],
      reportReason: null,
      title: body.title,
      body: body.body,
      contact: body.contact ?? null,
      relatedType: (body.relatedType as V1Inquiry['relatedType']) ?? null,
      relatedId: body.relatedId ?? null,
      status: 'received',
      createdAt: now,
      updatedAt: now,
      closedAt: null,
      replies: [],
    };
    v1InquiriesFixture.items.unshift(inquiry);
    return ok(inquiry);
  }),
  http.get(`${api}/inquiries/:inquiryId`, ({ params }) => {
    const inquiry = v1InquiriesFixture.items.find((item) => item.inquiryId === params.inquiryId) ?? v1InquiriesFixture.items[0];
    return ok(inquiry);
  }),
  http.get(`${api}/matches`, ({ request }) => {
    const sportId = new URL(request.url).searchParams.get('sportId');
    const sport = v1SportsFixture.find((item) => item.id === sportId);
    const levelCodes = new URL(request.url).searchParams.get('levelCodes')?.split(',').filter(Boolean) ?? [];
    const flags = readToggles(request);
    const byLevel = levelCodes.length
      ? v1MatchesFixture.filter((item) => rangeMatches(levelCodes, item.minLevel?.code, item.maxLevel?.code))
      : v1MatchesFixture;
    const bySport = sportId
      ? byLevel.filter((item) => item.sport?.sportId === sportId || (sport && item.sportName === sport.name))
      : byLevel;
    const matches = applyToggles(bySport, flags, true);
    return ok(pageWithCounts(request, matches, applyToggles(byLevel, flags, true), toggleFacets(bySport, flags, true)));
  }),
  http.get(`${api}/matches/:matchId`, ({ params }) => ok(v1MatchesFixture.find((item) => item.id === params.matchId) ?? v1MatchesFixture[0])),
  http.get(`${api}/teams`, ({ request }) => {
    const sportId = new URL(request.url).searchParams.get('sportId');
    const levelCodes = new URL(request.url).searchParams.get('levelCodes')?.split(',').filter(Boolean) ?? [];
    const sport = v1SportsFixture.find((item) => item.id === sportId);
    const teamsBySport = sport
      ? v1TeamsFixture.filter((item) => item.sport?.sportId === sport.id || item.sportName === sport.name)
      : v1TeamsFixture;
    const teams = levelCodes.length
      ? teamsBySport.filter((item) => rangeMatches(levelCodes, item.minLevel?.code, item.maxLevel?.code))
      : teamsBySport;
    const teamsIgnoringSport = levelCodes.length
      ? v1TeamsFixture.filter((item) => rangeMatches(levelCodes, item.minLevel?.code, item.maxLevel?.code))
      : v1TeamsFixture;
    return ok(pageWithCounts(request, teams, teamsIgnoringSport));
  }),
  http.get(`${api}/teams/name-availability`, () => ok({ available: true })),
  http.get(`${api}/teams/:teamId`, ({ params }) => ok(teamDetail(String(params.teamId)))),
  http.get(`${api}/teams/:teamId/competition-entries`, ({ params }) =>
    ok({ ...v1TeamCompetitionEntriesFixture, teamId: String(params.teamId) })),
  http.get(`${api}/teams/:teamId/members`, () => ok({
    items: [
      {
        membershipId: 'membership-1',
        userId: 'user-1',
        displayName: '김도윤',
        realName: '김도윤',
        phone: '01012345678',
        birthDate: '1995-03-15',
        profileImageUrl: null,
        gender: 'male',
        role: 'owner',
        status: 'active',
        joinedAt: '2026-05-18T00:00:00.000Z',
        canChangeRole: false,
        canRemove: false,
      },
      {
        membershipId: 'membership-2',
        userId: 'user-2',
        displayName: '박서준',
        realName: '박서준',
        phone: null,
        birthDate: '1997-08-20',
        profileImageUrl: null,
        gender: 'female',
        role: 'member',
        status: 'active',
        joinedAt: '2026-05-18T00:00:00.000Z',
        canChangeRole: true,
        canRemove: true,
      },
    ],
    summary: { ownerCount: 1, managerCount: 0, memberCount: 2 },
    viewerRole: 'owner',
    membersVisibilityEnabled: true,
    pageInfo: { nextCursor: null, hasNext: false },
  })),
  http.get(`${api}/me/teams`, () => ok(v1TeamsFixture)),
  http.get(`${api}/me/team-matches`, ({ request }) => {
    const scope = new URL(request.url).searchParams.get('scope');
    const items = v1TeamMatchRulesMsw.listItems().map((item) => {
      const teamMatchId = item.id;
      const createdByMe = scope === 'created';

      return {
        teamMatchId,
        title: item.title,
        sportName: item.sport?.name ?? item.sportName ?? '종목 미정',
        startsAt: item.startsAt,
        deadlineAt: item.deadlineAt ?? null,
        status: item.status,
        displayState: item.displayState ?? item.status,
        isLive: item.isLive ?? false,
        relation: createdByMe ? 'created_by_me' : 'approved',
        teamId: item.hostTeamId ?? null,
        teamName: item.hostTeam?.name ?? item.hostTeamName ?? null,
        applicationId: createdByMe ? null : 'team-match-application-1',
        league: item.league ?? null,
        manageRoute: createdByMe ? `/team-matches/${teamMatchId}` : null,
        detailRoute: `/team-matches/${teamMatchId}`,
      } satisfies V1MyTeamMatch;
    });

    return ok(page(items));
  }),
  http.get(`${api}/team-matches`, ({ request }) => {
    const storedTeamMatches = v1TeamMatchRulesMsw.listItems();
    const sportId = new URL(request.url).searchParams.get('sportId');
    const levelCodes = new URL(request.url).searchParams.get('levelCodes')?.split(',').filter(Boolean) ?? [];
    const sport = v1SportsFixture.find((item) => item.id === sportId);
    const teamMatchesBySport = sport
      ? storedTeamMatches.filter((item) => item.sport?.sportId === sport.id || item.sportName === sport.name)
      : storedTeamMatches;
    const flags = readToggles(request);
    const byLevel = levelCodes.length
      ? teamMatchesBySport.filter((item) => rangeMatches(levelCodes, item.minLevel?.code, item.maxLevel?.code))
      : teamMatchesBySport;
    const teamMatches = applyToggles(byLevel, flags, false);
    // 종목 건수만 종목 필터를 빼고 센다(토글은 유지). 토글 칩은 종목·레벨 필터를 유지하고 자기 토글만 뺀다.
    const ignoringSportByLevel = levelCodes.length
      ? storedTeamMatches.filter((item) => rangeMatches(levelCodes, item.minLevel?.code, item.maxLevel?.code))
      : storedTeamMatches;
    return ok(pageWithCounts(request, teamMatches, applyToggles(ignoringSportByLevel, flags, false), toggleFacets(byLevel, flags, false)));
  }),
  http.get(`${api}/chat/rooms`, () => ok(v1ChatRoomsFixture)),
  http.get(`${api}/chat/rooms/:roomId`, ({ params }) => {
    const room = v1ChatRoomsFixture.items.find((item) => item.roomId === params.roomId) ?? v1ChatRoomsFixture.items[0];
    return ok({
      roomId: room.roomId,
      roomType: room.roomType,
      status: room.status,
      title: room.title,
      teamContact: room.teamContact,
      linkedTarget: room.linkedTarget,
      composer: room.linkedTargetCancelled
        ? { canSend: false, blockedReason: 'MATCH_CANCELLED' as const }
        : { canSend: true, blockedReason: null },
      me: {
        participantId: 'chat-participant-1',
        status: 'active',
        pinned: room.pinned,
        mutedUntil: room.mutedUntil ?? null,
        lastReadMessageId: null,
      },
      participants: [
        { userId: 'user-1', displayName: '나', role: 'member' },
        { userId: 'user-2', displayName: '상대', role: 'member' },
      ],
    });
  }),
  http.get(`${api}/chat/rooms/:roomId/messages`, ({ params }) => ok(v1ChatMessagesByRoomFixture[String(params.roomId)] ?? v1ChatMessagesFixture)),
  http.post(`${api}/chat/rooms/:roomId/messages`, async ({ params, request }) => {
    const body = await request.json() as { content?: string; imageUrl?: string; share?: { kind: 'team_schedule' | 'match'; targetId: string }; fileId?: string };
    const sentAt = new Date().toISOString();
    // 사진 메시지(Task 181)는 서버처럼 body '사진' + imageUrl 로 싣는다.
    const message = {
      messageId: `message-${Date.now()}`,
      sender: { userId: 'user-1', displayName: '나', profileImageUrl: null },
      messageType: body.imageUrl ? 'image' as const : body.share ? 'share' as const : body.fileId ? 'file' as const : 'text' as const,
      content: body.imageUrl ? '사진' : body.share ? '[공유] 공유한 항목' : body.fileId ? '[파일] 첨부 파일' : body.content ?? '',
      // 파일(Task 181 ③)은 서버처럼 이름·크기만 싣는다(목 서버는 업로드 내용을 모르니 고정값).
      file: body.fileId ? { name: '첨부 파일', size: 0, mimeType: 'application/octet-stream' } : null,
      imageUrl: body.imageUrl ?? null,
      // 일정·매치 공유(Task 181 ②)는 서버처럼 스냅숏 카드를 싣는다(목 서버는 제목을 모르니 고정 문구).
      shareCard: body.share
        ? {
            kind: body.share.kind,
            targetId: body.share.targetId,
            title: '공유한 항목',
            startAt: null,
            place: null,
            sub: null,
            route: body.share.kind === 'match' ? `/matches/${body.share.targetId}` : `/team-matches/${body.share.targetId}`,
          }
        : null,
      status: 'sent',
      sentAt,
      mine: true,
    };
    const roomMessages = v1ChatMessagesByRoomFixture[String(params.roomId)] ?? v1ChatMessagesFixture;
    roomMessages.items.unshift(message);
    const room = v1ChatRoomsFixture.items.find((item) => item.roomId === params.roomId);
    if (room) {
      room.lastMessage = { messageId: message.messageId, contentPreview: `나: ${message.content}`, sentAt };
      room.unreadCount = 0;
    }
    return ok({ messageId: message.messageId, roomId: params.roomId, messageType: message.messageType, content: message.content, imageUrl: message.imageUrl, shareCard: message.shareCard, file: message.file, status: 'sent', sentAt });
  }),
  // 채팅 파일 업로드(Task 181 ③) — 공개 URL 없이 fileId 만 돌려준다.
  http.post(`${api}/uploads/files`, () => ok({ fileId: 'chat-file-1', name: '첨부 파일', size: 0, mimeType: 'application/octet-stream' })),
  http.patch(`${api}/chat/rooms/:roomId/me`, async ({ params, request }) => {
    const body = await request.json() as { pinned?: boolean; lastReadMessageId?: string | null; mutedUntil?: string | null };
    const room = v1ChatRoomsFixture.items.find((item) => item.roomId === params.roomId);
    if (room && typeof body.pinned === 'boolean') room.pinned = body.pinned;
    if (room && body.mutedUntil !== undefined) {
      room.mutedUntil = body.mutedUntil;
      room.muted = Boolean(body.mutedUntil && new Date(body.mutedUntil).getTime() > Date.now());
    }
    if (room && body.lastReadMessageId !== undefined) room.unreadCount = 0;
    return ok({
      roomId: params.roomId,
      pinned: room?.pinned ?? Boolean(body.pinned),
      mutedUntil: room?.mutedUntil ?? body.mutedUntil ?? null,
      lastReadMessageId: body.lastReadMessageId ?? null,
      status: 'active',
    });
  }),
  http.post(`${api}/chat/rooms/:roomId/leave`, ({ params }) => {
    v1ChatRoomsFixture.items = v1ChatRoomsFixture.items.filter((item) => item.roomId !== params.roomId);
    return ok({ roomId: params.roomId, status: 'left' });
  }),
  http.get(`${api}/notifications`, () => ok(v1NotificationsFixture)),
  http.get(`${api}/reviews`, ({ request }) => {
    const tab = new URL(request.url).searchParams.get('tab');
    return ok(tab === 'written' ? v1ReviewsWrittenFixture : v1ReviewsPendingFixture);
  }),
  http.get(`${api}/reviews/received`, () => ok(v1ReviewsReceivedFixture)),
  http.get(`${api}/reviews/sources/:sourceType/:sourceId`, ({ params }) => {
    return ok(params.sourceType === 'team_match' ? v1ReviewTeamMatchSourceFixture : v1ReviewMatchSourceFixture);
  }),
  http.post(`${api}/reviews`, async ({ request }) => {
    const body = await request.json() as { targetTeamId?: string | null; targetUserId?: string | null };
    if (body.targetUserId === 'user-2') {
      return ok({ ...v1ReviewSubmitFixture, alreadySubmitted: true });
    }
    return ok(v1ReviewSubmitFixture);
  }),
  http.patch(`${api}/notifications/:notificationId/read`, ({ params }) => {
    const readAt = new Date().toISOString();
    const notification = v1NotificationsFixture.items.find((item) => item.notificationId === params.notificationId);
    if (notification) {
      notification.status = 'read';
      notification.readAt = readAt;
      v1NotificationsFixture.unreadCount = v1NotificationsFixture.items.filter((item) => item.status !== 'read').length;
    }
    return ok({ notificationId: params.notificationId, status: 'read', readAt });
  }),
  http.post(`${api}/notifications/read-all`, () => {
    const readAt = new Date().toISOString();
    const updatedCount = v1NotificationsFixture.items.filter((item) => item.status !== 'read').length;
    v1NotificationsFixture.items.forEach((item) => {
      item.status = 'read';
      item.readAt = item.readAt ?? readAt;
    });
    v1NotificationsFixture.unreadCount = 0;
    return ok({ updatedCount, readAt, unreadCount: 0 });
  }),
  http.get(`${api}/notification-preferences`, () => ok(v1SettingsFixture.notifications)),
  http.get(`${api}/me/profile`, () => ok(v1ProfileFixture)),
  http.get(`${api}/me/settings`, () => ok(v1SettingsFixture)),
  http.get(`${api}/admin/overview`, () => ok(v1AdminOverviewFixture)),
  http.get(`${api}/admin/action-logs`, () => ok(v1AdminLogsFixture)),
  http.get(api + '/admin/popups', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const status = params.get('status');
    const q = params.get('q')?.trim().toLowerCase();
    const statusSource = v1AdminPopupsFixture.filter((popup) => {
      if (q && !(popup.title + ' ' + popup.body).toLowerCase().includes(q)) return false;
      return true;
    });
    const rows = statusSource.filter((popup) => !status || popup.status === status);
    return ok({
      ...page(rows),
      summary: {
        total: statusSource.length,
        byStatus: countFacet(statusSource, ['published', 'archived', 'draft'], (popup) => popup.status),
      },
    });
  }),
  http.get(api + '/admin/popups/:popupId', ({ params }) => {
    const popup = v1AdminPopupsFixture.find((item) => item.popupId === params.popupId);
    return popup ? ok({ popup }) : HttpResponse.json({ status: 'error', message: 'Popup was not found' }, { status: 404 });
  }),
  http.post(api + '/admin/popups', async ({ request }) => {
    const body = await request.json() as V1AdminPopupCreatePayload;
    const now = '2026-05-18T10:00:00.000Z';
    const popup: V1AdminPopupRow = {
      popupId: 'popup-new',
      audience: body.audience,
      title: body.title,
      body: body.body ?? '',
      content: body.content,
      contentVersion: 1,
      targetScreens: body.targetScreens,
      targetPaths: body.targetPaths,
      linkUrl: body.linkUrl ?? null,
      linkLabel: body.linkLabel ?? null,
      status: body.status,
      publishedAt: body.status === 'published' ? now : null,
      archivedAt: body.status === 'archived' ? now : null,
      displayStartAt: body.displayStartAt ?? null,
      displayEndAt: body.displayEndAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    v1AdminPopupsFixture.unshift(popup);
    return ok({ popup });
  }),
  http.patch(api + '/admin/popups/:popupId', async ({ params, request }) => {
    const body = await request.json() as V1AdminPopupUpdatePayload;
    const index = v1AdminPopupsFixture.findIndex((popup) => popup.popupId === params.popupId);
    const previous = index >= 0 ? v1AdminPopupsFixture[index] : v1AdminPopupsFixture[0];
    const now = '2026-05-18T11:00:00.000Z';
    const popup: V1AdminPopupRow = {
      ...previous,
      ...body,
      body: body.body ?? previous.body,
      contentVersion: previous.contentVersion + 1,
      publishedAt: body.status === 'published' ? previous.publishedAt ?? now : null,
      archivedAt: body.status === 'archived' ? previous.archivedAt ?? now : null,
      updatedAt: now,
    };
    if (index >= 0) v1AdminPopupsFixture[index] = popup;
    return ok({ popup });
  }),
  http.delete(api + '/admin/popups/:popupId', ({ params }) => {
    const index = v1AdminPopupsFixture.findIndex((popup) => popup.popupId === params.popupId);
    if (index < 0) return HttpResponse.json({ status: 'error', message: 'Popup was not found' }, { status: 404 });
    v1AdminPopupsFixture.splice(index, 1);
    return ok({ popupId: params.popupId, deleted: true });
  }),
  http.get(`${api}/admin/notices`, ({ request }) => {
    const params = new URL(request.url).searchParams;
    const status = params.get('status');
    const category = params.get('category');
    const audience = params.get('audience');
    const q = params.get('q')?.trim().toLowerCase();
    const searched = v1AdminNoticesFixture.filter((notice) => {
      if (q && !`${notice.title} ${notice.body}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const statusSource = searched.filter((notice) => {
      if (category && notice.category !== category) return false;
      if (audience && notice.audience !== audience) return false;
      return true;
    });
    const audienceSource = searched.filter((notice) => {
      if (status && notice.status !== status) return false;
      if (category && notice.category !== category) return false;
      return true;
    });
    const rows = statusSource.filter((notice) => !status || notice.status === status);
    return ok({
      ...page(rows),
      summary: {
        total: statusSource.length,
        byStatus: countFacet(statusSource, ['published', 'draft', 'archived'], (notice) => notice.status),
        byAudience: countFacet(audienceSource, ['public', 'users', 'admins'], (notice) => notice.audience),
      },
    });
  }),
  http.get(`${api}/admin/notices/:noticeId`, ({ params }) => {
    const notice = v1AdminNoticesFixture.find((item) => item.noticeId === params.noticeId);
    return notice ? ok({ notice }) : notFound('Notice was not found');
  }),
  http.get(`${api}/admin/inquiries`, ({ request }) => {
    const params = new URL(request.url).searchParams;
    const status = params.get('status');
    const category = params.get('category');
    const reportReason = params.get('reportReason');
    const reportedTeamId = params.get('reportedTeamId');
    const q = params.get('q')?.trim().toLowerCase();
    // reportedTeamId 는 칩이 없는 딥링크 필터라 자기 facet이 없다 — searched 단계에서 걸러
    // 아래 세 facet(status/category/reportReason) 모두가 이미 걸러진 집합을 이어받게 한다
    // (admin.service.ts의 statusFacetWhere/categoryFacetWhere/reportReasonFacetWhere 미러).
    const searched = v1InquiriesFixture.items.map(toAdminInquiryRow).filter((inquiry) => {
      if (q && !`${inquiry.title} ${inquiry.requesterName ?? ''} ${inquiry.requesterEmail ?? ''}`.toLowerCase().includes(q)) return false;
      if (reportedTeamId && getReportedTeamIdForInquiry(inquiry.inquiryId) !== reportedTeamId) return false;
      return true;
    });
    // 각 facet 은 "자기 자신을 뺀 나머지 필터" 로 집계한다 — admin.service.ts의 실제 규칙을
    // 그대로 미러링한다(사유 하나를 골라도 다른 사유 칩 건수는 그대로 보여야 한다).
    const statusSource = searched.filter((inquiry) => {
      if (category && inquiry.category !== category) return false;
      if (reportReason && inquiry.reportReason !== reportReason) return false;
      return true;
    });
    const categorySource = searched.filter((inquiry) => {
      if (status && inquiry.status !== status) return false;
      if (reportReason && inquiry.reportReason !== reportReason) return false;
      return true;
    });
    const reportReasonSource = searched.filter((inquiry) => {
      if (status && inquiry.status !== status) return false;
      if (category && inquiry.category !== category) return false;
      return true;
    });
    const rows = statusSource.filter((inquiry) => !status || inquiry.status === status);
    return ok({
      ...page(rows),
      summary: {
        total: statusSource.length,
        byStatus: countFacet(statusSource, ['received', 'reviewing', 'answered', 'closed'], (inquiry) => inquiry.status),
        byCategory: countFacet(categorySource, ['account', 'match', 'team', 'tournament', 'payment_refund', 'report', 'other', 'tournament_hosting', 'partnership'], (inquiry) => inquiry.category),
        byReportReason: countFacet(reportReasonSource, ['spam', 'harassment', 'impersonation', 'inappropriate', 'other'], (inquiry) => inquiry.reportReason ?? ''),
        reportReasonTotal: reportReasonSource.length,
      },
    });
  }),
  http.get(`${api}/admin/inquiries/:inquiryId`, ({ params }) => {
    const inquiry = v1InquiriesFixture.items.find((item) => item.inquiryId === params.inquiryId) ?? v1InquiriesFixture.items[0];
    return ok(toAdminInquiryDetail(inquiry));
  }),
  http.get(`${api}/admin/reports/teams`, ({ request }) => {
    const limitParam = new URL(request.url).searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(Number(limitParam), 1), 50) : 20;
    return ok({ items: v1ReportedTeamsFixture.slice(0, limit), windowDays: v1ReportedTeamsWindowDays });
  }),
  http.post(`${api}/admin/inquiries/:inquiryId/block-reported-team`, ({ params }) => {
    const inquiryId = params.inquiryId as string;
    const reportedTeamId = getReportedTeamIdForInquiry(inquiryId);
    if (!reportedTeamId) {
      return HttpResponse.json(
        {
          status: 'error',
          statusCode: 409,
          code: 'REPORT_TARGET_UNKNOWN',
          message: '신고 대상 팀을 알 수 없어 차단할 수 없어요.',
          timestamp: '2026-05-18T00:00:00.000Z',
        },
        { status: 409 },
      );
    }
    // 멱등 — 두 번째 클릭도 에러가 아니라 200 + alreadyBlocked: true 여야 한다(admin.service.ts 실측, P2002 흡수).
    const alreadyBlocked = blockedInquiryIds.has(inquiryId);
    blockedInquiryIds.add(inquiryId);
    return ok({ blocked: true, alreadyBlocked, teamId: 'team-1', blockedTeamId: reportedTeamId });
  }),
  http.post(`${api}/admin/inquiries/:inquiryId/replies`, async ({ params, request }) => {
    const body = await request.json() as { body: string };
    const inquiry = v1InquiriesFixture.items.find((item) => item.inquiryId === params.inquiryId) ?? v1InquiriesFixture.items[0];
    const now = new Date().toISOString();
    inquiry.status = 'answered';
    inquiry.updatedAt = now;
    inquiry.replies = [
      ...(inquiry.replies ?? []),
      {
        replyId: `reply-${(inquiry.replies?.length ?? 0) + 1}`,
        adminName: '운영팀',
        adminRole: 'ops',
        body: body.body,
        createdAt: now,
        updatedAt: now,
      },
    ];
    return ok(toAdminInquiryDetail(inquiry));
  }),
  http.post(`${api}/admin/inquiries/:inquiryId/status`, async ({ params, request }) => {
    const body = await request.json() as { status: V1Inquiry['status']; reason?: string };
    const inquiry = v1InquiriesFixture.items.find((item) => item.inquiryId === params.inquiryId) ?? v1InquiriesFixture.items[0];
    const previousStatus = inquiry.status;
    inquiry.status = body.status;
    inquiry.closedAt = body.status === 'closed' ? new Date().toISOString() : null;
    inquiry.updatedAt = new Date().toISOString();
    return ok({
      inquiryId: params.inquiryId,
      previousStatus,
      status: body.status,
      actionLogId: 'action-inquiry',
      statusChangeLogId: 'status-inquiry',
    });
  }),
  http.post(`${api}/admin/notices`, async ({ request }) => {
    const body = await request.json() as V1AdminNoticeCreatePayload;
    const now = '2026-05-18T10:00:00.000Z';
    const notice: V1AdminNoticeRow = {
      noticeId: 'notice-new',
      audience: body.audience,
      category: body.category,
      title: body.title,
      body: body.body ?? '',
      content: body.content,
      contentVersion: 1,
      status: body.status,
      publishedAt: body.status === 'published' ? now : null,
      archivedAt: body.status === 'archived' ? now : null,
      createdAt: now,
      updatedAt: now,
    };
    v1AdminNoticesFixture.unshift(notice);
    return ok({ notice });
  }),
  http.patch(`${api}/admin/notices/:noticeId`, async ({ params, request }) => {
    const body = await request.json() as V1AdminNoticeUpdatePayload;
    const now = '2026-05-18T11:00:00.000Z';
    const index = v1AdminNoticesFixture.findIndex((notice) => notice.noticeId === params.noticeId);
    const previous = index >= 0 ? v1AdminNoticesFixture[index] : v1AdminNoticesFixture[0];
    const category = body.category;
    const notice = {
      ...previous,
      audience: body.audience,
      category,
      title: body.title,
      body: body.body ?? previous.body,
      content: body.content,
      contentVersion: previous.contentVersion + 1,
      status: body.status,
      publishedAt: body.status === 'published' ? previous.publishedAt ?? now : null,
      archivedAt: body.status === 'archived' ? previous.archivedAt ?? now : null,
      updatedAt: now,
    };
    if (index >= 0) v1AdminNoticesFixture[index] = notice;
    return ok({ notice });
  }),
  http.delete(`${api}/admin/notices/:noticeId`, ({ params }) => {
    const index = v1AdminNoticesFixture.findIndex((notice) => notice.noticeId === params.noticeId);
    if (index < 0) return notFound('Notice was not found');
    v1AdminNoticesFixture.splice(index, 1);
    return ok({ noticeId: params.noticeId, deleted: true });
  }),

  // ── Team schedules (Task 12/13) ───────────────────────────────────────────
  http.get(`${api}/teams/:teamId/schedules`, ({ params }) => {
    const items = params.teamId === v1ScheduleFixture.teamId ? [scheduleSummary()] : [];
    return ok({ items, nextCursor: null });
  }),
  http.get(`${api}/teams/:teamId/schedules/:scheduleId`, () => ok(scheduleDetail())),
  http.post(`${api}/teams/:teamId/schedules`, async ({ params, request }) => {
    const body = await request.json() as V1CreateScheduleDto;
    // class-transformer는 String metadata의 스칼라를 변환하지만 null/omit과 배열은 유지한다.
    const toDtoString = (value: unknown) => value == null || typeof value === 'object' ? value : String(value);
    const dates = { startAt: toDtoString(body.startAt), endAt: toDtoString(body.endAt) };
    const { startAt, endAt } = dates;
    // @IsDateString() 기본 옵션과 같은 validator를 사용해 DTO 오류를 service422와 구분한다.
    const invalidDates = (['startAt', 'endAt'] as const).filter((field) => {
      const value = dates[field];
      return typeof value !== 'string' || !isISO8601(value);
    });
    if (typeof startAt !== 'string' || typeof endAt !== 'string' || invalidDates.length) {
      return HttpResponse.json(
        {
          status: 'error', statusCode: 400, code: 'VALIDATION_ERROR', message: '입력값을 다시 확인해 주세요.',
          details: invalidDates.map((field) => ({ field, messages: [`${field} must be a valid ISO 8601 date string`] })),
        },
        { status: 400 },
      );
    }
    // 서버 계약을 그대로 흉내낸다. 이 mock 이 MATCH 나 teamMatchId 를 받아주면, 프로덕션에서
    // 422/400 으로 실패할 호출이 테스트에서는 조용히 통과한다 — mock 이 서버보다 관대하면
    // 테스트가 거짓말을 한다. 이전에는 "이 경로는 항상 TRAINING/EVENT 만 받는다" 를 주석으로만
    // 주장했고 코드로 강제하지 않았다.
    const raw = body as Record<string, unknown>;
    if (raw.type === 'MATCH') {
      return HttpResponse.json(
        { status: 'error', code: 'SCHEDULE_MATCH_TYPE_SYSTEM_ONLY', message: 'MATCH 일정은 시스템만 만들 수 있어요.' },
        { status: 422 },
      );
    }
    if ('teamMatchId' in raw) {
      return HttpResponse.json(
        { status: 'error', code: 'BAD_REQUEST', message: 'property teamMatchId should not exist' },
        { status: 400 },
      );
    }
    const startDate = new Date(startAt);
    const endDate = new Date(endAt);
    if (!(endDate.getTime() > startDate.getTime())) {
      return HttpResponse.json(
        { status: 'error', statusCode: 422, code: 'SCHEDULE_INVALID_TIME_RANGE', message: 'Schedule end time must be after start time' },
        { status: 422 },
      );
    }
    v1ScheduleFixture = {
      ...v1ScheduleFixture,
      teamId: String(params.teamId),
      title: body.title,
      type: body.type,
      startAt: startDate.toISOString(),
      endAt: endDate.toISOString(),
      timezone: body.timezone,
      capacity: body.capacity ?? null,
      rsvpDeadlineAt: body.rsvpDeadlineAt ?? null,
      visibility: body.visibility ?? 'TEAM',
      // 매치 ↔ 팀일정 연동: teamMatchId는 V1CreateScheduleDto에서 제거됐다 — MATCH 타입
      // 스케줄은 이제 TeamMatchesService가 시스템으로만 만든다. 이 mock 경로는 항상 TRAINING/
      // EVENT만 받으므로 teamMatchId/matchConfirmed는 v1ScheduleFixture의 기존 값(null)을
      // 그대로 spread로 물려받는다.
      state: 'SCHEDULED',
      version: 0,
      cancelReason: null,
      cancelledAt: null,
    };
    return ok(scheduleMutationResult());
  }),
  http.patch(`${api}/teams/:teamId/schedules/:scheduleId`, async ({ request }) => {
    const body = await request.json() as V1UpdateScheduleDto;
    const toDtoString = (value: unknown) => value == null || typeof value === 'object' ? value : String(value);
    const dates = { startAt: toDtoString(body.startAt), endAt: toDtoString(body.endAt) };
    const { startAt, endAt } = dates;
    const rawVersion: unknown = body.expectedVersion;
    const expectedVersion = rawVersion == null || typeof rawVersion === 'object' ? rawVersion : Number(rawVersion);
    const versionMessages: string[] = [];
    if (typeof expectedVersion !== 'number' || !(expectedVersion >= 0)) {
      versionMessages.push('expectedVersion must not be less than 0');
    }
    if (!Number.isInteger(expectedVersion)) versionMessages.push('expectedVersion must be an integer number');
    // @IsOptional()은 null/omit을 건너뛰며, supplied DTO 오류는 모든 service gate보다 먼저 거부한다.
    const invalidDates = (['startAt', 'endAt'] as const).filter((field) => {
      const value = dates[field];
      return value != null && (typeof value !== 'string' || !isISO8601(value));
    });
    if (typeof expectedVersion !== 'number' || versionMessages.length ||
      (startAt != null && typeof startAt !== 'string') || (endAt != null && typeof endAt !== 'string') || invalidDates.length) {
      return HttpResponse.json(
        {
          status: 'error', statusCode: 400, code: 'VALIDATION_ERROR', message: '입력값을 다시 확인해 주세요.',
          details: [
            ...(versionMessages.length ? [{ field: 'expectedVersion', messages: versionMessages }] : []),
            ...invalidDates.map((field) => ({ field, messages: [`${field} must be a valid ISO 8601 date string`] })),
          ],
        },
        { status: 400 },
      );
    }
    // 서버와 같은 version → terminal → effective range 순서로, fixture 변경 전에 거부한다.
    if (expectedVersion !== v1ScheduleFixture.version) {
      return HttpResponse.json(
        {
          status: 'error', statusCode: 409, code: 'VERSION_CONFLICT', message: 'Schedule version is stale',
          details: { expectedVersion, currentVersion: v1ScheduleFixture.version },
        },
        { status: 409 },
      );
    }
    if (v1ScheduleFixture.state !== 'SCHEDULED') {
      return HttpResponse.json(
        { status: 'error', statusCode: 409, code: 'SCHEDULE_TERMINAL', message: 'Schedule is already terminal' },
        { status: 409 },
      );
    }
    const startDate = new Date(startAt ?? v1ScheduleFixture.startAt);
    const endDate = new Date(endAt ?? v1ScheduleFixture.endAt);
    if (!(endDate.getTime() > startDate.getTime())) {
      return HttpResponse.json(
        { status: 'error', statusCode: 422, code: 'SCHEDULE_INVALID_TIME_RANGE', message: 'Schedule end time must be after start time' },
        { status: 422 },
      );
    }
    if (body.title !== undefined) v1ScheduleFixture.title = body.title;
    if (startAt != null) v1ScheduleFixture.startAt = startDate.toISOString();
    if (endAt != null) v1ScheduleFixture.endAt = endDate.toISOString();
    if (body.capacity !== undefined) v1ScheduleFixture.capacity = body.capacity;
    if (body.rsvpDeadlineAt !== undefined) v1ScheduleFixture.rsvpDeadlineAt = body.rsvpDeadlineAt;
    if (body.visibility !== undefined) v1ScheduleFixture.visibility = body.visibility;
    v1ScheduleFixture.version += 1;
    return ok(scheduleMutationResult());
  }),
  http.post(`${api}/teams/:teamId/schedules/:scheduleId/cancel`, async ({ request }) => {
    const body = await request.json() as V1CancelScheduleDto;
    const cancelledAt = new Date().toISOString();
    v1ScheduleFixture.state = 'CANCELLED';
    v1ScheduleFixture.cancelReason = body.cancelReason;
    v1ScheduleFixture.cancelledAt = cancelledAt;
    v1ScheduleFixture.version += 1;
    return ok({ state: 'cancelled' as const, version: v1ScheduleFixture.version, cancelledAt, replayed: false });
  }),
  http.post(`${api}/teams/:teamId/schedules/:scheduleId/complete`, () => {
    const completedAt = new Date().toISOString();
    v1ScheduleFixture.state = 'COMPLETED';
    v1ScheduleFixture.version += 1;
    return ok({ state: 'completed' as const, version: v1ScheduleFixture.version, completedAt, replayed: false });
  }),
  http.post(`${api}/teams/:teamId/schedules/:scheduleId/reminders`, async ({ request }) => {
    const body = await request.json() as V1TriggerScheduleReminderDto;
    return ok({ jobId: `reminder-job-${Date.now()}`, kind: body.kind, status: 'queued', replayed: false });
  }),
  http.put(`${api}/teams/:teamId/schedules/:scheduleId/attendance/me`, async ({ request }) => {
    const body = await request.json() as V1SetScheduleAttendanceDto;
    const previous = v1MyAttendance.status;
    if (previous === 'GOING') v1ScheduleAttendanceCounts.going = Math.max(0, v1ScheduleAttendanceCounts.going - 1);
    if (previous === 'MAYBE') v1ScheduleAttendanceCounts.maybe = Math.max(0, v1ScheduleAttendanceCounts.maybe - 1);
    if (previous === 'NOT_GOING') v1ScheduleAttendanceCounts.notGoing = Math.max(0, v1ScheduleAttendanceCounts.notGoing - 1);
    if (previous === 'WAITLISTED') v1ScheduleAttendanceCounts.waitlisted = Math.max(0, v1ScheduleAttendanceCounts.waitlisted - 1);
    const capacity = v1ScheduleFixture.capacity;
    // 서버는 GOING이 정원을 채우면 WAITLISTED로 파생시킨다 — 클라이언트는 GOING/MAYBE/NOT_GOING만
    // 보낼 수 있다(V1ClientSettableAttendanceStatus), WAITLISTED 승격은 이 목만 유일한 경로.
    const isFull = body.status === 'GOING' && capacity !== null && v1ScheduleAttendanceCounts.going >= capacity;
    const nextStatus = isFull ? 'WAITLISTED' : body.status;
    if (nextStatus === 'GOING') v1ScheduleAttendanceCounts.going += 1;
    if (nextStatus === 'MAYBE') v1ScheduleAttendanceCounts.maybe += 1;
    if (nextStatus === 'NOT_GOING') v1ScheduleAttendanceCounts.notGoing += 1;
    if (nextStatus === 'WAITLISTED') v1ScheduleAttendanceCounts.waitlisted += 1;
    v1MyAttendance = {
      status: nextStatus,
      version: v1MyAttendance.version + 1,
      waitlistPosition: nextStatus === 'WAITLISTED' ? v1ScheduleAttendanceCounts.waitlisted : null,
    };
    return ok({
      status: v1MyAttendance.status,
      version: v1MyAttendance.version,
      waitlistPosition: v1MyAttendance.waitlistPosition,
      counts: { ...v1ScheduleAttendanceCounts },
      replayed: false,
    });
  }),
  http.post(`${api}/teams/:teamId/schedules/:scheduleId/guest-recruitment`, async ({ params, request }) => {
    const body = await request.json() as V1CreateGuestRecruitmentDto;
    v1GuestRecruitmentFixture = {
      id: 'guest-rec-1',
      scheduleId: String(params.scheduleId),
      slots: body.slots,
      closesAt: body.closesAt,
      note: body.note ?? null,
      visibility: body.visibility ?? 'MEMBERS',
      state: 'OPEN',
      version: 1,
      applicantCount: 0,
      approvedCount: 0,
    };
    v1GuestApplications = [];
    return ok({ ...v1GuestRecruitmentFixture, replayed: false });
  }),
  http.patch(`${api}/teams/:teamId/schedules/:scheduleId/guest-recruitment`, async ({ request }) => {
    const body = await request.json() as V1UpdateGuestRecruitmentDto;
    if (!v1GuestRecruitmentFixture) return notFound('Guest recruitment was not found');
    if (body.slots !== undefined) v1GuestRecruitmentFixture.slots = body.slots;
    if (body.closesAt !== undefined) v1GuestRecruitmentFixture.closesAt = body.closesAt;
    if (body.note !== undefined) v1GuestRecruitmentFixture.note = body.note;
    if (body.visibility !== undefined) v1GuestRecruitmentFixture.visibility = body.visibility;
    if (body.state !== undefined) v1GuestRecruitmentFixture.state = body.state === 'open' ? 'OPEN' : 'CLOSED';
    v1GuestRecruitmentFixture.version += 1;
    return ok({ ...v1GuestRecruitmentFixture, replayed: false });
  }),
  http.post(`${api}/teams/:teamId/schedules/:scheduleId/guest-recruitment/applications`, async ({ request }) => {
    const body = await request.json() as V1CreateGuestApplicationDto;
    const existing = v1GuestApplications.find((item) => item.displayName === body.displayName);
    if (existing) {
      return ok({
        applicationId: existing.applicationId,
        state: existing.state,
        displayName: existing.displayName,
        note: existing.note,
        alreadyApplied: true,
        replayed: false,
      });
    }
    const application = {
      applicationId: `guest-app-${v1GuestApplications.length + 1}`,
      state: 'PENDING' as const,
      displayName: body.displayName,
      note: body.note ?? null,
    };
    v1GuestApplications.push(application);
    if (v1GuestRecruitmentFixture) v1GuestRecruitmentFixture.applicantCount += 1;
    return ok({ ...application, alreadyApplied: false, replayed: false });
  }),
  http.get(`${api}/me/schedule`, () => ok({
    items: [
      {
        ...scheduleSummary(),
        teamId: v1ScheduleFixture.teamId,
        teamName: '성수 볼러즈',
        myRole: 'owner',
        myAttendanceStatus: v1MyAttendance.status,
      },
    ],
    nextCursor: null,
  })),

  // The stock mock lineup is a draft: do not simulate successful shared writes.
  // Interactive shared-record tests override these handlers with their own contract fixtures.
  http.get(`${api}/team-matches/:teamMatchId/record`, ({ params }) => {
    const match = v1TeamMatchesFixture.find((item) => item.id === params.teamMatchId);
    if (!match || params.teamMatchId !== 'team-match-1') return HttpResponse.json({ message: '경기를 찾을 수 없어요.' }, { status: 404 });
    return ok({
      teamMatchId: match.id, title: match.title, startsAt: match.startsAt ?? null,
      leagueId: null, tournamentId: null,
      phase: v1GameResultRevisions.length ? 'legacy' : 'scheduled', version: 0,
      serverTime: new Date().toISOString(), canEdit: false, participant: false, operator: false, ownSideId: null,
      lineupReady: false,
      missingSides: v1GameFixture.sides.map((side) => ({ sideId: side.id, sideKey: side.sideKey, teamName: side.displayNameSnapshot })),
      sides: v1GameFixture.sides.map((side) => ({ id: side.id, key: side.sideKey, name: side.displayNameSnapshot, score: null })),
      participants: [], subMatches: [], goals: [], history: [], confirmations: [], officialAt: null, officialCorrected: false,
    } satisfies SharedRecord);
  }),
  http.post(`${api}/team-matches/:teamMatchId/record`, () => HttpResponse.json({
    code: 'RECORD_PARTICIPANT_REQUIRED', message: '양 팀의 제출된 라인업 참가자와 플랫폼 주관 경기의 운영자만 기록할 수 있어요.',
  }, { status: 403 })),

  // ── Task 17: games / result revisions / team-match lineup ─────────────────
  http.get(`${api}/games/:gameId`, () => ok({
    ...v1GameFixture,
    lineups: v1FriendlyGameLineups.map(({ id, gameId, sideId, revision, state, version, submittedAt, supersedesId, invalidatedAt }) =>
      ({ id, gameId, sideId, revision, state, version, submittedAt, supersedesId, invalidatedAt })),
  })),
  http.get(`${api}/games/:gameId/lineups`, ({ params }) => {
    if (params.gameId !== v1GameFixture.id) return HttpResponse.json({ code: 'GAME_NOT_FOUND', message: '경기를 찾을 수 없어요.' }, { status: 404 });
    // The scheduled team-owner actor sees only its own side. A saved draft is
    // still a default preview for record consumers until the human submits it.
    return ok(v1FriendlyGameLineups.map((lineup) => {
      if (lineup.id !== v1TeamMatchLineupFixture.lineupId || v1TeamMatchLineupFixture.state !== 'DRAFT') return lineup;
      return { ...lineup, participants: friendlyGameLineup({ ...v1TeamMatchLineupFixture, starters: v1FriendlyDefaultParticipants }, lineup.supersedesId, lineup.createdAt).participants };
    }));
  }),
  http.get(`${api}/games/:gameId/result-revisions`, () => ok(v1GameResultRevisions)),
  http.post(`${api}/games/:gameId/result-revisions`, async ({ request }) => {
    const body = await request.json() as V1CreateGameResultRevisionPayload;
    const now = new Date().toISOString();
    const revisionId = `revision-${v1GameResultRevisions.length + 1}`;
    const revision: V1GameResultRevision = {
      id: revisionId,
      gameId: v1GameFixture.id,
      revision: v1GameResultRevisions.length + 1,
      state: 'DRAFT',
      // 서버는 제출받은 평평한 {home,away} 를 그대로 돌려주지 않고 스냅샷으로 감싼다.
      // 예전에는 이 목이 입력을 그대로 되돌려줘서, 실제로는 화면이 읽지 못하는 형태인데도
      // 테스트가 통과했다.
      score: {
        regulation: { home: body.score.home, away: body.score.away },
        penalty: null,
        goals: [],
        incomplete: false,
      },
      eventsHash: body.eventsHash,
      missingScorer: false,
      mvpParticipantId: body.mvpParticipantId ?? null,
      reason: body.reason ?? null,
      outcomeReason: 'NORMAL',
      outcomeNote: null,
      createdByActorType: 'USER',
      createdByUserId: 'user-1',
      createdByName: '스태프 닉네임',
      createdBySystemActor: null,
      supersedesId: null,
      submittedAt: null,
      officialAt: null,
      createdAt: now,
      updatedAt: now,
      resultParticipants: body.actualParticipants.map((participant, index) => ({
        id: `result-participant-${index + 1}`,
        resultRevisionId: revisionId,
        participantId: participant.participantId,
        sideId: participant.sideId,
        started: participant.started,
        minutesPlayed: participant.minutesPlayed ?? null,
        goals: participant.goals,
        assists: participant.assists,
        fouls: participant.fouls,
        cards: participant.cards,
        goalkeeper: participant.goalkeeper,
      })),
    };
    v1GameResultRevisions.unshift(revision);
    v1GameFixture.version += 1;
    return ok({
      gameId: v1GameFixture.id,
      state: v1GameFixture.state,
      version: v1GameFixture.version,
      durableCommandId: `command-${Date.now()}`,
      replayed: false,
      revisionId: revision.id,
      revision: revision.revision,
      revisionState: revision.state,
    });
  }),
  http.post(`${api}/games/:gameId/result-revisions/:revisionId/submit`, ({ params }) => {
    const revision = v1GameResultRevisions.find((item) => item.id === params.revisionId) ?? v1GameResultRevisions[0];
    const now = new Date().toISOString();
    if (revision) {
      revision.state = 'SUBMITTED';
      revision.submittedAt = now;
      revision.updatedAt = now;
    }
    v1GameFixture.version += 1;
    return ok({
      gameId: v1GameFixture.id,
      state: v1GameFixture.state,
      version: v1GameFixture.version,
      durableCommandId: `command-${Date.now()}`,
      replayed: false,
      revisionId: revision?.id ?? String(params.revisionId),
      revision: revision?.revision ?? 1,
      revisionState: revision?.state ?? 'SUBMITTED',
    });
  }),
  http.post(`${api}/games/:gameId/result-revisions/:revisionId/decision`, async ({ params, request }) => {
    const body = await request.json() as V1DecideGameResultRevisionPayload;
    const revision = v1GameResultRevisions.find((item) => item.id === params.revisionId) ?? v1GameResultRevisions[0];
    const now = new Date().toISOString();
    if (revision) {
      revision.state = body.decision === 'approve' ? 'OFFICIAL' : 'CHANGE_REQUESTED';
      revision.officialAt = body.decision === 'approve' ? now : revision.officialAt;
      revision.reason = body.decision === 'change_request' ? body.reason ?? null : revision.reason;
      revision.updatedAt = now;
      if (revision.state === 'OFFICIAL') {
        v1GameFixture.currentOfficialRevisionId = revision.id;
        v1GameFixture.state = 'ENDED';
      }
    }
    v1GameFixture.version += 1;
    return ok({
      gameId: v1GameFixture.id,
      state: v1GameFixture.state,
      version: v1GameFixture.version,
      durableCommandId: `command-${Date.now()}`,
      replayed: false,
      revisionId: revision?.id ?? String(params.revisionId),
      revision: revision?.revision ?? 1,
      revisionState: revision?.state ?? 'CHANGE_REQUESTED',
    });
  }),
  http.get(`${api}/team-matches/:teamMatchId/lineup`, () => ok(v1TeamMatchLineupFixture)),
  // 기본 픽스처의 상대는 아직 미제출이다(opponent.submitted=false) — 서버와 같은 404 를 준다.
  // 공개 뒤 화면을 보는 테스트는 이 핸들러를 덮어쓴다.
  http.get(`${api}/team-matches/:teamMatchId/lineup/opponent`, () => HttpResponse.json({
    code: 'OPPONENT_LINEUP_NOT_SUBMITTED', message: '상대 팀이 아직 참석명단을 내지 않았어요.',
  }, { status: 404 })),
  // 기본 픽스처는 초안이라 추가만 창이 닫혀 있다(lateAdditionAllowed=false) — 서버처럼 409.
  http.post(`${api}/team-matches/:teamMatchId/lineup/late-additions`, () => HttpResponse.json({
    code: 'LINEUP_NOT_LOCKED', message: '아직 경기 기록 전이라 참석명단에서 바로 넣을 수 있어요.',
  }, { status: 409 })),
  http.put(`${api}/team-matches/:teamMatchId/lineup`, async ({ request }) => {
    const body: V1TeamMatchLineupSavePayload = await request.json();
    const versionFailure = friendlyLineupVersionFailure(body.expectedVersion);
    if (versionFailure) return versionFailure;
    const previousLineupId = v1TeamMatchLineupFixture.lineupId;
    v1TeamMatchLineupFixture = {
      ...v1TeamMatchLineupFixture,
      lineupId: randomUuid(),
      revision: v1TeamMatchLineupFixture.revision + 1,
      version: v1TeamMatchLineupFixture.revision + 1,
      // 서버와 같다(Task 180 R-2): 이미 낸 명단의 저장은 곧바로 새 제출본, 초안의 저장은 초안.
      state: v1TeamMatchLineupFixture.state === 'DRAFT' ? 'DRAFT' : 'SUBMITTED',
      effectiveRosterSource: v1TeamMatchLineupFixture.state === 'DRAFT' ? 'DEFAULT_PREVIEW' : 'MANUAL',
      hasSavedDraft: v1TeamMatchLineupFixture.state === 'DRAFT',
      formation: body.formation ?? null,
      // 서버(`rosterOf`)와 **같은 규칙**: `participants` 가 **비어 있지 않을 때만** 그것이
      // 명단이고, 그 밖에는 옛 `starters`+`bench` 를 합친다. `??` 로 쓰면 빈 배열에서
      // 갈린다 — 서버는 `length > 0` 을 보므로 `participants: []` 를 받으면 레거시 두
      // 배열로 넘어가는데, mock 만 빈 명단을 만들어 화면 테스트가 서버와 다른 것을 본다.
      // 응답은 아직 `starters`/`bench` 모양이라 전원을 `starters` 에 싣고 `bench` 는
      // 비운다(#978 이후의 실제 서버 동작).
      starters: (body.participants?.length
        ? body.participants
        : [...(body.starters ?? []), ...(body.bench ?? [])]
      ).map((participant) => ({
        // **`id` 는 `V1GameParticipant.id` 이고 `userId` 와 별개다.** 예전 mock 은 여기에
        // `userId` 를 그대로 넣어, `participantId` 를 `userId` 로 잘못 다루는 코드가
        // 있어도 테스트가 통과했다(결과 입력 폼의 골·카드 귀속이 그 값을 쓴다).
        // 실제 참가자처럼 독립된 UUID를 발급해 사용자 ID와 갈라 둔다.
        id: randomUuid(),
        // 서버와 같다: 저장 요청이 실어 보낸 사람 연결을 응답이 그대로 되돌려준다.
        // 게스트는 계정이 없으므로 null.
        userId: participant.userId ?? null,
        displayName: v1TeamMatchLineupFixture.eligibleMembers?.find((member) => member.userId === participant.userId)?.displayName ?? participant.displayName ?? '이름 미확인',
        jerseyNumber: participant.jerseyNumber ?? null,
        position: participant.position ?? null,
        goalkeeper: participant.goalkeeper ?? false,
        positionX: participant.positionX ?? null,
        positionY: participant.positionY ?? null,
      })),
      bench: [],
    };
    v1FriendlyGameLineups.unshift(friendlyGameLineup(v1TeamMatchLineupFixture, previousLineupId));
    if (v1TeamMatchLineupFixture.state === 'DRAFT') {
      // Preview IDs are stable per basis lineup; saving creates a new basis.
      v1FriendlyDefaultParticipants = v1FriendlyDefaultParticipants.map((participant) => ({ ...participant, id: randomUuid() }));
    }
    return ok({
      teamMatchId: v1TeamMatchLineupFixture.teamMatchId,
      gameId: v1TeamMatchLineupFixture.gameId,
      sideId: v1TeamMatchLineupFixture.sideId,
      lineupId: v1TeamMatchLineupFixture.lineupId,
      revision: v1TeamMatchLineupFixture.revision,
      state: v1TeamMatchLineupFixture.state,
      version: v1TeamMatchLineupFixture.version,
      replayed: false,
    });
  }),
  http.post(`${api}/team-matches/:teamMatchId/lineup/submit`, async ({ request }) => {
    const body: { expectedVersion: number } = await request.json();
    const versionFailure = friendlyLineupVersionFailure(body.expectedVersion);
    if (versionFailure) return versionFailure;
    // 서버와 같다(Task 180 R-2): 이미 낸 명단을 다시 내면 아무것도 바꾸지 않고 지금 상태로 성공한다.
    if (v1TeamMatchLineupFixture.state === 'DRAFT') {
      const previousLineupId = v1TeamMatchLineupFixture.lineupId;
      const pristineDefault = v1TeamMatchLineupFixture.effectiveRosterSource === 'DEFAULT_PREVIEW' && !v1TeamMatchLineupFixture.hasSavedDraft;
      const revision = v1TeamMatchLineupFixture.revision + (pristineDefault ? 1 : 0);
      v1TeamMatchLineupFixture = {
        ...v1TeamMatchLineupFixture,
        lineupId: pristineDefault ? randomUuid() : previousLineupId,
        revision, version: revision, state: 'SUBMITTED',
        starters: pristineDefault ? v1FriendlyDefaultParticipants : v1TeamMatchLineupFixture.starters,
        publicLineupAt: v1TeamMatchLineupFixture.publicLineupAt ?? new Date().toISOString(),
      };
      if (pristineDefault) {
        v1FriendlyGameLineups.unshift(friendlyGameLineup(v1TeamMatchLineupFixture, previousLineupId));
      } else {
        const saved = v1FriendlyGameLineups.find((lineup) => lineup.id === previousLineupId);
        if (saved) {
          saved.state = 'SUBMITTED';
          saved.version += 1;
          saved.submittedAt = new Date().toISOString();
          saved.updatedAt = saved.submittedAt;
        }
      }
    }
    v1TeamMatchLineupFixture.effectiveRosterSource = 'MANUAL';
    v1TeamMatchLineupFixture.hasSavedDraft = false;
    const publicLineupAt = v1TeamMatchLineupFixture.publicLineupAt;
    return ok({
      teamMatchId: v1TeamMatchLineupFixture.teamMatchId,
      gameId: v1TeamMatchLineupFixture.gameId,
      sideId: v1TeamMatchLineupFixture.sideId,
      lineupId: v1TeamMatchLineupFixture.lineupId,
      revision: v1TeamMatchLineupFixture.revision,
      state: v1TeamMatchLineupFixture.state,
      version: v1TeamMatchLineupFixture.version,
      replayed: false,
      publicLineupAt,
    });
  }),
  http.post(`${api}/team-matches/:teamMatchId/lineup/change-request`, async ({ request }) => {
    const body = await request.json() as { expectedVersion: number; reason: string };
    v1TeamMatchLineupFixture.version += 1;
    return ok({
      teamMatchId: v1TeamMatchLineupFixture.teamMatchId,
      gameId: v1TeamMatchLineupFixture.gameId,
      sideId: v1TeamMatchLineupFixture.sideId,
      lineupId: v1TeamMatchLineupFixture.lineupId ?? 'lineup-1',
      revision: v1TeamMatchLineupFixture.revision,
      state: 'change_requested' as const,
      version: v1TeamMatchLineupFixture.version,
      reason: body.reason,
      replayed: false,
    });
  }),

  // ── Tournament operations board/staff/fields (Task 18/19) ─────────────────
  http.get(`${api}/tournament-ops/tournaments/:tournamentId/operations`, () => ok({
    items: v1TournamentOperationsBoardItems,
    nextCursor: null,
    watermark: '2026-05-18T00:00:00.000Z',
    liveWarnings: [],
  })),
  http.get(`${api}/tournament-ops/tournaments/:tournamentId/staff`, () => ok({ items: v1TournamentStaffAssignments })),
  http.post(`${api}/tournament-ops/tournaments/:tournamentId/staff`, async ({ params, request }) => {
    const body = await request.json() as V1GrantTournamentStaffPayload;
    const assignment: V1TournamentStaffAssignment = {
      id: `staff-${v1TournamentStaffAssignments.length + 1}`,
      tournamentId: String(params.tournamentId),
      userId: body.userId,
      role: body.role,
      fieldId: body.fieldId ?? null,
      fixtureIds: body.fixtureIds ?? [],
      version: 1,
      expiresAt: body.expiresAt ?? null,
      revokedAt: null,
      grantedByUserId: 'user-1',
      createdAt: new Date().toISOString(),
    };
    v1TournamentStaffAssignments.push(assignment);
    return ok(assignment);
  }),
  http.post(`${api}/tournament-ops/tournaments/:tournamentId/staff/:assignmentId/revoke`, ({ params }) => {
    const assignment = v1TournamentStaffAssignments.find((item) => item.id === params.assignmentId);
    if (!assignment) return notFound('Staff assignment was not found');
    assignment.revokedAt = new Date().toISOString();
    assignment.version += 1;
    return ok(assignment);
  }),
  http.get(`${api}/tournament-ops/tournaments/:tournamentId/fields`, ({ params }) =>
    ok({ items: v1TournamentFields.filter((field) => field.tournamentId === params.tournamentId) })),
  http.post(`${api}/tournament-ops/tournaments/:tournamentId/fields`, async ({ params, request }) => {
    const body = await request.json() as { name?: string; scopeKey?: string; sortOrder?: number };
    const name = body.name?.trim() ?? '';
    if (!name || name.length > 120 || !body.scopeKey || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(body.scopeKey)) {
      return HttpResponse.json({ status: 'error', code: 'VALIDATION_ERROR', message: '경기장 이름과 코드를 확인해 주세요.' }, { status: 422 });
    }
    const same = v1TournamentFields.filter((field) => field.tournamentId === params.tournamentId);
    if (same.some((field) => field.name.trim().toLowerCase() === name.toLowerCase() || field.scopeKey === body.scopeKey)) {
      return HttpResponse.json({ status: 'error', code: 'FIELD_NAME_DUPLICATE', message: '이미 등록된 경기장이에요.' }, { status: 409 });
    }
    const field = { id: randomUuid(), tournamentId: String(params.tournamentId), scopeKey: body.scopeKey, name,
      sortOrder: body.sortOrder ?? 0, active: true, version: 0,
      place: { name, address: null, latitude: null, longitude: null, provider: null, providerPlaceId: null } };
    v1TournamentFields.push(field);
    return HttpResponse.json({ status: 'success', data: field, timestamp: '2026-05-18T00:00:00.000Z' }, { status: 201 });
  }),
  http.post(`${api}/tournament-ops/tournaments/:tournamentId/fields/import-places`, ({ params }) => {
    let addedCount = 0;
    let existingCount = 0;
    const seen = new Set<string>();
    for (const fixture of v1CompetitionFixturePlaces.filter((row) => row.tournamentId === params.tournamentId)) {
      const name = fixture.place.name.trim();
      const key = name.toLowerCase();
      if (!key || ['장소 미정', '미정', 'tbd'].includes(key) || seen.has(key)) continue;
      seen.add(key);
      if (v1TournamentFields.some((field) => field.tournamentId === params.tournamentId && field.name.trim().toLowerCase() === key)) { existingCount++; continue; }
      v1TournamentFields.push({ id: randomUuid(), tournamentId: String(params.tournamentId), scopeKey: `place-${randomUuid()}`, name,
        sortOrder: v1TournamentFields.length, active: true, version: 0, place: { ...fixture.place } });
      addedCount++;
    }
    for (const fixture of v1CompetitionFixturePlaces.filter((row) => row.tournamentId === params.tournamentId && row.fieldId === null)) {
      const field = v1TournamentFields.find((entry) => entry.tournamentId === params.tournamentId && entry.name.trim().toLowerCase() === fixture.place.name.trim().toLowerCase());
      if (!field) continue;
      fixture.fieldId = field.id;
      const item = v1TournamentOperationsBoardItems.find((entry) => entry.fixtureId === fixture.fixtureId);
      if (item) { item.fieldId = field.id; item.fieldName = field.name; item.stableRevision = randomUuid(); }
    }
    return ok({ addedCount, existingCount, updatedCount: 0 });
  }),
  http.patch(`${api}/tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/field`, async ({ params, request }) => {
    const body = await request.json() as { fieldId?: string };
    const field = v1TournamentFields.find((row) => row.id === body.fieldId && row.tournamentId === params.tournamentId && row.active);
    const fixture = v1CompetitionFixturePlaces.find((row) => row.fixtureId === params.fixtureId && row.tournamentId === params.tournamentId);
    if (!field || !fixture) return notFound('경기 또는 경기장을 찾을 수 없어요.');
    if (fixture.fieldId !== field.id && fixture.place.name.trim().toLowerCase() !== field.name.trim().toLowerCase()) fixture.place = { ...field.place };
    fixture.fieldId = field.id;
    const item = v1TournamentOperationsBoardItems.find((row) => row.fixtureId === fixture.fixtureId);
    if (item) { item.fieldId = field.id; item.fieldName = field.name; item.stableRevision = randomUuid(); }
    return ok({ fixtureId: fixture.fixtureId, tournamentId: fixture.tournamentId, fieldId: field.id });
  }),
  http.delete(`${api}/tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/field`, ({ params }) => {
    const fixture = v1CompetitionFixturePlaces.find((row) => row.fixtureId === params.fixtureId && row.tournamentId === params.tournamentId);
    if (!fixture) return notFound('경기를 찾을 수 없어요.');
    if (!['', '장소 미정', '미정', 'tbd'].includes(fixture.place.name.trim().toLowerCase())) return HttpResponse.json({ status: 'error', code: 'FIELD_PLACE_LINK_REQUIRED', message: '장소가 설정된 경기는 경기장 연결을 유지해야 해요.' }, { status: 409 });
    fixture.fieldId = null;
    const item = v1TournamentOperationsBoardItems.find((row) => row.fixtureId === fixture.fixtureId);
    if (item) { item.fieldId = null; item.fieldName = null; item.stableRevision = randomUuid(); }
    return ok({ fixtureId: fixture.fixtureId, tournamentId: fixture.tournamentId, fieldId: null });
  }),
];

const levelOrder = ['beginner', 'novice', 'intermediate', 'advanced'];

function rangeMatches(selected: string[], minCode?: string, maxCode?: string) {
  const min = levelOrder.indexOf(minCode ?? '');
  const max = levelOrder.indexOf(maxCode ?? '');
  if (min < 0 || max < 0) return false;
  return selected.some((code) => {
    const order = levelOrder.indexOf(code);
    return order >= min && order <= max;
  });
}
