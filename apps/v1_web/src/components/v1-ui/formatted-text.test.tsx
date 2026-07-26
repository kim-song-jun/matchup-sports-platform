import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormattedText } from './formatted-text';

describe('FormattedText', () => {
  it('renders a divider line (---) as a styled <hr>, not literal dash text', () => {
    const { container } = render(
      <FormattedText text={'환불 규정 안내\n\n---\n\n대회 당일 취소는 환불 불가합니다.'} />
    );
    const hr = container.querySelector('hr.tm-fmt-hr');
    expect(hr).not.toBeNull();
    // 대시 문자열이 문단 텍스트로 그대로 노출되면 안 된다.
    expect(container.textContent).not.toContain('---');
  });

  it('detects underscore, block-line, and asterisk divider variants', () => {
    const variants = ['___', '─────', '***'];
    for (const divider of variants) {
      const { container } = render(<FormattedText text={`앞 문단\n\n${divider}\n\n뒤 문단`} />);
      expect(container.querySelectorAll('hr.tm-fmt-hr').length).toBe(1);
      expect(container.textContent).not.toContain(divider);
    }
  });

  it('detects the single "⸻" (U+2E3B three-em dash) divider some note apps auto-convert "---" into', () => {
    // 실제 시드 데이터(0e65978c 대회 규정)가 이 관습을 사용한다 — 반복 없이 한 글자로 등장.
    const { container } = render(<FormattedText text={'1. 참가 자격\n\n본문 내용\n\n⸻\n\n2. 경기 방식'} />);
    expect(container.querySelectorAll('hr.tm-fmt-hr').length).toBe(1);
    expect(container.textContent).not.toContain('⸻');
  });

  it('does not treat a short 2-char dash run as a divider', () => {
    const { container } = render(<FormattedText text={'문단 안에 -- 짧은 대시가 있어요'} />);
    expect(container.querySelector('hr.tm-fmt-hr')).toBeNull();
    expect(container.textContent).toContain('-- 짧은 대시가 있어요');
  });

  it('does not confuse a real bullet item with a divider', () => {
    const { container } = render(<FormattedText text={'- 첫 번째 항목\n- 두 번째 항목'} />);
    expect(container.querySelector('hr.tm-fmt-hr')).toBeNull();
    const items = container.querySelectorAll('.tm-fmt-li');
    expect(items.length).toBe(2);
  });

  it('keeps rendering paragraphs, bullet lists, and ordered lists around a divider', () => {
    const { container } = render(
      <FormattedText
        text={'대회 규정\n\n1. 경기 시작 30분 전 도착\n2. 유니폼 착용 필수\n\n───\n\n- 우천 시 실내 대체\n- 문의는 채팅으로'}
      />
    );
    expect(container.querySelector('ol.tm-fmt-list')).not.toBeNull();
    expect(container.querySelector('ul.tm-fmt-list')).not.toBeNull();
    expect(container.querySelector('hr.tm-fmt-hr')).not.toBeNull();
  });
});
