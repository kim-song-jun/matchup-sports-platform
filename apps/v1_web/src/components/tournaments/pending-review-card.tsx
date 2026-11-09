'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCurrentHref } from '@/components/v1-ui/use-current-href';
import { withFromPath } from '@/lib/session-storage';
import { Star } from 'lucide-react';
import { Card } from '@/components/v1-ui/primitives';
import { hasStoredV1Session } from '@/lib/session-storage';
import { useV1PendingTournamentReviews, useV1Reviews } from '@/hooks/use-v1-api';

/** 목록 한 번에 세는 상한. 배너는 총계만 쓰므로 여기서 잘려도 "N건 이상"이 되진 않는다 —
 *  경기 후기가 이보다 많은 사용자는 극히 드물고, 넘치면 어차피 목록에서 이어서 처리한다. */
const PENDING_SCAN_LIMIT = 50;

/**
 * 남은 후기 총계와 첫 대회를 함께 돌려준다. 홈은 유도 배너를 하나만 고르므로 카드가 뜰지
 * 부모가 미리 알아야 한다 — 부모와 카드가 이 훅을 같이 쓰고, React Query 가 같은 키를
 * 한 번만 요청한다.
 */
export function usePendingReviewsSummary() {
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
  return {
    total: eventRemaining + tournamentItems.length,
    eventRemaining,
    tournamentItems,
  };
}

type ReviewAction = { href: string; label: string };

/**
 * 남은 후기를 한 카드로 모아 안내한다. 작성 화면이 둘이라 CTA 도 둘로 나뉜다:
 * 경기 후기(개인 매치·팀매치·대회 경기)는 /my/reviews, 대회 후기는 /tournaments/:id/awards(허브에 안 뜬다).
 * `banner` 는 마이페이지·시상 화면의 파란 안내 카드, `row` 는 홈의 흰 카드 한 줄이다 —
 * 홈 위쪽에서 다음 경기 카드와 같은 강조를 쓰지 않도록 버튼도 회색으로 낮춘다.
 */
export function PendingReviewsCard({ layout = 'banner' }: { layout?: 'banner' | 'row' }) {
  const { total, eventRemaining, tournamentItems } = usePendingReviewsSummary();
  // 홈·마이·시상 어디에 놓여도 도착 화면의 뒤로가기가 이 화면(받은 출처 포함)으로 돌아오게 한다.
  const pathname = usePathname();
  const here = useCurrentHref();
  // 지금 보고 있는 화면으로 가는 링크는 받은 출처를 잃지 않도록 현재 URL 그대로 둔다.
  const linkFrom = (target: string) => (target === pathname ? here ?? target : withFromPath(target, here));
  if (total === 0) return null;

  const firstTournament = tournamentItems[0];
  // 소스마다 작성 화면이 달라 CTA를 하나로 합칠 수 없다. 둘 다 있으면 둘 다 낸다.
  const actions = [
    eventRemaining > 0 ? { href: linkFrom('/my/reviews'), label: `경기 후기 ${eventRemaining}건 쓰기` } : null,
    firstTournament ? { href: linkFrom(`/tournaments/${firstTournament.tournamentId}/awards`), label: '대회 후기 쓰기' } : null,
  ].filter((action): action is ReviewAction => action !== null);
  const sources = describeSources(eventRemaining, tournamentItems.length, firstTournament?.tournamentTitle);

  if (layout === 'row') {
    const single = actions.length === 1 ? actions[0] : null;
    return (
      <Card pad={16} style={{ marginBottom: 16, minWidth: 0 }}>
        {/* 좁은 폭에서 버튼이 제목을 음절 단위로 밀어내지 않도록, 자리가 모자라면 버튼이 다음 줄로 간다. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span
            aria-hidden="true"
            style={{
              flexShrink: 0, width: 36, height: 36, borderRadius: 'var(--radius-control)', background: 'var(--orange-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Star size={18} fill="var(--orange500)" stroke="var(--orange500)" strokeWidth={1.6} />
          </span>
          <div style={{ flex: '1 1 120px', minWidth: 0 }}>
            <div className="tm-text-label">
              남은 후기 <span className="tab-num">{total}</span>건
            </div>
            <div className="tm-text-caption" style={{ marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sources}
            </div>
          </div>
          {single ? (
            <Link href={single.href} className="tm-btn tm-btn-sm tm-btn-neutral" style={{ whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 'auto' }}>
              {single.label}
            </Link>
          ) : null}
        </div>
        {single ? null : (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {actions.map((action) => (
              <Link key={action.href} href={action.href} className="tm-btn tm-btn-sm tm-btn-neutral" style={{ flex: '1 1 auto', whiteSpace: 'nowrap' }}>
                {action.label}
              </Link>
            ))}
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card
      pad={16}
      // 지면에 색을 까므로 그 위 보조 텍스트를 함께 올린다(globals.css .tm-on-tint).
      className="tm-on-tint"
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
            {sources}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {actions.map((action, index) => (
          <Link
            key={action.href}
            href={action.href}
            // 배너 배경이 blue500 8% 라 tm-btn-neutral(grey100)은 배경에 묻혀 버튼으로 안 읽힌다.
            // 두 번째 CTA 는 위계를 낮추되 형태는 남아야 하므로 흰 배경 + 테두리로 분리한다.
            className={`tm-btn tm-btn-sm tm-btn-block ${index === 0 ? 'tm-btn-primary' : 'tm-btn-outline'}`}
            style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {action.label}
          </Link>
        ))}
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
