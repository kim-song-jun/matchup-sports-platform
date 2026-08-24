import { describe, expect, it } from 'vitest';
import * as ogImage from './opengraph-image';

/**
 * 이 라우트의 렌더링 모드는 **기능의 일부**다.
 *
 * alpha 실측(2026-08-24, 서빙 커밋 888041a8)에서 `revalidate` 만 둔 상태로 배포했더니
 * 라우트가 빌드 타임에 한 장으로 생성되어 **모든 사용자에게 같은 이미지가 나갔다** --
 * 서로 다른 두 사용자와 존재하지 않는 사용자까지 응답이 42,163 bytes 로 바이트 단위
 * 동일했다. 빌드 시점엔 API 에 닿을 수 없어 폴백 이미지가 구워진 것이다.
 *
 * 누군가 `dynamic` 을 지우거나 `revalidate` 를 되살리면 같은 사고가 재현된다.
 * 상수를 검사하는 테스트지만, 그 상수가 정확히 이 계약이다.
 */
describe('선수 카드 OG 이미지 라우트 설정', () => {
  it('요청마다 실행된다 -- 정적으로 구워지면 모든 사용자가 같은 이미지를 받는다', () => {
    expect(ogImage.dynamic).toBe('force-dynamic');
  });

  it('정적 생성을 유도하는 revalidate 를 라우트에 두지 않는다', () => {
    // 데이터 캐시는 fetch 쪽 next.revalidate 가 담당한다(URL 단위라 사용자별로 나뉜다).
    expect('revalidate' in ogImage).toBe(false);
  });

  it('Node 런타임에서 돈다 -- satori 렌더와 폰트 에셋 로딩 때문', () => {
    expect(ogImage.runtime).toBe('nodejs');
  });

  it('링크 미리보기 규격(1200x630)을 유지한다', () => {
    expect(ogImage.size).toEqual({ width: 1200, height: 630 });
    expect(ogImage.contentType).toBe('image/png');
  });
});
