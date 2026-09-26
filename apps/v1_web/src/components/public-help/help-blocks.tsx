import Link from 'next/link';
import type { FaqItem } from '@/lib/public-content/faq';
import { guidePath, type Guide } from '@/lib/public-content/guides';
import { faqAnchorPath } from '@/lib/public-site/help-search';

/** 질문 링크 목록. 답은 /faq 한 곳에만 싣고(FAQPage 원출처) 다른 페이지는 질문으로 딥링크만 건다. */
export function HelpQuestionLinks({ items, label }: { items: readonly FaqItem[]; label: string }) {
  return (
    <ul className="tm-help-qlinks" aria-label={label}>
      {items.map((item) => (
        <li key={item.id}>
          <Link className="tm-help-qlink" href={faqAnchorPath(item)}>{item.question}</Link>
        </li>
      ))}
    </ul>
  );
}

export function HelpGuideCards({ guides, headingLevel = 'h3' }: { guides: readonly Guide[]; headingLevel?: 'h2' | 'h3' }) {
  const Heading = headingLevel;
  return (
    <ul className="tm-help-guides">
      {guides.map((guide) => (
        <li key={guide.slug} className="tm-help-guide-card">
          <p className="tm-help-guide-who">{guide.audience}</p>
          <Heading className="tm-help-guide-title">
            <Link className="tm-help-guide-link" href={guidePath(guide.slug)}>{guide.title}</Link>
          </Heading>
          <p className="tm-help-guide-summary">{guide.summary}</p>
          <p className="tm-help-guide-more" aria-hidden="true">{guide.steps.length}단계 · 가이드 보기</p>
        </li>
      ))}
    </ul>
  );
}

/** 페이지 끝 문의 안내. 답변 목표 시간은 정해지지 않아 약속하지 않는다. */
export function HelpContactCta({ showFaqLink = true }: { showFaqLink?: boolean }) {
  return (
    <aside className="tm-help-cta" aria-labelledby="help-cta-heading">
      <h2 id="help-cta-heading" className="tm-help-cta-title">찾는 답이 없나요?</h2>
      <p className="tm-help-cta-body">
        로그인했다면 1:1 문의로, 로그인이 안 되면 이메일로, 대회 개설·제휴는 문의 폼으로 보내 주세요. 문의 창구에서 한 번에 고를 수 있어요.
      </p>
      <div className="tm-help-cta-actions">
        <Link className="tm-btn tm-btn-md tm-btn-primary" href="/contact">문의 창구 보기</Link>
        {showFaqLink ? (
          <Link className="tm-btn tm-btn-md tm-btn-outline" href="/faq">자주 묻는 질문 전체 보기</Link>
        ) : null}
      </div>
    </aside>
  );
}
