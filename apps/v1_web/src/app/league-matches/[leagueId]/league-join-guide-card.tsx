'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { InfoRow, Card } from '@/components/v1-ui/primitives';
import { useV1MyRegistrations } from '@/hooks/use-v1-api';
import { formatEntryFee, formatTournamentDateTimeLong } from '@/lib/date-utils';
import { hasStoredV1Session } from '@/lib/session-storage';

interface LeagueJoinGuideCardProps {
  leagueId: string;
  state: 'draft' | 'active' | 'completed' | 'on_hold';
  registrationOpen: boolean;
  registrationDeadlineAt: string | null;
  entryFee: number;
  entryFeeConfigured: boolean;
}

/**
 * 공개 리그 상세의 '참가 안내' 카드 — 신청 입구와 마감 안내를 한 컴포넌트의 상태로 둔다.
 *
 * | 조건(위에서부터 첫 일치)              | 그리는 것    |
 * | 끝난 리그 / 내 팀이 이미 신청         | 없음         |
 * | 신청 받는 중                          | 열림 카드    |
 * | 마감이 지났다(마감 시각이 있다)       | 닫힘 카드    |
 * | 마감 미설정 + 참가비 확정             | 안내 전용    |
 * | 마감 미설정 + 참가비 미설정           | 없음         |
 *
 * 계좌번호는 공개 응답에 없고 여기에도 없다 — 신청한 팀장의 신청 화면에서만 보인다.
 * 취소한 신청은 없는 것으로 본다(다시 신청할 수 있다).
 */
export function LeagueJoinGuideCard({
  leagueId,
  state,
  registrationOpen,
  registrationDeadlineAt,
  entryFee,
  entryFeeConfigured,
}: LeagueJoinGuideCardProps) {
  const headingId = useId();
  // 공개 화면이라 비로그인도 연다. 세션 힌트가 있을 때만 내 신청을 조회해 401 을 쏘지 않는다
  // (SSR 과 첫 렌더가 어긋나지 않게 초기값은 false).
  const [hasSessionHint, setHasSessionHint] = useState(false);
  useEffect(() => {
    setHasSessionHint(hasStoredV1Session());
  }, []);

  const hasClosed = registrationDeadlineAt !== null;
  const needsMyRegistration = (registrationOpen || hasClosed) && state !== 'completed';
  const lookupEnabled = needsMyRegistration && hasSessionHint;
  const myRegistrations = useV1MyRegistrations(leagueId, { enabled: lookupEnabled });
  // 조회 실패(isError)는 "신청 없음"으로 본다.
  const hasActiveRegistration = (myRegistrations.data ?? []).some((registration) => registration.status !== 'cancelled');
  // 조회가 끝나기 전에 그리면 카드가 떴다 사라지거나, 신청한 팀장에게 닫힘 카드가 잠깐 보인다.
  const lookupPending = lookupEnabled && myRegistrations.isPending;

  if (state === 'completed' || hasActiveRegistration) return null;

  const feeLabel = entryFeeConfigured ? (entryFee > 0 ? `팀당 ${formatEntryFee(entryFee)}` : '무료') : null;
  const showsPaymentMethod = entryFee > 0;

  if (registrationOpen) {
    if (lookupPending) return null;
    const rows: { label: string; value: string }[] = [];
    if (feeLabel !== null) rows.push({ label: '참가비', value: feeLabel });
    if (showsPaymentMethod) rows.push({ label: '입금 방법', value: '계좌이체 · 신청 후 안내해요' });
    if (hasClosed) rows.push({ label: '신청 마감', value: formatTournamentDateTimeLong(registrationDeadlineAt) });
    return (
      <section className="mt-3" aria-labelledby={headingId}>
        <Card pad={16}>
          <div className="flex items-center gap-2">
            <span className="tm-badge tm-badge-blue">모집 중</span>
            <h3 id={headingId} className="tm-text-card-title text-[var(--text-strong)]">참가 안내</h3>
          </div>
          {rows.length > 0 && (
            <div className="mt-2">
              {rows.map((row, index) => (
                <InfoRow key={row.label} label={row.label} value={row.value} isLast={index === rows.length - 1} />
              ))}
            </div>
          )}
          <Link
            href={`/tournaments/${leagueId}/apply`}
            className="tm-btn tm-btn-md tm-btn-primary tm-btn-block mt-3"
            style={{ minHeight: 44 }}
          >
            참가 신청
          </Link>
        </Card>
      </section>
    );
  }

  if (hasClosed) {
    if (lookupPending) return null;
    return (
      <section className="mt-3" aria-labelledby={headingId}>
        <Card pad={16} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="tm-badge tm-badge-grey">모집 마감</span>
            <h3 id={headingId} className="tm-text-card-title text-[var(--text-strong)]">신청이 마감됐어요</h3>
          </div>
          <p className="tm-text-label text-[var(--text-muted)]">
            {formatTournamentDateTimeLong(registrationDeadlineAt)}에 마감됐어요. 이미 신청한 팀은 확정 결과를 기다려 주세요.
          </p>
          <Link href="/tournaments?kind=league" className="tm-btn tm-btn-md tm-btn-neutral" style={{ minHeight: 44 }}>
            다른 리그 둘러보기
          </Link>
        </Card>
      </section>
    );
  }

  // 마감 미설정 — 참가비를 확정한 리그만 안내하고, 그 외(alpha 기존 리그 전부)는 아무것도 그리지 않는다.
  if (!entryFeeConfigured) return null;
  return (
    <section className="mt-3" aria-labelledby={headingId}>
      <Card pad={16}>
        <div className="flex items-center gap-2">
          <span className="tm-badge tm-badge-grey">신청 준비 중</span>
          <h3 id={headingId} className="tm-text-card-title text-[var(--text-strong)]">참가 안내</h3>
        </div>
        <div className="mt-2">
          <InfoRow label="참가비" value={feeLabel ?? ''} isLast={!showsPaymentMethod} />
          {showsPaymentMethod && <InfoRow label="입금 방법" value="계좌이체 · 신청 후 안내해요" isLast />}
        </div>
        <p className="tm-text-caption mt-2 text-[var(--text-muted)]">신청 일정은 아직 정해지지 않았어요.</p>
      </Card>
    </section>
  );
}
