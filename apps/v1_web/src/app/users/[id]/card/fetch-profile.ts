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
 *
 * ## 다만 조용히 삼키지는 않는다
 * 처음엔 `catch { return null }` 로 두었다가 alpha 에서 대가를 치렀다 -- OG 이미지가
 * 모든 사용자에게 같은 폴백을 주는데, 실패 이유가 어디에도 남지 않아 **원인을 볼 수
 * 없었다.** 화면은 계속 살려 두되(null 반환) 서버 로그에는 반드시 남긴다.
 */

/**
 * `revalidate` 는 정적/ISR 렌더에서만 의미가 있다. `dynamic = 'force-dynamic'` 인
 * 라우트(= OG 이미지)에서 함께 쓰면 캐시 전략이 서로 모순되므로, 호출부가 자기
 * 렌더링 모드에 맞는 것을 고르게 한다.
 */
export type OgFetchStrategy = 'revalidate' | 'no-store';

export async function fetchPublicProfileForOg(
  userId: string,
  strategy: OgFetchStrategy = 'revalidate',
): Promise<V1PublicProfile | null> {
  const origin =
    process.env.INTERNAL_API_ORIGIN ??
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, '') ??
    (process.env.NODE_ENV === 'production' ? 'http://v1_api:8121' : 'http://localhost:8121');

  const url = `${origin.replace(/\/$/, '')}/api/v1/users/${userId}/public-profile`;
  const init: RequestInit =
    strategy === 'no-store' ? { cache: 'no-store' } : { next: { revalidate: 300 } };

  try {
    const response = await fetch(url, init);
    if (!response.ok) {
      console.error(`[og-card] 프로필 조회 실패: ${response.status} ${url}`);
      return null;
    }
    const envelope = (await response.json()) as { data?: V1PublicProfile };
    return envelope.data ?? null;
  } catch (error) {
    // 여기가 alpha 에서 실제로 걸린 자리다 -- 무엇이 터졌는지 남기지 않으면
    // "이미지가 전부 같다"는 증상만 보이고 원인은 영영 안 보인다.
    console.error(`[og-card] 프로필 조회 예외 (${strategy}) ${url}`, error);
    return null;
  }
}
