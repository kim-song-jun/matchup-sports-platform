'use client';

import Link from 'next/link';
import type { KeyboardEvent, ReactNode } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageCircle, MoreHorizontal } from 'lucide-react';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { ErrorState, ListItem } from '@/components/v1-ui/primitives';
import { ChevronRightIcon } from '@/components/v1-ui/icons';
import { useV1TeamSchedules } from '@/hooks/use-v1-api';
import { withFromPath } from '@/lib/session-storage';
import { extractErrorMessage } from '@/lib/error-message';
import { toScheduleListItemModel } from '@/components/team-schedules/team-schedules.view-model';
import { usePublicTeamRecords } from '@/components/public-game-records/use-public-game-records';
import { TeamRecordsContent } from '@/components/public-game-records/team-records-content';
import type { TeamRecordTypeFilter } from '@/components/public-game-records/types';
import { TeamParticipationSkeleton } from './team-detail-profile';

/**
 * 소속 회원이 보는 팀 상세의 탭 네 개(2026-11-27 사용자 확정 A안) — 지금 헤더 카드 아래에 밑줄 탭을 붙인다.
 * 처음엔 회원이 가장 자주 보는 일정 탭을 연다. 고른 탭은 `?tab=` 으로 주소에 남겨, 경기 상세에 다녀와도
 * 같은 탭으로 돌아온다. 가입 전인 사람에게는 탭 없이 한 장짜리 화면을 그대로 보인다.
 */
export const TEAM_DETAIL_TABS = [
  { key: 'info', label: '정보' },
  { key: 'schedule', label: '일정' },
  { key: 'records', label: '기록' },
  { key: 'fee', label: '회비' },
] as const;

export type TeamDetailTabKey = (typeof TEAM_DETAIL_TABS)[number]['key'];

const DEFAULT_TAB: TeamDetailTabKey = 'schedule';

function tabFromQuery(value: string | null): TeamDetailTabKey {
  return TEAM_DETAIL_TABS.some((tab) => tab.key === value) ? (value as TeamDetailTabKey) : DEFAULT_TAB;
}

/** 지금 탭과 바꾸는 함수. 주소는 replace 로만 바꾼다 — 탭을 누를 때마다 뒤로가기 기록이 쌓이면 안 된다. */
export function useTeamDetailTab() {
  const searchParams = useSearchParams();
  const urlTab = tabFromQuery(searchParams.get('tab'));
  const [tab, setTab] = useState<TeamDetailTabKey>(urlTab);
  useEffect(() => setTab(urlTab), [urlTab]);
  const changeTab = useCallback((next: TeamDetailTabKey) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === DEFAULT_TAB) url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);
  return [tab, changeTab] as const;
}

/** 탭이 쓰는 id 묶음 — 탭 버튼과 패널을 서로 가리키게 한다. 모바일·데스크톱이 각자 하나씩 만든다. */
export function useTeamDetailTabIds() {
  const baseId = useId();
  return {
    tab: (key: TeamDetailTabKey) => `${baseId}-tab-${key}`,
    panel: (key: TeamDetailTabKey) => `${baseId}-panel-${key}`,
  };
}

