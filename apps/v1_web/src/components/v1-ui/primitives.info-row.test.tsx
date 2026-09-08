import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfoRow } from './primitives';

/**
 * **라벨이 있는 자리에서 "모른다"는 말로 해야 한다.**
 *
 * 값이 빈 문자열이면 예전엔 라벨만 남고 값 칸이 통째로 비었다 — 사용자는 그걸 "정보가
 * 없다"가 아니라 **화면이 깨졌다**로 읽는다(개인 매치 상세의 "성별 조건"이 그렇게 나갔다).
 *
 * 소비처를 전수로 봤을 때 **값 없음이 정상인 자리가 하나도 없어서** 공유본이 폴백하는 게
 * 안전하다. 다른 어휘를 쓰는 화면은 호출부가 폴백을 명시한다 — 그때는 이 기본값이 닿지
 * 않아야 한다(아래 마지막 케이스).
 */
function valueOf(container: HTMLElement): string {
  const row = container.querySelector('.tm-info-row');
  expect(row).not.toBeNull();
  const value = (row as HTMLElement).querySelector('.tm-text-body');
  expect(value).not.toBeNull();
  return ((value as HTMLElement).textContent ?? '').trim();
}

describe('InfoRow — 빈 값', () => {
  it('값이 있으면 그대로 그린다', () => {
    const { container } = render(<InfoRow label="장소" value="안양천 풋살장" />);
    expect(valueOf(container)).toBe('안양천 풋살장');
  });

  it('빈 문자열이면 미정이라고 말한다', () => {
    const { container } = render(<InfoRow label="장소" value="" />);
    expect(valueOf(container)).toBe('미정');
    // 라벨은 그대로 남아야 한다 — 행을 숨기면 "이 항목이 없는 매치"로 읽힌다.
    expect(within(container).getByText('장소')).toBeInTheDocument();
  });

  /** 서버가 `' '` 를 주는 경우 — `''` 만 보는 판정은 반만 막는다. */
  it('공백만 있어도 빈 값으로 본다', () => {
    const { container } = render(<InfoRow label="장소" value="   " />);
    expect(valueOf(container)).toBe('미정');
  });

  /**
   * 앞뒤 공백은 **판정과 렌더가 같은 값을 봐야** 한다 — `trim()` 으로 "값이 있다"고 판정하고
   * 원본을 그리면 화면에 공백이 남아 정렬이 흔들린다.
   */
  it('앞뒤 공백은 다듬어서 그린다', () => {
    const { container } = render(<InfoRow label="장소" value="  안양천 풋살장  " />);
    expect(valueOf(container)).toBe('안양천 풋살장');
    // `textContent` 를 직접 봐서 실제로 공백이 안 들어갔는지 확인한다(위 헬퍼는 trim 한다).
    const value = container.querySelector('.tm-info-row .tm-text-body');
    expect(value?.textContent).toBe('안양천 풋살장');
  });

  /**
   * 폴백은 **값 슬롯만** 대체한다 — 값이 없다고 그 행의 다른 정보까지 사라지면 안 된다.
   */
  it('빈 값이어도 sub 와 badge 는 그대로 그린다', () => {
    const { container } = render(
      <InfoRow label="장소" value="" sub="주소는 확정 후 안내해요" badge={<span>마감 임박</span>} />,
    );
    expect(valueOf(container)).toContain('미정');
    expect(within(container).getByText('주소는 확정 후 안내해요')).toBeInTheDocument();
    expect(within(container).getByText('마감 임박')).toBeInTheDocument();
  });
});
