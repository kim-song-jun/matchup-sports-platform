'use client';

import { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Users, CalendarX, CircleCheck } from 'lucide-react';
import { LessonSchedule } from '@/types/api';

// Stable mock schedules — generated once at module level to avoid re-renders
const MOCK_SCHEDULES: LessonSchedule[] = (() => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const sessions: LessonSchedule[] = [];
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const dow = date.getDay();
    if (dow === 1 || dow === 3 || dow === 5) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      sessions.push({
        id: `mock-${dateStr}`,
        lessonId: '',
        sessionDate: dateStr,
        startTime: '10:00',
        endTime: '11:30',
        maxParticipants: 8,
        isCancelled: false,
        attendeeCount: (d * 3) % 7, // deterministic, not random
      });
    }
  }
  return sessions;
})();

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toLocalDate(dateStr: string): Date {
  // Parse YYYY-MM-DD without timezone shift
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d);
}

interface LessonCalendarProps {
  schedules?: LessonSchedule[];
  onReserve?: (scheduleId: string) => void;
}

export function LessonCalendar({ schedules, onReserve }: LessonCalendarProps) {
  const activeSessions = schedules && schedules.length > 0 ? schedules : MOCK_SCHEDULES;

  const today = useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Map dateKey -> sessions
  const sessionMap = useMemo(() => {
    const map = new Map<string, LessonSchedule[]>();
    for (const s of activeSessions) {
      const d = toLocalDate(s.sessionDate);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const existing = map.get(key);
      if (existing) {
        existing.push(s);
      } else {
        map.set(key, [s]);
      }
    }
    return map;
  }, [activeSessions]);

  const getSessionsForDate = useCallback(
    (date: Date): LessonSchedule[] => {
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      return sessionMap.get(key) ?? [];
    },
    [sessionMap],
  );

  // Calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ day: number; date: Date } | null> = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: new Date(year, month, d) });
    return cells;
  }, [year, month]);

  const goToPrevMonth = useCallback(() => {
    setDirection('right');
    setSelectedDate(null);
    setViewDate(new Date(year, month - 1, 1));
  }, [year, month]);

  const goToNextMonth = useCallback(() => {
    setDirection('left');
    setSelectedDate(null);
    setViewDate(new Date(year, month + 1, 1));
  }, [year, month]);

  const handleDayClick = useCallback(
    (date: Date) => {
      const daySessions = getSessionsForDate(date);
      if (daySessions.length === 0) {
        setSelectedDate(null);
        return;
      }
      setSelectedDate((prev) => (prev && isSameDay(prev, date) ? null : date));
    },
    [getSessionsForDate],
  );

  const selectedSessions = useMemo(
    () => (selectedDate ? getSessionsForDate(selectedDate) : []),
    [selectedDate, getSessionsForDate],
  );

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">수업 일정</h3>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={goToPrevMonth}
          aria-label="이전 달"
          className="flex min-h-[44px] min-w-11 items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-colors transition-transform"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="text-base font-semibold text-gray-900 dark:text-white select-none">
          {year}년 {month + 1}월
        </p>
        <button
          onClick={goToNextMonth}
          aria-label="다음 달"
          className="flex min-h-[44px] min-w-11 items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-colors transition-transform"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={[
              'pb-1.5 text-center text-xs font-medium select-none',
              i === 0
                ? 'text-red-400'
                : i === 6
                ? 'text-blue-400'
                : 'text-gray-400 dark:text-gray-500',
            ].join(' ')}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div
        key={`${year}-${month}`}
        className={[
          'grid grid-cols-7 gap-y-0.5 select-none',
          direction === 'left'
            ? 'motion-safe:animate-slide-in-left'
            : direction === 'right'
            ? 'motion-safe:animate-slide-in-right'
            : '',
        ].join(' ')}
        onAnimationEnd={() => setDirection(null)}
      >
        {calendarDays.map((cell, idx) => {
          if (!cell) return <div key={`blank-${idx}`} className="h-11" />;

          const { day, date } = cell;
          const isToday = isSameDay(date, today);
          const daySessions = getSessionsForDate(date);
          const hasSessions = daySessions.length > 0;
          const isSelected = !!selectedDate && isSameDay(date, selectedDate);
          const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const dow = date.getDay();
          const isSunday = dow === 0;
          const isSaturday = dow === 6;

          // Cancelled-only dates look muted
          const allCancelled = hasSessions && daySessions.every((s) => s.isCancelled);

          return (
            <button
              key={day}
              type="button"
              onClick={() => handleDayClick(date)}
              aria-label={`${month + 1}월 ${day}일${hasSessions ? `, 수업 ${daySessions.length}건` : ''}`}
              aria-pressed={isSelected}
              disabled={!hasSessions}
              className={[
                'relative flex flex-col items-center justify-center h-11 rounded-xl transition-colors',
                hasSessions && !allCancelled
                  ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700'
                  : 'cursor-default',
                isSelected
                  ? 'bg-blue-50 dark:bg-blue-900/30'
                  : '',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium leading-none transition-colors',
                  isToday
                    ? 'bg-blue-500 text-white font-bold'
                    : isSelected
                    ? 'font-semibold text-blue-600 dark:text-blue-400'
                    : isPast
                    ? 'text-gray-300 dark:text-gray-600'
                    : isSunday
                    ? 'text-red-400'
                    : isSaturday
                    ? 'text-blue-400'
                    : 'text-gray-700 dark:text-gray-300',
                ].join(' ')}
              >
                {day}
              </span>

              {/* Session dot(s) */}
              {hasSessions && (
                <span className="absolute bottom-0.5 flex gap-0.5">
                  {daySessions.slice(0, 3).map((s) => (
                    <span
                      key={s.id}
                      className={[
                        'h-1 w-1 rounded-full',
                        s.isCancelled
                          ? 'bg-gray-300 dark:bg-gray-600'
                          : isToday
                          ? 'bg-white/80'
                          : 'bg-blue-500 dark:bg-blue-400',
                      ].join(' ')}
                      aria-hidden="true"
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 px-1">
        <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
          <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden="true" />
          수업 있는 날
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
          <span className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
          취소된 수업
        </span>
      </div>

      {/* Selected date sessions */}
      {selectedDate && selectedSessions.length > 0 && (
        <div className="mt-4 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden motion-safe:animate-fade-in">
          {/* Selected date header */}
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 px-4 py-2.5">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 (
              {DAY_LABELS[selectedDate.getDay()]})
            </p>
            <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
              {selectedSessions.length}개 수업
            </span>
          </div>

          <ul className="divide-y divide-gray-50 dark:divide-gray-700">
            {selectedSessions.map((session) => {
              const isCancelled = session.isCancelled;
              const slots =
                session.maxParticipants !== undefined && session.attendeeCount !== undefined
                  ? session.maxParticipants - session.attendeeCount
                  : null;
              const isFull = slots !== null && slots <= 0;

              return (
                <li key={session.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    {/* Time block */}
                    <div
                      className={[
                        'shrink-0 rounded-xl px-3 py-2 text-center min-w-[64px]',
                        isCancelled
                          ? 'bg-gray-100 dark:bg-gray-700'
                          : 'bg-blue-50 dark:bg-blue-900/30',
                      ].join(' ')}
                    >
                      <p
                        className={[
                          'text-xs font-bold tabular-nums',
                          isCancelled
                            ? 'text-gray-400 dark:text-gray-500'
                            : 'text-blue-600 dark:text-blue-400',
                        ].join(' ')}
                      >
                        {session.startTime}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                        ~{session.endTime}
                      </p>
                    </div>

                    {/* Session info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isCancelled ? (
                          <span className="flex items-center gap-1 text-xs font-semibold text-gray-400 dark:text-gray-500">
                            <CalendarX size={13} aria-hidden="true" />
                            취소된 수업
                          </span>
                        ) : isFull ? (
                          <span className="text-xs font-semibold text-amber-500">마감</span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            <CircleCheck size={13} aria-hidden="true" />
                            예약 가능
                          </span>
                        )}
                      </div>

                      {session.maxParticipants !== undefined && (
                        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <Users size={12} aria-hidden="true" />
                            {session.attendeeCount ?? 0}/{session.maxParticipants}명
                          </span>
                        </div>
                      )}

                      {session.note && (
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                          {session.note}
                        </p>
                      )}

                      {isCancelled && session.cancelReason && (
                        <p className="mt-1 text-xs text-red-400 dark:text-red-500">
                          사유: {session.cancelReason}
                        </p>
                      )}
                    </div>

                    {/* Reserve button */}
                    {!isCancelled && !isFull && onReserve && (
                      <button
                        type="button"
                        onClick={() => onReserve(session.id)}
                        className="shrink-0 flex items-center justify-center min-h-[44px] rounded-xl bg-blue-500 px-3 text-sm font-semibold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors"
                        aria-label={`${session.startTime} 수업 예약`}
                      >
                        예약
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Empty hint when nothing selected */}
      {!selectedDate && (
        <p className="mt-4 text-center text-sm text-gray-400 dark:text-gray-500">
          날짜를 선택하면 수업 상세가 표시돼요
        </p>
      )}
    </div>
  );
}
