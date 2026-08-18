'use client';

import Link from 'next/link';
import { Star } from 'lucide-react';
import { Card } from '@/components/v1-ui/primitives';
import { hasStoredV1Session } from '@/lib/session-storage';
import { useV1PendingTournamentReviews, useV1Reviews } from '@/hooks/use-v1-api';

/** 목록 한 번에 세는 상한. 배너는 총계만 쓰므로 여기서 잘려도 "N건 이상"이 되진 않는다 —
 *  경기 후기가 이보다 많은 사용자는 극히 드물고, 넘치면 어차피 목록에서 이어서 처리한다. */
const PENDING_SCAN_LIMIT = 50;

/**
 * 마이페이지 상단 — 아직 남은 후기를 한 카드로 모아 안내한다.
 *
 * 후기는 소스가 둘이고 작성 화면도 갈린다:
 *   - 경기 후기(개인 매치·팀매치·대회 경기) → /my/reviews 허브에서 이어서 작성
 *   - 대회 후기                              → /tournaments/:id/awards (허브에 안 뜬다)
 * 예전에는 이 카드가 대회 후기만 알려줘서, 경기 후기는 마이 메뉴의 서브텍스트 한 줄
 * 말고는 유도 수단이 없었다. 총계를 한 번에 보여주고 소스별로 갈 곳을 나눠 준다.
 */
export function PendingReviewsCard() {
  const hasSession = hasStoredV1Session();
  const { data: tournamentPending } = useV1PendingTournamentReviews(hasSession);
  const { data: eventPending } = useV1Reviews(
    { tab: 'pending', limit: PENDING_SCAN_LIMIT },
    { enabled: hasSession },
  );

  const tournamentItems = tournamentPending ?? [];
  // 경기 후기는 "경기 수"가 아니라 아직 남은 "대상 수"를 센다 — 한 경기에 상대 팀 1 +
  // 상대 선수 여러 명이 걸리므로, 경기 수로 세면 실제 할 일보다 훨씬 적게 보인다.
  const eventRemaining = (eventPending?.items ?? []).reduce((sum, item) => sum + item.remainingCount, 0);
  const total = eventRemaining + tournamentItems.length;
  if (total === 0) return null;

  const firstTournament = tournamentItems[0];

  return (
    <Card
      pad={16}
      style={{ background: 'var(--tint-blue)', border: '1px solid var(--tint-blue-border)', marginBottom: 16, minWidth: 0 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 40, height: 40, borderRadius: 10, background: 'var(--surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
          aria-hidden="true"
        >
          <Star size={18} fill="var(--orange500)" stroke="var(--orange500)" strokeWidth={1.6} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue700)' }}>
            남은 후기 <span className="tab-num">{total}</span>건
          </div>
          <div
            style={{
              fontSize: 12, color: 'var(--text-caption)', marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {describeSources(eventRemaining, tournamentItems.length, firstTournament?.tournamentTitle)}
          </div>
        </div>
      </div>

      {/* 소스마다 작성 화면이 달라 CTA를 하나로 합칠 수 없다. 둘 다 있으면 두 줄로 나눈다. */}
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {eventRemaining > 0 ? (
          <Link
            href="/my/reviews"
            className="tm-btn tm-btn-sm tm-btn-primary tm-btn-block"
            style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            경기 후기 {eventRemaining}건 쓰기
          </Link>
        ) : null}
        {firstTournament ? (
          <Link
            href={`/tournaments/${firstTournament.tournamentId}/awards`}
            // 배너 배경이 blue500 8% 라 tm-btn-neutral(grey100)은 배경에 묻혀 버튼으로 안 읽힌다.
            // 두 번째 CTA 는 위계를 낮추되 형태는 남아야 하므로 흰 배경 + 테두리로 분리한다.
            className={`tm-btn tm-btn-sm tm-btn-block ${eventRemaining > 0 ? 'tm-btn-outline' : 'tm-btn-primary'}`}
            style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            대회 후기 쓰기
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

function describeSources(eventRemaining: number, tournamentCount: number, tournamentTitle?: string) {
  if (eventRemaining > 0 && tournamentCount > 0) {
    return `함께 뛴 상대 평가 ${eventRemaining}건 · 대회 후기 ${tournamentCount}건`;
  }
  if (eventRemaining > 0) return '함께 뛴 상대에게 후기를 남겨주세요';
  return tournamentTitle ?? '참가팀 후기를 기다리고 있어요';
}
