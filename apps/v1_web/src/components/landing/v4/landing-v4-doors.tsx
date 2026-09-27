import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight, Trophy, Users, Zap } from 'lucide-react';
import { LandingCtaLink, type LandingCtaId } from '../landing-cta-link';
import { formatLandingCount, type LandingV4Data } from '@/lib/landing/landing-v4-data';

type Door = {
  readonly id: string;
  readonly tone: 'blue' | 'green' | 'orange';
  readonly icon: ReactNode;
  readonly title: string;
  readonly desc: string;
  readonly points: readonly string[];
  readonly statLine: (data: LandingV4Data) => string | null;
  readonly href: string;
  readonly cta: LandingCtaId;
  readonly linkLabel: string;
  readonly secondaryHref: string;
  readonly secondaryCta: LandingCtaId;
  readonly secondaryLabel: string;
  readonly secondaryLead: string;
};

const DOORS: readonly Door[] = [
  {
    id: 'matches',
    tone: 'blue',
    icon: <Zap size={24} aria-hidden="true" />,
    title: '매치',
    desc: '혼자여도 근처 경기에 바로 신청해요',
    points: ['종목·지역·실력으로 찾기', '신청하면 채팅방이 생겨요', '선착순이나 승인 후 참가'],
    statLine: (data) => {
      const count = formatLandingCount(data.counts.teamMatches);
      return count ? `지금 팀 매치 ${count}` : null;
    },
    href: '/team-matches',
    cta: 'door_browse_team_matches',
    linkLabel: '매치 둘러보기',
    secondaryHref: '/for/players',
    secondaryCta: 'door_players_guide',
    secondaryLabel: '개인 안내',
    secondaryLead: '개인으로 뛴다면',
  },
  {
    id: 'tournaments',
    tone: 'green',
    icon: <Trophy size={24} aria-hidden="true" />,
    title: '대회',
    desc: '대진표·실시간 스코어·순위를 한눈에',
    points: ['조별리그 후 결선·토너먼트·리그', '경기 중 점수가 바로 반영돼요', '결과가 확정되면 순위표가 바뀌어요'],
    statLine: (data) => {
      const total = formatLandingCount(data.counts.tournaments);
      const open = formatLandingCount(data.counts.tournamentsOpen);
      return total && open ? `대회 ${total} · 모집 중 ${open}` : null;
    },
    href: '/tournaments',
    cta: 'door_browse_tournaments',
    linkLabel: '대회 둘러보기',
    secondaryHref: '/for/organizers',
    secondaryCta: 'door_organizers_guide',
    secondaryLabel: '대회 운영자 안내',
    secondaryLead: '대회를 연다면',
  },
  {
    id: 'teams',
    tone: 'orange',
    icon: <Users size={24} aria-hidden="true" />,
    title: '팀',
    desc: '팀원·명단·전적을 한곳에서',
    points: ['초대·가입 신청', '경기별 명단 제출', '전체·대회·리그·친선 전적'],
    statLine: (data) => {
      const count = formatLandingCount(data.counts.teams);
      return count ? `팀 ${count} 활동 중` : null;
    },
    href: '/teams',
    cta: 'door_browse_teams',
    linkLabel: '팀 둘러보기',
    secondaryHref: '/for/teams',
    secondaryCta: 'door_teams_guide',
    secondaryLabel: '팀 안내',
    secondaryLead: '팀을 운영한다면',
  },
];

const stagger = (i: number) => ({ '--i': i }) as CSSProperties;

export function LandingV4Doors({ data }: { data: LandingV4Data }) {
  return (
    <section id="doors" className="tm-landing-section" aria-labelledby="doors-heading">
      <div className="tm-landing-section-inner">
        <div className="tm-landing-section-header" data-align="center" data-reveal>
          <p className="tm-landing-section-kw">문 3개</p>
          <h2 id="doors-heading" className="tm-landing-section-title">무엇을 하러 오셨나요</h2>
          <p className="tm-landing-section-sub">매치·대회·팀, 필요한 곳부터 둘러보세요.</p>
        </div>
        <ul className="tm-landing-v4-doors">
          {DOORS.map((door, i) => {
            const stat = door.statLine(data);
            return (
              <li key={door.id} className="tm-landing-v4-door" data-reveal="scale" style={stagger(i)}>
                <span className="tm-landing-v4-door-icon" data-tone={door.tone} aria-hidden="true">{door.icon}</span>
                <h3>{door.title}</h3>
                <p className="tm-landing-v4-door-desc">{door.desc}</p>
                {stat ? <p className="tm-landing-v4-door-stat">{stat}</p> : null}
                <ul className="tm-landing-v4-door-points">
                  {door.points.map((point) => <li key={point}>{point}</li>)}
                </ul>
                <LandingCtaLink className="tm-landing-v4-door-link" href={door.href} cta={door.cta}>
                  {door.linkLabel}
                  <ArrowRight size={16} aria-hidden="true" />
                </LandingCtaLink>
                <p className="tm-landing-v4-door-secondary">
                  {door.secondaryLead} →{' '}
                  <LandingCtaLink href={door.secondaryHref} cta={door.secondaryCta}>{door.secondaryLabel}</LandingCtaLink>
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
