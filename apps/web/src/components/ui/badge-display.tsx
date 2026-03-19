'use client';

import { useState } from 'react';
import { Star, Clock, Shield, CheckCircle, Sparkles } from 'lucide-react';

interface Badge {
  id: string;
  type: string;
  name: string;
  description?: string;
  earnedAt?: string;
}

interface BadgeDisplayProps {
  badges: Badge[];
  size?: 'sm' | 'md';
}

const badgeConfig: Record<string, { icon: typeof Star; color: string; bg: string }> = {
  manner_player: { icon: Star, color: 'text-amber-500', bg: 'bg-amber-50' },
  punctual: { icon: Clock, color: 'text-blue-500', bg: 'bg-blue-50' },
  referee_hero: { icon: Shield, color: 'text-purple-500', bg: 'bg-purple-50' },
  honest_team: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
  newcomer: { icon: Sparkles, color: 'text-pink-500', bg: 'bg-pink-50' },
};

export function BadgeDisplay({ badges, size = 'sm' }: BadgeDisplayProps) {
  const [tooltip, setTooltip] = useState<string | null>(null);

  if (!badges || badges.length === 0) return null;

  const iconSize = size === 'sm' ? 14 : 18;
  const containerSize = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {badges.map((badge) => {
        const config = badgeConfig[badge.type] || badgeConfig.newcomer;
        const Icon = config.icon;

        return (
          <div key={badge.id} className="relative">
            <button
              onMouseEnter={() => setTooltip(badge.id)}
              onMouseLeave={() => setTooltip(null)}
              onClick={() => setTooltip(tooltip === badge.id ? null : badge.id)}
              className={`flex ${containerSize} items-center justify-center rounded-full ${config.bg} ${config.color} transition-transform hover:scale-110`}
              aria-label={badge.name}
            >
              <Icon size={iconSize} />
            </button>

            {/* Tooltip */}
            {tooltip === badge.id && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 animate-fade-in">
                <div className="rounded-lg bg-gray-900 px-3 py-2 text-center whitespace-nowrap shadow-lg">
                  <p className="text-[12px] font-semibold text-white">{badge.name}</p>
                  {badge.description && (
                    <p className="text-[11px] text-gray-400 mt-0.5">{badge.description}</p>
                  )}
                </div>
                <div className="flex justify-center">
                  <div className="h-2 w-2 rotate-45 bg-gray-900 -mt-1" />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
