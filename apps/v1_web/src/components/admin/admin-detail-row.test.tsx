/**
 * 상세 화면의 "값 없음" 판정. 회원·팀·매치·팀매치가 각자 복사해 갖고 있던 것을 하나로 모으면서
 * 그 안에 있던 결함도 함께 고쳤다 — 아래가 그 계약이다.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminDetailRow } from './admin-detail-row';

describe('AdminDetailRow', () => {
  it('값이 없으면 대시로 보여준다', () => {
    render(<><AdminDetailRow label="지역" value={null} /><AdminDetailRow label="주소" value={undefined} /></>);
    expect(screen.getAllByText('-')).toHaveLength(2);
  });

  it('빈 문자열도 값 없음으로 본다 — 빈 칸을 남기지 않는다', () => {
    // `value ?? '-'` 였을 때의 결함: DB 에 ''가 들어오면 칸이 비어 라벨만 남았다.
    render(<AdminDetailRow label="주소" value="" />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('0 은 0 그대로 보여준다 — 값이 없는 게 아니다', () => {
    // `value || '-'` 였을 때의 결함: 0 을 빈 값으로 삼켰다.
    render(<AdminDetailRow label="참가비" value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('-')).not.toBeInTheDocument();
  });

  it('보통 값은 그대로 보여준다', () => {
    render(<AdminDetailRow label="지역" value="서울 성동구" />);
    expect(screen.getByText('서울 성동구')).toBeInTheDocument();
  });
});
