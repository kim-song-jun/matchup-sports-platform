import { http, HttpResponse } from 'msw';
import type {
  V1PlayerEligibilityMethod,
  V1PlayerEligibilityStatus,
  V1TournamentRosterPlayer,
} from '@/types/api';

/**
 * 선출 여부 판정 근거·이전 판정 유지·본인 신고(MD-QA #192) — `docs/api/domains/tournaments.md`
 * "선출 여부 판정" 계약을 따르는 상태형 핸들러.
 *
 * - 어드민 판정: 아마추어·선출에는 `verificationMethod` 필수(400 `ELIGIBILITY_METHOD_REQUIRED`), `note` 생략 시 기존 메모 유지.
 * - 본인 신고: 명단 행의 주인만(403), 허위 신고 동의 필수(400), 운영진 판정 뒤에는 409 `ELIGIBILITY_ADMIN_REVIEWED`.
 * - JoinKFA 로 나가는 요청은 없다 — 이 핸들러에도 없다.
 */
const api = '*/api/v1';
const NOW = '2026-11-11T00:00:00.000Z';

function ok<T>(data: T) {
  return HttpResponse.json({ status: 'success', data, timestamp: NOW });
}

function fail(status: number, code: string, message: string) {
  return HttpResponse.json({ status: 'error', statusCode: status, code, message, details: null, timestamp: NOW }, { status });
}

export type PlayerEligibilityMswRequest = { method: string; path: string; body: unknown };

export function playerEligibilityRosterPlayer(overrides: Partial<V1TournamentRosterPlayer> = {}): V1TournamentRosterPlayer {
  return {
    id: 'player-me',
    jerseyNumber: 7,
    userId: 'user-me',
    realName: '홍길동',
    nickname: '길동이',
    birthDateSnapshot: '1995-03-15',
    genderSnapshot: 'male',
    personalInfoVisible: true,
    eligibilityStatus: 'needs_review',
    eligibilityNote: null,
    eligibilityVerificationMethod: null,
    eligibilityVerifiedAt: null,
    selfDeclaredStatus: null,
    selfDeclaredAt: null,
    eligibilityAdminReviewed: false,
    isViewer: true,
    addedAt: NOW,
    removedAt: null,
    ...overrides,
  };
}

export function createV1PlayerEligibilityMswHandlers(init: {
  tournamentId: string;
  registrationId: string;
  players: V1TournamentRosterPlayer[];
  viewerUserId: string;
}) {
  const players = init.players.map((player) => ({ ...player }));
  const requests: PlayerEligibilityMswRequest[] = [];
  const rosterPath = `${api}/tournaments/${init.tournamentId}/registrations/${init.registrationId}/players`;

  const handlers = [
    http.get(rosterPath, () => ok({ players, belowMinimum: false })),
    http.patch(`${rosterPath}/:playerId/self-declaration`, async ({ params, request }) => {
      const body = (await request.json()) as { selfDeclaredStatus?: string; consent?: unknown };
      requests.push({ method: 'PATCH', path: `self-declaration/${String(params.playerId)}`, body });
      const player = players.find((row) => row.id === params.playerId);
      if (!player) return fail(404, 'PLAYER_NOT_FOUND', '선수를 찾을 수 없어요.');
      if (player.userId !== init.viewerUserId) return fail(403, 'PERMISSION_DENIED', '본인만 선출 여부를 신고할 수 있어요.');
      if (body.consent !== true) return fail(400, 'VALIDATION_ERROR', '허위 신고 안내에 동의해야 신고할 수 있어요.');
      if (body.selfDeclaredStatus !== 'non_pro' && body.selfDeclaredStatus !== 'pro') {
        return fail(400, 'VALIDATION_ERROR', '아마추어 또는 선출 중에서 골라 주세요.');
      }
      if (player.eligibilityAdminReviewed) {
        return fail(409, 'ELIGIBILITY_ADMIN_REVIEWED', '운영진이 확정한 선출 여부예요. 변경이 필요하면 운영진에게 문의해 주세요.');
      }
      player.selfDeclaredStatus = body.selfDeclaredStatus;
      player.selfDeclaredAt = NOW;
      return ok({ id: player.id, selfDeclaredStatus: player.selfDeclaredStatus, selfDeclaredAt: NOW });
    }),
    http.patch(`${api}/admin/players/:playerId/eligibility`, async ({ params, request }) => {
      const body = (await request.json()) as {
        eligibilityStatus: V1PlayerEligibilityStatus;
        verificationMethod?: V1PlayerEligibilityMethod;
        note?: string;
      };
      requests.push({ method: 'PATCH', path: `eligibility/${String(params.playerId)}`, body });
      const player = players.find((row) => row.id === params.playerId);
      if (!player) return fail(404, 'PLAYER_NOT_FOUND', '선수를 찾을 수 없어요.');
      if (body.eligibilityStatus !== 'needs_review' && !body.verificationMethod) {
        return fail(400, 'ELIGIBILITY_METHOD_REQUIRED', '무엇으로 확인했는지 골라 주세요.');
      }
      player.eligibilityStatus = body.eligibilityStatus;
      player.eligibilityVerificationMethod = body.verificationMethod ?? null;
      if (body.note !== undefined) player.eligibilityNote = body.note.trim() || null;
      player.eligibilityVerifiedAt = body.eligibilityStatus === 'needs_review' ? null : NOW;
      player.eligibilityAdminReviewed = true;
      return ok(player);
    }),
  ];

  return { handlers, requests, players };
}
