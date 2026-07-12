import { Goal, Handshake, Medal, Star, Trophy } from 'lucide-react';

/** 상금 배분 항목 라벨 → 아이콘 (공개 시상 카드·어드민 미리보기 공용) */
export function PrizeRankIcon({ label }: { label: string }) {
  const size = 20;
  switch (label) {
    case '1위': return <Medal size={size} className="tm-medal-gold" strokeWidth={2} />;
    case '2위': return <Medal size={size} className="tm-medal-silver" strokeWidth={2} />;
    case '3위': return <Medal size={size} className="tm-medal-bronze" strokeWidth={2} />;
    case 'MVP': return <Star size={size} fill="var(--orange500)" stroke="var(--orange500)" strokeWidth={1.6} />;
    case '득점왕': return <Goal size={size} style={{ color: 'var(--blue500)' }} strokeWidth={2} />;
    case '도움왕': return <Handshake size={size} style={{ color: 'var(--green500)' }} strokeWidth={2} />;
    default: return <Trophy size={size} className="tm-medal-gold" strokeWidth={2} />;
  }
}
