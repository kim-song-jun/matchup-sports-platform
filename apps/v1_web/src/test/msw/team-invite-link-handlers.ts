import { http, HttpResponse } from 'msw';
import type {
  V1TeamInvitationBatchResult,
  V1TeamInvitationBatchStatus,
  V1TeamInviteLink,
  V1TeamInviteLinkPreview,
  V1TeamJoinApplicationResult,
} from '@/types/api';

/**
 * 팀 초대 링크·여러 명 초대(Task 180 G12) — `docs/api/domains/teams.md` "초대 링크" 계약을 따르는 상태형 핸들러.
 * 재발급하면 옛 토큰은 410 REVOKED, 만료는 410 EXPIRED, 링크로 들어온 신청은 대기(requested)로만 남는다.
 */
const api = '*/api/v1';
const NOW = '2026-10-01T00:00:00.000Z';
const DAY_MS = 24 * 60 * 60 * 1000;

export const TEAM_INVITE_LINK_MSW = { teamId: 'team-invite-1', teamName: 'QA0929 마포 FC' } as const;

function ok<T>(data: T) {
  return HttpResponse.json({ status: 'success', data, timestamp: NOW });
}

function fail(status: number, code: string, message: string) {
  return HttpResponse.json({ status: 'error', statusCode: status, code, message, details: null, timestamp: NOW }, { status });
}

/** 32자 base64url 모양의 결정적 토큰(서버 형식과 같은 길이). */
export function inviteLinkToken(n: number) {
  return `tok${String(n).padStart(29, '0')}`;
}

export type TeamInviteLinkMswRequest = { method: string; path: string; body: unknown };

export function createV1TeamInviteLinkMswHandlers(init: {
  link?: V1TeamInviteLink;
  /** 링크를 여는 사람 — null 이면 비로그인(미리보기의 viewer 가 null). */
  viewer?: V1TeamInviteLinkPreview['viewer'];
  joinPolicy?: 'approval_required' | 'closed';
  /** 여러 명 초대에서 찾을 수 있는 사람(이메일·닉네임 정확히 일치). */
  people?: Array<{ email: string; nickname: string; member?: boolean; invited?: boolean }>;
} = {}) {
  const state = {
    issued: 0,
    link: init.link ?? ({ teamId: TEAM_INVITE_LINK_MSW.teamId, status: 'none', token: null, expiresAt: null, createdAt: null } as V1TeamInviteLink),
    revoked: new Set<string>(),
    viewer: init.viewer === undefined ? null : init.viewer,
    joinPolicy: init.joinPolicy ?? 'approval_required',
    people: init.people ?? [],
    requests: [] as TeamInviteLinkMswRequest[],
  };
  const record = (request: Request, body: unknown = null) => {
    state.requests.push({ method: request.method, path: new URL(request.url).pathname, body });
  };
  const issueNew = (created: boolean) => {
    if (state.link.token) state.revoked.add(state.link.token);
    state.issued += 1;
    state.link = {
      teamId: TEAM_INVITE_LINK_MSW.teamId,
      status: 'active',
      token: inviteLinkToken(state.issued),
      expiresAt: new Date(Date.parse(NOW) + 7 * DAY_MS).toISOString(),
      createdAt: NOW,
    };
    return ok({ ...state.link, created });
  };
  const deadLink = (token: string) => {
    if (state.revoked.has(token)) return fail(410, 'TEAM_INVITE_LINK_REVOKED', '새 링크가 만들어져서 이 링크는 더 이상 쓸 수 없어요. 팀장·매니저에게 새 링크를 받아 주세요.');
    if (token !== state.link.token) return fail(404, 'TEAM_INVITE_LINK_NOT_FOUND', '초대 링크를 찾을 수 없어요. 링크 주소를 다시 확인해 주세요.');
    if (state.link.status === 'expired') return fail(410, 'TEAM_INVITE_LINK_EXPIRED', '초대 링크가 만료됐어요. 팀장·매니저에게 새 링크를 받아 주세요.');
    return null;
  };

  const handlers = [
    http.get(`${api}/teams/:teamId/invite-link`, ({ request }) => {
      record(request);
      return ok(state.link);
    }),
    http.post(`${api}/teams/:teamId/invite-link`, ({ request }) => {
      record(request);
      if (state.joinPolicy === 'closed') return fail(409, 'JOIN_CLOSED', "가입을 닫아 둔 팀은 초대 링크를 만들 수 없어요. 팀 정보에서 '가입 가능'으로 바꿔 주세요.");
      if (state.link.status === 'active') return ok({ ...state.link, created: false });
      return issueNew(true);
    }),
    http.post(`${api}/teams/:teamId/invite-link/reissue`, ({ request }) => {
      record(request);
      return issueNew(true);
    }),
    http.get(`${api}/team-invite-links/:token`, ({ request, params }) => {
      record(request);
      const dead = deadLink(String(params.token));
      if (dead) return dead;
      const preview: V1TeamInviteLinkPreview = {
        team: { id: TEAM_INVITE_LINK_MSW.teamId, name: TEAM_INVITE_LINK_MSW.teamName, sportName: '풋살', regionName: '서울 마포구', logoUrl: null },
        expiresAt: state.link.expiresAt ?? NOW,
        viewer: state.viewer,
      };
      return ok(preview);
    }),
    http.post(`${api}/team-invite-links/:token/join-applications`, ({ request, params }) => {
      record(request);
      const dead = deadLink(String(params.token));
      if (dead) return dead;
      if (state.viewer?.joinState === 'member') return fail(409, 'ALREADY_MEMBER', '이미 팀 멤버예요.');
      if (state.viewer?.joinState === 'requested') return fail(409, 'ALREADY_REQUESTED', '이미 가입 신청해서 승인을 기다리고 있어요.');
      state.viewer = { joinState: 'requested', eligible: false, reasonCode: 'ALREADY_REQUESTED', message: '이미 가입 신청해서 승인을 기다리고 있어요.' };
      const result: V1TeamJoinApplicationResult = {
        applicationId: 'app-link-1',
        teamId: TEAM_INVITE_LINK_MSW.teamId,
        status: 'requested',
        joinState: 'requested',
        requiresApproval: true,
        immediateJoinSupported: false,
      };
      return ok(result);
    }),
    http.post(`${api}/teams/:teamId/invitations/batch`, async ({ request }) => {
      const body = (await request.json()) as { recipients: string[] };
      record(request, body);
      const seen = new Set<string>();
      const results = body.recipients.map((raw) => {
        const recipient = raw.trim();
        const person = state.people.find((p) => (recipient.includes('@') ? p.email === recipient.toLowerCase() : p.nickname === recipient));
        const key = person?.email ?? recipient;
        let status: V1TeamInvitationBatchStatus;
        if (seen.has(key)) status = 'duplicate';
        else if (!person) status = 'not_found';
        else if (person.member) status = 'already_member';
        else if (person.invited) status = 'already_invited';
        else status = 'invited';
        seen.add(key);
        if (status === 'invited' && person) person.invited = true;
        return { recipient, status, invitationId: status === 'invited' || status === 'already_invited' ? `inv-${key}` : null };
      });
      const result: V1TeamInvitationBatchResult = {
        teamId: TEAM_INVITE_LINK_MSW.teamId,
        invitedCount: results.filter((row) => row.status === 'invited').length,
        results,
      };
      return ok(result);
    }),
  ];

  return { handlers, state };
}

export const v1TeamInviteLinkMswHandlers = createV1TeamInviteLinkMswHandlers().handlers;
