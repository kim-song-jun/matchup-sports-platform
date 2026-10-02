/**
 * @vitest-environment node
 *
 * jsdom 에서 돌리면 sharp 가 "Unsupported input ... of type object" 로 거부한다 --
 * jsdom 의 Uint8Array 가 Node 의 것과 달라 satori 산출 SVG 를 넘기지 못한다.
 * 이 테스트는 실제 PNG 를 만드는 것이 목적이므로 Node 환경에서 돈다.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * satori 가 실제로 이 카드를 그릴 수 있는지 건다 (Task 155).
 *
 * ## 왜 렌더까지 하나
 * 이 라우트는 **네 라운드 동안 alpha 에서 모든 사용자에게 같은 폴백 이미지**를 줬다.
 * HTTP 200 · PNG · `cache-control: no-store` 까지 전부 정상이라 상태코드로는 통과했고,
 * 실패는 서버 로그에도 남지 않았다. 원인은 두 가지가 겹쳐 있었다:
 *
 * 1. 폰트를 `fetch(new URL(..., import.meta.url))` 로 읽었다 -- 그 URL 은 `file:` 스킴인데
 *    Node 의 fetch 는 `file:` 을 지원하지 않아 **항상 실패**했다.
 * 2. **satori 는 숫자를 자식으로 받지 못한다.** `<div>{42}</div>` 는
 *    `Expected <div> to have explicit "display: flex" ...` 로 던진다. 이 카드는 총점·
 *    등번호·능력치가 전부 숫자라 정상 경로가 항상 실패했고, 문자열만 쓰는 폴백만 성공했다.
 *
 * 그래서 여기서는 **실제로 PNG 를 만들어 본다.** 렌더가 되는지는 렌더해야만 알 수 있다.
 */

// 라우트 파일과 같은 폰트를 쓴다 -- 폰트가 사라지거나 경로가 바뀌면 이 테스트가 먼저 깨진다.
const FONT_DIR = path.join(__dirname, '..', '..', '..', '..', 'lib', 'og-fonts');

type Node = { type: 'div'; props: { style: Record<string, unknown>; children: unknown } };
const el = (style: Record<string, unknown>, children: unknown): Node => ({ type: 'div', props: { style, children } });

async function render(child: unknown): Promise<Buffer> {
  const { ImageResponse } = (await import(
    'next/dist/compiled/@vercel/og/index.node.js'
  )) as { ImageResponse: new (element: unknown, options: unknown) => { arrayBuffer(): Promise<ArrayBuffer> } };
  const [regular, bold] = await Promise.all([
    readFile(path.join(FONT_DIR, 'Pretendard-Regular.ttf')),
    readFile(path.join(FONT_DIR, 'Pretendard-Bold.ttf')),
  ]);
  const response = new ImageResponse(
    el({ width: '100%', height: '100%', display: 'flex', background: '#111', color: '#fff', fontFamily: 'Pretendard' }, [child]),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Pretendard', data: regular, weight: 400, style: 'normal' },
        { name: 'Pretendard', data: bold, weight: 700, style: 'normal' },
      ],
    },
  );
  return Buffer.from(await response.arrayBuffer());
}

describe('선수 카드 OG 이미지 렌더', () => {
  it('숫자를 자식으로 주면 satori 가 거부한다 -- 이 계약이 깨지면 카드가 통째로 폴백된다', async () => {
    // 이 테스트가 실패하기 시작하면(= 숫자를 받아들이면) String() 래핑을 걷어도 된다.
    // 지금은 받아들이지 않으므로 아래 "문자열로 감싸면 그려진다" 가 필수 대응이다.
    await expect(render(el({ fontSize: 44 }, 42))).rejects.toThrow(/display: flex/);
  });

  it('문자열로 감싸면 그려진다', async () => {
    const png = await render(el({ fontSize: 44 }, String(42)));

    expect(png.subarray(0, 4).toString('hex')).toBe('89504e47');
  });

  it('카드의 숫자 3종(총점·등번호·능력치)을 모두 문자열로 넣으면 렌더된다', async () => {
    const card = { overall: 48, jerseyNumber: 1, statValue: 44 as number | null };

    const png = await render(
      el({ display: 'flex', flexDirection: 'column' }, [
        el({ fontSize: 148, fontWeight: 700 }, String(card.overall ?? '–')),
        el({ fontSize: 34 }, String(card.jerseyNumber)),
        el({ fontSize: 44 }, String(card.statValue ?? '잠김')),
      ]),
    );

    expect(png.length).toBeGreaterThan(1000);
  });

  it('잠긴 능력치(null)는 문자열 잠김으로 그려진다', async () => {
    const value: number | null = null;

    const png = await render(el({ fontSize: 44 }, String(value ?? '잠김')));

    expect(png.subarray(0, 4).toString('hex')).toBe('89504e47');
  });
});
