import type { CSSProperties } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  sportChips,
  type LandingCount,
  type LandingLiveTournament,
  type LandingSportChips,
  type LandingV4Data,
} from '@/lib/landing/landing-v4-data';
import { LandingCtaLink } from '../landing-cta-link';
import { LandingV4Count, LandingV4MatchCard, LandingV4Parallax } from './landing-v4-now-fx';

/* 마키가 넓은 화면에서도 끊기지 않게 한 벌을 최소 이만큼 채운다(카드 폭 약 300px × 8). */
const MARQUEE_MIN_ITEMS = 8;
const MARQUEE_MIN_SOURCE = 3;

const stagger = (i: number) => ({ '--i': i }) as CSSProperties;

type Stat = { key: string; label: string; count: NonNullable<LandingCount>; unit: string; chips: LandingSportChips };

function StatBlock({ stat, order }: { stat: Stat; order: number }) {
  return (
    <div className="tm-landing-v4-stat" data-reveal style={stagger(order)}>
      <p className="tm-landing-v4-stat-k">{stat.label}</p>
      <p className="tm-landing-v4-stat-n">
        <LandingV4Count value={stat.count.value} order={order} />
        <small>{stat.count.more ? `${stat.unit} 이상` : stat.unit}</small>
      </p>
      <ul className="tm-landing-v4-stat-sub">
        {stat.chips.chips.map((chip) => <li key={chip.name}>{`${chip.name} ${chip.count}`}</li>)}
        {stat.chips.soon ? <li data-soon="true">{stat.chips.soon}</li> : null}
      </ul>
    </div>
  );
}

function StatusBadge({ card }: { card: LandingLiveTournament }) {
  return (
    <span className="tm-landing-v4-tbadge" data-status={card.status}>
      {card.status === 'in_progress' ? <i aria-hidden="true" /> : null}
      {card.status === 'in_progress' ? `LIVE · ${card.statusLabel}` : card.statusLabel}
    </span>
  );
}

function BigCard({ card }: { card: LandingLiveTournament }) {
  const meta = [card.formatLabel, card.teamsText, card.prizeText].filter((v): v is string => Boolean(v));
  return (
    <LandingCtaLink className="tm-landing-v4-tcard tm-landing-v4-tcard-big" href={card.href} cta="live_open_tournament">
      <LandingV4Parallax src={card.imageUrl ?? '/illustrations/landing-hero-640.webp'} illustration={!card.imageUrl} />
      <span className="tm-landing-v4-tcard-body">
        <StatusBadge card={card} />
        <span className="tm-landing-v4-tcard-title">{card.title}</span>
        <span className="tm-landing-v4-tcard-meta">{meta.map((m) => <span key={m}>{m}</span>)}</span>
        <span className="tm-landing-v4-tcard-go">대회 보기<ArrowRight size={16} aria-hidden="true" /></span>
      </span>
    </LandingCtaLink>
  );
}

function SideCard({ card }: { card: LandingLiveTournament }) {
  const facts = [card.dateText, card.location].filter((v): v is string => Boolean(v)).join(' · ');
  const slots = card.slots;
  return (
    <LandingCtaLink className="tm-landing-v4-tcard tm-landing-v4-tcard-sm" href={card.href} cta="live_open_tournament">
      <StatusBadge card={card} />
      <span className="tm-landing-v4-tcard-sm-title">{card.title}</span>
      {facts ? <span className="tm-landing-v4-tcard-sm-facts">{facts}</span> : null}
      {slots ? (
        <>
          <span className="tm-landing-v4-slots" aria-hidden="true" style={{ '--tm-landing-v4-slots': Math.min(slots.total, 16) } as CSSProperties}>
            {Array.from({ length: Math.min(slots.total, 16) }, (_, i) => <i key={i} data-on={i < slots.confirmed} />)}
          </span>
          <span className="tm-landing-v4-slots-cap">
            <span>{`${slots.total}팀 중 ${slots.confirmed}팀 확정`}</span>
            <span>{`남은 자리 ${slots.total - slots.confirmed}`}</span>
          </span>
        </>
      ) : null}
      <span className="tm-landing-v4-tcard-link">대회 보기<ArrowRight size={14} aria-hidden="true" /></span>
    </LandingCtaLink>
  );
}

