import type { V1MyTeam, V1MyTeamsResponse } from '@/types/api';

/**
 * 팀에서 운영 권한(초대/승인/컨택 등)을 가진 역할인지 판정한다.
 * teams-client.tsx 와 my-api-clients.tsx 에 같은 함수가 각각 로컬로 중복돼 있던 것을
 * 팀 컨택이 세 번째 소비처가 되면서 공유 유틸로 올린 것이다.
 */
export function isTeamOperatorRole(role?: string | null) {
  return role === 'owner' || role === 'manager' || role === 'admin';
}

/**
 * `useV1MyTeams()` 응답은 배열이면서 `items`도 같이 들고 있는 하이브리드 형태다.
 * teams-client.tsx 와 team-contact-new-client.tsx 에 동일 로직이 각각 로컬로
 * 중복돼 있던 것을 공유 유틸로 올린 것이다(Task 10 리뷰 후속).
 */
export function normalizeMyTeamsResponse(data: V1MyTeamsResponse | undefined): V1MyTeam[] {
  if (!data) return [];
  return 'items' in data ? data.items : (data as V1MyTeam[]);
}
