import type { TakeoverState } from '@/lib/game-operations-queue';
import type { GameState } from '@/types/game-operations';

export type ConsoleStatusKey =
  | 'undoing'
  | 'takeover-handoff'
  | 'takeover-denied'
  | 'read-only'
  | 'record-error'
  | 'command-error'
  | 'command-retry'
  | 'banner-message'
  | 'expiry-error'
  | 'disconnected'
  | 'queue'
  | 'takeover-expired'
  | 'takeover-pending'
  | 'period-expired'
  | 'start-blocked-teams'
  | 'sync-gap'
  | 'behind';

export type ConsoleStatusActionKind = 'takeover' | 'retry-command' | 'retry-expiry';

export interface ConsoleStatusItem {
  readonly key: ConsoleStatusKey;
  readonly tone: 'info' | 'warning' | 'danger';
  readonly title: string;
  readonly body: string;
  readonly action?: { readonly kind: ConsoleStatusActionKind; readonly label: string };
}

export interface ConsoleStatus {
  readonly tone: 'ok' | 'info' | 'warning' | 'danger';
  readonly headline: string;
  /** 우선순위 순서. 첫 항목이 상태 줄의 제목이다. */
  readonly items: readonly ConsoleStatusItem[];
  /** 「자세히」 시트의 고정 줄. `recordingDevice` 는 기록 권한을 한 기기만 쥐는 경기에서만 있다. */
  readonly facts: { readonly connection: string; readonly recordingDevice: string | null };
}

export interface ConsoleStatusInput {
  readonly gameState: GameState | null;
  readonly leaseRequired: boolean;
  readonly takeoverEnabled: boolean;
  readonly sampleMode: boolean;
  readonly takeover: TakeoverState;
  readonly handoff: { readonly code: string; readonly holderName?: string | null } | null;
  readonly connection: 'connecting' | 'connected' | 'disconnected';
  readonly offlineCommandAllowed: boolean;
  readonly canOperate: boolean;
  readonly syncGap: boolean;
  readonly behind: boolean;
  readonly periodExpired: boolean;
  readonly expiryError: string | null;
  readonly startBlockedByTeams: boolean;
  readonly commandError: string | null;
  /** 방금 누른 기록·되돌리기가 실패한 결과. 진행 요청 오류와 따로 남는다. */
  readonly recordError: { readonly kind: 'save' | 'undo'; readonly message: string } | null;
  readonly bannerMessage: string | null;
  readonly retryLabel: string | null;
  readonly queue: { readonly waiting: number; readonly failed: number };
  /** 방금 누른 되돌리기. `sending` 은 요청이 서버에 가 있는 동안, `waiting` 은 다른 전송이 끝나기를 기다리는 동안이다. */
  readonly undo: 'waiting' | 'sending' | null;
  readonly endPeriodLabel: string;
  readonly gameOperationsErrorMessage: (code: string) => string;
}

const VIEW_ONLY = '이 기기는 보기만 할 수 있어요.';

function handoffBody({ code, holderName }: { code: string; holderName?: string | null }): string {
  if (!holderName) return `다른 기기에서 기록하고 있어요. ${VIEW_ONLY}`;
  return code === 'TAKEOVER_SUPERSEDED'
    ? `${holderName}님이 기록 권한을 가져갔어요. ${VIEW_ONLY}`
    : `${holderName}님이 이 경기를 기록하고 있어요. ${VIEW_ONLY}`;
}

function disconnectedBody(input: ConsoleStatusInput): string {
  if (!input.leaseRequired) {
    return '실시간 연결이 끊겼어요. 진행 요청은 서버에 직접 보내고, 기록은 다시 연결되면 전송돼요.';
  }
  if (!input.offlineCommandAllowed) {
    return '다시 연결하는 중이에요. 연결될 때까지 재개·종료 같은 진행 버튼은 잠겨요. 그동안 적는 기록은 이 기기에 모아 두었다가 보내요.';
  }
  return input.canOperate
    ? '다시 연결하는 중이에요. 진행 버튼은 그대로 쓸 수 있고, 보낸 명령은 서버 기준으로 반영돼요.'
    : '연결이 끊긴 사이 기록 권한이 만료돼 진행 명령을 보낼 수 없어요. 다시 연결되면 권한을 새로 받아요.';
}

function okHeadline(input: ConsoleStatusInput): string {
  if (input.sampleMode) return '체험 중 · 서버 연결 없음';
  const held = input.leaseRequired && input.takeoverEnabled && input.takeover.status === 'held';
  // 끊기면 이 줄이 경고로 바뀌므로, 기록 중일 때는 「연결됨」을 덧붙이지 않는다(자세히 시트의 연결 줄이 그대로 말한다).
  if (held && input.gameState === 'SCHEDULED') return '이 기기에서 기록할 수 있어요';
  if (held && (input.gameState === 'LIVE' || input.gameState === 'PAUSED')) return '이 기기에서 기록 중';
  return '연결됨';
}