function Marquee({ data }: { data: LandingV4Data }) {
  const source = data.teamMatches;
  if (source.length === 0) return null;
  const flowing = source.length >= MARQUEE_MIN_SOURCE;
  const repeat = flowing ? Math.ceil(MARQUEE_MIN_ITEMS / source.length) : 1;
  const group = (clone: boolean) =>
    Array.from({ length: repeat }, (_, r) =>
      source.map((match) => <LandingV4MatchCard key={`${r}-${match.id}`} match={match} clone={clone || r > 0} />),
    );
  return (
    <>
      <div className="tm-landing-section-inner tm-landing-v4-mq-head" data-reveal>
        <h3>곧 열리는 팀 매치</h3>
        {flowing ? <p className="tm-landing-v4-mq-hint">마우스를 올리거나 키보드로 이동하면 멈춰요</p> : null}
      </div>
      <div className="tm-landing-v4-mq" data-flow={flowing ? 'true' : 'false'} data-loop="off">
        <div className="tm-landing-v4-mq-track">
          <ul className="tm-landing-v4-mq-group">{group(false)}</ul>
          {flowing ? <ul className="tm-landing-v4-mq-group" data-clone="true" aria-hidden="true">{group(true)}</ul> : null}
        </div>
      </div>
    </>
  );
}

/** 지금 팀밋에서 — 페이지의 유일한 어두운 강조 섹션. 실데이터를 못 받으면 짧은 안내만 남긴다. */
export function LandingV4Now({ data }: { data: LandingV4Data }) {
  if (!data.hasAnyData) {
    return (
      <section id="now" className="tm-landing-section" aria-labelledby="now-heading">
        <div className="tm-landing-section-inner tm-landing-v4-now-empty">
          <h2 id="now-heading" className="tm-landing-section-title">지금 팀밋에서</h2>
          <p className="tm-landing-section-sub">지금은 현황을 불러오지 못했어요. 대회 목록에서 바로 둘러볼 수 있어요.</p>
          <LandingCtaLink className="tm-btn tm-btn-lg tm-btn-neutral" href="/tournaments" cta="live_empty_browse_tournaments">
            대회 둘러보기
          </LandingCtaLink>
        </div>
      </section>
    );
  }
  const candidates = [
    { key: 'teamMatches', label: '팀 매치', count: data.counts.teamMatches, unit: '개', chips: sportChips(data.bySport, 'teamMatches') },
    { key: 'tournaments', label: '대회', count: data.counts.tournaments, unit: '개', chips: sportChips(data.bySport, 'tournaments') },
    { key: 'teams', label: '활동 중인 팀', count: data.counts.teams, unit: '팀', chips: sportChips(data.bySport, 'teams') },
  ];
  const stats = candidates.filter((s): s is Stat => s.count !== null);
  const [big, ...side] = data.tournaments;

  return (
    <section id="now" className="tm-landing-section tm-landing-v4-now" aria-labelledby="now-heading">
      <div className="tm-landing-section-inner">
        <div className="tm-landing-section-header" data-reveal>
          <p className="tm-landing-section-kw">지금 팀밋에서</p>
          <h2 id="now-heading" className="tm-landing-section-title">오늘도 이만큼<br />뛰고 있어요</h2>
          <p className="tm-landing-section-sub">실제로 운영 중인 숫자예요. 가입하지 않아도 모두 둘러볼 수 있어요.</p>
        </div>
        {stats.length > 0 ? (
          <div className="tm-landing-v4-stats">{stats.map((stat, i) => <StatBlock key={stat.key} stat={stat} order={i} />)}</div>
        ) : null}
        {big ? (
          <div className="tm-landing-v4-tgrid" data-side={side.length > 0 ? 'true' : 'false'}>
            <div data-reveal><BigCard card={big} /></div>
            {side.length > 0 ? (
              <div className="tm-landing-v4-tside">
                {side.map((card, i) => (
                  <div key={card.id} data-reveal style={stagger(i + 1)}><SideCard card={card} /></div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <Marquee data={data} />
    </section>
  );
}
