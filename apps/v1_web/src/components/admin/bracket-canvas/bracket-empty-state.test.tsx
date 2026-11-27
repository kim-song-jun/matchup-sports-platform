import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BracketEmptyState } from './bracket-empty-state';

afterEach(() => cleanup());
const template = { key: 'template', label: '템플릿으로 대진 만들기' } as const;
const INFO = '/admin/tournaments/t-1/info?edit=rules';

function show(overrides: Partial<React.ComponentProps<typeof BracketEmptyState>> = {}) {
  const props = { canWrite: true, create: template, onCreate: vi.fn(), sixTeamNotice: false, infoHref: INFO, ...overrides };
  render(<BracketEmptyState {...props} />);
  return props;
}

describe('BracketEmptyState', () => {
  it('제목 「아직 대진이 없어요」, 버튼은 create.label 하나뿐이고 시간·구장 배정·초기화·공개 문구가 없다', () => {
    const props = show();
    expect(screen.getByText('아직 대진이 없어요')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '템플릿으로 대진 만들기' }));
    expect(props.onCreate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/시간 배정|구장 배정|초기화|공개/)).not.toBeInTheDocument();
  });

  it.each([
    ['template', '템플릿을 고르면 조와 경기가 한 번에 만들어져요. 팀은 나중에 넣어도 돼요.'],
    ['stage', '단계 구성에 맞춰 조와 경기가 한 번에 만들어져요. 팀은 나중에 넣어도 돼요.'],
    ['multi-finals-create', '예선 조를 편성하면 토너먼트까지 한 번에 만들어져요.'],
  ] as const)('%s 대회의 안내 문구', (key, sub) => {
    show({ create: { key, label: '대진 만들기' } });
    expect(screen.getByText(sub)).toBeInTheDocument();
  });

  it('create=null 이면 버튼이 없다(읽기 전용·형식 모름)', () => {
    show({ create: null });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('아직 만들어진 대진이 없어요.')).toBeInTheDocument();
  });

  it('읽기 전용(canWrite=false)은 create 가 있어도 버튼·링크가 없다', () => {
    show({ canWrite: false, sixTeamNotice: true, onShowList: vi.fn() });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('아직 만들어진 대진이 없어요.')).toBeInTheDocument();
  });

  it('sixTeamNotice 면 「6강 방식을 먼저 정해요」 링크가 대회 정보의 경기 규칙 편집을 가리킨다(대조군: 아니면 없다)', () => {
    show({ sixTeamNotice: true });
    expect(screen.getByRole('link', { name: '6강 방식을 먼저 정해요' })).toHaveAttribute('href', INFO);
    cleanup();
    show({ sixTeamNotice: false });
    expect(screen.queryByRole('link', { name: '6강 방식을 먼저 정해요' })).not.toBeInTheDocument();
  });

  it('폰 문구 「큰 화면에서 해요」가 어디에도 없다', () => {
    show();
    expect(document.body).not.toHaveTextContent('큰 화면');
  });

  it('onShowList 가 있으면 「직접 조 만들기」가 목록 보기로 보낸다', () => {
    const onShowList = vi.fn();
    show({ onShowList });
    fireEvent.click(screen.getByRole('button', { name: '직접 조 만들기' }));
    expect(onShowList).toHaveBeenCalledTimes(1);
  });

  it('onShowList 가 없으면 「직접 조 만들기」가 없다', () => {
    show();
    expect(screen.queryByRole('button', { name: '직접 조 만들기' })).not.toBeInTheDocument();
  });
});
