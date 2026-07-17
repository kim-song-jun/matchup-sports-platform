import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { V1PublicTournamentStatus } from '@/types/api';
import type { V1PublicTournamentCampaign } from '@/types/tournament-campaign';
import { TournamentCampaignTemplate } from './tournament-campaign-template';

const campaignStyles = readFileSync(
  'src/components/tournaments/tournament-campaign-template.module.css',
  'utf8',
);

function campaign(status: V1PublicTournamentStatus): V1PublicTournamentCampaign {
  return {
    id: 'campaign-1',
    slug: 'summer-futsal-cup',
    status: 'published',
    content: {
      version: 1,
      hero: {
        title: 'Teameet Summer Futsal Cup',
        summary: '도심에서 펼쳐지는 하루 완결형 풋살 대회',
        imageUrl: 'https://images.example.com/campaign.webp',
      },
      intro: {
        title: '함께 만드는 여름의 결승전',
        body: '예선부터 결승까지 한곳에서 이어지는 대회예요.',
      },
      highlightsSectionTitle: '대회 하이라이트',
      highlights: [
        {
          title: '하루 완결 운영',
          body: '경기와 시상식을 하루 안에 진행해요.',
          imageUrl: 'https://images.example.com/highlight.webp',
        },
      ],
      faqSectionTitle: '참가 전 확인해 주세요',
      faq: [{ question: '선수 명단은 언제까지 제출하나요?', answer: '신청 마감일까지 제출해 주세요.' }],
    },
    publishedAt: '2026-07-14T01:00:00.000Z',
    updatedAt: '2026-07-14T01:00:00.000Z',
    tournament: {
      id: 'tournament-1',
      title: 'Teameet Summer Futsal Cup',
      status,
      format: 'group_knockout',
      sport: { code: 'futsal', name: '풋살' },
      scheduledAt: '2026-08-15T00:00:00.000Z',
      scheduledEndAt: '2026-08-16T00:00:00.000Z',
      registrationDeadlineAt: '2026-08-08T00:00:00.000Z',
      venue: '데일리그라운드 청라국제도시점',
      coverImageUrl: null,
      teamCount: 8,
      minPlayers: 6,
      maxPlayers: 10,
      entryFee: 300000,
      rulesText: '대회 규정을 준수해 주세요.',
      refundPolicyText: '마감 전 취소는 전액 환불돼요.',
      prizePool: 4000000,
      prizeSummary: '총 400만원 상당 상금 및 상품',
      prizeBreakdown: null,
      sponsors: [],
      confirmedCount: 4,
      pendingPaymentCount: 0,
      registrationAvailability: status === 'open' ? 'available' : 'closed',
      participantTeams: [],
    },
  };
}

describe('TournamentCampaignTemplate', () => {
  it('isolates the campaign hero behind an opaque desktop navigation surface', () => {
    const desktopStyles = campaignStyles.slice(
      campaignStyles.indexOf('@media (min-width: 1024px)'),
    );

    expect(desktopStyles).toMatch(
      /:global\(\.tm-app-frame\):has\(\.campaign\)\s+:global\(\.tm-desktop-nav\)\s*{[^}]*background:\s*var\(--bg\);[^}]*backdrop-filter:\s*none;[^}]*box-shadow:/,
    );
  });

  it('stacks the intro at tablet width while retaining the two-column desktop layout', () => {
    const tabletStyles = campaignStyles.slice(
      campaignStyles.indexOf('@media (min-width: 768px) and (max-width: 1023px)'),
      campaignStyles.indexOf('@media (prefers-reduced-motion: reduce)'),
    );

    expect(campaignStyles).toMatch(
      /\.intro\s*{[^}]*grid-template-columns:\s*minmax\(220px, 0\.8fr\) minmax\(0, 1\.2fr\)/,
    );
    expect(tabletStyles).toMatch(
      /\.intro\s*{\s*grid-template-columns:\s*1fr;\s*gap:\s*20px;\s*}/,
    );
  });

  it('keeps Korean words intact and lets fact values shrink inside narrow cards', () => {
    expect(campaignStyles).toMatch(
      /\.campaign\s*{[^}]*word-break:\s*keep-all;[^}]*overflow-wrap:\s*break-word;/,
    );
    expect(campaignStyles).toMatch(
      /\.fact\s*>\s*div\s*{\s*min-width:\s*0;\s*}/,
    );
  });

  it('keeps the 390px intro readable without forcing horizontal overflow', () => {
    const mobileStyles = campaignStyles.slice(
      campaignStyles.indexOf('@media (max-width: 767px)'),
      campaignStyles.indexOf('@media (min-width: 768px) and (max-width: 1023px)'),
    );

    expect(mobileStyles).toMatch(
      /\.intro\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
    );
    expect(campaignStyles).toMatch(
      /\.intro\s*>\s*\*\s*{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/,
    );
    expect(campaignStyles).toMatch(
      /\.introBody\s*{[^}]*word-break:\s*keep-all;[^}]*overflow-wrap:\s*anywhere;[^}]*text-wrap:\s*pretty;/,
    );
  });

  it('renders loaded campaign content with its required section headings', () => {
    render(<TournamentCampaignTemplate campaign={campaign('open')} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Teameet Summer Futsal Cup' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '함께 만드는 여름의 결승전' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '대회 하이라이트' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '참가 전 확인해 주세요' })).toBeInTheDocument();
    expect(screen.getByText('하루 완결 운영')).toBeInTheDocument();
    expect(screen.getByText('선수 명단은 언제까지 제출하나요?')).toBeInTheDocument();
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

  it.each([
    ['open', '참가 신청하기', '/tournaments/tournament-1/my'],
    ['in_progress', '대진표 보기', '/tournaments/tournament-1/bracket'],
    ['completed', '결과 보기', '/tournaments/tournament-1/results'],
  ] satisfies Array<[V1PublicTournamentStatus, string, string]>) (
    'routes the %s campaign primary action to the real tournament flow',
    (status, label, href) => {
      render(<TournamentCampaignTemplate campaign={campaign(status)} />);

      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    },
  );

  it('removes the application action after registration closes and keeps tournament detail available', () => {
    render(<TournamentCampaignTemplate campaign={campaign('closed')} />);

    expect(screen.queryByRole('link', { name: '참가 신청하기' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '대회 상세 보기' })).toHaveAttribute(
      'href',
      '/tournaments/tournament-1',
    );
  });

  it.each([
    ['deadline_passed', '접수 기간이 종료됐어요'],
    ['full', '참가 정원이 모두 찼어요'],
    ['started', '이미 시작된 대회예요'],
  ] as const)(
    'removes the application action when registration is %s',
    (registrationAvailability, heading) => {
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
    },
  );

  it('shows pending payment teams in the capacity fact without exposing them as participants', () => {
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

    expect(screen.getByText('4팀 확정 · 2팀 입금 대기 / 8팀')).toBeInTheDocument();
  });

  it('replaces a failed campaign image with a local sport fallback', () => {
    render(<TournamentCampaignTemplate campaign={campaign('open')} />);
    const hero = screen.getByRole('img', { name: 'Teameet Summer Futsal Cup' });

    fireEvent.error(hero);

    expect(hero).toHaveAttribute('src', '/mock/generated/futsal-rooftop.webp');
  });
});
