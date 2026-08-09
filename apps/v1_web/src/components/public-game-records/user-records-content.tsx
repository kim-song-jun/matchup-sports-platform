'use client';

import Link from 'next/link';
import { Card, EmptyState, KPIStat } from '@/components/v1-ui/primitives';
import { formatTournamentDateShort } from '@/lib/date-utils';
import { userRecordResultLabel } from './format';
import type { PublicUserRecordItem, PublicUserRecordsResponse } from './types';

const RESULT_COLOR: Record<string, string> = {
  WON: 'var(--blue500)',
  LOST: 'var(--red500)',
  DRAWN: 'var(--text-caption)',
};

function UserRecordRow({ item }: { item: PublicUserRecordItem }) {
  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--grey100)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-caption)' }}>
          {formatTournamentDateShort(item.officialAt) ?? ''}
          {item.tournamentTitle ? ` · ${item.tournamentTitle}` : ''}
        </span>
        <span style={{ display: 'flex', gap: 4 }}>
          {item.mvp ? (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#E8960C', background: '#FFF4DE', borderRadius: 6, padding: '2px 6px' }}>
              MVP
            </span>
          ) : null}
          {item.isCorrected ? (
            <span
              style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue500)', background: 'var(--blue50)', borderRadius: 6, padding: '2px 6px' }}
            >
              정정됨
            </span>
          ) : null}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span
          className="tab-num"
          style={{ fontSize: 14, fontWeight: 800, color: item.result ? (RESULT_COLOR[item.result] ?? 'var(--text-strong)') : 'var(--text-caption)', width: 20 }}
        >
          {userRecordResultLabel(item.result)}
        </span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
          {item.teamName ?? '소속 미상'} vs {item.opponentTeamName ?? '상대 미상'}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-caption)' }}>
        {item.goals}골 · 경고 {item.cards.yellow} · 퇴장 {item.cards.red}
        {item.goalkeeper ? ' · 골키퍼' : ''}
        {item.started ? '' : ' · 교체 출전'}
      </div>
    </div>
  );
}

export function UserRecordsContent({
  data,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  data: PublicUserRecordsResponse;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}) {
  return (
    <div style={{ padding: '16px 20px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <KPIStat label="출전" value={data.summary.appearances} unit="경기" />
          <KPIStat label="골" value={data.summary.goals} unit="골" />
          <KPIStat label="MVP" value={data.summary.mvpCount} unit="회" />
        </div>
      </Card>

      <section>
        <h3 className="tm-hub-section-title" style={{ marginBottom: 10 }}>활동 기록</h3>
        {data.items.length === 0 ? (
          <EmptyState
            title="공개된 경기 기록이 없어요"
            sub="본인 인증(연동)과 공개 동의를 마친 경기부터 이곳에 표시돼요."
          />
        ) : (
          <Card pad={0}>
            {data.items.map((item) =>
              item.tournamentId ? (
                <Link
                  key={item.id}
                  href={`/tournaments/${item.tournamentId}`}
                  style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
                >
                  <UserRecordRow item={item} />
                </Link>
              ) : (
                <div key={item.id}>
                  <UserRecordRow item={item} />
                </div>
              ),
            )}
          </Card>
        )}
        {hasNextPage ? (
          <button
            type="button"
            className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
            style={{ marginTop: 12 }}
            disabled={isFetchingNextPage}
            onClick={onLoadMore}
          >
            {isFetchingNextPage ? '불러오는 중…' : '더 보기'}
          </button>
        ) : null}
      </section>
    </div>
  );
}
