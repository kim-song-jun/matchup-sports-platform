'use client';

import { SportCard } from '@/components/match/sport-card';

const sports = [
  { type: 'futsal', label: '풋살', emoji: '⚽', color: '#10B981' },
  { type: 'basketball', label: '농구', emoji: '🏀', color: '#F59E0B' },
  { type: 'badminton', label: '배드민턴', emoji: '🏸', color: '#3B82F6' },
  { type: 'ice_hockey', label: '아이스하키', emoji: '🏒', color: '#6366F1' },
  { type: 'figure_skating', label: '피겨', emoji: '⛸️', color: '#EC4899' },
  { type: 'short_track', label: '쇼트트랙', emoji: '🏅', color: '#EF4444' },
];

export default function HomePage() {
  return (
    <div className="px-5 pt-[var(--safe-area-top)]">
      {/* Header */}
      <header className="flex items-center justify-between py-4">
        <h1 className="text-2xl font-black text-primary">MatchUp</h1>
        <button className="rounded-full bg-background p-2">
          <Bell size={20} />
        </button>
      </header>

      {/* 종목 선택 */}
      <section className="mb-6">
        <h2 className="mb-3 text-lg font-bold">종목 선택</h2>
        <div className="grid grid-cols-3 gap-3">
          {sports.map((sport) => (
            <SportCard key={sport.type} {...sport} />
          ))}
        </div>
      </section>

      {/* 추천 매치 */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">추천 매치</h2>
          <button className="text-sm text-primary">더보기</button>
        </div>
        <div className="space-y-3">
          <MatchPreviewCard
            title="주말 풋살 한판!"
            sport="풋살"
            date="3/22 (토) 18:00"
            venue="서울 마포 풋살파크"
            players="8/10"
            fee="15,000원"
            level="중급"
          />
          <MatchPreviewCard
            title="농구 3대3 모집"
            sport="농구"
            date="3/23 (일) 14:00"
            venue="강남 체육관"
            players="4/6"
            fee="12,000원"
            level="초급~중급"
          />
        </div>
      </section>
    </div>
  );
}

function Bell({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function MatchPreviewCard({
  title,
  sport,
  date,
  venue,
  players,
  fee,
  level,
}: {
  title: string;
  sport: string;
  date: string;
  venue: string;
  players: string;
  fee: string;
  level: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 transition-shadow hover:shadow-md active:scale-[0.99]">
      <div className="mb-2 flex items-start justify-between">
        <h3 className="font-bold">{title}</h3>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          {sport}
        </span>
      </div>
      <div className="space-y-1 text-sm text-text-secondary">
        <p>📅 {date}</p>
        <p>📍 {venue}</p>
        <div className="flex gap-4">
          <span>👥 {players}</span>
          <span>💰 {fee}</span>
          <span>📊 {level}</span>
        </div>
      </div>
    </div>
  );
}