/** 콘솔 안내 조건을 우선순위 목록 하나로 모은다. 배열에 넣는 순서가 곧 우선순위다. */
export function deriveConsoleStatus(input: ConsoleStatusInput): ConsoleStatus {
  const { leaseRequired, takeoverEnabled, takeover, connection, queue } = input;
  const disconnected = connection === 'disconnected' && (!leaseRequired || takeoverEnabled);
  const items: ConsoleStatusItem[] = [];

  // 방금 누른 것의 결과라 맨 앞에 둔다 — 기록 버튼이 잠긴 까닭도 이 줄이 말한다.
  if (input.undo !== null) {
    items.push({
      key: 'undoing',
      tone: 'info',
      title: '되돌리는 중이에요…',
      body:
        input.undo === 'sending'
          ? '끝날 때까지 기록 버튼을 잠깐 막아 둬요.'
          : '보내던 기록을 다 보낸 뒤에 되돌려요. 오래 걸리면 그만두고 알려 드려요.',
    });
  }
  if (input.handoff !== null) {
    items.push({
      key: 'takeover-handoff',
      tone: 'warning',
      title: '다른 기기에서 기록하고 있어요',
      body: handoffBody(input.handoff),
      action: { kind: 'takeover', label: '이 기기에서 기록하기' },
    });
  } else if (leaseRequired && takeover.status === 'denied') {
    items.push({
      key: 'takeover-denied',
      tone: 'danger',
      title: '이 기기에서 기록할 수 없어요',
      body: `${input.gameOperationsErrorMessage(takeover.code)} (${takeover.code})`,
    });
  }
  if (leaseRequired && !takeoverEnabled) {
    items.push({
      key: 'read-only',
      tone: 'info',
      title: '보기만 할 수 있어요',
      body: '지원 담당자는 이 경기의 기록을 볼 수만 있어요.',
    });
  }
  if (input.recordError !== null) {
    items.push({
      key: 'record-error',
      tone: 'danger',
      title: input.recordError.kind === 'save' ? '기록을 저장하지 못했어요' : '기록을 되돌리지 못했어요',
      body: input.recordError.message,
    });
  }
  if (input.commandError !== null) {
    items.push({ key: 'command-error', tone: 'danger', title: '요청을 처리하지 못했어요', body: input.commandError });
  }
  if (input.retryLabel !== null) {
    items.push({
      key: 'command-retry',
      tone: 'danger',
      title: `${input.retryLabel} 요청의 응답을 받지 못했어요`,
      body: '같은 요청을 다시 보낼 수 있어요.',
      action: { kind: 'retry-command', label: '같은 요청 재시도' },
    });
  }
  if (input.bannerMessage !== null) {
    items.push({ key: 'banner-message', tone: 'danger', title: '기록을 확인해 주세요', body: input.bannerMessage });
  }
  if (input.expiryError !== null) {
    items.push({
      key: 'expiry-error',
      tone: 'danger',
      title: '경기 진행 상태를 확인하지 못했어요',
      body: input.expiryError,
      action: { kind: 'retry-expiry', label: '종료 상태 다시 확인' },
    });
  }
  if (disconnected) {
    items.push({
      key: 'disconnected',
      tone: 'warning',
      title: queue.waiting > 0 ? `연결이 끊겼어요 · 기록 ${queue.waiting}개 보낼 차례` : '연결이 끊겼어요',
      body: disconnectedBody(input),
    });
  }
  // 끊긴 동안 기다리는 기록은 위 제목이 이미 말한다. 실패는 손이 필요하므로 언제나 따로 알린다.
  if (queue.failed > 0) {
    items.push({
      key: 'queue',
      tone: 'danger',
      title: `기록 ${queue.failed}개를 보내지 못했어요`,
      body: '아래 목록에서 사유를 확인하고 다시 보내 주세요.',
    });
  } else if (queue.waiting > 0 && !disconnected) {
    items.push({
      key: 'queue',
      tone: 'info',
      title: `기록 ${queue.waiting}개 보내는 중이에요`,
      body: '서버에 닿으면 기록 목록에 나타나요.',
    });
  }
  if (leaseRequired && takeover.status === 'expired') {
    items.push({ key: 'takeover-expired', tone: 'warning', title: '기록 권한을 다시 가져오는 중이에요…', body: '' });
  }
  if (leaseRequired && takeoverEnabled && (takeover.status === 'none' || takeover.status === 'requesting')) {
    items.push({ key: 'takeover-pending', tone: 'info', title: '이 기기에서 기록할 준비를 하는 중이에요…', body: '' });
  }
  if (input.periodExpired) {
    items.push({
      key: 'period-expired',
      tone: 'warning',
      title: '설정된 시간이 끝났어요',
      body: `서버의 시간 종료 처리를 확인하고 있어요. 처리가 늦어지면 ‘${input.endPeriodLabel}’를 눌러 주세요.`,
    });
  }
  if (input.gameState === 'SCHEDULED' && input.startBlockedByTeams) {
    items.push({
      key: 'start-blocked-teams',
      tone: 'warning',
      title: '팀을 먼저 정해 주세요',
      body: '대진표에서 서로 다른 두 팀을 배정한 뒤 경기를 시작해 주세요.',
    });
  }
  if (input.syncGap) {
    items.push({ key: 'sync-gap', tone: 'info', title: '기록을 다시 불러오는 중이에요…', body: '' });
  }
  if (input.behind) {
    items.push({ key: 'behind', tone: 'info', title: '최신 경기 상태를 확인하고 있어요', body: '' });
  }

  const facts = {
    connection: input.sampleMode
      ? '서버 연결 없음'
      : connection === 'connected'
        ? '연결됨'
        : connection === 'connecting'
          ? '연결하는 중'
          : '끊겼어요',
    recordingDevice: !leaseRequired
      ? null
      : input.handoff !== null
        ? '다른 기기'
        : takeoverEnabled && takeover.status === 'held'
          ? '이 기기'
          : null,
  };

  const [first] = items;
  if (first === undefined) {
    const connecting = !input.sampleMode && connection === 'connecting';
    return {
      tone: connecting ? 'info' : 'ok',
      headline: connecting ? '연결하는 중이에요…' : okHeadline(input),
      items,
      facts,
    };
  }
  return {
    tone: first.tone,
    headline: items.length > 1 ? `${first.title} 외 ${items.length - 1}개` : first.title,
    items,
    facts,
  };
}
