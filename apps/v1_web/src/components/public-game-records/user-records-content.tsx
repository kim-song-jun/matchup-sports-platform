'use client';

import Link from 'next/link';
import { EyeOff } from 'lucide-react';
import { Card, EmptyState, KPIStat } from '@/components/v1-ui/primitives';
import { formatTournamentDateShort } from '@/lib/date-utils';
import { userRecordResultLabel } from './format';
import { resultChipStyle, resultStripeStyle } from './result-emphasis';
import type { PublicUserRecordItem, PublicUserRecordsResponse } from './types';

/**
 * `viewerIsOwner && !consentGranted`일 때만 뜬다 — 본인은 동의 없이도 자기 기록을
 * 볼 수 있지만(서버 게이팅 우회), 그 상태는 "남에게는 아직 안 보이는 상태"다. 그
 * 사실과 해결 경로(공개 동의 설정)를 색만이 아니라 아이콘+텍스트로 함께 전달한다.
 */
function OwnerVisibilityBanner() {
  return (
    <Card
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        background: 'var(--blue50)',
      }}
    >
      <EyeOff size={20} strokeWidth={2} color="var(--blue700)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="tm-text-body-lg" style={{ color: 'var(--blue700)', fontWeight: 700 }}>
          이 기록은 아직 나에게만 보여요
        </div>
        <div className="tm-text-label" style={{ color: 'var(--blue700)', lineHeight: 1.5 }}>
          경기 기록 공개를 켜면 다른 사람도 내 활동 기록을 볼 수 있어요.
        </div>
        <Link
          href="/my/settings/record-consent"
          className="tm-btn tm-btn-md tm-btn-primary"
          style={{ marginTop: 8, alignSelf: 'flex-start' }}
        >
          경기 기록 공개 설정하기
        </Link>
      </div>
    </Card>
  );
}

function UserRecordRow({ item }: { item: PublicUserRecordItem }) {
  return (
    <div
      style={{
        padding: '12px 16px 12px 12px',
        borderTop: '1px solid var(--grey100)',
        ...resultStripeStyle(item.result),
      }}
    >
      {/* [R-T2] 고정폭 없는 텍스트/배지 — 아래 span 모두 12로 상향.
          '정정됨' 배지 제거 후 재균형: 우측에 남는 배지는 MVP 하나뿐이라 고정폭
          `justify-content: space-between` 대신 날짜/대회명 span이 `flex:1`로 남은
          폭을 모두 차지하게 하고(대회명이 길어도 줄임표 전까지 더 길게 보임),
          MVP가 없는 행은 우측 슬롯 자체를 렌더하지 않는다. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span
          style={{
            fontSize: 12,
            color: 'var(--text-caption)',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {formatTournamentDateShort(item.officialAt) ?? ''}
          {item.tournamentTitle ? ` · ${item.tournamentTitle}` : ''}
        </span>
        {item.mvp ? (
          <span
            style={{
              flexShrink: 0,
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--orange700, #a36100)',
              background: 'var(--orange50)',
              borderRadius: 6,
              padding: '2px 6px',
            }}
          >
            MVP
          </span>
        ) : null}
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
  // items가 0건이면(대회 라인업에 아직 연결된 적 없음) 배너의 "이 기록은 아직
  // 나에게만 보여요" 문구가 바로 아래 EmptyState("아직 등록된 경기 기록이 없어요")와
  // 모순된다 — 숨겨진 기록이 실제로 있을 때만 보여준다.
  const showOwnerVisibilityBanner = data.viewerIsOwner && !data.consentGranted && data.items.length > 0;

  return (
    <div style={{ padding: '16px 20px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {showOwnerVisibilityBanner ? <OwnerVisibilityBanner /> : null}

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
          data.viewerIsOwner ? (
            // 본인 페이지에서 0건이면 본인은 동의 여부와 무관하게 이미 자기 기록을 볼 수
            // 있으므로(showOwnerVisibilityBanner가 그 상태를 별도로 알린다), 남는 원인은
            // "대회 라인업에 아직 팀원으로 연결되지 않음" 하나뿐이다.
            <EmptyState
              title="아직 등록된 경기 기록이 없어요"
              sub="팀 매니저가 대회 라인업에 회원님을 팀원으로 연결하면 이곳에 표시돼요."
            />
          ) : (
            // 타인이 보는 페이지에서 0건이면 원인이 신원 연결 미완료·공개 동의 미완료
            // 둘 다일 수 있어(서버가 어느 쪽인지 구분해 내려주지 않음) 두 조건을 모두
            // 3인칭으로 안내한다 — "나를"이라고 쓰면 조회자 본인 얘기처럼 보인다.
            <EmptyState
              title="공개된 경기 기록이 없어요"
              sub="팀 매니저가 대회 라인업에 이 선수를 팀원으로 연결해야 하고, 선수 본인이 마이페이지 > 설정 > 경기 기록 공개에서 공개 동의를 켜야 이곳에 표시돼요."
            />
          )
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
