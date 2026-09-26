import { FAQ_CATEGORIES, FAQ_ITEMS, faqsByIds, type FaqItem } from '@/lib/public-content/faq';
import { GLOSSARY_TERMS } from '@/lib/public-content/glossary';
import { GUIDES, guidePath } from '@/lib/public-content/guides';
import { faqAnchorPath, normalizeHelpText as normalize, type HelpSearchEntry } from './help-search';

/** 허브 "자주 찾는 질문". 답은 /faq 에만 싣고 여기서는 질문 링크만 보인다(FAQPage 중복 방지). */
export const HELP_POPULAR_FAQ_IDS = [
  'how-to-sign-up',
  'match-confirmation',
  'join-a-competition',
  'result-confirmation',
  'entry-fee-refund',
  'host-a-competition',
] as const;

export function buildHelpSearchIndex(): HelpSearchEntry[] {
  const categoryLabel = new Map(FAQ_CATEGORIES.map((category) => [category.id, category.label]));
  const faqs = FAQ_ITEMS.map((item) => ({
    kind: 'faq' as const,
    href: faqAnchorPath(item),
    title: item.question,
    context: categoryLabel.get(item.category) ?? '',
    haystack: normalize([item.question, ...item.answer].join(' ')),
  }));
  const guides = GUIDES.map((guide) => ({
    kind: 'guide' as const,
    href: guidePath(guide.slug),
    title: guide.title,
    context: guide.audience,
    haystack: normalize([guide.title, guide.summary, ...guide.steps.flatMap((step) => [step.title, step.body])].join(' ')),
  }));
  const terms = GLOSSARY_TERMS.map((term) => ({
    kind: 'term' as const,
    href: `/help/glossary#${term.id}`,
    title: term.term,
    context: '용어집',
    haystack: normalize([term.term, ...(term.aliases ?? []), term.definition].join(' ')),
  }));
  return [...faqs, ...guides, ...terms];
}

export function popularFaqs(): FaqItem[] {
  return faqsByIds(HELP_POPULAR_FAQ_IDS);
}
