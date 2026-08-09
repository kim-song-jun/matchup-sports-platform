import { http, HttpResponse } from 'msw';
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
  v1ReviewTeamMatchSourceFixture,
  v1SettingsFixture,
  v1SportsFixture,
  v1TeamMatchesFixture,
  v1TeamsFixture,
  v1UserFixture,
  toAdminInquiryDetail,
  toAdminInquiryRow,
} from './fixtures';

const api = '*/api/v1';

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
  lineups: [] as { id: string; gameId: string; sideId: string; revision: number; state: string; version: number; submittedAt: string | null; supersedesId: string | null }[],
  actorRole: 'team_owner',
};

let v1GameResultRevisions: V1GameResultRevision[] = [];

let v1TeamMatchLineupFixture: V1TeamMatchLineup = {
  teamMatchId: 'team-match-1',
  gameId: 'game-1',
  sideId: 'side-home-1',
  role: 'team_owner',
  lineupId: 'lineup-1',
  revision: 1,
  state: 'DRAFT',
  version: 1,
  formation: '2-2',
  publicLineupAt: null,
  starters: [
    { id: 'participant-1', displayName: '김도윤', jerseyNumber: 7, position: 'FW', goalkeeper: false, positionX: 30, positionY: 60 },
    { id: 'participant-2', displayName: '박서준', jerseyNumber: 1, position: 'GK', goalkeeper: true, positionX: 50, positionY: 6 },
  ],
  bench: [{ id: 'participant-3', displayName: '이하늘', jerseyNumber: 11 }],
};

