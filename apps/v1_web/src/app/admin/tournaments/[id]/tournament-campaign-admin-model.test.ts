import { describe, expect, it } from 'vitest';
import {
  emptyTournamentCampaignForm,
  validateTournamentCampaignForm,
  type TournamentCampaignForm,
} from './tournament-campaign-admin-model';

/**
 * 캠페인 편집 폼이 서버 PLAIN_TEXT(`<>{}`, "속성명:" 형태 거부)를 사전 검증하지
 * 않아, 그 조합을 입력하면 저장이 400으로만 실패하고 어느 필드 때문인지 알 수
 * 없었던 결함(감사 index 74)의 회귀 방지 테스트. 서버 DTO(apps/v1_api/src/tournaments
 * /dto/tournament-campaign.dto.ts)와 동일한 입력으로, 프론트가 제출 전에 필드별
 * 에러로 미리 잡아내는지 확인한다.
 */
function filledForm(overrides: Partial<TournamentCampaignForm> = {}): TournamentCampaignForm {
  return {
    ...emptyTournamentCampaignForm('t-1'),
    heroTitle: '풋살 여름 대회',
    introTitle: '소개',
    introBody: '대회 소개 내용입니다.',
    highlightsSectionTitle: '참가할 이유',
    faqSectionTitle: 'FAQ',
    ...overrides,
  };
}

describe('validateTournamentCampaignForm — PLAIN_TEXT 사전 검증', () => {
  it('정상 텍스트는 통과한다', () => {
    const errors = validateTournamentCampaignForm(filledForm());
    expect(errors).toEqual({});
  });

  it('꺾쇠(<, >)가 들어간 FAQ 답변은 제출 전에 필드별 에러를 반환한다', () => {
    const form = filledForm({
      faq: [{ question: '진행 순서가 어떻게 되나요?', answer: 'A조 > B조 순으로 진행합니다.' }],
    });
    const errors = validateTournamentCampaignForm(form);
    expect(errors.faq).toBeDefined();
  });

  it('중괄호({ })가 들어간 소개 내용은 제출 전에 필드별 에러를 반환한다', () => {
    const form = filledForm({ introBody: '준비물 { 유니폼, 축구화 } 을 챙겨오세요.' });
    const errors = validateTournamentCampaignForm(form);
    expect(errors.introBody).toBeDefined();
  });

  it('"속성명:" 형태(예: position:)는 제출 전에 필드별 에러를 반환한다', () => {
    const form = filledForm({ heroSummary: 'position: 자유' });
    const errors = validateTournamentCampaignForm(form);
    expect(errors.heroSummary).toBeDefined();
  });

  it('참가할 이유(highlight) 제목·내용도 동일하게 검증한다', () => {
    const form = filledForm({
      highlights: [{ title: '전문 심판진', body: '<선착순 16팀> 우선 배정', imageUrl: '' }],
    });
    const errors = validateTournamentCampaignForm(form);
    expect(errors.highlights).toBeDefined();
  });
});
