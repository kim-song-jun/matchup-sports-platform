import type { Metadata } from 'next';
import { buildPublicMetadata } from '@/lib/seo';
import { fetchPublicSiteInfo } from '@/lib/public-site/site-info';
import { PublicSiteFooter } from '@/components/public-site';
import { LandingRoot } from '@/components/landing/landing-root';
import { LandingCtaBanner, LandingHow } from '@/components/landing/landing-sections';
import { LandingMobileCta } from '@/components/landing/landing-mobile-cta';
import { fetchLandingV4Data } from '@/lib/landing/landing-v4-data';
import { LandingV4Nav } from '@/components/landing/v4/landing-v4-nav';
import { LandingV4Hero } from '@/components/landing/v4/landing-v4-hero';
import { LandingV4Doors } from '@/components/landing/v4/landing-v4-doors';
import { LandingV4Live } from '@/components/landing/v4/landing-v4-live';
import { LandingV4Sports } from '@/components/landing/v4/landing-v4-sports';
import { LandingV4Faq } from '@/components/landing/v4/landing-v4-faq';

/* v3 와 같은 이유로 색인하지 않고 정본은 /landing 으로 둔다. */
const base = buildPublicMetadata({
  title: '매치부터 대회까지, 한 앱에서 끝까지',
  description:
    '매치와 팀을 찾고, 대회 신청부터 라이브 스코어와 기록까지 한 흐름으로 이어지는 생활체육 플랫폼 팀밋이에요.',
  path: '/landing/v4',
});

export const metadata: Metadata = {
  ...base,
  alternates: { canonical: '/landing' },
  robots: { index: false, follow: true },
};

// 목록 페이지와 같은 이유 — 빌드 타임에 API 를 못 받아 빈 seed 가 그대로 굳는 것을 막는다.
// fetchPublicV1 자체는 next:{revalidate:300} 을 쓰므로 API 부하는 5분 캐시로 그대로 유지된다.
export const revalidate = 0;

/* 구성: GNB → 히어로 → 문 3개 → 지금 열려 있어요(실데이터) → 시작 3단계(A안 재사용) →
 * 종목(실데이터) → 자주 묻는 질문 3개 → CTA 배너 → 푸터 → 모바일 하단 바. */
export default async function LandingV4Page() {
  const [siteInfo, data] = await Promise.all([fetchPublicSiteInfo(), fetchLandingV4Data()]);
  return (
    <LandingRoot variant="v4">
      <LandingV4Nav />
      <main>
        <LandingV4Hero />
        <LandingV4Doors data={data} />
        <LandingV4Live data={data} />
        <LandingHow />
        <LandingV4Sports data={data} />
        <LandingV4Faq />
        <LandingCtaBanner />
      </main>
      <div data-mobile-cta-hide>
        <PublicSiteFooter siteInfo={siteInfo} />
      </div>
      <LandingMobileCta browse={{ href: '/team-matches', label: '경기 보기', cta: 'mobile_bar_browse_team_matches' }} />
    </LandingRoot>
  );
}
