import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import {
  ArrowRight,
  CalendarDays,
  ChartNoAxesColumn,
  CreditCard,
  MessageCircle,
  Trophy,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { PublicSearchItem, publicIllustrationSrc, type PublicIllustration } from '@/components/public-site';
import type { FaqCategory, FaqCategoryId, FaqItem } from '@/lib/public-content/faq';
import type { GlossaryTerm } from '@/lib/public-content/glossary';
import { guidePath, type Guide, type GuideSlug } from '@/lib/public-content/guides';
import { faqAnchorPath, faqCategorySectionId, helpSearchKey } from '@/lib/public-site/help-search';

/** 질문 링크 목록. 답을 펼치지 않는 자리(가이드·용어 관련 질문)에서 /faq 문항으로 딥링크만 건다. */
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

/** 가이드 카드·가이드 상세 히어로가 같은 그림을 쓴다. */
export const GUIDE_ILLUSTRATION: Readonly<Record<GuideSlug, PublicIllustration>> = {
  'join-match': 'landing-hero',
  'create-team': 'auth-welcome',
  'join-competition': 'journey-done',
  'match-results': 'matches-empty',
};

/**
 * 가이드 카드: 대상 → 제목(카드 전체로 넓힌 링크) → 한 줄 요약 → 단계 미리보기.
 * 페이지 검색어(PublicSearchProvider)가 있으면 맞지 않는 카드를 hidden 으로 가린다.
 */
export function HelpGuideCards({ guides, headingLevel = 'h3', columns = 2 }: {
  guides: readonly Guide[];
  headingLevel?: 'h2' | 'h3';
  /** 1024+ 칸 수. 세 장만 보일 때(가이드 상세의 "다른 가이드") 3칸으로 한 줄을 채운다. */
  columns?: 2 | 3;
}) {
  const Heading = headingLevel;
  return (
    <ul className="tm-help-guides" data-columns={columns}>
      {guides.map((guide, index) => (
        <PublicSearchItem key={guide.slug} matchKey={helpSearchKey('guide', guide.slug)}>
          <div className="tm-help-guide-reveal" data-reveal style={{ '--i': index % columns } as CSSProperties}>
            <div className="tm-help-guide-card">
              <div className="tm-help-guide-top">
                <div>
                  <p className="tm-help-guide-who">{guide.audience}</p>
                  <Heading className="tm-help-guide-title">
                    <Link className="tm-help-guide-link" href={guidePath(guide.slug)}>{guide.title}</Link>
                  </Heading>
                  <p className="tm-help-guide-summary">{guide.summary}</p>
                </div>
                <Image
                  className="tm-help-guide-illu"
                  src={publicIllustrationSrc(GUIDE_ILLUSTRATION[guide.slug])}
                  alt=""
                  width={640}
                  height={640}
                  sizes="112px"
                />
              </div>
              <ol className="tm-help-guide-steps" aria-label={`${guide.title} 단계`}>
                {guide.steps.map((step) => <li key={step.title}>{step.title}</li>)}
              </ol>
              <p className="tm-help-guide-more" aria-hidden="true">
                <span>{guide.steps.length}단계</span>
                <span className="tm-help-guide-go">가이드 보기 <ArrowRight size={16} /></span>
              </p>
            </div>
          </div>
        </PublicSearchItem>
      ))}
    </ul>
  );
}

const TOPIC_ICON: Readonly<Record<FaqCategoryId, LucideIcon>> = {
  account: UserRound,
  match: CalendarDays,
  team: UsersRound,
  competition: Trophy,
  result: ChartNoAxesColumn,
  fee: CreditCard,
  support: MessageCircle,
};

/** 허브의 주제별 질문 카드. 각 카드는 /faq 의 주제 묶음으로 이어진다. */
export function HelpTopics({ categories, items }: { categories: readonly FaqCategory[]; items: readonly FaqItem[] }) {
  return (
    <nav className="tm-help-topics" aria-labelledby="help-topics-label">
      <p className="tm-help-topics-label" id="help-topics-label">주제별 질문</p>
      <ul>
        {categories.map((category) => {
          const Icon = TOPIC_ICON[category.id];
          const count = items.filter((item) => item.category === category.id).length;
          return (
            <li key={category.id}>
              <Link className="tm-help-topic" href={`/faq#${faqCategorySectionId(category.id)}`}>
                <span className="tm-help-topic-icon" aria-hidden="true"><Icon size={20} /></span>
                <span className="tm-help-topic-text">
                  <b>{category.label}</b>
                  <small>질문 {count}개</small>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** 허브의 용어집 바로가기. 검색어가 있으면 맞는 용어 칩만 남긴다. */
export function HelpGlossaryShortcut({ terms }: { terms: readonly GlossaryTerm[] }) {
  return (
    <div className="tm-help-gloss">
      <p className="tm-help-gloss-head">
        <Link className="tm-ps-text-link" href="/help/glossary">용어집에서 말뜻 찾기</Link>
        <small>용어 {terms.length}개</small>
      </p>
      <ul className="tm-help-gloss-terms" aria-label="용어집 바로가기">
        {terms.map((term) => (
          <PublicSearchItem key={term.id} matchKey={helpSearchKey('term', term.id)}>
            <Link className="tm-help-gloss-term" href={`/help/glossary#${term.id}`}>{term.term}</Link>
          </PublicSearchItem>
        ))}
      </ul>
    </div>
  );
}
