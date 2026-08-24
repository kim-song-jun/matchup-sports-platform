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

/**
 * **요청마다 실행해야 한다.** `revalidate` 만 두면 이 라우트가 빌드 타임에 한 장으로
 * 생성되어 **모든 사용자에게 같은 이미지가 나간다.**
 *
 * alpha 실측(2026-08-24, 서빙 커밋 888041a8)에서 실제로 그랬다 -- 서로 다른 두 사용자와
 * **존재하지 않는 사용자**까지 응답 바이트가 완전히 동일(42,163 bytes)했다. 빌드 시점에는
 * `v1_api` 에 닿을 수 없어 프로필이 null 이었고, 그때 만들어진 폴백 이미지가 그대로
 * 구워져 나가고 있었다.
 *
 * 데이터 캐시는 `fetchPublicProfileForOg` 의 `next: { revalidate: 300 }` 이 담당한다 --
 * 그건 URL 단위라 사용자별로 따로 캐시된다. 라우트 자체를 정적으로 만들면 안 된다.
 */
export const dynamic = 'force-dynamic';

/**
 * ## satori 는 숫자 자식을 렌더하지 못한다
 *
 * `<div>{42}</div>` 처럼 **숫자를 그대로 자식으로 주면** satori 가
 * `Expected <div> to have explicit "display: flex" ...` 로 던진다. 숫자를 자식 노드로
 * 세면서 컨테이너로 오인하는 것으로 보인다 -- 같은 자리에 문자열을 주면 통과한다.
 *
 * 이 카드는 총점·등번호·능력치가 전부 숫자라 **정상 카드 경로가 항상 실패**했고,
 * 문자열만 쓰는 폴백 이미지만 성공했다. 그래서 모든 사용자가 같은 폴백을 받았다
 * (alpha 실측: 서로 다른 사용자와 없는 사용자까지 응답 바이트가 동일).
 *
 * 그러므로 **이 파일에서 숫자를 자식으로 쓸 때는 반드시 `String()` 으로 감싼다.**
 */

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 이 라우트는 force-dynamic 이므로 fetch 도 no-store 여야 한다 -- revalidate 와 함께
  // 쓰면 캐시 전략이 모순되고, 그 예외를 헬퍼가 삼켜 모든 사용자가 같은 폴백을 받았다.
  const [fonts, profile] = await Promise.all([loadOgFonts(), fetchPublicProfileForOg(id, 'no-store')]);

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
            <div style={{ fontSize: 148, fontWeight: 700, lineHeight: 1 }}>{String(card.overall ?? '–')}</div>
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
                {String(card.jerseyNumber)}
              </div>
            ) : null}
            <div style={{ fontSize: 60, fontWeight: 700 }}>{profile.displayName}</div>
          </div>
          {/* satori 는 자식이 둘 이상인 div 에 명시적 display 를 요구한다. 여기서는
              레이아웃이 필요한 게 아니라 한 줄 텍스트이므로, 조각을 나누지 말고
              **하나의 문자열로 합친다** -- flex 를 붙이면 텍스트가 조각별로 배치된다. */}
          <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.66)', marginTop: 8 }}>
            {`${tier.label} · ${card.appearances}경기${teamName ? ` · ${teamName}` : ''}`}
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
              {/* 자물쇠 이모지는 satori 가 못 그리므로 텍스트 `잠김` 으로 말한다.
                  주석은 **엘리먼트 밖에** 둔다 -- satori 는 텍스트 전용 div 안의 주석까지
                  자식으로 세어 "display: flex 를 붙여라" 에러를 낸다. */}
              <div
                style={{
                  width: 116,
                  fontSize: 44,
                  fontWeight: 700,
                  color: s.value === null ? 'rgba(255,255,255,0.34)' : '#ffffff',
                }}
              >
                {String(s.value ?? '잠김')}
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
