/**
 * info-section.test.tsx
 *
 * 이 화면은 같은 값을 두 번 그리고 같은 편집 버튼을 두 곳에 두고 있었다(요약표 2개,
 * '대회 정보 수정' + '기본 정보 수정', 상금은 읽기 2곳 + 편집 1곳). 아래는 그 통합이
 * 되돌아가지 않도록 "한 번만 나온다"를 고정하고, 함께 고친 권한 게이팅을 검증한다.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { V1Tournament } from '@/types/api';
import { TournamentInfoSection } from './info-section';
import { TournamentAdminProvider } from './tournament-admin-context';

const { hooks } = vi.hoisted(() => ({
  hooks: { tournament: undefined as unknown, mutate: vi.fn() },
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournament: () => ({ data: hooks.tournament }),
  useV1UpdateTournament: () => ({ mutate: hooks.mutate, isPending: false }),
  useV1UploadImages: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1MasterSports: () => ({ data: [] }),
  useV1LineupSizeOptions: () => ({ data: [], isPending: false, isError: false }),
}));

const tournament = {
  id: 'tournament-1',
  sportId: 'sport-1',
  title: 'Teameet Futsal Cup',
  status: 'open',
  format: 'group_knockout',
  registrationDeadlineAt: '2026-08-25T00:00:00.000Z',
  rosterDeadlineAt: '2026-08-28T00:00:00.000Z',
  bracketPublishedAt: null,
  bracketPublishScheduledAt: null,
  scheduledAt: '2026-08-30T00:00:00.000Z',
  scheduledEndAt: null,
  venue: '성수 풋살장',
  parkingInfo: null,
  latitude: null,
  longitude: null,
  coverImageUrl: null,
  teamCount: 8,
  minPlayers: 8,
  maxPlayers: 12,
  competitionConfigVersionId: null,
  lineupMaxPlayers: 5,
  lineupMinPlayers: 3,
  lineupSizeOptions: [],
  substitutionMode: 'rolling',
  maxSubstitutions: null,
  substitutionModeOptions: ['limited', 'rolling'],
  genderCategory: null,
  genderMinMale: null,
  genderMaxMale: null,
  genderMinFemale: null,
  genderMaxFemale: null,
  minMatchesPerTeam: null,
  entryFee: 50000,
  prizePool: 1000000,
  prizeSummary: '우승 트로피 + 상금',
  prizeBreakdown: '우승 600,000원',
  promoHomeEnabled: false,
  promoHomePriority: 0,
  promoListEnabled: false,
  promoListPriority: 0,
  bankName: '국민은행',
  bankAccount: '123-456',
  bankHolder: '티밋',
  rulesText: null,
  refundPolicyText: null,
  registrationCount: 5,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
} as unknown as V1Tournament;

function renderSection(canWrite: boolean) {
  hooks.tournament = tournament;
  return render(
    <TournamentAdminProvider value={{ tournamentId: 'tournament-1', canWrite, showToast: vi.fn() }}>
      <TournamentInfoSection />
    </TournamentAdminProvider>,
  );
}

describe('TournamentInfoSection', () => {
  it('같은 값을 두 번 그리지 않는다', () => {
    renderSection(true);

    for (const label of ['신청 마감', '명단 마감', '참가비', '팀 수', '출전 인원', '교체 방식', '입금 계좌']) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }
    // 카드 제목과 업로더 자체 label이 겹쳐 '커버 이미지'가 두 번 뜬 적이 있다.
    expect(screen.getAllByText('커버 이미지')).toHaveLength(1);
  });

  it('편집 진입점은 관심사마다 하나씩이다', () => {
    renderSection(true);

    expect(screen.getAllByRole('button', { name: '대회 정보 수정' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '홍보 카드 수정' })).toHaveLength(1);
    // 같은 모달을 여는 두 번째 버튼이 있었다.
    expect(screen.queryByRole('button', { name: '기본 정보 수정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '프로모 설정' })).not.toBeInTheDocument();
  });

  it('상금은 편집기 한 곳에서만 읽고 고친다', () => {
    renderSection(true);

    expect(screen.getAllByRole('region', { name: '상금·시상 정보' })).toHaveLength(1);
    expect(screen.getAllByLabelText('상품 및 상금')).toHaveLength(1);
    // '상금 배분'은 편집기 안에서 한 번만 나온다 — 요약표가 같은 텍스트를 또 뿌리던
    // 읽기 블록이 사라졌다는 뜻이다.
    expect(screen.getAllByText('상금 배분')).toHaveLength(1);
  });

  it('상금 편집기는 저장된 값으로 채워져 열린다', () => {
    renderSection(true);

    // 초기값은 렌더 도중 setState 가 아니라 useState 초기화 함수로 한 번만 계산된다 —
    // 비어 있는 폼이 뜨면 운영자가 기존 상금을 지운 채 저장하게 된다.
    expect(screen.getByLabelText('상품 및 상금')).toHaveValue('우승 트로피 + 상금');
    expect(screen.getByDisplayValue('우승')).toBeInTheDocument();
    expect(screen.getByDisplayValue('600,000원')).toBeInTheDocument();
  });

  it('읽기 전용 관리자에게는 저장 경로를 열어 주지 않는다', () => {
    renderSection(false);

    expect(screen.queryByRole('button', { name: '대회 정보 수정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '홍보 카드 수정' })).not.toBeInTheDocument();
    // 상금 저장 버튼과 입력이 함께 잠긴다 — 예전에는 둘 다 그대로 노출됐다.
    expect(screen.queryByRole('button', { name: '상금 정보 저장' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('상품 및 상금')).toBeDisabled();
  });
});
