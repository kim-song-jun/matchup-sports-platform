'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminInlineError, AdminKpiCard } from '@/components/admin';
import { PushFailureTable } from '@/components/admin/push-failure-table';
import { SmsFailureTable } from '@/components/admin/sms-failure-table';
import { useV1AdminMonitoringSummary } from '@/hooks/use-v1-api';
import type { V1AdminMonitoringSummary } from '@/types/api';
import { AuditLogView } from './audit-log-view';
import { ErrorLogsClient } from './error-logs-client';

// ── Types ─────────────────────────────────────────────────────────────────
type TabKey = 'errors' | 'push' | 'sms' | 'audit';

interface Tab {
  key: TabKey;
  label: string;
}

interface SignalCard {
  tab: TabKey;
  label: string;
  /** 수치의 집계 기준 — 라벨만으로는 "무엇의 개수"인지 오독된다(24h 창 vs 미확인 누적 vs 오늘). */
  caption: string;
  value: (summary: V1AdminMonitoringSummary) => number;
  /** true 면 0 초과일 때 위험 톤 — 감사 로그는 활동량이지 이상 신호가 아니라서 끈다. */
  alerting: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────
const TABS: Tab[] = [
  { key: 'errors', label: '에러 로그' },
  { key: 'push', label: '웹 푸시 실패' },
  { key: 'sms', label: 'SMS · 인증 실패' },
  { key: 'audit', label: '감사 로그' },
];

const SIGNAL_CARDS: SignalCard[] = [
  { tab: 'errors', label: '에러', caption: '최근 24시간', value: (s) => s.errorsLast24h, alerting: true },
  { tab: 'push', label: '웹 푸시 실패', caption: '미확인 누적', value: (s) => s.pushUnacked, alerting: true },
  { tab: 'sms', label: 'SMS · 인증 실패', caption: '미확인 누적', value: (s) => s.smsUnacked, alerting: true },
  { tab: 'audit', label: '운영 활동', caption: '오늘', value: (s) => s.auditToday, alerting: false },
];

function pickTab(value: string | null): TabKey {
  return TABS.some((tab) => tab.key === value) ? (value as TabKey) : 'errors';
}

// ── Client ────────────────────────────────────────────────────────────────
/**
 * 모니터링 허브 — 흩어져 있던 운영 감시 4화면(에러 로그·웹 푸시 실패·SMS/인증 실패·
 * 감사 로그)을 신호 스트립 + 탭 한 화면으로 모은다(2026-08-25 B안 사용자 확정).
 * 각 탭 본문은 기존 화면의 컴포넌트를 그대로 이식했고, 구 URL 은 ?tab= 리다이렉트로
 * 보존된다. 활성 탭만 마운트한다 — 4개 화면이 동시에 폴링·조회를 시작하면 첫 진입이
 * 무거워지고, 각 본문은 원래 독립 페이지라 탭 전환 시 상태 리셋이 기존 동작과 같다.
 */
export function MonitoringClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // URL → 초기 상태. 구 URL 리다이렉트와 사이드바·개요 딥링크가 그대로 해당 탭에 도착한다.
  const [activeTab, setActiveTab] = useState<TabKey>(() => pickTab(searchParams.get('tab')));
  // 뒤로가기/앞으로가기·외부 내비게이션으로 URL 만 바뀐 경우에도 탭을 따라가게 한다 —
  // 클릭은 setActiveTab 이 즉시 처리하므로 이 effect 는 재동기화 전용이다 (리그 허브와 동일).
  useEffect(() => {
    setActiveTab(pickTab(searchParams.get('tab')));
  }, [searchParams]);

  const { data: summary, isPending, isError, refetch } = useV1AdminMonitoringSummary();

  // 상태 → URL 은 탭 전환 시점에만 쓴다(replace — 탭을 오갈 때마다 히스토리가 쌓이면
  // 뒤로가기가 허브 안에서 맴돈다). effect 동기화가 필요할 만큼 상태가 얽혀 있지 않다.
  function handleTabChange(tab: TabKey) {
    setActiveTab(tab);
    router.replace(tab === 'errors' ? pathname : `${pathname}?tab=${tab}`, { scroll: false });
  }

  return (
    <>
      {/* ── 신호 스트립: 미확인 신호 4카드, 클릭 = 해당 탭. 개요 페이지 KPI 와
          같은 AdminKpiCard 시각 언어를 쓰고, 활성 탭 표시는 아래 세그먼트가 담당한다. ── */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SIGNAL_CARDS.map((card) => {
          const count = summary ? card.value(summary) : null;
          const alert = card.alerting && (count ?? 0) > 0;
          return (
            <AdminKpiCard
              key={card.tab}
              label={card.label}
              value={count ?? '—'}
              sub={card.caption}
              tone={alert ? 'danger' : 'neutral'}
              onClick={() => handleTabChange(card.tab)}
              ariaLabel={`${card.label}(${card.caption}): ${count ?? '집계 중'}건 — ${
                TABS.find((tab) => tab.key === card.tab)?.label
              } 탭 열기`}
            />
          );
        })}
      </div>
      {isError && (
        <div className="mb-5 -mt-2">
          <AdminInlineError message="신호 집계를 불러오지 못했어요." onRetry={() => void refetch()} />
        </div>
      )}

      {/* ── Tab segmented control ─────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="모니터링 항목"
        className="mb-4 flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-[var(--surface-soft)] p-1"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              id={`monitoring-tab-${tab.key}`}
              role="tab"
              aria-selected={isActive}
              // 활성 패널만 마운트하므로 비활성 탭이 존재하지 않는 id 를 가리키지 않도록
              // aria-controls 는 활성 탭에만 단다 (#771 Copilot 지적의 허브 공통 반영).
              aria-controls={isActive ? `monitoring-panel-${tab.key}` : undefined}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              className={[
                'min-h-[44px] whitespace-nowrap rounded-lg px-4 text-[length:var(--font-size-label)] font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                isActive
                  ? 'bg-[var(--card-surface)] text-[var(--text-strong)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-body)]',
              ].join(' ')}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Active tab panel (활성 탭만 마운트) ───────────────────────── */}
      <div
        key={activeTab}
        id={`monitoring-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`monitoring-tab-${activeTab}`}
        className="tm-tabpanel-enter"
      >
        {activeTab === 'errors' && <ErrorLogsClient />}
        {activeTab === 'push' && <PushFailureTable />}
        {activeTab === 'sms' && <SmsFailureTable />}
        {activeTab === 'audit' && <AuditLogView />}
      </div>
    </>
  );
}
