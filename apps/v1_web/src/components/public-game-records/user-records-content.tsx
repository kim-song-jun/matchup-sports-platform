'use client';

import Link from 'next/link';
import { EyeOff } from 'lucide-react';
import { Card, EmptyState, KPIStat } from '@/components/v1-ui/primitives';
import { formatTournamentDateShort } from '@/lib/date-utils';
import { TournamentAwardIcon } from '@/components/tournaments/tournament-award-icon';
import { userRecordResultLabel } from './format';
import { resultChipStyle, resultStripeStyle } from './result-emphasis';
import { SegmentedTabs } from '@/components/v1-ui/segmented-tabs';
import { RECORD_TYPE_TABS, recordEmptyCopy, type RecordTypeFilter } from './record-category-tabs';
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

/**
 * F6 -- 행 상단 캡션에 붙일 대회/리그 이름. 대회 경기는 예전처럼 대회명을, 정규 리그
 * 대진은 리그명을 같은 자리에 같은 표기(` · 이름`)로 보여준다 -- 리그 경기가 친선
 * 팀매치와 구분 없이 이름 없는 행으로 남던 것이 이 결함(F6)이었다. 리그가 아닌 친선
 * 팀매치는 예전 그대로 아무것도 붙지 않는다(회귀 금지).
 *
 * 서버 계약상 `tournamentId`가 있는 경기는 `leagueId`가 항상 null이라(대회의 "리그 방식"
 * 포맷도 분류상 `tournament`) 둘이 동시에 채워지는 행은 없지만, 우선순위는 백엔드
 * 판정 함수(`classifyTeamRecordCategory`)와 같은 순서로 고정해 둔다.
 */
function competitionLabel(item: PublicUserRecordItem): string | null {
  return item.tournamentTitle ?? item.leagueTitle ?? null;
}

