import { BellIcon } from '@/components/v1-ui/icons';

/* 목업 화면의 팀·점수·능력치는 전부 가상의 예시다(옆 설명 텍스트와 섹션 소제목에 명시). */

function AppBar({ title }: { title: string }) {
  return (
    <div className="lpm-appbar"><span className="lpm-appbar-title">{title}</span><BellIcon size={24} /></div>
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
              <div className="lpm-pcard-ovr"><b>78</b><span>MF</span></div>
              <div className="lpm-pcard-avatar">10</div>
            </div>
            <div className="lpm-pcard-name">한강 10번</div>
            <div className="lpm-pcard-team">FC 한강 · 풋살</div>
            <div className="lpm-pcard-stats">
              {CARD_STATS.map((stat) => (
                <div key={stat.label}><b>{stat.value}</b><span>{stat.label}</span></div>
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
