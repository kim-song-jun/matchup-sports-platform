export const TEST_PERSONAS = {
  sinaro: { nickname: '시나로E2E', email: 'e2e+sinaro@test.local' },
  teamOwner: { nickname: '팀장오너E2E', email: 'e2e+owner@test.local' },
  teamManager: { nickname: '매니저E2E', email: 'e2e+manager@test.local' },
  teamMember: { nickname: '일반팀원E2E', email: 'e2e+member@test.local' },
  mercenaryHost: { nickname: '용병호스트E2E', email: 'e2e+merchost@test.local' },
  admin: { nickname: '관리자E2E', email: 'e2e+admin@test.local' },
  instructor: { nickname: '강사E2E', email: 'e2e+instructor@test.local' },
  seller: { nickname: '판매자E2E', email: 'e2e+seller@test.local' },
} as const;

export type PersonaKey = keyof typeof TEST_PERSONAS;

export const API_BASE = 'http://localhost:8111';
export const WEB_BASE = 'http://localhost:3003';
