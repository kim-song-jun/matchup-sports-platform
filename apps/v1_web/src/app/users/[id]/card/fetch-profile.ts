import type { V1PublicProfile } from '@/types/api';

/**
 * 공유 카드 화면·이미지가 쓰는 서버측 프로필 조회 (Task 155).
 *
 * `lib/seo.ts` 의 내부 origin 해석과 같은 규칙을 쓴다 -- 컨테이너 안에서는
 * `v1_api:8121`, 로컬에서는 `localhost:8121`. 공개 엔드포인트라 인증이 필요 없다.
 *
 * **실패해도 던지지 않는다.** 링크 미리보기 이미지는 실패하면 카카오톡에 깨진
 * 썸네일이 뜨는데, 그건 링크를 안 눌리게 만든다 -- 호출부가 브랜드 이미지로
 * 대체할 수 있도록 null 을 돌려준다.
 */
export async function fetchPublicProfileForOg(userId: string): Promise<V1PublicProfile | null> {
  const origin =
    process.env.INTERNAL_API_ORIGIN ??
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, '') ??
    (process.env.NODE_ENV === 'production' ? 'http://v1_api:8121' : 'http://localhost:8121');

  try {
    const response = await fetch(`${origin.replace(/\/$/, '')}/api/v1/users/${userId}/public-profile`, {
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    const envelope = (await response.json()) as { data?: V1PublicProfile };
    return envelope.data ?? null;
  } catch {
    return null;
  }
}