/** 밑줄 탭 막대. 스크롤하면 상단바 바로 아래에 붙는다. 좌우 화살표로도 옮긴다. */
export function TeamDetailTabBar({
  active,
  onChange,
  ids,
}: {
  active: TeamDetailTabKey;
  onChange: (tab: TeamDetailTabKey) => void;
  ids: ReturnType<typeof useTeamDetailTabIds>;
}) {
  const refs = useRef(new Map<TeamDetailTabKey, HTMLButtonElement>());
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = TEAM_DETAIL_TABS.findIndex((tab) => tab.key === active);
    const step = event.key === 'ArrowRight' ? 1 : TEAM_DETAIL_TABS.length - 1;
    const next = TEAM_DETAIL_TABS[(index + step) % TEAM_DETAIL_TABS.length].key;
    onChange(next);
    refs.current.get(next)?.focus();
  };
  return (
    <div className="tm-team-detail-tabs" role="tablist" aria-label="팀 메뉴">
      {TEAM_DETAIL_TABS.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            ref={(node) => {
              if (node) refs.current.set(tab.key, node);
              else refs.current.delete(tab.key);
            }}
            id={ids.tab(tab.key)}
            type="button"
            role="tab"
            className="tm-team-detail-tab"
            aria-selected={selected}
            aria-controls={ids.panel(tab.key)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={onKeyDown}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function TeamDetailTabPanel({
  tab,
  ids,
  children,
}: {
  tab: TeamDetailTabKey;
  ids: ReturnType<typeof useTeamDetailTabIds>;
  children: ReactNode;
}) {
  return (
    <div key={tab} id={ids.panel(tab)} role="tabpanel" aria-labelledby={ids.tab(tab)} className="tm-team-detail-tab-panel">
      {children}
    </div>
  );
}

/** 일정 탭의 팀 일정 — 다가오는 세 개만 보이고 나머지는 일정 화면으로 보낸다. */
export function TeamUpcomingSchedulesSection({ teamId, from }: { teamId: string; from: string }) {
  // 오늘 0시 기준 — 지금 시각을 그대로 넣으면 렌더마다 쿼리 키가 바뀌어 계속 다시 부른다.
  const filters = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return { state: 'SCHEDULED', from: today.toISOString(), limit: 3 };
  }, []);
  const query = useV1TeamSchedules(teamId, filters);
  const listHref = withFromPath(`/teams/${teamId}/schedules`, from);
  const items = (query.data?.items ?? []).map((item) => toScheduleListItemModel(item, teamId));
  // 모바일·데스크톱 본문이 함께 그려지므로 고정 id 를 쓰지 않는다.
  const titleId = useId();
  return (
    <section aria-labelledby={titleId}>
      <div className="tm-section-title" style={{ alignItems: 'center' }}>
        <h2 id={titleId} className="tm-text-body-lg" style={{ margin: 0 }}>팀 일정</h2>
        <Link className="tm-team-detail-more-link" href={listHref} aria-label="팀 일정 전체 보기">
          전체 보기
          <ChevronRightIcon size={16} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>
      {query.isLoading ? (
        <TeamParticipationSkeleton label="팀 일정 불러오는 중" />
      ) : query.isError ? (
        <ErrorState message="팀 일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <div className="tm-card tm-on-tint tm-team-participation-empty">
          <div className="tm-text-label">다가오는 팀 일정이 없어요</div>
          <div className="tm-text-caption">훈련·이벤트 일정이 생기면 여기서 참석을 체크해요.</div>
        </div>
      ) : (
        <div className="tm-team-open-match-list">
          {items.map((item) => (
            <ListItem
              key={item.id}
              href={withFromPath(item.href, from)}
              title={item.title}
              sub={[item.typeLabel, item.dateTimeLabel, item.attendanceSummary].filter((part) => part !== null).join(' · ')}
              trailing={<span className={`tm-badge ${item.stateTone === 'default' ? 'tm-badge-blue' : 'tm-badge-grey'}`}>{item.stateLabel}</span>}
              chev
              style={item.isTentative ? { opacity: 0.35 } : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * 기록 탭 — 팀 전적 화면(/teams/:id/records)과 같은 내용이다. 종류·시즌 고르기는 이 탭 안에서만 바꾸고
 * 팀 상세 주소에는 남기지 않는다(주소에는 탭만 둔다).
 */
export function TeamRecordsTab({ teamId, from }: { teamId: string; from: string }) {
  const [type, setType] = useState<TeamRecordTypeFilter>('all');
  const [season, setSeason] = useState<string | undefined>(undefined);
  const { data, isPending, isError, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    usePublicTeamRecords(teamId, season, type === 'all' ? undefined : type);
  const firstPage = data?.pages[0];
  if (isPending) return <TeamParticipationSkeleton label="팀 기록 불러오는 중" />;
  if (isError || !firstPage) {
    return <ErrorState message={extractErrorMessage(error, '팀 기록을 불러오지 못했어요.')} onRetry={() => void refetch()} />;
  }
  return (
    <div className="tm-team-detail-records">
      <TeamRecordsContent
        data={{ ...firstPage, items: data.pages.flatMap((page) => page.items) }}
        selfHref={from}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => void fetchNextPage()}
        activeType={type}
        onChangeType={setType}
        activeSeason={season}
        onChangeSeason={setSeason}
      />
    </div>
  );
}

/**
 * 회비 탭 — 지금은 팀이 정한 월 회비만 보인다. 납부 현황과 장부는 서버에 기록할 자리가 생긴 뒤 이 탭에 붙인다.
 */
export function TeamFeeTab({ fee, editHref }: { fee?: number | null; editHref?: string }) {
  const value = fee == null ? '정하지 않았어요' : fee === 0 ? '회비가 없어요' : `${fee.toLocaleString('ko-KR')}원`;
  return (
    <section className="tm-team-section" aria-label="회비">
      <div className="tm-card tm-team-fee-card">
        <div className="tm-text-caption">월 회비</div>
        <div className={fee == null || fee === 0 ? 'tm-team-fee-value tm-team-fee-value-muted' : 'tm-team-fee-value tab-num'}>{value}</div>
        <p className="tm-text-caption" style={{ margin: 0 }}>
          {fee == null ? '팀장·매니저가 회비를 정하면 여기에 보여요.' : '회비 금액은 팀장·매니저가 팀 정보에서 정해요.'}
        </p>
      </div>
      {editHref ? (
        <Link className="tm-list-row tm-pressable tm-team-fee-edit" href={editHref}>
          <span className="tm-text-label" style={{ flex: 1 }}>회비 금액 바꾸기</span>
          <ChevronRightIcon size={18} stroke="var(--text-caption)" strokeWidth={2} aria-hidden="true" />
        </Link>
      ) : null}
    </section>
  );
}

/**
 * 운영진 메뉴 — 헤더에서 뺀 멤버 관리·팀 정보 수정을 ⋯ 버튼에서도 연다. 공유 버튼과 나란히 두면 390 폭에서
 * 팀 이름이 두 줄로 밀려, 운영진에게는 공유를 이 메뉴 첫 줄로 옮기고 ⋯ 하나만 둔다.
 */
export function TeamManageMoreButton({ membersHref, editHref, onShare }: { membersHref: string; editHref: string; onShare: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="tm-btn tm-btn-icon tm-btn-ghost tm-team-profile-more" type="button" aria-label="팀 관리 메뉴" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="팀 관리">
        <div className="tm-team-more-menu">
          <button
            className="tm-list-row tm-pressable tm-team-more-menu-button"
            type="button"
            onClick={() => {
              setOpen(false);
              onShare();
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-label">팀 링크 공유</div>
              <div className="tm-text-caption">팀 상세 주소를 복사해요</div>
            </div>
          </button>
          <Link className="tm-list-row tm-pressable" href={membersHref} data-sheet-exit onClick={() => setOpen(false)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-label">멤버 관리</div>
              <div className="tm-text-caption">초대·가입 신청·역할</div>
            </div>
            <ChevronRightIcon size={18} stroke="var(--text-caption)" strokeWidth={2} aria-hidden="true" />
          </Link>
          <Link className="tm-list-row tm-pressable" href={editHref} data-sheet-exit onClick={() => setOpen(false)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-label">팀 정보 수정</div>
              <div className="tm-text-caption">소개·로고·공개 범위</div>
            </div>
            <ChevronRightIcon size={18} stroke="var(--text-caption)" strokeWidth={2} aria-hidden="true" />
          </Link>
        </div>
      </BottomSheet>
    </>
  );
}

/** 팀 채팅 — 회원 화면의 하단 긴 버튼 대신 오른쪽 아래 동그란 버튼(2026-11-27 사용자 확정). */
export function TeamChatFab({ onClick, pending, disabled }: { onClick: () => void; pending?: boolean; disabled?: boolean }) {
  return (
    <button
      className="tm-floating-fab tm-team-chat-fab tm-hide-desktop"
      type="button"
      aria-label={pending ? '팀 채팅 여는 중' : '팀 채팅'}
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      onClick={onClick}
    >
      <MessageCircle size={26} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}
