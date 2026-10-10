import type { QueuedGameEvent } from '@/lib/game-operations-queue';
import type { GameEventRecord } from '@/types/game-operations';
import type { EventCaptureCommitInput } from './action-target-picker';

/**
 * 지금 기록하려는 옐로가 이 경기에서 그 선수의 두 번째 옐로이고 레드는 아직 없는가.
 * 서버 확정 이벤트(취소된 것 제외)와 아직 서버에 닿지 않은 대기·전송 중 항목을 함께 센다 —
 * 연달아 눌러 두 번째가 아직 큐에 있을 때도 놓치지 않기 위해서다. `acked` 항목은 이미
 * 이벤트 목록에 있으므로 다시 세지 않는다.
 */
export function isSecondYellowWithoutRed(
  events: readonly GameEventRecord[],
  queueItems: readonly QueuedGameEvent[],
  input: EventCaptureCommitInput,
): boolean {
  if (input.type !== 'CARD' || input.payload.card !== 'YELLOW' || input.participantId === undefined) return false;
  const participantId = input.participantId;

  const reversedIds = new Set(
    events.map((event) => event.reversesEventId).filter((id): id is string => id !== null && id !== undefined),
  );
  const cardColors: string[] = [
    ...events
      .filter((event) => event.type === 'CARD' && event.participantId === participantId && !reversedIds.has(event.id))
      .map((event) => String(event.payload.card)),
    ...queueItems
      .filter(
        (item) =>
          (item.status === 'queued' || item.status === 'sending') &&
          item.event.type === 'CARD' &&
          item.event.participantId === participantId,
      )
      .map((item) => String(item.event.payload.card)),
  ];

  return cardColors.filter((color) => color === 'YELLOW').length === 1 && !cardColors.includes('RED');
}
