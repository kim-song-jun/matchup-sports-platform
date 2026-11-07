import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  parallelTracksNote,
  TournamentProgressStepper,
  type StageStatus,
  type TournamentStage,
} from './tournament-progress-stepper';

const NAMES = ['조별리그', '12강', '8강', '4강', '결승', '시상'];

function stages(statuses: StageStatus[], tracks?: string[]): TournamentStage[] {
  return statuses.map((status, idx) => ({
    key: `s${idx}`,
    label: NAMES[idx] ?? `단계 ${idx + 1}`,
    status,
    ...(tracks && idx > 0 && idx < statuses.length - 1 ? { parallelTracks: tracks } : {}),
  }));
}

function items() {
  return within(screen.getByRole('list', { name: '대회 진행 단계' })).getAllByRole('listitem');
}

describe('TournamentProgressStepper 진행 표시', () => {
  it('진행 중인 단계에는 "진행 중"과 현재 단계 표시가 붙고 카운터는 그 단계 번호를 말한다', () => {
    const { container } = render(
      <TournamentProgressStepper stages={stages(['done', 'done', 'active', 'upcoming', 'upcoming', 'upcoming'])} />,
    );

    const [, , eightFinal] = items();
    expect(eightFinal).toHaveAttribute('aria-current', 'step');
    expect(eightFinal).toHaveTextContent('진행 중');
    expect(screen.queryByText('다음')).not.toBeInTheDocument();
    expect(screen.getByText('전체 6단계 중 3단계 진행 중')).toBeInTheDocument();
    expect(container.querySelector('.tm-hub-stepper-count [aria-hidden="true"]')).toHaveTextContent('3 / 6');
  });

  it('단계 사이 구간에서는 첫 미완료 단계가 "다음"이고 카운터는 끝낸 단계 수를 말한다', () => {
    render(<TournamentProgressStepper stages={stages(['done', 'done', 'upcoming', 'upcoming', 'upcoming', 'upcoming'])} />);

    const listItems = items();
    expect(listItems[2]).toHaveAccessibleName('8강 (다음 단계)');
    expect(listItems[2]).toHaveTextContent('다음');
    // 그 뒤 단계는 그냥 예정이다.
    expect(listItems[3]).toHaveAccessibleName('4강 (예정)');
    expect(listItems.filter((item) => item.textContent?.includes('다음'))).toHaveLength(1);
    expect(listItems.some((item) => item.hasAttribute('aria-current'))).toBe(false);
    expect(screen.getByText('전체 6단계 중 2단계 완료')).toBeInTheDocument();
  });

  it('아직 아무 단계도 시작하지 않았으면 첫 단계가 "다음"이다', () => {
    render(<TournamentProgressStepper stages={stages(['upcoming', 'upcoming', 'upcoming'])} />);

    expect(items()[0]).toHaveAccessibleName('조별리그 (다음 단계)');
    expect(screen.getByText('전체 3단계 중 0단계 완료')).toBeInTheDocument();
  });

  it('모두 끝났으면 "다음"도 "진행 중"도 없다', () => {
    render(<TournamentProgressStepper stages={stages(['done', 'done', 'done'])} />);

    expect(screen.queryByText('다음')).not.toBeInTheDocument();
    expect(screen.queryByText('진행 중')).not.toBeInTheDocument();
    expect(screen.getByText('전체 3단계 중 3단계 완료')).toBeInTheDocument();
  });

  it('칸의 접근 가능한 이름은 단계 이름과 상태다', () => {
    render(<TournamentProgressStepper stages={stages(['done', 'active', 'upcoming'])} />);

    expect(items().map((item) => item.getAttribute('aria-label'))).toEqual([
      '조별리그 (완료)',
      '12강 (진행 중)',
      '8강 (예정)',
    ]);
  });
});

describe('TournamentProgressStepper 토너먼트 안내', () => {
  it('같은 단계를 치르는 토너먼트가 둘 이상이면 스텝퍼 위에 한 줄로 알린다', () => {
    render(
      <TournamentProgressStepper
        stages={stages(['done', 'active', 'upcoming', 'upcoming'], ['상위 토너먼트', '하위 토너먼트'])}
      />,
    );

    expect(screen.getByText('상위·하위 토너먼트가 같은 단계로 진행돼요')).toBeInTheDocument();
  });

  it('토너먼트가 하나이거나 구분이 없으면 안내를 띄우지 않는다', () => {
    const { rerender } = render(<TournamentProgressStepper stages={stages(['done', 'active', 'upcoming'])} />);
    expect(screen.queryByText(/같은 단계로 진행돼요/)).not.toBeInTheDocument();

    rerender(<TournamentProgressStepper stages={stages(['done', 'active', 'upcoming'], ['프리미어'])} />);
    expect(screen.queryByText(/같은 단계로 진행돼요/)).not.toBeInTheDocument();
  });
});

describe('parallelTracksNote', () => {
  it('이름 끝의 "토너먼트"·"결선"은 문장이 다시 붙이므로 한 번만 나온다', () => {
    expect(parallelTracksNote(['상위 토너먼트', '하위 토너먼트'])).toBe('상위·하위 토너먼트가 같은 단계로 진행돼요');
    expect(parallelTracksNote(['상위 결선', '하위 결선'])).toBe('상위·하위 토너먼트가 같은 단계로 진행돼요');
  });

  it('운영자가 붙인 이름은 그대로 읽는다', () => {
    expect(parallelTracksNote(['프리미어', '챌린지'])).toBe('프리미어·챌린지 토너먼트가 같은 단계로 진행돼요');
  });

  it('이름이 "토너먼트" 뿐이면 그 이름을 지우지 않는다', () => {
    expect(parallelTracksNote(['토너먼트', '챌린지'])).toBe('토너먼트·챌린지 토너먼트가 같은 단계로 진행돼요');
  });
});
