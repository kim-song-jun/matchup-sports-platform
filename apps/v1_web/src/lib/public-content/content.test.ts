/**
 * 공개 콘텐츠 무결성. 이 데이터는 FAQPage·DefinedTermSet JSON-LD 로 AI·검색엔진에 인용되므로,
 * 깨진 앵커·없는 질문 참조·지키지 못할 약속 문구가 그대로 퍼진다.
 */
import { describe, expect, it } from 'vitest';
import { buildFaqPageLd } from '@/lib/public-site/structured-data';
import { expectNoNonFootballCompetitionClaim } from '@/test/public-claims';
import { AUDIENCE_PAGES } from './audiences';
import { FAQ_CATEGORIES, FAQ_ITEMS, faqsByIds } from './faq';
import { GLOSSARY_TERMS } from './glossary';
import { GUIDES, guidePath } from './guides';

/** alpha 에 없는 약속: 주최자 운영 계정·어드민 권한(스태프 지정까지만), 소켓식 실시간, AI 매칭. */
const FORBIDDEN = ['운영 계정', '실시간', 'AI 매칭', '어드민 권한', '관리자 권한'];

function allText(): string[] {
  return [
    ...FAQ_ITEMS.flatMap((item) => [item.question, ...item.answer, ...(item.links ?? []).map((l) => l.label)]),
    ...GUIDES.flatMap((g) => [g.title, g.summary, ...g.steps.flatMap((s) => [s.title, s.body]), ...g.notes.flatMap((n) => [n.title, ...n.body])]),
    ...GLOSSARY_TERMS.flatMap((t) => [t.term, t.definition, ...(t.detail ?? [])]),
    ...AUDIENCE_PAGES.flatMap((a) => [
      a.metaTitle, a.metaDescription, a.keyword, a.title, a.lead,
      ...[...a.points, ...(a.steps ?? []), ...a.notYet].flatMap((p) => [p.title, p.body]),
      ...a.ctas.map((c) => c.label),
    ]),
  ];
}

describe('FAQ 데이터', () => {
  it('id 는 고유하고 URL 앵커로 쓸 수 있는 kebab-case 다', () => {
    const ids = FAQ_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('모든 답은 첫 문장이 완결된 해요체 문장이다(answer-first)', () => {
    for (const item of FAQ_ITEMS) {
      const first = item.answer[0].trim();
      expect(first.length, item.id).toBeGreaterThan(10);
      expect(first, item.id).toMatch(/(요|다)\.$/);
      // 첫 문단이 한 문장이어야 인용했을 때 앞뒤 맥락 없이 읽힌다
      expect(first.slice(0, -1), item.id).not.toMatch(/[.?!]\s/);
    }
  });

  it('카테고리는 전부 정의돼 있고, 정의된 카테고리는 전부 쓰인다', () => {
    const defined = new Set(FAQ_CATEGORIES.map((c) => c.id));
    const used = new Set(FAQ_ITEMS.map((item) => item.category));
    expect([...used].every((id) => defined.has(id))).toBe(true);
    expect(used.size).toBe(defined.size);
  });

  it('20~30문항이고 updatedAt 은 유효한 날짜다', () => {
    expect(FAQ_ITEMS.length).toBeGreaterThanOrEqual(20);
    expect(FAQ_ITEMS.length).toBeLessThanOrEqual(30);
    for (const item of [...FAQ_ITEMS, ...GUIDES, ...GLOSSARY_TERMS, ...AUDIENCE_PAGES]) {
      expect(item.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(item.updatedAt))).toBe(false);
    }
  });

  it('FAQPage LD 의 답에는 링크 라벨이 섞이지 않는다', () => {
    const ld = buildFaqPageLd(FAQ_ITEMS, '/faq') as { mainEntity: { acceptedAnswer: { text: string } }[] };
    FAQ_ITEMS.forEach((item, index) => {
      const text = ld.mainEntity[index].acceptedAnswer.text;
      expect(text).toBe(item.answer.join(' '));
      for (const link of item.links ?? []) expect(text).not.toContain(link.label);
    });
  });
});

describe('공개 콘텐츠 전체', () => {
  it.each(FORBIDDEN)('지키지 못할 약속 문구 "%s" 가 없다', (phrase) => {
    for (const text of allText()) expect(text).not.toContain(phrase);
  });

  it('대회 경기 설정 종목을 축구·풋살 밖으로 약속하지 않는다', () => {
    for (const text of allText()) expectNoNonFootballCompetitionClaim(text);
  });

  it('가이드·용어집·대상 페이지가 가리키는 FAQ 는 모두 존재한다', () => {
    const refs = [
      ...GUIDES.flatMap((g) => g.relatedFaqIds),
      ...GLOSSARY_TERMS.flatMap((t) => t.relatedFaqIds ?? []),
      ...AUDIENCE_PAGES.flatMap((a) => a.relatedFaqIds),
    ];
    expect(() => faqsByIds(refs)).not.toThrow();
    expect(() => faqsByIds(['no-such-question'])).toThrow(/no-such-question/);
  });

  it('FAQ 링크의 /help/guides/* 는 실제 가이드 slug 다', () => {
    const guidePaths = new Set(GUIDES.map((g) => guidePath(g.slug)));
    const linked = FAQ_ITEMS.flatMap((item) => item.links ?? []).map((l) => l.href).filter((h) => h.startsWith('/help/guides/'));
    expect(linked.length).toBeGreaterThan(0);
    for (const href of linked) expect(guidePaths.has(href), href).toBe(true);
  });

  it('용어·가이드·대상 식별자는 고유하다', () => {
    for (const ids of [GLOSSARY_TERMS.map((t) => t.id), GUIDES.map((g) => g.slug), AUDIENCE_PAGES.map((a) => a.slug)]) {
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
