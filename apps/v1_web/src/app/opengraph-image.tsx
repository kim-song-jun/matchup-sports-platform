import { readFile } from 'node:fs/promises';
import { ImageResponse } from 'next/og';
import { loadOgFonts } from '@/lib/og-card';
import { DEFAULT_SOCIAL_IMAGE } from '@/lib/seo';

/**
 * 커버가 없는 페이지(대회·팀·공지·목록)의 기본 링크 미리보기.
 *
 * 데이터에 의존하지 않으므로 빌드 때 한 장으로 굽는다 — 요청마다 그릴 이유가 없다.
 * satori 는 CSS 변수를 읽지 못해 색·크기를 리터럴로 적는다(선수 카드 OG 와 같은 사정).
 */

export const size = { width: DEFAULT_SOCIAL_IMAGE.width, height: DEFAULT_SOCIAL_IMAGE.height };
export const contentType = 'image/png';
export const alt = 'Teameet — 매치부터 대회까지, 한 앱에서 끝까지';
export const runtime = 'nodejs';

const BRAND_BLUE = '#3182F6';
const BRAND_BLUE_DEEP = '#1B64DA';

async function loadMarkDataUrl(): Promise<string | null> {
  try {
    // import.meta.url 기준 경로여야 번들러가 에셋을 추적한다(og-card.ts 의 폰트와 같은 이유).
    const png = await readFile(new URL('../../public/brand/teameet-mark.png', import.meta.url));
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (error) {
    console.error('[opengraph-image] 로고 마크 로딩 실패 -- 마크 없이 그린다', error);
    return null;
  }
}

export default async function Image() {
  const [fonts, mark] = await Promise.all([loadOgFonts(), loadMarkDataUrl()]);

  // 폰트가 없으면 한글이 tofu 로 그려진다 — 라틴 워드마크만 남긴다.
  const fontConfig =
    fonts === null
      ? undefined
      : [
          { name: 'Pretendard', data: fonts.regular, weight: 400 as const, style: 'normal' as const },
          { name: 'Pretendard', data: fonts.bold, weight: 700 as const, style: 'normal' as const },
        ];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: `linear-gradient(135deg, ${BRAND_BLUE} 0%, ${BRAND_BLUE_DEEP} 100%)`,
          color: '#ffffff',
          fontFamily: 'Pretendard',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {mark ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 112,
                height: 112,
                borderRadius: 28,
                background: '#ffffff',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- satori 는 <img> 만 그린다 */}
              <img src={mark} width={88} height={88} alt="" />
            </div>
          ) : null}
          <div style={{ display: 'flex', fontSize: 52, fontWeight: 700, letterSpacing: -1 }}>Teameet</div>
        </div>

        {fonts === null ? null : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <div style={{ display: 'flex', flexDirection: 'column', fontSize: 76, fontWeight: 700, lineHeight: 1.2, letterSpacing: -2 }}>
              <div style={{ display: 'flex' }}>매치부터 대회까지,</div>
              <div style={{ display: 'flex' }}>한 앱에서 끝까지</div>
            </div>
            <div style={{ display: 'flex', fontSize: 36, fontWeight: 400, color: 'rgba(255, 255, 255, 0.88)' }}>
              축구·풋살·러닝·수영
            </div>
          </div>
        )}
      </div>
    ),
    { ...size, fonts: fontConfig },
  );
}
