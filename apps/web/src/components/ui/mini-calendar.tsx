'use client';

import { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { sportLabel } from '@/lib/constants';

interface MatchItem {
  id: string;
  title: string;
  matchDate: string;
  startTime: string;
  sportType: string;
}

interface MiniCalendarProps {
  matches: MatchItem[];
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function MiniCalendar({ matches }: MiniCalendarProps) {
  const today = useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Build a Set of date keys (YYYY-MM-DD) that have matches for fast lookup
  const matchDateMap = useMemo(() => {
    const map = new Map<string, MatchItem[]>();
    for (const m of matches) {
      const d = new Date(m.matchDate);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const existing = map.get(key);
      if (existing) {
        existing.push(m);
      } else {
        map.set(key, [m]);
      }
    }
    return map;
  }, [matches]);

  // Calendar grid cells
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ day: number; date: Date } | null> = [];

    // Leading blanks
    for (let i = 0; i < firstDay; i++) {
      cells.push(null);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, date: new Date(year, month, d) });
    }

    return cells;
  }, [year, month]);

  const getMatchesForDate = useCallback(
    (date: Date): MatchItem[] => {
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      return matchDateMap.get(key) ?? [];
    },
    [matchDateMap],
  );

  const selectedMatches = useMemo(() => {
    if (!selectedDate) return [];
    return getMatchesForDate(selectedDate);
  }, [selectedDate, getMatchesForDate]);

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
      const dayMatches = getMatchesForDate(date);
      if (dayMatches.length === 0) {
        setSelectedDate(null);
        return;
      }
      // Toggle if clicking the same date
      if (selectedDate && isSameDay(selectedDate, date)) {
        setSelectedDate(null);
      } else {
        setSelectedDate(date);
      }
    },
    [selectedDate, getMatchesForDate],
  );

  const visibleMatches = selectedMatches.slice(0, 3);
  const extraCount = selectedMatches.length - 3;

  return (
    <div className="w-full select-none">
      {/* Header: month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={goToPrevMonth}
          aria-label="이전 달"
          className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-[colors,transform] min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <ChevronLeft size={18} />
        </button>
        <h3 className="text-md font-semibold text-gray-900 dark:text-white">
          {year}년 {month + 1}월
        </h3>
        <button
          onClick={goToNextMonth}
          aria-label="다음 달"
          className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-[colors,transform] min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Day labels row */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={`text-center text-xs font-medium pb-1.5 ${
              i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div
        key={`${year}-${month}`}
        className={`grid grid-cols-7 gap-y-0.5 ${
          direction === 'left'
            ? 'motion-safe:animate-slide-in-left'
            : direction === 'right'
              ? 'motion-safe:animate-slide-in-right'
              : ''
        }`}
        onAnimationEnd={() => setDirection(null)}
      >
        {calendarDays.map((cell, idx) => {
          if (!cell) {
            return <div key={`blank-${idx}`} className="h-10" />;
          }

          const { day, date } = cell;
          const isToday = isSameDay(date, today);
          const dayMatches = getMatchesForDate(date);
          const hasMatches = dayMatches.length > 0;
          const isSelected = selectedDate !== null && isSameDay(date, selectedDate);
          const dayOfWeek = date.getDay();
          const isSunday = dayOfWeek === 0;
          const isSaturday = dayOfWeek === 6;

          return (
            <button
              key={day}
              type="button"
              onClick={() => handleDayClick(date)}
              aria-label={`${month + 1}월 ${day}일${hasMatches ? `, 매치 ${dayMatches.length}건` : ''}`}
              className={`relative flex flex-col items-center justify-center min-h-[44px] min-w-[44px] rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                hasMatches ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700' : 'cursor-default'
              } ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-base leading-none transition-colors ${
                  isToday
                    ? 'bg-blue-500 text-white font-bold'
                    : isSelected
                      ? 'font-semibold text-blue-600 dark:text-blue-400'
                      : isSunday
                        ? 'text-red-400'
                        : isSaturday
                          ? 'text-blue-400'
                          : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                {day}
              </span>
              {/* Match indicator dot */}
              {hasMatches && (
                <span
                  className={`absolute bottom-0.5 h-1 w-1 rounded-full ${
                    isToday ? 'bg-white/80' : 'bg-blue-500 dark:bg-blue-400'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day's matches */}
      {selectedDate && selectedMatches.length > 0 && (
        <div className="mt-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden motion-safe:animate-expand">
          <div className="px-3.5 py-2 border-b border-gray-50 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 ({DAY_LABELS[selectedDate.getDay()]})
            </p>
          </div>
          <ul className="divide-y divide-gray-50 dark:divide-gray-700">
            {visibleMatches.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/matches/${m.id}`}
                  className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.99] transition-[colors,transform]"
                >
                  <span className="rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                    {sportLabel[m.sportType] ?? m.sportType}
                  </span>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate flex-1 min-w-0">
                    {m.title}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums shrink-0">
                    {m.startTime}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {extraCount > 0 && (
            <div className="px-3.5 py-2 border-t border-gray-50 dark:border-gray-700 text-center">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                외 {extraCount}건
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
