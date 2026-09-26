import type { Metadata } from 'next';
import { buildPublicMetadata } from '@/lib/seo';
import { LandingSports, LandingHow, LandingFooter } from '@/components/landing/landing-sections';
import { LandingMobileCta } from '@/components/landing/landing-mobile-cta';
import { LandingV2Root } from '@/components/landing/v2/landing-v2-root';
import { LandingV2Hero, LandingV2Nav } from '@/components/landing/v2/landing-v2-hero';
import { LandingV2Pains, LandingV2Pivot } from '@/components/landing/v2/landing-v2-pains';
import { LandingV2Story } from '@/components/landing/v2/landing-v2-story';
import { LandingV2CtaBanner, LandingV2Trust } from '@/components/landing/v2/landing-v2-trust';

/* A안(/landing)과 내용이 겹치는 비교용 안이라 색인하지 않고 정본을 /landing 으로 둔다.
   sitemap·llms.txt 에도 넣지 않는다. */
export const metadata: Metadata = {
  ...buildPublicMetadata({
    title: '운동보다 준비가 더 힘들었다면',
    description:
      '인원 모으기·대진표·점수 기록·전적 정리까지, 생활체육 경기 준비를 매치·팀·대회 한 흐름으로 이어 주는 Teameet이에요.',
    path: '/landing',
  }),
  robots: { index: false, follow: true },
};

/* 기(공감 히어로) → 승(불편 넷) → 전(반전 띠·해결 챕터·신뢰) → 결(종목·이용 방법·CTA).
   섹션은 서버 컴포넌트라 설명이 HTML 에 그대로 실리고, 클라이언트 섬은 CTA 계측·토글·모션 배선뿐이다. */
export default function LandingV2Page() {
  return (
    <LandingV2Root>
      <LandingV2Nav />
      <main>
        <LandingV2Hero />
        <LandingV2Pains />
        <LandingV2Pivot />
        <LandingV2Story />
        <LandingV2Trust />
        <LandingSports />
        <LandingHow />
        <LandingV2CtaBanner />
      </main>
      <LandingFooter />
      <LandingMobileCta variant="v2" />
    </LandingV2Root>
  );
}
