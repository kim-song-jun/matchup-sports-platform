import { ArrowRight } from 'lucide-react';
import { PublicFaqList } from '@/components/public-site';
import { faqsByIds } from '@/lib/public-content/faq';
import { LandingCtaLink } from '../landing-cta-link';

/* 회원가입 없이 둘러보기 · 참가비·결제 · (팀 없이는 안 되고 팀장/매니저가 신청하는) 대회 참가 흐름 —
 * 셋 다 lib/public-content/faq.ts 에 실제로 있는 항목이다. */
const FAQ_IDS = ['browse-without-account', 'entry-fee-payment', 'join-a-competition'] as const;

export function LandingV4Faq() {
  const items = faqsByIds(FAQ_IDS);

  return (
    <section id="faq" className="tm-landing-section" aria-labelledby="faq-heading">
      <div className="tm-landing-section-inner">
        <div className="tm-landing-section-header" data-align="center" data-reveal>
          <p className="tm-landing-section-kw">도움말</p>
          <h2 id="faq-heading" className="tm-landing-section-title">자주 묻는 질문</h2>
          <p className="tm-landing-section-sub">시작 전에 자주 나오는 질문만 먼저 모았어요.</p>
        </div>
        <div className="tm-landing-v4-faq" data-reveal>
          <PublicFaqList items={items} headingLevel="h3" />
        </div>
        <p className="tm-landing-v4-faq-more">
          <LandingCtaLink className="tm-landing-v4-faq-more-link" href="/help" cta="faq_view_all">
            도움말 전체 보기
            <ArrowRight size={16} aria-hidden="true" />
          </LandingCtaLink>
        </p>
      </div>
    </section>
  );
}
