import { faqsByIds, type FaqItem } from '@/lib/public-content/faq';
import type { GlossaryTerm } from '@/lib/public-content/glossary';
import type { Guide } from '@/lib/public-content/guides';
import { helpSearchKey, normalizeHelpText as normalize, type HelpSearchEntry } from './help-search';

/** 허브 "자주 찾는 질문". 허브는 답을 제자리에서 펼쳐 보이지만 FAQPage JSON-LD 는 /faq 에만 싣는다. */
export const HELP_POPULAR_FAQ_IDS = [
  'how-to-sign-up',
  'match-confirmation',
  'join-a-competition',
  'result-confirmation',
  'entry-fee-refund',
  'host-a-competition',
] as const;

export function faqSearchEntries(items: readonly FaqItem[]): HelpSearchEntry[] {
  return items.map((item) => {
    const table = item.table
      ? [item.table.caption, ...item.table.rows.flatMap((row) => [row.header, ...row.cells])]
      : [];
    return { key: helpSearchKey('faq', item.id), haystack: normalize([item.question, ...item.answer, ...table].join(' ')) };
  });
}

export function guideSearchEntries(guides: readonly Guide[]): HelpSearchEntry[] {
  return guides.map((guide) => ({
    key: helpSearchKey('guide', guide.slug),
    haystack: normalize(
      [guide.title, guide.audience, guide.summary, ...guide.steps.flatMap((step) => [step.title, step.body])].join(' '),
    ),
  }));
}

export function termSearchEntries(terms: readonly GlossaryTerm[]): HelpSearchEntry[] {
  return terms.map((term) => ({
    key: helpSearchKey('term', term.id),
    haystack: normalize([term.term, ...(term.aliases ?? []), term.definition, ...(term.detail ?? [])].join(' ')),
  }));
}

export function popularFaqs(): FaqItem[] {
  return faqsByIds(HELP_POPULAR_FAQ_IDS);
}
