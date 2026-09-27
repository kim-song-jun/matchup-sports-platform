import type { Metadata } from 'next';
import { buildPublicMetadata } from '@/lib/seo';
import { fetchPublicSiteInfo } from '@/lib/public-site/site-info';
import { PublicSiteFooter } from '@/components/public-site';
import { LandingRoot } from '@/components/landing/landing-root';
import { LandingNav } from '@/components/landing/landing-hero';
import { LandingWhy } from '@/components/landing/landing-why';
import { LandingBento } from '@/components/landing/landing-bento';
import { LandingCtaBanner, LandingHow, LandingSports } from '@/components/landing/landing-sections';
import { LandingMobileCta } from '@/components/landing/landing-mobile-cta';
import { LandingV4Hero } from '@/components/landing/v4/landing-v4-hero';
import { LandingV4Tour } from '@/components/landing/v4/landing-v4-tour';

/* v3 와 같은 이유로 색인하지 않고 정본을 /landing 으로 둔다. og:url 은 미리보기 캐시가 겹치지 않게 이 페이지로 둔다.
   sitemap·llms.txt 에도 넣지 않는다. */
const base = buildPublicMetadata({
  title: '매치부터 대회까지, 한 앱에서 끝까지',
  description:
    '축구·풋살·러닝·수영 매치와 팀을 찾고, 대회·리그 신청부터 라이브 스코어와 기록까지 한 흐름으로 이어지는 생활체육 플랫폼 Teameet이에요.',
  path: '/landing/v4',
});

export const metadata: Metadata = {
  ...base,
  alternates: { canonical: '/landing' },
  robots: { index: false, follow: true },
};

/* 내용·순서·카피는 A안 그대로다. 히어로(직접 만져 보는 폰)와 투어(1024+·높이 700+ 고정 폰)만 v4 전용이다(landing-v4.css). */
export default async function LandingV4Page() {
  const siteInfo = await fetchPublicSiteInfo();
  return (
    <LandingRoot variant="v4">
      <LandingNav />
      <main>
        <LandingV4Hero />
        <LandingWhy />
        <LandingV4Tour />
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
