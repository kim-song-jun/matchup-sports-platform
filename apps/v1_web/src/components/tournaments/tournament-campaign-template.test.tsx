import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { V1PublicTournamentStatus } from '@/types/api';
import type { V1PublicTournamentCampaign } from '@/types/tournament-campaign';
import { resolveNextImageSrc } from '@/test/next-image';
import { TournamentCampaignTemplate } from './tournament-campaign-template';
import { campaign } from './tournament-campaign-template.test-fixture';

describe('TournamentCampaignTemplate', () => {
  it('renders loaded campaign content with its required section headings', () => {
    render(<TournamentCampaignTemplate campaign={campaign('open')} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Teameet Summer Futsal Cup' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '함께 만드는 여름의 결승전' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '대회 하이라이트' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '참가 전 확인해 주세요' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '우승의 보상, 함께 만드는 파트너' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '공식 파트너' })).toBeInTheDocument();
    expect(screen.getByText('하루 완결 운영')).toBeInTheDocument();
    expect(screen.getByText('선수 명단은 언제까지 제출하나요?')).toBeInTheDocument();
    expect(screen.getByText('공식 후원사를 준비하고 있어요')).toBeInTheDocument();
    expect(screen.getByText('총 4,000,000원')).toBeInTheDocument();
    expect(screen.queryByText('참가 현황')).not.toBeInTheDocument();
    expect(screen.queryByText('참가비')).not.toBeInTheDocument();
  });

  it('moves the application decision next to the hero and keeps only two primary conversion points', () => {
    render(<TournamentCampaignTemplate campaign={campaign('open')} />);

    const decision = screen.getByRole('region', { name: '함께 뛸 팀을 기다리고 있어요' });
    expect(within(decision).getByText('참가 신청 안내')).toBeInTheDocument();
    expect(within(decision).getByText('참가 신청 마감까지')).toBeInTheDocument();
    expect(within(decision).getByRole('link', { name: '참가 신청하기' })).toHaveAttribute(
      'href', '/tournaments/tournament-1/my',
    );
    expect(screen.getAllByRole('link', { name: '참가 신청하기' })).toHaveLength(2);
  });

  it('keeps the phrase after a hero-title comma in one editorial line', () => {
    const source = campaign('open');
    render(
      <TournamentCampaignTemplate
        campaign={{
          ...source,
          content: {
            ...source.content,
            hero: {
              ...source.content.hero,
              title: '팀밋 풋살컵(혼성), 여름의 승부가 시작됩니다',
            },
          },
        }}
      />,
    );

    const heading = screen.getByRole('heading', {
      level: 1,
      name: '팀밋 풋살컵(혼성), 여름의 승부가 시작됩니다',
    });
    expect(within(heading).getByText('팀밋 풋살컵(혼성),')).toBeInTheDocument();
    expect(within(heading).getByText('여름의 승부가 시작됩니다')).toBeInTheDocument();
  });

  it('updates the registration copy and actions together when the deadline passes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T23:59:00.000Z'));
    const source = campaign('open');

    try {
      render(
        <TournamentCampaignTemplate
          campaign={{
            ...source,
            tournament: {
              ...source.tournament,
              registrationDeadlineAt: '2026-08-08T00:00:00.000Z',
            },
          }}
        />,
      );

      expect(screen.getByRole('heading', { name: '함께 뛸 팀을 기다리고 있어요' })).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: '참가 신청하기' })).toHaveLength(2);

      act(() => {
        vi.setSystemTime(new Date('2026-08-08T00:00:01.000Z'));
        vi.advanceTimersByTime(60_001);
      });

      expect(screen.getByRole('heading', { name: '접수 기간이 종료됐어요' })).toBeInTheDocument();
      expect(screen.getByText('접수 종료')).toHaveClass('tm-badge-grey');
      expect(screen.queryByRole('link', { name: '참가 신청하기' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '대회 상세 안내를 확인해 주세요' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('presents real sponsor benefits inside the shared rewards flow', () => {
    const source = campaign('open');
    render(
      <TournamentCampaignTemplate
        campaign={{
          ...source,
          tournament: {
            ...source.tournament,
            sponsors: [{
              id: 'sponsor-1',
              name: '카조아',
              description: '참가팀 회복을 지원하는 공식 파트너',
              logoUrl: null,
              websiteUrl: 'https://example.com/kajoa',
              instagramUrl: null,
              benefitText: '논슬립 하프삭스',
              boothText: null,
              eventTitle: null,
              eventDescription: null,
              eventResultText: null,
              sortOrder: 0,
            }],
          },
        }}
      />,
    );

    const rewards = screen.getByRole('region', { name: '우승의 보상, 함께 만드는 파트너' });
    expect(within(rewards).getByText('카조아')).toBeInTheDocument();
    expect(within(rewards).getByText('논슬립 하프삭스')).toBeInTheDocument();
    expect(within(rewards).queryByText('공식 후원사를 준비하고 있어요')).not.toBeInTheDocument();
  });

  it('omits incomplete prize breakdown rows without a value', () => {
    render(
      <TournamentCampaignTemplate
        campaign={{
          ...campaign('open'),
          tournament: {
            ...campaign('open').tournament,
            prizeBreakdown: '우승 30만원 / 경품',
          },
        }}
      />,
    );

    expect(screen.getByText('우승')).toBeInTheDocument();
    expect(screen.getByText('30만원')).toBeInTheDocument();
    expect(screen.queryByText('경품')).not.toBeInTheDocument();
  });

  it('renders repeated highlight titles and FAQ questions without duplicate React keys', () => {
    const repeatedHighlight = {
      title: '하루 완결 운영',
      body: '서로 다른 운영 안내도 같은 제목을 사용할 수 있어요.',
    };
    const repeatedFaq = {
      question: '선수 명단은 언제까지 제출하나요?',
      answer: '팀별 일정에 따라 안내된 시각까지 제출해 주세요.',
    };
    const source = campaign('open');
    const campaignWithRepeatedLabels: V1PublicTournamentCampaign = {
      ...source,
      content: {
        ...source.content,
        highlights: [...source.content.highlights, repeatedHighlight],
        faq: [...source.content.faq, repeatedFaq],
      },
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      render(<TournamentCampaignTemplate campaign={campaignWithRepeatedLabels} />);

      const renderedErrors = consoleError.mock.calls.flat().join(' ');
      expect(renderedErrors).not.toContain('same key');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('renders text-only highlights without repeating the campaign image fallback', () => {
    const source = campaign('open');
    const textOnlyHighlights = [
      { title: '빠른 경기 진행', body: '대기 시간을 줄인 일정으로 운영해요.' },
      { title: '개인 시상', body: '팀 성적과 함께 개인 활약도 기록해요.' },
      { title: '결과 아카이브', body: '경기 종료 후 결과 페이지에서 다시 확인해요.' },
    ];

    render(
      <TournamentCampaignTemplate
        campaign={{
          ...source,
          content: { ...source.content, highlights: textOnlyHighlights },
        }}
      />,
    );

    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByText('빠른 경기 진행')).toBeInTheDocument();
    expect(screen.getByText('개인 시상')).toBeInTheDocument();
    expect(screen.getByText('결과 아카이브')).toBeInTheDocument();
  });

  it.each([
    ['open', '참가 신청하기', '/tournaments/tournament-1/my', '참가 준비를 마무리하세요'],
    ['in_progress', '대진표 보기', '/tournaments/tournament-1/bracket', '현재 경기 흐름을 확인하세요'],
    ['completed', '결과 보기', '/tournaments/tournament-1/results', '결과와 기록을 다시 만나보세요'],
  ] satisfies Array<[V1PublicTournamentStatus, string, string, string]>) (
    'routes the %s campaign primary action to the real tournament flow',
    (status, label, href, followUpHeading) => {
      render(<TournamentCampaignTemplate campaign={campaign(status)} />);

      expect(
        screen.getAllByRole('link', { name: label })
          .some((link) => link.getAttribute('href') === href),
      ).toBe(true);
      expect(screen.getByRole('heading', { name: followUpHeading })).toBeInTheDocument();
    },
  );

  it('removes the application action after registration closes and keeps tournament detail available', () => {
    render(<TournamentCampaignTemplate campaign={campaign('closed')} />);

    expect(screen.queryByRole('link', { name: '참가 신청하기' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '대회 상세 보기' })[0]).toHaveAttribute(
      'href', '/tournaments/tournament-1',
    );
    expect(screen.getByRole('heading', { name: '대회 상세 안내를 확인해 주세요' })).toBeInTheDocument();
  });

  it.each([
    ['deadline_passed', '접수 기간이 종료됐어요', '접수 종료'],
    ['full', '참가 정원이 모두 찼어요', '모집 마감'],
    ['started', '이미 시작된 대회예요', '대회 시작'],
  ] as const)(
    'removes the application action when registration is %s',
    (registrationAvailability, heading, badgeLabel) => {
      const source = campaign('open');
      render(
        <TournamentCampaignTemplate
          campaign={{
            ...source,
            tournament: { ...source.tournament, registrationAvailability },
          }}
        />,
      );

      expect(screen.queryByRole('link', { name: '참가 신청하기' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
      expect(screen.getByText(badgeLabel)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '대회 상세 안내를 확인해 주세요' })).toBeInTheDocument();
    },
  );

  it('keeps operational participant counts out of the promotional fact strip', () => {
    const source = campaign('open');
    render(
      <TournamentCampaignTemplate
        campaign={{
          ...source,
          tournament: {
            ...source.tournament,
            pendingPaymentCount: 2,
          },
        }}
      />,
    );

    expect(screen.queryByText('4팀 확정 · 2팀 입금 대기 / 8팀')).not.toBeInTheDocument();
    expect(screen.getByText('공식 파트너 공개 예정')).toBeInTheDocument();
  });

  it('replaces a failed campaign image with a sport-tinted illustration panel — no mock photo', () => {
    const { container } = render(<TournamentCampaignTemplate campaign={campaign('open')} />);
    const hero = screen.getByRole('img', { name: 'Teameet Summer Futsal Cup' });

    fireEvent.error(hero);

    // 실패한 사진은 사라지고(목업 사진으로 바꿔치기하지 않는다) 종목 그래픽 폴백
    // 패널로 대체된다 — 대회 sport.code='futsal' → sportIllustration('풋살')='sport-futsal'.
    expect(screen.queryByRole('img', { name: 'Teameet Summer Futsal Cup' })).not.toBeInTheDocument();
    const fallback = container.querySelector('.tm-campaign-media-fallback');
    expect(fallback).toBeInTheDocument();
    const illustration = fallback?.querySelector('img') ?? null;
    // next/image 전환(U15) 이후 실제 DOM src는 `/_next/image?url=...`로 재작성된다.
    expect(resolveNextImageSrc(illustration)).toBe('/illustrations/sport-futsal-640.webp');
  });
});
