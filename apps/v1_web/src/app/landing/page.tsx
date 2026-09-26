import { buildPublicMetadata } from '@/lib/seo';
import { fetchPublicSiteInfo } from '@/lib/public-site/site-info';
import { PublicSiteFooter } from '@/components/public-site';
import { LandingRoot } from '@/components/landing/landing-root';
import { LandingHero, LandingNav } from '@/components/landing/landing-hero';
import { LandingWhy } from '@/components/landing/landing-why';
import { LandingTour } from '@/components/landing/landing-tour';
import { LandingBento } from '@/components/landing/landing-bento';
import { LandingCtaBanner, LandingHow, LandingSports } from '@/components/landing/landing-sections';
import { LandingMobileCta } from '@/components/landing/landing-mobile-cta';

export const metadata = buildPublicMetadata({
  title: '매치부터 대회까지, 한 앱에서 끝까지',
  description:
    '축구·풋살·러닝·수영 매치와 팀을 찾고, 대회·리그 신청부터 라이브 스코어와 기록까지 한 흐름으로 이어지는 생활체육 플랫폼 Teameet이에요.',
  path: '/landing',
});

/* 섹션은 전부 서버 컴포넌트라 설명 텍스트가 HTML 에 그대로 실린다. 클라이언트 섬은
   CTA 계측·테마/모션 스위치·내비 메뉴·예전/이제 토글·모바일 CTA 바·모션 배선(LandingRoot)뿐이다. */
export default async function LandingPage() {
  const siteInfo = await fetchPublicSiteInfo();
  return (
    <LandingRoot>
      <LandingNav />
      <main>
        <LandingHero />
        <LandingWhy />
        <LandingTour />
        <LandingBento />
        <LandingSports />
        <LandingHow />
        <LandingCtaBanner />
      </main>
      {/* 공개 페이지(/faq·/help·/for/*·/contact)와 같은 푸터 — 사업자 정보는 어드민 설정에서 온다 */}
      <div data-mobile-cta-hide>
        <PublicSiteFooter siteInfo={siteInfo} />
      </div>
      <LandingMobileCta />
    </LandingRoot>
  );
}
