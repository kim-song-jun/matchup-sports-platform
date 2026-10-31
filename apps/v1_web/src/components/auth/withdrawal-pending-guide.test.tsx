import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WithdrawalPendingGuide } from './withdrawal-pending-guide';

afterEach(cleanup);

// KST 로는 11월 7일 00:30 — UTC 날짜(11월 6일)와 달라서 한국 달력으로 바꾸는지 가른다.
const UNTIL = '2026-11-06T15:30:00.000Z';
const STEPS = [
  { title: '계정에 로그인해요', body: '위 이메일로 가입한 계정이에요.' },
  { title: '탈퇴 신청을 취소해요' },
  { title: '계정을 다시 쓸 수 있어요' },
];

function renderGuide(props: Partial<Parameters<typeof WithdrawalPendingGuide>[0]> = {}) {
  return render(<WithdrawalPendingGuide until={UNTIL} steps={STEPS} waitedText="이 번호를 다시 쓸 수 있어요" {...props} />);
}

describe('WithdrawalPendingGuide', () => {
  it('방법 1 은 순서가 있는 단계로, 방법 2 는 오늘 → 삭제일(KST) → 그다음 일정으로 읽힌다', () => {
    renderGuide();

    const steps = within(screen.getByRole('list', { name: '방법 1 지금 바로 쓰기' })).getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent('계정에 로그인해요위 이메일로 가입한 계정이에요.');
    expect(steps[1]).toHaveTextContent('탈퇴 신청을 취소해요');
    expect(steps[2]).toHaveTextContent('계정을 다시 쓸 수 있어요');

    const timeline = within(screen.getByRole('list', { name: '기다릴 때의 일정' })).getAllByRole('listitem');
    expect(timeline).toHaveLength(3);
    expect(timeline[0]).toHaveTextContent('오늘탈퇴 신청 중');
    expect(timeline[1]).toHaveTextContent('11월 7일계정이 삭제돼요');
    expect(timeline[2]).toHaveTextContent('그다음이 번호를 다시 쓸 수 있어요');
    expect(screen.getByText('11월 7일')).toHaveAttribute('datetime', UNTIL);
  });

  it('두 방법을 제목으로 구분해 스크린리더가 방법 번호까지 읽는다', () => {
    renderGuide();
    expect(screen.getByRole('heading', { name: '방법 1 지금 바로 쓰기' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '방법 2 기다리기' })).toBeInTheDocument();
  });

  it('날짜가 null 이면 방법 2 와 일정을 그리지 않고 방법 1 은 그대로 둔다', () => {
    renderGuide({ until: null, actions: <a href="/login">로그인하고 탈퇴 취소하기</a> });

    expect(screen.queryByRole('heading', { name: /방법 2/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '기다릴 때의 일정' })).not.toBeInTheDocument();
    expect(screen.queryByText('계정이 삭제돼요')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '방법 1 지금 바로 쓰기' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '로그인하고 탈퇴 취소하기' })).toHaveAttribute('href', '/login');
  });

  it('읽을 수 없는 날짜도 "11월 7일" 같은 거짓 날짜를 만들지 않고 방법 2 를 뺀다', () => {
    renderGuide({ until: 'someday' });

    expect(screen.queryByText(/Invalid|NaN/)).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '기다릴 때의 일정' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '방법 1 지금 바로 쓰기' })).toBeInTheDocument();
  });

  it('제목 블록이 있으면 배지·제목·계정·안내를 위에 그리고 방법은 그 아래 단계의 제목이 된다', () => {
    renderGuide({ head: { title: '탈퇴를 신청한 계정이에요', lead: '두 가지예요.', account: { label: '가입한 이메일', value: 'ru***@example.com' } } });

    expect(screen.getByText('탈퇴 신청 중', { selector: '.tm-badge' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '탈퇴를 신청한 계정이에요' })).toHaveAccessibleDescription('두 가지예요.');
    expect(screen.getByText('가입한 이메일')).toBeInTheDocument();
    expect(screen.getByText('ru***@example.com')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '방법 1 지금 바로 쓰기' })).toBeInTheDocument();
  });

  it('제목 블록이 없으면 화면의 h1 바로 아래라 방법이 h2 다', () => {
    renderGuide();
    expect(screen.getByRole('heading', { level: 2, name: '방법 1 지금 바로 쓰기' })).toBeInTheDocument();
    expect(screen.queryByText('탈퇴 신청 중', { selector: '.tm-badge' })).not.toBeInTheDocument();
  });

  it('요청하면 제목으로 포커스를 옮기고, 아니면 가져가지 않는다', () => {
    const head = { title: '탈퇴를 신청한 계정이에요' };
    const { unmount } = renderGuide({ head });
    expect(document.body).toHaveFocus();
    unmount();

    renderGuide({ head, focusHeadingOnMount: true });
    expect(screen.getByRole('heading', { name: '탈퇴를 신청한 계정이에요' })).toHaveFocus();
  });

  it('방법 1 의 마지막 단계만 숫자 대신 끝 표시를 그리고 장식은 읽히지 않게 한다', () => {
    const { container } = renderGuide({ finishIcon: 'link' });
    const items = container.querySelectorAll('.tm-wpg-steps > li');
    expect(items[0].querySelector('.tm-wpg-num')).toHaveTextContent('1');
    expect(items[1].querySelector('.tm-wpg-num')).toHaveTextContent('2');
    expect(items[2].querySelector('.tm-wpg-num')).toHaveClass('tm-wpg-num-done');
    expect(items[2].querySelector('.tm-wpg-num')).toHaveTextContent('');
    container.querySelectorAll('.tm-wpg-num, .tm-wpg-dot').forEach((node) => expect(node).toHaveAttribute('aria-hidden', 'true'));
  });
});
