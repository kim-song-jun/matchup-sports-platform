/**
 * next/image로 렌더된 <img>의 실제 DOM `src`는 항상 이미지 최적화 로더를 거쳐
 * `/_next/image?url=<encoded>&w=..&q=..` 형태로 재작성된다(Next.js `image-component.js`의
 * `ImageElement` — 원본 경로를 그대로 두지 않는다). U15(raw <img> → next/image 전환) 이후
 * 테스트에서 "이 팀 로고가 화면에 보이는가"를 검증하려면 리터럴 src 동등 비교
 * (`img[src="/uploads/..."]`, `toHaveAttribute('src', '/uploads/...')`)로는 항상 실패한다 —
 * 실제로 표시되는 원본 이미지 경로는 `url` 쿼리 파라미터를 디코딩해야 얻을 수 있다.
 */
export function resolveNextImageSrc(img: Element | null | undefined): string | null {
  if (!img) return null;
  const src = img.getAttribute('src');
  if (!src) return null;
  try {
    const url = new URL(src, 'http://localhost');
    return url.searchParams.get('url') ?? src;
  } catch {
    return src;
  }
}

/** container 안의 <img> 중 next/image 최적화 전 원본 경로가 `path`인 것을 찾는다. */
export function queryImageBySrc(container: ParentNode, path: string): HTMLImageElement | null {
  const imgs = Array.from(container.querySelectorAll('img'));
  return imgs.find((img) => resolveNextImageSrc(img) === path) ?? null;
}
