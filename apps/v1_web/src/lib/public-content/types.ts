/**
 * 공개 소개·도움말 페이지(/faq, /help, /for/*)가 함께 읽는 콘텐츠 모양.
 *
 * 화면과 JSON-LD 가 같은 배열을 읽는다 — 화면에 없는 문장을 구조화 데이터에만 넣으면 검색엔진이
 * 스팸으로 본다. 그래서 링크(`links`)는 본문 문단과 따로 둔다: LD 에는 문단만 싣고 링크 라벨은
 * 싣지 않는다(AI 가 답을 인용할 때 끝에 버튼 문구가 붙지 않게).
 */

export type PublicLink = {
  readonly href: string;
  readonly label: string;
};

/** 인용되기 쉬운 비교표. 각 행은 행 머리(`header`)만 읽어도 뜻이 통하게 쓴다. */
export type PublicTable = {
  readonly caption: string;
  readonly columns: readonly string[];
  readonly rows: readonly { readonly header: string; readonly cells: readonly string[] }[];
};

/** 첫 문장이 문맥 없이 읽히는 완결된 답이어야 한다(answer-first). */
export type AnswerParagraphs = readonly [string, ...string[]];
