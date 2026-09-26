import { buildPublicMetadata } from '@/lib/seo';
import { LandingRoot } from '@/components/landing/landing-root';
import { LandingHero, LandingNav } from '@/components/landing/landing-hero';
import { LandingWhy } from '@/components/landing/landing-why';
import { LandingTour } from '@/components/landing/landing-tour';
import { LandingBento } from '@/components/landing/landing-bento';
import { LandingCtaBanner, LandingFooter, LandingHow, LandingSports } from '@/components/landing/landing-sections';
import { LandingMobileCta } from '@/components/landing/landing-mobile-cta';

export const metadata = buildPublicMetadata({
  title: '매치부터 대회까지, 한 앱에서 끝까지',
  description:
    '축구·풋살·러닝·수영 매치와 팀을 찾고, 대회·리그 신청부터 라이브 스코어와 기록까지 한 흐름으로 이어지는 생활체육 플랫폼 Teameet이에요.',
  path: '/landing',
});

/* 섹션은 전부 서버 컴포넌트라 설명 텍스트가 HTML 에 그대로 실린다. 클라이언트 섬은
   CTA 계측·테마/모션 스위치·예전/이제 토글·모바일 CTA 바·모션 배선(LandingRoot)뿐이다. */
export default function LandingPage() {
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
      <LandingFooter />
      <LandingMobileCta />
    </LandingRoot>
  );
}
