import { Check, MapPin } from 'lucide-react';
import { BellIcon } from '@/components/v1-ui/icons';

/* 목업 화면의 팀·점수·능력치는 전부 가상의 예시다(옆 설명 텍스트와 섹션 소제목에 명시). */

function AppBar({ title }: { title: string }) {
  return (
    <div className="lpm-appbar"><span className="lpm-appbar-title">{title}</span><BellIcon size={24} /></div>
  );
}

function Fixture({ place, home, score, away }: { place: string; home: string; score: string; away: string }) {
  return (
    <div className="lpm-fixture">
      <div className="lpm-fixture-top">
        <MapPin size={14} />{place}<span className="lpm-badge" data-tone="blue">확정된 결과</span>
      </div>
      <div className="lpm-fixture-main"><span>{home}</span><span className="lpm-score">{score}</span><span>{away}</span></div>
    </div>
  );
}

/** 대회 대진 (/tournaments/[id]/bracket) — 확정 결과가 다음 라운드로 올라간다 */
export function BracketScreenBody() {
  return (
    <>
      <AppBar title="순위·브래킷" />
      <div className="lpm-body">
        <div className="lpm-row">
          <span className="lpm-h">가을 풋살 챔피언십</span>
          <span className="lpm-badge" data-tone="blue">조별리그 + 토너먼트</span>
        </div>
        <div>
          <div className="lpm-stepper">
            <span className="lpm-step-dot"><Check size={16} /></span>
            <span className="lpm-step-line" />
            <span className="lpm-step-dot"><Check size={16} /></span>
            <span className="lpm-step-line" />
            <span className="lpm-step-dot" data-state="now">3</span>
          </div>
          <div className="lpm-step-labels"><span>조별리그</span><span>4강</span><span>결승</span></div>
        </div>
        <div className="lpm-card">
          <svg className="lpm-bracket" viewBox="0 0 335 150">
            <path className="ln" d="M110 20H130V54H110M130 37H150M110 96H130V130H110M130 113H150M230 37H240V113H230M240 75H250" />
            <path className="win" d="M110 20H130V37H150" />
            <path className="win" d="M110 96H130V113H150" />
            <rect x="0.5" y="6.5" width="110" height="28" rx="7" /><text x="10" y="25">FC 한강</text>
            <text className="s" x="98" y="25" textAnchor="end">3</text>
            <rect x="0.5" y="40.5" width="110" height="28" rx="7" /><text x="10" y="59">망원 FC</text>
            <text className="s" x="98" y="59" textAnchor="end">1</text>
            <rect x="0.5" y="82.5" width="110" height="28" rx="7" /><text x="10" y="101">성수 러너스</text>
            <text className="s" x="98" y="101" textAnchor="end">2</text>
            <rect x="0.5" y="116.5" width="110" height="28" rx="7" /><text x="10" y="135">합정 SC</text>
            <text className="s" x="98" y="135" textAnchor="end">0</text>
            <rect x="150.5" y="23.5" width="80" height="28" rx="7" /><text x="160" y="42">FC 한강</text>
            <rect x="150.5" y="99.5" width="80" height="28" rx="7" /><text x="160" y="118">성수 러너스</text>
            <rect className="champ" x="250.5" y="61.5" width="84" height="28" rx="7" />
            <text x="292" y="80" textAnchor="middle">결승 진행 중</text>
          </svg>
        </div>
        <Fixture place="성수 풋살장 1구장 · 토 16:00" home="FC 한강" score="3 : 1" away="망원 FC" />
        <Fixture place="성수 풋살장 2구장 · 토 17:30" home="성수 러너스" score="2 : 0" away="합정 SC" />
      </div>
    </>
  );
}

/**
 * 라이브 스코어 (공개 경기 기록 화면). 서버 HTML 은 골이 들어간 최종 장면이고,
 * 모션이 켜지면 컨트롤러가 1:1 로 되돌린 뒤 시계와 골을 재생한다.
 */
export function LiveScreenBody() {
  return (
    <>
      <AppBar title="경기 기록" />
      <div className="lpm-body">
        <span className="lpm-cap lpm-cap-strong">결승</span>
        <div className="lpm-card lpm-live">
          <div className="lpm-live-teams">
            <span>FC 한강</span>
            <span className="lpm-live-score"><span><b data-live-home>2</b> : <b>1</b></span></span>
            <span>성수 러너스</span>
          </div>
          <div className="lpm-live-meta">토요일 · 성수 풋살장 2구장</div>
          <div className="lpm-live-meta">
            <span className="lpm-badge" data-tone="live">LIVE</span>
            <span className="lpm-live-clock">후반 <span data-live-clock>27:11</span></span>
          </div>
        </div>
        <div className="lpm-sect"><b>경기 기록</b><span>스태프가 입력하면 바로 반영</span></div>
        <div className="lpm-events">
          <div className="lpm-event" data-team="a" data-live-goal>
            <time>27&apos;</time><i /><span>골 · FC 한강 #9<small>도움 #7</small></span>
          </div>
          <div className="lpm-event" data-team="b">
            <time>19&apos;</time><i /><span>골 · 성수 러너스 #11<small>후반</small></span>
          </div>
          <div className="lpm-event" data-team="a">
            <time>8&apos;</time><i /><span>골 · FC 한강 #10<small>전반 · 도움 #9</small></span>
          </div>
          <div className="lpm-event" data-team="none">
            <time>0&apos;</time><i /><span>경기 시작<small>전반</small></span>
          </div>
        </div>
      </div>
    </>
  );
}

/* 실제 카드처럼 원시 횟수가 아니라 1~99 능력치다(골·도움 최소 30, 엔트리 최소 50 — v1_api profile/player-card.ts).
   "엔트리" 라벨도 서버가 보내는 값 그대로다. */
const CARD_STATS = [
  { value: 64, label: '골' },
  { value: 58, label: '도움' },
  { value: 83, label: '엔트리' },
  { value: 76, label: '실력' },
  { value: 92, label: '매너' },
  { value: 95, label: '시간약속' },
] as const;

/** 선수 카드 (/users/[id]/card) — 실제 카드의 골드 티어 토큰(.tm-player-card[data-tier])을 빌려 쓴다 */
export function CardScreenBody() {
  return (
    <>
      <AppBar title="선수 카드" />
      <div className="lpm-body">
        <div className="tm-player-card lpm-pcard" data-tier="gold" data-shape="rect">
          <div className="lpm-pcard-face">
            <div className="lpm-pcard-top">
              <div className="lpm-pcard-ovr"><b data-count="78">78</b><span>MF</span></div>
              <div className="lpm-pcard-avatar">10</div>
            </div>
            <div className="lpm-pcard-name">한강 10번</div>
            <div className="lpm-pcard-team">FC 한강 · 풋살</div>
            <div className="lpm-pcard-stats">
              {CARD_STATS.map((stat) => (
                <div key={stat.label}><b data-count={stat.value}>{stat.value}</b><span>{stat.label}</span></div>
              ))}
            </div>
            <div className="lpm-pcard-tier">GOLD · 활동량 기준 등급</div>
          </div>
        </div>
        <div className="lpm-seg"><span data-on="true">전체</span><span>대회·리그</span></div>
      </div>
    </>
  );
}
