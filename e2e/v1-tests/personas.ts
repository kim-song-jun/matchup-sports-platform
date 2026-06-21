/**
 * v1 seed 페르소나(apps/v1_api/prisma/seed.ts) — 각 페르소나의 역할·이메일·대표 플로우.
 * docs/ops/v1-persona-flows.md의 17 페르소나 중 seed로 실재하는 6 핵심 actor + 신규 방문자.
 * 각 flow spec이 이 정의를 사용해 "페르소나별 플로우 테스트"를 구성한다.
 */
export const personas = {
  visitor: { email: null, name: '신규 방문자', flow: '가입→온보딩 위저드→홈(onboardingStatus=completed)' },
  host: { email: 'host@teameet.v1', name: '호스트민', flow: '매치 생성 위저드·호스트 매치 관리·팀매치 주최' },
  applicant: { email: 'applicant@teameet.v1', name: '지원수', flow: '매치 탐색→상세→참가신청·팀 가입신청' },
  owner: { email: 'owner@teameet.v1', name: '팀장원', flow: '팀 관리·멤버·소유권·팀 설정' },
  manager: { email: 'manager@teameet.v1', name: '매니저준', flow: '팀 운영·가입신청 검토' },
  member: { email: 'member@teameet.v1', name: '멤버현', flow: '소속팀 조회·내 활동' },
  admin: { email: 'admin@teameet.v1', name: '운영자', flow: '운영 대시보드·회원/매치/팀/대회 관리' },
} as const;

export type PersonaKey = keyof typeof personas;
