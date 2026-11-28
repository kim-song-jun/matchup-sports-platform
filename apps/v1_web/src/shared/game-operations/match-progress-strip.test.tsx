import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { matchProgressSteps, resultProgressSteps, type ProgressStep } from '@/lib/match-progress-steps';
import { MatchProgressStrip } from './match-progress-strip';

const NAMES = [
  { number: 1, label: '전반' },
  { number: 2, label: '후반' },
  { number: 3, label: '연장 전반' },
  { number: 4, label: '연장 후반' },
];

/** 결선 연장 아홉 단계 — 단계 줄이 가장 길어지는 경우다. */
function finalWithExtra(position: { livePeriodNumber: number | null; breakBeforePeriodNumber: number | null }): ProgressStep[] {
  return matchProgressSteps({
    periods: NAMES,
    regularPeriodCount: 2,
    regulationEnded: false,
    allowPenaltyShootout: true,
    penaltyShootoutEligible: false,
    ...position,
  });
}

/** jsdom 에는 Tailwind 스타일이 없어서 눈에 보이는 글자는 `sr-only`(시각 숨김 규약)를 뺀 글자로 잰다. */
function visibleText(item: HTMLElement): string {
  const clone = item.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.sr-only').forEach((node) => node.remove());
  return (clone.textContent ?? '').trim();
}

function items() {
  return within(screen.getByRole('list', { name: '경기 진행 단계' })).getAllByRole('listitem');
}

describe('MatchProgressStrip — 진행 중 경기', () => {
  it('단계마다 목록 항목이 하나고 이름이 모두 있다 — 지금이 아니어도 스크린리더가 읽는다', () => {
    render(<MatchProgressStrip steps={finalWithExtra({ livePeriodNumber: 3, breakBeforePeriodNumber: null })} label="경기 진행 단계" />);
    expect(items().map((item) => item.textContent)).toEqual([
      '전반', '하프타임', '후반', '휴식', '연장 전반', '휴식', '연장 후반', '승부차기(동점이면)', '종료',
    ]);
  });

  it('aria-current="step" 은 지금 단계 하나에만 붙는다', () => {
    render(<MatchProgressStrip steps={finalWithExtra({ livePeriodNumber: 3, breakBeforePeriodNumber: null })} label="경기 진행 단계" />);
    const current = items().filter((item) => item.getAttribute('aria-current') === 'step');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe('연장 전반');
  });

  it('눈에 보이는 글자는 지금 단계와 바로 다음 단계뿐이다', () => {
    render(<MatchProgressStrip steps={finalWithExtra({ livePeriodNumber: 3, breakBeforePeriodNumber: null })} label="경기 진행 단계" />);
    const visible = items().map(visibleText).filter((text) => text !== '');
    expect(visible).toEqual(['연장 전반', '휴식']);
  });

  it('지금이 쉬는 단계여도 지금과 다음만 글자로 보인다', () => {
    render(<MatchProgressStrip steps={finalWithExtra({ livePeriodNumber: null, breakBeforePeriodNumber: 2 })} label="경기 진행 단계" />);
    expect(items().map(visibleText).filter((text) => text !== '')).toEqual(['하프타임', '후반']);
  });

  it('지난 단계는 체크가 있고 지금·남은 단계에는 체크가 없다', () => {
    render(<MatchProgressStrip steps={finalWithExtra({ livePeriodNumber: 3, breakBeforePeriodNumber: null })} label="경기 진행 단계" />);
    const withCheck = items().filter((item) => item.querySelector('svg') !== null);
    expect(withCheck.map((item) => item.textContent)).toEqual(['전반', '하프타임', '후반', '휴식']);
  });

  it('조건부 승부차기는 다음 단계가 아니면 글자 없이 점선 점으로만 있고 이름에 「동점이면」이 담긴다', () => {
    render(<MatchProgressStrip steps={finalWithExtra({ livePeriodNumber: 3, breakBeforePeriodNumber: null })} label="경기 진행 단계" />);
    const penalty = items().find((item) => item.getAttribute('data-step-state') === 'conditional') as HTMLElement;
    expect(visibleText(penalty)).toBe('');
    expect(penalty.textContent).toBe('승부차기(동점이면)');
  });

  it('바로 다음 단계가 승부차기면 「승부차기?」가 아니라 「승부차기」 글자로 보이고 점선은 그대로다', () => {
    render(<MatchProgressStrip steps={finalWithExtra({ livePeriodNumber: 4, breakBeforePeriodNumber: null })} label="경기 진행 단계" />);
    const penalty = items().find((item) => item.getAttribute('data-step-state') === 'conditional') as HTMLElement;
    expect(visibleText(penalty)).toBe('승부차기');
    expect(penalty.textContent).toBe('승부차기(동점이면)');
    expect(items().map(visibleText).filter((text) => text !== '')).toEqual(['연장 후반', '승부차기']);
  });

  it('승부차기 차례가 되면 지금 단계로 보이고 점선이 아니다', () => {
    const steps = matchProgressSteps({
      periods: NAMES.slice(0, 2),
      regularPeriodCount: 2,
      livePeriodNumber: null,
      breakBeforePeriodNumber: null,
      regulationEnded: true,
      allowPenaltyShootout: true,
      penaltyShootoutEligible: true,
    });
    render(<MatchProgressStrip steps={steps} label="경기 진행 단계" />);
    const current = items().find((item) => item.getAttribute('aria-current') === 'step') as HTMLElement;
    expect(current.textContent).toBe('승부차기');
    expect(current.getAttribute('data-step-state')).toBe('current');
    expect(items().map(visibleText).filter((text) => text !== '')).toEqual(['승부차기', '종료']);
  });

  it('마지막 단계가 지금이면 다음이 없어 글자는 하나다', () => {
    const steps = matchProgressSteps({
      periods: NAMES.slice(0, 2),
      regularPeriodCount: 2,
      livePeriodNumber: null,
      breakBeforePeriodNumber: null,
      regulationEnded: true,
      allowPenaltyShootout: false,
      penaltyShootoutEligible: false,
    });
    render(<MatchProgressStrip steps={steps} label="경기 진행 단계" />);
    expect(items().map(visibleText).filter((text) => text !== '')).toEqual(['종료']);
  });

  it('지금 위치를 모르면 글자 없이 이름만 둔다', () => {
    const steps = matchProgressSteps({
      periods: NAMES.slice(0, 2),
      regularPeriodCount: 2,
      livePeriodNumber: null,
      breakBeforePeriodNumber: null,
      regulationEnded: false,
      allowPenaltyShootout: false,
      penaltyShootoutEligible: false,
    });
    render(<MatchProgressStrip steps={steps} label="경기 진행 단계" />);
    expect(items().map(visibleText).filter((text) => text !== '')).toEqual([]);
    expect(items().filter((item) => item.hasAttribute('aria-current'))).toHaveLength(0);
    expect(items()).toHaveLength(4);
  });

  it('단계가 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<MatchProgressStrip steps={[]} label="경기 진행 단계" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('MatchProgressStrip — 끝난 경기', () => {
  it('labels="all" 이면 네 단계 이름이 모두 글자로 보이고 지금은 결과 확인이다', () => {
    render(<MatchProgressStrip steps={resultProgressSteps({ official: false })} label="경기 진행 단계" labels="all" />);
    expect(items().map(visibleText)).toEqual(['예정', '진행', '결과 확인', '확정']);
    expect(items().find((item) => item.getAttribute('aria-current') === 'step')?.textContent).toBe('결과 확인');
  });
});
