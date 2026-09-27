import type { Metadata } from 'next';
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

/* A안(/landing)과 내용이 같은 비교용 안이라 색인하지 않고 정본을 /landing 으로 둔다.
   og:url 은 이 페이지로 둔다 — 같으면 메신저 미리보기 캐시가 A안과 서로를 덮는다.
   sitemap·llms.txt 에도 넣지 않는다. */
const base = buildPublicMetadata({
  title: '매치부터 대회까지, 한 앱에서 끝까지',
  description:
    '축구·풋살·러닝·수영 매치와 팀을 찾고, 대회·리그 신청부터 라이브 스코어와 기록까지 한 흐름으로 이어지는 생활체육 플랫폼 Teameet이에요.',
  path: '/landing/v3',
});

export const metadata: Metadata = {
  ...base,
  alternates: { canonical: '/landing' },
  robots: { index: false, follow: true },
};

/* 내용·순서·카피는 A안 그대로다. 달라지는 건 768 이상에서 투어가 sticky 폰 대신 "설명 + 전용 화면"
   행으로 서고, 스크롤 위치로 켜지는 연출이 처음부터 완성 상태로 보이는 것뿐이다(landing-v3.css). */
export default async function LandingV3Page() {
  const siteInfo = await fetchPublicSiteInfo();
  return (
    <LandingRoot variant="v3">
      <LandingNav />
      <main>
        <LandingHero />
        <LandingWhy />
        <LandingTour layout="rows" />
        <LandingBento />
        <LandingSports />
        <LandingHow />
        <LandingCtaBanner />
      </main>
      <div data-mobile-cta-hide>
        <PublicSiteFooter siteInfo={siteInfo} />
      </div>
      <LandingMobileCta />
    </LandingRoot>
  );
}
