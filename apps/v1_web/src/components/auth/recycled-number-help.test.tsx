import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RecycledNumberHelp } from './recycled-number-help';

afterEach(cleanup);

describe('RecycledNumberHelp', () => {
  it('새로 받은 번호일 수 있다는 한 줄과, 번호를 싣지 않은 고객센터 링크를 준다', () => {
    render(<RecycledNumberHelp />);

    expect(screen.getByText('번호를 최근에 새로 받았나요? 전에 이 번호를 쓰던 계정이 남아 있을 수 있어요.')).toBeInTheDocument();
    // 주소에 쿼리가 없어야 번호·계정 단서가 URL(기록·로그)에 남지 않는다.
    expect(screen.getByRole('link', { name: '고객센터에 알려 주세요' })).toHaveAttribute('href', '/contact');
  });

  it('링크를 앞 문장과 이어서 읽는다 — 이름은 보이는 글자 그대로, 맥락은 설명으로', () => {
    render(<RecycledNumberHelp />);

    expect(screen.getByRole('link', { name: '고객센터에 알려 주세요' }))
      .toHaveAccessibleDescription('번호를 최근에 새로 받았나요? 전에 이 번호를 쓰던 계정이 남아 있을 수 있어요.');
  });

  it('두 컴포넌트가 한 화면에 있어도 설명이 서로의 문장을 가리키지 않는다', () => {
    render(<><RecycledNumberHelp /><RecycledNumberHelp variant="not-mine" /></>);

    const [first, second] = screen.getAllByRole('link', { name: '고객센터에 알려 주세요' });
    expect(first).toHaveAccessibleDescription(/^번호를 최근에 새로 받았나요\?/);
    expect(second).toHaveAccessibleDescription('내 계정이 아닌가요? 번호를 최근에 새로 받았다면');
  });

  it('찾은 계정이 눈앞에 있을 때(not-mine)는 "내 계정이 아닌가요?"로 시작해 같은 링크로 이어진다', () => {
    render(<RecycledNumberHelp variant="not-mine" />);

    const sentence = screen.getByRole('link', { name: '고객센터에 알려 주세요' }).closest('p');
    expect(sentence).toHaveTextContent('내 계정이 아닌가요? 번호를 최근에 새로 받았다면고객센터에 알려 주세요');
    expect(screen.getByRole('link', { name: '고객센터에 알려 주세요' })).toHaveAttribute('href', '/contact');
  });

  it('링크는 탈퇴 안내의 고객센터 링크와 같은 낮은 강조 버튼 모양(44px 높이의 sm ghost)이다', () => {
    render(<RecycledNumberHelp />);

    const link = screen.getByRole('link', { name: '고객센터에 알려 주세요' });
    expect(link).toHaveClass('tm-btn', 'tm-btn-sm', 'tm-btn-ghost', 'tm-btn-block');
  });
});
