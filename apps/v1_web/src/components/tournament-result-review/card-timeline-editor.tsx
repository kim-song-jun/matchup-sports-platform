'use client';

import { useId } from 'react';
import type { EditableCardEvent } from '@/lib/result-card-events';
import { isSinglePeriod, periodLabel } from '@/components/tournament-live/operate/period-label';

type Props = {
  events: readonly EditableCardEvent[];
  participants: readonly { participantId: string; sideId: string; label: string }[];
  periods: readonly { number: number }[];
  periodCount?: number | null;
  onChange: (events: EditableCardEvent[]) => void;
};

export function CardTimelineEditor({ events, participants, periods, periodCount, onChange }: Props) {
  const prefix = useId();
  function update(index: number, patch: Partial<EditableCardEvent>) {
    onChange(events.map((event, i) => i === index ? { ...event, ...patch } : event));
  }
  return (
    <section aria-label="카드 기록과 시간" style={{ marginBottom: 20 }}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="tm-text-label" style={{ fontWeight: 600 }}>카드 기록과 시간</p>
        <button type="button" className="tm-btn tm-btn-sm tm-btn-neutral" style={{ minHeight: 44 }}
          disabled={participants.length === 0} onClick={() => {
            const participant = participants[0];
            if (!participant) return;
            onChange([...events, { id: crypto.randomUUID(), card: 'YELLOW',
              participantId: participant.participantId, sideId: participant.sideId,
              ...(periods[0] ? { period: periods[0].number } : {}) }]);
          }}>카드 추가</button>
      </div>
      <p className="tm-text-caption mb-3" style={{ color: 'var(--text-muted)' }}>
        카드 기록을 바꾸면 참가자별 경고·퇴장 합계도 함께 바뀌어요. 모르는 시간은 비워 두세요.
      </p>
      <div className="flex flex-col gap-3">
        {events.map((event, index) => (
          <fieldset key={event.id} className="tm-card p-3" style={{ minWidth: 0 }}>
            <legend className="tm-text-caption">{index + 1}번째 카드</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="col-span-2 sm:col-span-1 min-w-0">
                <label className="tm-text-caption" htmlFor={`${prefix}-${index}-player`}>카드 선수</label>
                <select id={`${prefix}-${index}-player`} aria-label={`${index + 1}번째 카드 선수`}
                  className="tm-input w-full" style={{ minHeight: 44 }} value={event.participantId}
                  onChange={(e) => {
                    const participant = participants.find((candidate) => candidate.participantId === e.target.value);
                    if (participant) update(index, { participantId: participant.participantId, sideId: participant.sideId });
                  }}>
                  {participants.map((participant) => <option key={participant.participantId} value={participant.participantId}>{participant.label}</option>)}
                </select>
              </div>
              <div className="min-w-0">
                <label className="tm-text-caption" htmlFor={`${prefix}-${index}-card`}>카드 종류</label>
                <select id={`${prefix}-${index}-card`} aria-label={`${index + 1}번째 카드 종류`}
                  className="tm-input w-full" style={{ minHeight: 44 }} value={event.card}
                  onChange={(e) => update(index, { card: e.target.value === 'RED' ? 'RED' : 'YELLOW' })}>
                  <option value="YELLOW">옐로카드</option><option value="RED">레드카드</option>
                </select>
              </div>
              <div className="min-w-0">
                <label className="tm-text-caption" htmlFor={`${prefix}-${index}-minute`}>카드 시간(분)</label>
                <input id={`${prefix}-${index}-minute`} aria-label={`${index + 1}번째 카드 시간(분)`}
                  type="number" min={0} step={1} inputMode="numeric" className="tm-input w-full" style={{ minHeight: 44 }}
                  value={event.minute ?? ''} placeholder="시간 미입력"
                  onChange={(e) => update(index, { minute: e.target.value === '' ? undefined : Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} />
                {event.minute === undefined ? <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>시간 미입력</p> : null}
              </div>
              {isSinglePeriod(periodCount) ? null : <div className="min-w-0">
                <label className="tm-text-caption" htmlFor={`${prefix}-${index}-period`}>피리어드</label>
                <select id={`${prefix}-${index}-period`} aria-label={`${index + 1}번째 카드 피리어드`}
                  className="tm-input w-full" style={{ minHeight: 44 }} value={event.period ?? ''}
                  onChange={(e) => update(index, { period: e.target.value ? Number(e.target.value) : undefined })}>
                  <option value="">선택 안 함</option>
                  {periods.map((period) => <option key={period.number} value={period.number}>{periodLabel(period.number)}</option>)}
                </select>
              </div>}
            </div>
            <div className="flex justify-end mt-2">
              <button type="button" className="tm-btn tm-btn-sm tm-btn-outline" style={{ minHeight: 44, color: 'var(--red700)' }}
                aria-label={`${index + 1}번째 카드 삭제`} onClick={() => onChange(events.filter((_, i) => i !== index))}>삭제</button>
            </div>
          </fieldset>
        ))}
        {events.length === 0 ? <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>등록된 카드가 없어요.</p> : null}
      </div>
    </section>
  );
}
