import type { CSSProperties } from 'react';
import Image from 'next/image';
import { Check, ChevronLeft, Clock, MapPin, Plus, Users } from 'lucide-react';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import type { LandingLiveTeamMatch } from '@/lib/landing/landing-v4-data';
import { CardScreenBody } from '../landing-competition-screens';

/* 고정 무대 폰 안 장면 5개. ①② 는 실데이터 팀 매치, ③④⑤ 는 히어로 데모와 같은 가상의 예시(사람은 이니셜·등번호). */

/** 실데이터가 없을 때 ①② 가 쓰는 예시 — 화면에 "체험용 예시"를 함께 붙인다. */
export const EXAMPLE_TEAM_MATCHES: readonly LandingLiveTeamMatch[] = [
  {
    kind: 'team_match', id: 'example-1', hostName: 'FC 한강', opponentName: '성수 러너스',
    hostLogoUrl: null, opponentLogoUrl: null, region: '성동구', place: '성수 풋살장',
    dateTimeText: '토요일 19:00', formatText: '5:5', levelLabel: '입문', isLeague: false, href: '/team-matches',
  },
  {
    kind: 'team_match', id: 'example-2', hostName: '망원 FC', opponentName: '합정 SC',
    hostLogoUrl: null, opponentLogoUrl: null, region: '마포구', place: null,
    dateTimeText: '일요일 10:00', formatText: null, levelLabel: null, isLeague: true, href: '/team-matches',
  },
];

const delay = (ms: number) => ({ '--tm-landing-v4-s': `${ms}ms` }) as CSSProperties;

function matchTag(match: LandingLiveTeamMatch): { tone: 'blue' | 'green'; label: string } {
  if (match.isLeague) return { tone: 'green', label: '리그' };
  const label = [match.formatText, match.levelLabel].filter(Boolean).join(' ');
  return { tone: 'blue', label: label || '팀 매치' };
}

function Logos({ match }: { match: LandingLiveTeamMatch }) {
  return (
    <span className="tm-landing-v4-sm-logos">
      <TeamAvatar seed={match.hostName} name={match.hostName} logoUrl={match.hostLogoUrl} size="sm" />
      <TeamAvatar seed={match.opponentName} name={match.opponentName} logoUrl={match.opponentLogoUrl} size="sm" />
    </span>
  );
}

function StageMatchCard({ match, pick, ms }: { match: LandingLiveTeamMatch; pick?: boolean; ms: number }) {
  const tag = matchTag(match);
  const where = match.place ?? match.region;
  return (
    <div className="lpm-card tm-landing-v4-sm tm-landing-v4-rise" data-pick={pick ? 'true' : undefined} style={delay(ms)}>
      <div className="tm-landing-v4-sm-vs">
        <Logos match={match} />
        <span>
          <b>{match.hostName} vs {match.opponentName}</b>
          <small>{[match.dateTimeText, where].filter(Boolean).join(' · ')}</small>
        </span>
      </div>
      <div className="tm-landing-v4-sm-meta">
        <span className="lpm-badge" data-tone={tag.tone}>{tag.label}</span>
        <span className="tm-landing-v4-sm-link">자세히</span>
      </div>
    </div>
  );
}

function ExampleTag() {
  return <span className="lpm-badge" data-tone="grey">체험용 예시</span>;
}

export function SceneFind({ matches, countText, example }: { matches: readonly LandingLiveTeamMatch[]; countText: string | null; example: boolean }) {
  const shown = matches.slice(0, 3);
  return (
    <>
      <div className="lpm-appbar"><span className="lpm-appbar-title">팀 매치</span>{example ? <ExampleTag /> : null}</div>
      <div className="lpm-body">
        <div className="lpm-chips">
          {['전체', '풋살', '축구', '서울'].map((chip, i) => (
            <span key={chip} className="lpm-chip" data-on={i === 0}>{chip}</span>
          ))}
        </div>
        {shown.map((match, i) => (
          <StageMatchCard key={match.id} match={match} pick={i === 0} ms={120 + i * 120} />
        ))}
        {countText ? (
          <p className="lpm-cap tm-landing-v4-rise" style={delay(120 + shown.length * 120)}>
            <b className="tm-landing-v4-accent-text">{countText}</b> 중 {shown.length}개를 보고 있어요
          </p>
        ) : null}
      </div>
    </>
  );
}

