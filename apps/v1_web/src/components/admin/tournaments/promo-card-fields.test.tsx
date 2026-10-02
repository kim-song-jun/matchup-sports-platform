import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PromoCardFields, type TournamentPromoCardValue } from './promo-card-fields';

const EMPTY_VALUE: TournamentPromoCardValue = {
  enabled: false,
  title: '',
  subtitle: '',
  imageUrl: '',
  badgeText: '',
  dateText: '',
  teamsText: '',
  locationText: '',
  prizeText: '',
  priority: '0',
};

function renderFields(canResetFacts: boolean) {
  return render(
    <PromoCardFields
      variant="home"
      value={EMPTY_VALUE}
      onChange={() => {}}
      fallback={{ title: '테스트 대회', venue: null, sportName: null }}
      onResetFacts={() => {}}
      canResetFacts={canResetFacts}
    />,
  );
}

const RESET_BUTTON = { name: '날짜·장소·상금 문구를 대회 정보로 다시 채우기' };
const RESET_HINT = '직접 고친 문구가 없어서 되돌릴 것이 없어요.';

describe('PromoCardFields — 다시 채우기 버튼', () => {
  it('되돌릴 것이 없으면 비활성 사유를 눈에 보이는 문구로 알린다', () => {
    // disabled 버튼은 포인터 이벤트를 받지 않아 title 툴팁이 뜨지 않고, 터치 기기엔 hover
    // 자체가 없다. 사유가 title 로만 붙어 있으면 아무에게도 닿지 않으므로 화면에 렌더해야
    // 한다 — 이 단언이 깨지면 툴팁 전용 안내로 되돌아간 것이다.
    renderFields(false);

    const button = screen.getByRole('button', RESET_BUTTON);
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('title');

    const hint = screen.getByText(RESET_HINT);
    // 사유는 버튼과 접근성 트리에서도 연결돼 있어야 스크린리더가 함께 읽는다.
    expect(button.getAttribute('aria-describedby')).toBe(hint.getAttribute('id'));
  });

  it('되돌릴 것이 있으면 버튼이 눌리고 비활성 사유는 사라진다', () => {
    renderFields(true);

    const button = screen.getByRole('button', RESET_BUTTON);
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText(RESET_HINT)).toBeNull();
  });
});
