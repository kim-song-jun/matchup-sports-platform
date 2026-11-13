/*
 * /terms 가 보여 주는 약관 문서의 이름표와 쿼리 해석. 'use client' 파일(terms-client)에 두면
 * 서버 컴포넌트(page.tsx)가 받는 것은 값이 아니라 클라이언트 참조라 여기 둔다.
 */

export type LegalDocumentKey = 'terms' | 'privacy' | 'location' | 'tournament-policy' | 'support';

// 본문은 서버가 내려 주는 약관 문서를 쓰고, 이 제목은 문서를 불러오는 동안 보여 주는 값이다.
export const LEGAL_DOCUMENT_TITLES = {
  terms: '서비스 이용약관',
  privacy: '개인정보처리방침',
  location: '위치기반서비스 이용약관',
  'tournament-policy': '대회 운영정책',
  support: '고객센터',
} satisfies Record<LegalDocumentKey, string>;

export function isLegalDocumentKey(value: string): value is LegalDocumentKey {
  return Object.hasOwn(LEGAL_DOCUMENT_TITLES, value);
}

/**
 * 쿼리가 하나도 없는 /terms 는 외부 유입(북마크·검색엔진·공유 링크)의 도착지라 서비스 이용약관을 보여 준다.
 * 가입 동의 단계는 mode 로 명시하므로 document 없이 mode 만 있으면 문서 화면이 아니다.
 */
export function legalDocumentForQuery(document: string | null, mode: string | null): LegalDocumentKey | null {
  if (document) return isLegalDocumentKey(document) ? document : null;
  return mode ? null : 'terms';
}