export function SceneApply({ match, example }: { match: LandingLiveTeamMatch; example: boolean }) {
  const tag = matchTag(match);
  return (
    <>
      <div className="lpm-appbar"><ChevronLeft size={24} /><span className="lpm-appbar-title">팀 매치</span>{example ? <ExampleTag /> : null}</div>
      <div className="lpm-body">
        <div className="tm-landing-v4-apply-hero">
          <Image src="/illustrations/sport-futsal-hero-320.webp" alt="" width={320} height={320} sizes="160px" />
        </div>
        <div className="tm-landing-v4-sm-vs">
          <Logos match={match} />
          <b className="lpm-h">{match.hostName} vs {match.opponentName}</b>
        </div>
        <ul className="tm-landing-v4-apply-info">
          <li><Clock size={16} />{match.dateTimeText}</li>
          {(match.place ?? match.region) ? <li><MapPin size={16} />{match.place ?? match.region}</li> : null}
          <li><Users size={16} />{tag.label}</li>
        </ul>
      </div>
      <div className="tm-landing-v4-apply-toast">
        <Check size={20} />
        <span>신청했어요<small>체험용 예시라 실제로 신청되지 않아요</small></span>
      </div>
      <div className="tm-landing-v4-apply-cta">
        <span className="tm-landing-v4-apply-tap" />
        <span className="tm-landing-v4-apply-a">신청하기</span>
        <span className="tm-landing-v4-apply-b"><Check size={18} />신청 완료</span>
      </div>
    </>
  );
}

const ROSTER = [
  { no: 1, name: '선수 A' },
  { no: 7, name: '선수 B' },
  { no: 10, name: '선수 C' },
  { no: 14, name: '선수 D' },
  { no: 22, name: '선수 E' },
] as const;

export function SceneRoster() {
  return (
    <>
      <div className="lpm-appbar">
        <span className="lpm-appbar-title">출전 명단</span>
        <span className="lpm-badge tm-landing-v4-roster-count" data-tone="green">출전 {ROSTER.length}명</span>
      </div>
      <div className="lpm-body">
        <p className="lpm-cap">FC 한강 · 체험용 예시</p>
        <ul className="tm-landing-v4-roster">
          {ROSTER.map((player, i) => (
            <li key={player.no} className="tm-landing-v4-rise" style={delay(150 + i * 180)}>
              <span className="tm-landing-v4-roster-no">{player.no}</span>
              <b>{player.name}</b>
              <span className="lpm-badge" data-tone="green">출전</span>
            </li>
          ))}
        </ul>
        <div className="tm-landing-v4-roster-add tm-landing-v4-rise" style={delay(1000)}><Plus size={16} />선수 추가</div>
      </div>
    </>
  );
}

/** 굴러가는 숫자 — 서버 HTML 은 마지막 숫자(최종 상태)에 멈춰 있다. */
function Roll({ digits, side }: { digits: readonly number[]; side: 'home' | 'away' }) {
  return (
    <span className="tm-landing-v4-roll" data-side={side} style={{ '--tm-landing-v4-last': digits.length - 1 } as CSSProperties}>
      <span>{digits.map((d) => <span key={d}>{d}</span>)}</span>
    </span>
  );
}

const LIVE_EVENTS = [
  { minute: 12, team: 'a', text: '골 · FC 한강 #7', ms: 850 },
  { minute: 21, team: 'b', text: '골 · 성수 러너스 #9', ms: 1700 },
  { minute: 33, team: 'a', text: '골 · FC 한강 #10', ms: 2550 },
] as const;

export function SceneLive() {
  return (
    <>
      <div className="lpm-appbar"><span className="lpm-appbar-title">라이브</span><ExampleTag /></div>
      <div className="lpm-body">
        <div className="lpm-card lpm-live">
          <div className="lpm-live-teams">
            <span className="tm-landing-v4-live-team"><TeamAvatar seed="FC 한강" name="FC 한강" size="md" />FC 한강</span>
            <span className="lpm-live-score"><span><Roll digits={[0, 1, 2]} side="home" /> : <Roll digits={[0, 1]} side="away" /></span></span>
            <span className="tm-landing-v4-live-team"><TeamAvatar seed="성수 러너스" name="성수 러너스" size="md" />성수 러너스</span>
          </div>
          <div className="lpm-live-meta">
            <span className="lpm-badge" data-tone="live">LIVE</span>
            <span className="lpm-live-clock">후반 진행 중</span>
          </div>
        </div>
        <div className="lpm-events">
          {LIVE_EVENTS.map((event) => (
            <div key={event.minute} className="lpm-event tm-landing-v4-rise" data-team={event.team} style={delay(event.ms)}>
              <time>{event.minute}&apos;</time><i /><span>{event.text}</span>
            </div>
          ))}
        </div>
        <p className="lpm-cap tm-landing-v4-rise" style={delay(2800)}>관전 중 12명 · 링크로 누구나 볼 수 있어요</p>
      </div>
    </>
  );
}

/** 선수 카드는 A안 카드 화면을 그대로 쓰고, 등장 때 뒤집기만 얹는다(CSS). */
export function SceneRecord() {
  return <CardScreenBody />;
}
