'use client';

import { Button } from '@/components/v1-ui/button';
import { isRetryableGameOperationsErrorCode } from '@/hooks/use-v1-game-operations-console';
import type { QueuedGameEvent, QueuedEventStatus } from '@/lib/game-operations-queue';

/**
 * Task 21 — the durable local event queue's visible status list. Acceptance
 * criterion: "a failed event remains visible" — nothing that still needs the
 * operator's attention is silently dropped.
 *
 * 이미 ack 된 항목은 여기서 빼고 위의 "기록된 이벤트"(서버 확정 로그)에 맡긴다.
 * 예전에는 ack 된 것까지 남아, 전부 성공한 평상시에도 `골·옐로카드·골·파울·교체`가
 * "기록 완료"로만 나열됐다 — 위 목록과 1:1 중복이면서 시각·선수·팀은 없어 정보량이
 * 사실상 0이었고, 그 소음이 우측 절반을 상시 차지했다(2026-08-18 실화면 확인).
 * 실패·대기·전송중만 남기면 이 패널은 "지금 뭔가 잘못됐다"는 신호 전용이 된다.
 */

/** 아직 운영자가 알아야 할 항목(대기·전송중·실패)이 있는가. 섹션 노출 판정에 쓴다. */
export function hasUnsettledQueueItems(items: readonly QueuedGameEvent[]): boolean {
  return items.some((item) => item.status !== 'acked');
}

export interface QueueStatusPanelProps {
  readonly items: readonly QueuedGameEvent[];
  readonly onRetry: (clientEventId: string) => void;
}

const STATUS_LABEL: Record<QueuedEventStatus, string> = {
  queued: '대기 중',
  sending: '전송 중',
  acked: '기록 완료',
  failed: '전송 실패',
};

const STATUS_BADGE_CLASS: Record<QueuedEventStatus, string> = {
  queued: 'bg-[var(--surface-soft)] text-[var(--text-muted)]',
  sending: 'bg-[var(--blue50)] text-[var(--blue700)]',
  acked: 'bg-[var(--green50)] text-[var(--text-strong)]',
  failed: 'bg-[var(--red50)] text-[var(--red700)]',
};

function eventLabel(item: QueuedGameEvent): string {
  if (item.event.type === 'GOAL') return '골';
  if (item.event.type === 'OWN_GOAL') return '자책골';
  if (item.event.type === 'CARD') {
    const card = item.event.payload.card;
    return card === 'RED' ? '레드카드' : '옐로카드';
  }
  if (item.event.type === 'FOUL') return '파울';
  if (item.event.type === 'SUBSTITUTION') return '교체';
  if (item.event.type === 'CORRECTION') return '정정';
  return item.event.type;
}

export function QueueStatusPanel({ items, onRetry }: QueueStatusPanelProps) {
  const unsettled = items.filter((item) => item.status !== 'acked');
  if (unsettled.length === 0) {
    return (
      <p className="px-1 py-3 text-xs text-[var(--text-muted)]">
        모두 서버에 기록됐어요.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" aria-label="전송 대기·실패한 이벤트 목록">
      {unsettled.map((item) => (
        <li
          key={item.clientEventId}
          className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--text-strong)]">
              {eventLabel(item)}
            </p>
            {/* lastError 가 없는 실패도 사유 자리를 비워두지 않는다. 예전 스키마로 저장된
                로컬스토리지 항목은 status 만 'failed' 이고 lastError 가 없을 수 있는데,
                그때 아래 재시도 버튼은 뜨면서 이유는 안 보이면 운영자는 무엇이 왜 실패했는지
                모른 채 버튼만 누르게 된다. */}
            {item.status === 'failed' ? (
              <p className="text-xs text-[var(--red700)]" role="alert">
                {item.lastError?.message ?? '실패 사유를 확인할 수 없어요. 다시 시도해 보고, 계속 실패하면 새로고침해 주세요.'}
              </p>
            ) : null}
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[item.status]}`}
          >
            {STATUS_LABEL[item.status]}
          </span>
          {/* 실패 사유가 재시도로 풀리지 않는 코드(권한 없음/이미 종료된 경기/무효한
              payload 등)면 버튼을 아예 숨긴다 — 눌러도 항상 같은 이유로 다시 실패할 게
              확실한 버튼을 살려 두면 운영자가 실패 루프에 갇힌다. 그 대신 위의
              `item.lastError.message` 문구가 무엇을 해야 하는지(새로고침/관리자 문의
              등) 직접 안내한다. */}
          {item.status === 'failed' && (item.lastError === null || isRetryableGameOperationsErrorCode(item.lastError.code)) ? (
            <Button size="sm" variant="outline" onClick={() => onRetry(item.clientEventId)}>
              다시 시도
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
