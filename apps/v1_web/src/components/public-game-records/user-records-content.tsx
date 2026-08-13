'use client';

import Link from 'next/link';
import { Card, EmptyState, KPIStat } from '@/components/v1-ui/primitives';
import { formatTournamentDateShort } from '@/lib/date-utils';
import { userRecordResultLabel } from './format';
import { resultChipStyle, resultStripeStyle } from './result-emphasis';
import type { PublicUserRecordItem, PublicUserRecordsResponse } from './types';

function UserRecordRow({ item }: { item: PublicUserRecordItem }) {
  return (
    <div
      style={{
        padding: '12px 16px 12px 12px',
        borderTop: '1px solid var(--grey100)',
        ...resultStripeStyle(item.result),
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        {/* [R-T2] 고정폭 없는 텍스트/배지 — 아래 3개 span 모두 12로 상향. */}
        <span style={{ fontSize: 12, color: 'var(--text-caption)' }}>
          {formatTournamentDateShort(item.officialAt) ?? ''}
          {item.tournamentTitle ? ` · ${item.tournamentTitle}` : ''}
        </span>
        <span style={{ display: 'flex', gap: 4 }}>
          {item.mvp ? (
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange700, #a36100)', background: 'var(--orange50)', borderRadius: 6, padding: '2px 6px' }}>
              MVP
            </span>
          ) : null}
          {item.isCorrected ? (
            <span
              style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue700)', background: 'var(--blue50)', borderRadius: 6, padding: '2px 6px' }}
            >
              정정됨
            </span>
          ) : null}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={resultChipStyle(item.result)}>{userRecordResultLabel(item.result)}</span>
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
            // F3: "왜 비었는지"만 말하던 예전 문구(본인 인증/공개 동의)는 실제로 기록이
            // 만들어지는 경로와 어긋나 있었다 — 신원 연결은 대회 라인업에 팀원으로
            // 등록되는 순간(매니저의 로스터 등록) 자동으로 생기고, 그 다음 본인이 공개
            // 동의를 켜야 여기 보인다. 두 조건과 각각 어디서 해결하는지를 함께 밝힌다.
            sub="팀 매니저가 대회 라인업에 나를 팀원으로 연결해야 하고, 마이페이지 > 설정 > 경기 기록 공개에서 공개 동의를 켜야 이곳에 표시돼요."
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
