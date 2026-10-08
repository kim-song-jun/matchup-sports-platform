import { isSafeImageUrl } from './safe-image-url';

// 같은 입력표를 두 모드로 돌려 모드 간 차이가 의도한 곳에서만 나는지 본다.
// [입력, 기본 모드(캠페인), localUploadsOnly(리그 대표 이미지)]
const TABLE: ReadonlyArray<readonly [string, boolean, boolean]> = [
  ['/uploads/2026/10/x.webp', true, true],
  ['/uploads/한글-이름_1.png', true, true],
  ['https://cdn.example.com/a.png', true, false],
  ['http://cdn.example.com/a.png', false, false],
  ['https://localhost/a.png', false, false],
  ['https://10.0.0.1/a.png', false, false],
  ['https://user:pw@cdn.example.com/a.png', false, false],
  ['javascript:alert(1)', false, false],
  ['/uploads/../a.png', false, false],
  ['/uploads/./a.png', false, false],
  ['/uploads/a%22.webp', false, false],
  ['https://cdn.example.com/a%22.png', false, false],
  ['/uploads/a.webp?x=1', false, false],
  ['/uploads/a.webp#h', false, false],
  ['/uploads//a.webp', false, false],
  ['/uploads/a/', false, false],
  ['/uploads/', false, false],
  ['/other/a.png', false, false],
  // 채팅·임시 파일이 사는 경로 — 캠페인은 현행대로 통과하고 localUploadsOnly 에서만 막는다.
  ['/uploads/.private/x.png', true, false],
  ['/uploads/a/.x.png', true, false],
];

describe('isSafeImageUrl', () => {
  it.each(TABLE)('%s → 기본 %p · localUploadsOnly %p', (input, defaultMode, localOnly) => {
    expect(isSafeImageUrl(input)).toBe(defaultMode);
    expect(isSafeImageUrl(input, { localUploadsOnly: true })).toBe(localOnly);
  });

  it.each([undefined, null, 5, {}, ['/uploads/a.png']])('문자열이 아닌 %p 는 거부한다', (value) => {
    expect(isSafeImageUrl(value)).toBe(false);
    expect(isSafeImageUrl(value, { localUploadsOnly: true })).toBe(false);
  });
});