function UserRecordRow({ item }: { item: PublicUserRecordItem }) {
  const competition = competitionLabel(item);
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
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
          {competition ? ` · ${competition}` : ''}
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
              padding: '2px 8px',
            }}
          >
            MVP
          </span>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
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
  activeType,
  onChangeType,
}: {
  data: PublicUserRecordsResponse;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  /** Task 166 BE-4. 미전달이면 탭을 그리지 않는다 — 아직 탭 없이 이 컴포넌트를 쓰는
   *  화면이 있을 수 있어 팀 전적(`onChangeType`)과 같은 방식으로 optional 이다. */
  activeType?: RecordTypeFilter;
  onChangeType?: (next: RecordTypeFilter) => void;
}) {
  // items가 0건이면(대회 라인업에 아직 연결된 적 없음) 배너의 "이 기록은 아직
  // 나에게만 보여요" 문구가 바로 아래 EmptyState("아직 등록된 경기 기록이 없어요")와
  // 모순된다 — 숨겨진 기록이 실제로 있을 때만 보여준다.
  const showOwnerVisibilityBanner = data.viewerIsOwner && !data.consentGranted && data.items.length > 0;
  const resolvedActiveType: RecordTypeFilter = activeType ?? 'all';
  // 탭별 KPI 는 서버가 이미 계산해 보낸 `summary.byType[종류]` 를 읽는다 — 팀 전적과
  // 같은 계약이라 탭을 바꿔도 KPI 를 다시 받지 않는다. '전체'만 최상위 summary 다.
  const activeTotals =
    resolvedActiveType === 'all' ? data.summary : data.summary.byType[resolvedActiveType];

  return (
    <div style={{ padding: '16px 20px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {showOwnerVisibilityBanner ? <OwnerVisibilityBanner /> : null}

      {onChangeType ? (
        <SegmentedTabs
          items={RECORD_TYPE_TABS.map((tab) => ({ id: tab.key, label: tab.label }))}
          activeId={resolvedActiveType}
          onSelect={(id) => onChangeType(id as RecordTypeFilter)}
          ariaLabel="경기 종류"
          role="tablist"
        />
      ) : null}

      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
          {/* "출전"이 아니라 "엔트리" — 이 숫자는 **명단에 이름이 오른 경기 수**다.
              명단에 오르면 곧 참가자로 집계되므로(D3), 벤치에 있었어도 세어진다.
              "출전"이라 부르면 뛰지 않은 경기까지 뛴 것처럼 말하게 된다. */}
          <KPIStat label="엔트리" value={activeTotals.appearances} unit="경기" />
          <KPIStat label="골" value={activeTotals.goals} unit="골" />
          {/* 매치 MVP·대회 수상은 탭과 무관하게 **전체 기준**이다 — 대회 수상은 애초에
              대회에만 있고, 매치 MVP 를 탭별로 쪼개면 '친선 MVP 0회' 같은 칸이 생긴다. */}
          <KPIStat label="매치 MVP" value={data.summary.matchMvpCount} unit="회" />
          <KPIStat label="대회 수상" value={data.summary.tournamentAwardCount} unit="회" />
        </div>
      </Card>

      {data.tournamentAwards.length > 0 ? (
        <section aria-labelledby="tournament-awards-title">
          <h3 id="tournament-awards-title" className="tm-hub-section-title" style={{ marginBottom: 12 }}>대회 수상</h3>
          <Card pad={0}>
            {data.tournamentAwards.map((award) => (
              <Link
                key={award.id}
                href={`/tournaments/${award.tournamentId}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '16px 16px',
                  borderTop: '1px solid var(--grey100)',
                  color: 'inherit',
                  textDecoration: 'none',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-flex',
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 'var(--radius-control)',
                    background: 'var(--surface-soft)',
                  }}
                >
                  <TournamentAwardIcon iconKey={award.iconKey} awardType={award.awardType} size={20} />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>
                    {award.awardLabel}
                  </span>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: 'var(--text-caption)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {award.tournamentTitle}
                    {award.teamName ? ` · ${award.teamName}` : ''}
                    {formatTournamentDateShort(award.awardedAt) ? ` · ${formatTournamentDateShort(award.awardedAt)}` : ''}
                  </span>
                  {award.note ? (
                    <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                      {award.note}
                    </span>
                  ) : null}
                </span>
              </Link>
            ))}
          </Card>
        </section>
      ) : null}

      <section>
        <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>활동 기록</h3>
        {data.items.length === 0 ? (
          // 탭이 걸려 있으면 "이 종류가 없다" 가 정확한 설명이다 — 전체 문구를 그대로
          // 쓰면 기록이 있는데도 "아직 등록된 경기 기록이 없어요" 로 읽힌다.
          resolvedActiveType !== 'all' ? (
            <EmptyState {...recordEmptyCopy(resolvedActiveType, { title: '', sub: '' })} />
          ) : data.viewerIsOwner ? (
            // 본인 페이지에서 0건이면 본인은 동의 여부와 무관하게 이미 자기 기록을 볼 수
            // 있으므로(showOwnerVisibilityBanner가 그 상태를 별도로 알린다), 남는 원인은
            // "대회 라인업에 아직 팀원으로 연결되지 않음" 하나뿐이다.
            <EmptyState
              title="아직 등록된 경기 기록이 없어요"
              sub="팀 매니저가 대회 라인업에 회원님을 팀원으로 연결하고, 대회 결과가 확정되면 이곳에 표시돼요."
            />
          ) : (
            // 타인이 보는 페이지에서 0건이면 원인이 신원 연결 미완료·결과 미확정·공개 동의
            // 미완료 중 무엇이든 될 수 있고, 서버는 어느 쪽인지 구분해 내려주지 않는다.
            //
            // 2026-08-24 프로덕션 실측으로 문구 순서를 바꿨다. 이전 문구는 "팀 매니저가
            // 연결해야 하고" 를 **먼저** 말했는데, 실제로는 신원 연결이 1,384건 이미 쌓여
            // 있고 공개 동의를 켠 사람이 0명이었다 -- 즉 압도적 다수의 원인은 동의 쪽이다.
            // 이미 끝난 조건을 먼저 안내하니 사용자가 엉뚱한 곳을 확인하다 "오류인가?" 로
            // 되물었다(이 태스크의 출발점이 그 문의였다).
            //
            // 그렇다고 "동의를 안 켰다"고 단정하지는 않는다 -- 서버가 원인을 구분해 주지
            // 않으므로 단정은 틀릴 수 있다. 가장 흔한 원인을 앞에 두되 나머지도 함께 적는다.
            <EmptyState
              title="공개된 경기 기록이 없어요"
              sub="이 선수가 경기 기록 공개를 켜면 이곳에 표시돼요. 대회 결과가 확정되기 전이거나 팀 라인업에 연결되지 않은 경기는 표시되지 않아요."
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
