/** `url("…"), url("…")` 로 이뤄진 background-image 를 레이어별 요청(경로·원본·폭)으로 푼다. */
export function backgroundRequests(backgroundImage: string) {
  return [...backgroundImage.matchAll(/url\("([^"]+)"\)/g)].map(([, raw]) => {
    const url = new URL(raw, 'http://localhost');
    return { pathname: url.pathname, url: url.searchParams.get('url') ?? raw, w: url.searchParams.get('w') };
  });
}
