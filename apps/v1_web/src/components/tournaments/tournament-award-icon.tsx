import { Crown, Goal, Hand, Handshake, Medal, Shield, Sparkles, Star, Trophy } from 'lucide-react';
import type { V1TournamentAwardIconKey } from '@/types/api';

export const TOURNAMENT_AWARD_ICON_OPTIONS: Array<{ value: V1TournamentAwardIconKey; label: string }> = [
  { value: 'trophy', label: '트로피' },
  { value: 'crown', label: '왕관' },
  { value: 'goal', label: '골' },
  { value: 'shield', label: '방패' },
  { value: 'glove', label: '골키퍼 장갑' },
  { value: 'handshake', label: '악수' },
  { value: 'sparkles', label: '반짝임' },
  { value: 'medal', label: '메달' },
  { value: 'star', label: '별' },
];

export function legacyAwardIconKey(awardType: string): V1TournamentAwardIconKey {
  switch (awardType) {
    case 'mvp': return 'crown';
    case 'top_scorer': return 'goal';
    case 'best_defense': return 'shield';
    case 'best_keeper': return 'glove';
    case 'fair_play': return 'handshake';
    case 'best_rookie': return 'sparkles';
    default: return 'trophy';
  }
}

export function TournamentAwardIcon({ iconKey, awardType, size = 22 }: {
  iconKey?: V1TournamentAwardIconKey | null;
  awardType?: string;
  size?: number;
}) {
  const resolved = iconKey ?? legacyAwardIconKey(awardType ?? '');
  const common = { size, strokeWidth: 2 };

  switch (resolved) {
    case 'crown': return <Crown {...common} className="tm-medal-gold" />;
    case 'goal': return <Goal {...common} style={{ color: 'var(--blue700)' }} />;
    case 'shield': return <Shield {...common} style={{ color: 'var(--blue700)' }} />;
    case 'glove': return <Hand {...common} style={{ color: 'var(--green700)' }} />;
    case 'handshake': return <Handshake {...common} style={{ color: 'var(--green700)' }} />;
    case 'sparkles': return <Sparkles {...common} style={{ color: 'var(--orange700)' }} />;
    case 'medal': return <Medal {...common} className="tm-medal-gold" />;
    case 'star': return <Star {...common} style={{ color: 'var(--orange700)' }} />;
    default: return <Trophy {...common} className="tm-medal-gold" />;
  }
}
