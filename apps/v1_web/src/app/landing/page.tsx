import { buildPublicMetadata } from '@/lib/seo';
import { fetchPublicSiteInfo } from '@/lib/public-site/site-info';
import { PublicSiteFooter, PublicSiteGnb } from '@/components/public-site';
import { LandingRoot } from '@/components/landing/landing-root';
import { LandingMobileCta } from '@/components/landing/landing-mobile-cta';
import { fetchLandingV4Data, formatLandingCount, sportChips } from '@/lib/landing/landing-v4-data';
import { LandingV4Hero } from '@/components/landing/v4/landing-v4-hero';
import { LandingV4Stage } from '@/components/landing/v4/landing-v4-stage';
import { LandingV4Now } from '@/components/landing/v4/landing-v4-now';
import { LandingV4Bento } from '@/components/landing/v4/landing-v4-bento';
import { LandingV4Steps } from '@/components/landing/v4/landing-v4-steps';
import { LandingV4Faq } from '@/components/landing/v4/landing-v4-faq';
import { LandingV4Cta } from '@/components/landing/v4/landing-v4-cta';

export const metadata = buildPublicMetadata({
  title: '팀밋 — 축구·풋살 매치, 팀 찾기와 대회',
  description:
    '팀밋에서 함께 뛸 매치와 팀을 찾아보세요. 축구·풋살 대회와 리그의 일정, 참가 신청, 라이브 스코어, 경기 기록을 한곳에서 확인할 수 있어요.',
  path: '/landing',
});

// 목록 페이지와 같은 이유 — 빌드 타임에 API 를 못 받아 빈 seed 가 그대로 굳는 것을 막는다.
// fetchPublicV1 자체는 next:{revalidate:300} 을 쓰므로 API 부하는 5분 캐시로 그대로 유지된다.
export const revalidate = 0;

/* 구성: GNB → 히어로(데모) → 고정 무대(실데이터 ①②) → 지금 팀밋에서(실데이터, 유일한 강조) →
 * 경기 전후 벤토 → 3단계 → 자주 묻는 질문 → 펼쳐지는 CTA → 푸터 → 모바일 하단 바. */
export default async function LandingPage() {
  const [siteInfo, data] = await Promise.all([fetchPublicSiteInfo(), fetchLandingV4Data()]);
  const sports = sportChips(data.bySport, 'teamMatches').map((chip) => chip.name);
  return (
    <LandingRoot>
      <PublicSiteGnb currentPath="/landing" landing />
      <main>
        <LandingV4Hero />
        <LandingV4Stage
          matches={data.teamMatches}
          countText={formatLandingCount(data.counts.teamMatches)}
          sportsText={sports.length > 0 ? sports.join(' · ') : null}
        />
        <LandingV4Now data={data} />
        <LandingV4Bento />
        <LandingV4Steps />
        <LandingV4Faq />
        <LandingV4Cta />
      </main>
      {/* 공개 페이지(/faq·/help·/for/*·/contact)와 같은 푸터 — 사업자 정보는 어드민 설정에서 온다 */}
      <div data-mobile-cta-hide>
        <PublicSiteFooter siteInfo={siteInfo} />
      </div>
      <LandingMobileCta />
    </LandingRoot>
  );
}
