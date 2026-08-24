import { ImageResponse } from 'next/og';
import { loadOgFonts, OG_CARD_SIZE, OG_POSITION_LABEL, OG_TIER } from '@/lib/og-card';
import { fetchPublicProfileForOg } from './fetch-profile';

/**
 * 선수 카드 링크 미리보기 이미지 (Task 155).
 *
 * 카카오톡·인스타그램에 `/users/:id/card` 링크를 붙이면 이 이미지가 뜬다. 카드를
 * 만든 목적이 "자랑해서 공유하게 만들기"이므로, **링크가 텍스트로만 보이면 절반은
 * 실패**다 -- 이 파일이 그 나머지 절반이다.
 *
 * ## 화면 카드와 같아야 하는 것
 * 등급색·잠금 표기·"등급은 뛴 경기 수" 문구는 화면과 동일하게 간다. 미리보기가
 * 실제 화면과 다르면 링크를 눌렀을 때 "다른 걸 보여줬다"가 된다.
 *
 * ## 잠긴 능력치는 여기서도 숫자를 만들지 않는다
 * 공유 이미지라고 빈칸을 채우면 카드 전체가 거짓말이 된다. 자물쇠 이모지는 satori 가
 * 못 그리므로 텍스트 `잠김`으로 표기한다.
 */

export const size = OG_CARD_SIZE;
export const contentType = 'image/png';
export const alt = '선수 카드';

// satori 렌더와 폰트 에셋 로딩 모두 Node 런타임에서 돌린다.
export const runtime = 'nodejs';
// 카드는 경기가 끝나야 바뀐다 -- 매 요청마다 API 를 때릴 이유가 없다.
export const revalidate = 300;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [fonts, profile] = await Promise.all([loadOgFonts(), fetchPublicProfileForOg(id)]);

  // 폰트를 못 읽었으면 satori 기본 폰트로 간다. 한글은 못 그리지만 500 보다는 낫다 --
  // 깨진 썸네일은 링크를 안 눌리게 만든다. 이 경우 라틴 전용 브랜드 이미지로 떨어진다.
  const fontConfig =
    fonts === null
      ? undefined
      : [
          { name: 'Pretendard', data: fonts.regular, weight: 400 as const, style: 'normal' as const },
          { name: 'Pretendard', data: fonts.bold, weight: 700 as const, style: 'normal' as const },
        ];

  // 프로필이 없거나 카드를 숨겼으면 카드 대신 브랜드 카드를 그린다. 404 이미지를
  // 내려보내면 카카오톡이 깨진 썸네일을 보여준다 -- 그건 링크를 안 눌리게 만든다.
  if (fonts === null || profile === null || profile.playerCard === null || profile.playerCard === undefined) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(160deg, #20252e 0%, #0f1319 100%)',
            color: '#ffffff',
            fontSize: 56,
            fontWeight: 700,
            fontFamily: 'Pretendard',
          }}
        >
          Teameet 선수 카드
        </div>
      ),
      { ...size, fonts: fontConfig },
    );
  }

  const card = profile.playerCard;
  const tier = OG_TIER[card.tier];
  const teamName = profile.teams?.[0]?.name ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          padding: 56,
          background: `radial-gradient(1000px 600px at 78% 0%, ${tier.glow} 0%, rgba(0,0,0,0) 60%), linear-gradient(160deg, #20252e 0%, #141821 62%, #0f1319 100%)`,
          color: '#ffffff',
          fontFamily: 'Pretendard',
        }}
      >
        {/* 왼쪽 — 총점·포지션·이름 */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24 }}>
            <div style={{ fontSize: 148, fontWeight: 700, lineHeight: 1 }}>{card.overall ?? '–'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 16 }}>
              <div style={{ fontSize: 40, fontWeight: 700, color: '#ffc342', letterSpacing: 4 }}>
                {card.position ?? '–'}
              </div>
              <div style={{ fontSize: 22, color: 'rgba(255,255,255,0.6)' }}>
                {card.position ? OG_POSITION_LABEL[card.position] : '포지션 미정'}
              </div>
            </div>
          </div>

          {/* 등번호는 이름 앞. 왼쪽 큰 숫자(총점)와 헷갈리지 않게 크기·색을 낮춘다. */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 20 }}>
            {card.jerseyNumber !== null ? (
              <div
                style={{
                  fontSize: 34,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.5)',
                  border: '2px solid rgba(255,255,255,0.24)',
                  borderRadius: 10,
                  padding: '2px 12px',
                }}
              >
                {card.jerseyNumber}
              </div>
            ) : null}
            <div style={{ fontSize: 60, fontWeight: 700 }}>{profile.displayName}</div>
          </div>
          <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.66)', marginTop: 8 }}>
            {tier.label} · {card.appearances}경기{teamName ? ` · ${teamName}` : ''}
          </div>
          <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.44)', marginTop: 26 }}>
            등급은 실력이 아니라 뛴 경기 수로 올라가요
          </div>
        </div>

        {/* 오른쪽 — 6능력치 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            width: 470,
            paddingLeft: 44,
            borderLeft: `2px solid ${tier.ring}`,
          }}
        >
          {card.stats.map((s) => (
            <div key={s.code} style={{ display: 'flex', alignItems: 'center', marginBottom: 22 }}>
              <div
                style={{
                  width: 116,
                  fontSize: 44,
                  fontWeight: 700,
                  color: s.value === null ? 'rgba(255,255,255,0.34)' : '#ffffff',
                }}
              >
                {/* 자물쇠 이모지는 satori 가 못 그린다 -- 텍스트로 말한다. */}
                {s.value ?? '잠김'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.52)', letterSpacing: 2 }}>
                  {s.code}
                </div>
                <div
                  style={{
                    fontSize: 24,
                    color: s.value === null ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.84)',
                  }}
                >
                  {s.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts: fontConfig },
  );
}