// ── Tournament operations mock state (Task 18/19 backend, Task 19 frontend) ─
let v1TournamentOperationsBoardItems: V1TournamentOperationsBoardItem[] = [
  {
    fixtureId: 'fixture-1',
    tournamentId: 'tournament-1',
    round: '8강',
    fixtureNumber: 1,
    gameId: 'game-1',
    gameState: 'SCHEDULED',
    fieldId: 'field-1',
    fieldName: '1번 코트',
    homeRegistrationId: 'registration-1',
    awayRegistrationId: 'registration-2',
    scheduledAt: '2026-05-25T09:00:00.000Z',
    currentScore: null,
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

// 필드 목록은 GET만 훅이 있다(useV1TournamentFields) — POST/PATCH/DELETE 필드 mutation은
// use-v1-api.ts 어디에도 소비자가 없어 핸들러를 만들지 않는다(하단 리포트 참고).
const v1TournamentFields = [
  { id: 'field-1', tournamentId: 'tournament-1', scopeKey: 'court-1', name: '1번 코트', sortOrder: 1, active: true, version: 1 },
  { id: 'field-2', tournamentId: 'tournament-1', scopeKey: 'court-2', name: '2번 코트', sortOrder: 2, active: true, version: 1 },
];

export const v1MswHandlers = [
  http.get(`${api}/auth/me`, () => ok(v1UserFixture)),
  http.post(`${api}/auth/login`, () => ok({ session: { userId: v1UserFixture.id, userEmail: v1UserFixture.email }, ...v1UserFixture })),
  http.post(`${api}/auth/register`, async ({ request }) => {
    const body = await request.json();
    const issue = getRegisterIssue(body);
    if (issue) return validationError(issue);
    return ok({ session: { userId: v1UserFixture.id, userEmail: v1UserFixture.email }, ...v1UserFixture });
  }),
  http.get(`${api}/onboarding`, () => ok({ status: 'signup_done', currentStep: 'sport', canResume: true, missing: ['sports'], sports: [], regions: [], regionOptional: true })),
  http.patch(`${api}/onboarding/preferences`, async ({ request }) => ok(await request.json())),
  http.post(`${api}/onboarding/complete`, () => ok({ completed: true })),
  http.post(`${api}/onboarding/defer`, () => ok({ status: 'deferred', next: { route: '/home', reason: 'onboarding_deferred' }, missing: ['sports'], limited: true })),
  http.get(`${api}/master/sports`, () => ok(v1SportsFixture)),
  http.get(`${api}/master/regions`, () => ok(v1RegionsFixture)),
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
    const levelCodes = new URL(request.url).searchParams.get('levelCodes')?.split(',').filter(Boolean) ?? [];
    const matches = levelCodes.length
      ? v1MatchesFixture.filter((item) => rangeMatches(levelCodes, item.minLevel?.code, item.maxLevel?.code))
      : v1MatchesFixture;
    return ok(page(matches));
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
    return ok(page(teams));
  }),
  http.get(`${api}/teams/:teamId`, ({ params }) => ok(teamDetail(String(params.teamId)))),
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
  http.get(`${api}/team-matches`, ({ request }) => {
    const sportId = new URL(request.url).searchParams.get('sportId');
    const levelCodes = new URL(request.url).searchParams.get('levelCodes')?.split(',').filter(Boolean) ?? [];
    const sport = v1SportsFixture.find((item) => item.id === sportId);
    const teamMatchesBySport = sport
      ? v1TeamMatchesFixture.filter((item) => item.sport?.sportId === sport.id || item.sportName === sport.name)
      : v1TeamMatchesFixture;
    const teamMatches = levelCodes.length
      ? teamMatchesBySport.filter((item) => rangeMatches(levelCodes, item.minLevel?.code, item.maxLevel?.code))
      : teamMatchesBySport;
    return ok(page(teamMatches));
  }),
  http.get(`${api}/team-matches/:teamMatchId`, ({ params }) => ok(v1TeamMatchesFixture.find((item) => item.id === params.teamMatchId) ?? v1TeamMatchesFixture[0])),
  http.get(`${api}/chat/rooms`, () => ok(v1ChatRoomsFixture)),
  http.get(`${api}/chat/rooms/:roomId`, ({ params }) => {
    const room = v1ChatRoomsFixture.items.find((item) => item.roomId === params.roomId) ?? v1ChatRoomsFixture.items[0];
    return ok({
      roomId: room.roomId,
      roomType: room.roomType,
      status: room.status,
      title: room.title,
      linkedTarget: room.linkedTarget,
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
    const body = await request.json() as { content?: string };
    const sentAt = new Date().toISOString();
    const message = {
      messageId: `message-${Date.now()}`,
      sender: { userId: 'user-1', displayName: '나', profileImageUrl: null },
      content: body.content ?? '',
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
    return ok({ messageId: message.messageId, roomId: params.roomId, content: message.content, status: 'sent', sentAt });
  }),
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
    const q = params.get('q')?.trim().toLowerCase();
    const searched = v1InquiriesFixture.items.map(toAdminInquiryRow).filter((inquiry) => {
      if (q && !`${inquiry.title} ${inquiry.requesterName ?? ''} ${inquiry.requesterEmail ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const statusSource = searched.filter((inquiry) => {
      if (category && inquiry.category !== category) return false;
      return true;
    });
    const categorySource = searched.filter((inquiry) => !status || inquiry.status === status);
    const rows = statusSource.filter((inquiry) => !status || inquiry.status === status);
    return ok({
      ...page(rows),
      summary: {
        total: statusSource.length,
        byStatus: countFacet(statusSource, ['received', 'reviewing', 'answered', 'closed'], (inquiry) => inquiry.status),
        byCategory: countFacet(categorySource, ['account', 'match', 'team', 'tournament', 'payment_refund', 'report', 'other'], (inquiry) => inquiry.category),
      },
    });
  }),
  http.get(`${api}/admin/inquiries/:inquiryId`, ({ params }) => {
    const inquiry = v1InquiriesFixture.items.find((item) => item.inquiryId === params.inquiryId) ?? v1InquiriesFixture.items[0];
    return ok(toAdminInquiryDetail(inquiry));
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
    v1ScheduleFixture = {
      ...v1ScheduleFixture,
      teamId: String(params.teamId),
      title: body.title,
      type: body.type,
      startAt: body.startAt,
      endAt: body.endAt,
      timezone: body.timezone,
      capacity: body.capacity ?? null,
      rsvpDeadlineAt: body.rsvpDeadlineAt ?? null,
      visibility: body.visibility ?? 'TEAM',
      // 매치 ↔ 팀일정 연동: teamMatchId는 V1CreateScheduleDto에서 제거됐다 — MATCH 타입
      // 스케줄은 이제 TeamMatchesService가 시스템으로만 만든다. 이 mock 경로는 항상 TRAINING/
      // EVENT만 받으므로 teamMatchId/matchConfirmed는 v1ScheduleFixture의 기존 값(null)을
      // 그대로 spread로 물려받는다.
      state: 'SCHEDULED',
      version: 1,
      cancelReason: null,
      cancelledAt: null,
    };
    return ok(scheduleMutationResult());
  }),
  http.patch(`${api}/teams/:teamId/schedules/:scheduleId`, async ({ request }) => {
    const body = await request.json() as V1UpdateScheduleDto;
    if (body.title !== undefined) v1ScheduleFixture.title = body.title;
    if (body.startAt !== undefined) v1ScheduleFixture.startAt = body.startAt;
    if (body.endAt !== undefined) v1ScheduleFixture.endAt = body.endAt;
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

  // ── Task 17: games / result revisions / team-match lineup ─────────────────
  http.get(`${api}/games/:gameId`, () => ok(v1GameFixture)),
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
      createdByActorType: 'USER',
      createdByUserId: 'user-1',
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
  http.put(`${api}/team-matches/:teamMatchId/lineup`, async ({ request }) => {
    const body = await request.json() as V1TeamMatchLineupSavePayload;
    v1TeamMatchLineupFixture = {
      ...v1TeamMatchLineupFixture,
      revision: v1TeamMatchLineupFixture.revision + 1,
      version: v1TeamMatchLineupFixture.version + 1,
      formation: body.formation ?? null,
      starters: body.starters.map((participant, index) => ({
        id: participant.userId ?? `guest-participant-${index + 1}`,
        displayName: participant.displayName ?? '이름 미확인',
        jerseyNumber: participant.jerseyNumber ?? null,
        position: participant.position ?? null,
        goalkeeper: participant.goalkeeper ?? false,
        positionX: participant.positionX ?? null,
        positionY: participant.positionY ?? null,
      })),
      bench: body.bench.map((participant, index) => ({
        id: participant.userId ?? `guest-bench-${index + 1}`,
        displayName: participant.displayName ?? '이름 미확인',
        jerseyNumber: participant.jerseyNumber ?? null,
      })),
    };
    return ok({
      teamMatchId: v1TeamMatchLineupFixture.teamMatchId,
      gameId: v1TeamMatchLineupFixture.gameId,
      sideId: v1TeamMatchLineupFixture.sideId,
      lineupId: v1TeamMatchLineupFixture.lineupId ?? 'lineup-1',
      revision: v1TeamMatchLineupFixture.revision,
      state: v1TeamMatchLineupFixture.state,
      version: v1TeamMatchLineupFixture.version,
      replayed: false,
    });
  }),
  http.post(`${api}/team-matches/:teamMatchId/lineup/submit`, () => {
    v1TeamMatchLineupFixture.state = 'SUBMITTED';
    v1TeamMatchLineupFixture.version += 1;
    const publicLineupAt = new Date().toISOString();
    v1TeamMatchLineupFixture.publicLineupAt = publicLineupAt;
    return ok({
      teamMatchId: v1TeamMatchLineupFixture.teamMatchId,
      gameId: v1TeamMatchLineupFixture.gameId,
      sideId: v1TeamMatchLineupFixture.sideId,
      lineupId: v1TeamMatchLineupFixture.lineupId ?? 'lineup-1',
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
  http.get(`${api}/tournament-ops/tournaments/:tournamentId/fields`, () => ok({ items: v1TournamentFields })),
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
