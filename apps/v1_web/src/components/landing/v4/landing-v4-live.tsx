import type { LandingLiveTeamMatch, LandingLiveTournament, LandingTournamentLiveStatus, LandingV4Data } from '@/lib/landing/landing-v4-data';
import { LandingCtaLink } from '../landing-cta-link';

/* 대회 목록 뱃지(getTournamentStatusConfig)와 다른 색을 쓰지 않는다 — 상태 3종만 다루므로 직접 매핑한다. */
const STATUS_TONE: Readonly<Record<LandingTournamentLiveStatus, string>> = {
  in_progress: 'green',
  open: 'blue',
  closed: 'grey',
};

function TournamentCard({ card }: { card: LandingLiveTournament }) {
  const facts = [card.dateText, card.location].filter((v): v is string => Boolean(v)).join(' · ');
  const extra = [card.teamsText, card.prizeText].filter((v): v is string => Boolean(v)).join(' · ');
  return (
    <li className="tm-landing-v4-live-card">
      <span className="tm-landing-v4-live-badge" data-tone={STATUS_TONE[card.status]}>{card.statusLabel}</span>
      <h3 className="tm-landing-v4-live-title">{card.title}</h3>
      {facts ? <p className="tm-landing-v4-live-meta">{facts}</p> : null}
      {extra ? <p className="tm-landing-v4-live-meta">{extra}</p> : null}
      <LandingCtaLink className="tm-btn tm-btn-sm tm-btn-neutral tm-landing-v4-live-cta" href={card.href} cta="live_open_tournament">
        대회 보기
      </LandingCtaLink>
    </li>
  );
}

function TeamMatchCard({ card }: { card: LandingLiveTeamMatch }) {
  const meta = [card.region, card.dateTimeText].filter((v): v is string => Boolean(v)).join(' · ');
  return (
    <li className="tm-landing-v4-live-card">
      <span className="tm-landing-v4-live-badge" data-tone="blue">{card.isLeague ? '리그 경기' : '팀 매치'}</span>
      <h3 className="tm-landing-v4-live-title">{card.hostName} vs {card.opponentName}</h3>
      <p className="tm-landing-v4-live-meta">{meta}</p>
      <LandingCtaLink className="tm-btn tm-btn-sm tm-btn-neutral tm-landing-v4-live-cta" href={card.href} cta="live_open_team_match">
        경기 보기
      </LandingCtaLink>
    </li>
  );
}

export function LandingV4Live({ data }: { data: LandingV4Data }) {
  return (
    <section id="live" className="tm-landing-section" aria-labelledby="live-heading">
      <div className="tm-landing-section-inner">
        <div className="tm-landing-section-header" data-align="center" data-reveal>
          <p className="tm-landing-section-kw">현황</p>
          <h2 id="live-heading" className="tm-landing-section-title">지금 열려 있어요</h2>
          <p className="tm-landing-section-sub">로그인 없이 볼 수 있는 실제 대회와 경기예요.</p>
        </div>
        {data.live.length > 0 ? (
          <ul className="tm-landing-v4-live-grid">
            {data.live.map((card) => (card.kind === 'tournament' ? <TournamentCard key={`tournament-${card.id}`} card={card} /> : <TeamMatchCard key={`team-match-${card.id}`} card={card} />))}
          </ul>
        ) : (
          <p className="tm-landing-v4-live-empty">
            곧 새 경기가 열려요.{' '}
            <LandingCtaLink href="/contact" cta="live_empty_contact">대회 열기 문의 →</LandingCtaLink>
          </p>
        )}
      </div>
    </section>
  );
}
