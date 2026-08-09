'use client';

import { useState } from 'react';
import { AdminPageHeader, AdminDataTable, AdminStatusPill, AdminToasts, useAdminToast } from '@/components/admin';
import { useV1AdminTeamMatchSeries, useV1GenerateSeriesFixtures, useV1UpdateSeriesFixture } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { fromDatetimeLocalValue, toDatetimeLocalValue } from '@/components/team-schedules/team-schedules.view-model';
import type { V1SeriesFixture } from '@/types/team-match-series';

const inputClass =
  'h-[44px] rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

const WEEKDAY_OPTIONS = [
  { value: 0, label: '일요일' },
  { value: 1, label: '월요일' },
  { value: 2, label: '화요일' },
  { value: 3, label: '수요일' },
  { value: 4, label: '목요일' },
  { value: 5, label: '금요일' },
  { value: 6, label: '토요일' },
];

export default function TeamMatchSeriesFixturesClient({ seriesId }: { seriesId: string }) {
  const { data: series, isPending } = useV1AdminTeamMatchSeries(seriesId);
  const generateFixtures = useV1GenerateSeriesFixtures(seriesId);
  const updateFixture = useV1UpdateSeriesFixture(seriesId);
  const { toasts, showToast } = useAdminToast();
  const [weeksCount, setWeeksCount] = useState(7);
  const [dayOfWeek, setDayOfWeek] = useState<number | ''>('');
  const [time, setTime] = useState('18:00');
  const [placeName, setPlaceName] = useState('');

  if (isPending || series === undefined) return null;

  const onGenerate = async () => {
    // 요일은 골랐는데 time input(type="time")을 비워 지운 상태로 제출하면 서버가 형식
    // 오류로 400을 내려 사용자는 이유를 모른 채 막힌다 — 제출 전에 여기서 먼저 알려준다.
    if (dayOfWeek !== '' && time.trim() === '') {
      showToast('요일을 골랐으면 시각도 입력해 주세요.', 'error');
      return;
    }
    try {
      const result = await generateFixtures.mutateAsync({
        weeksCount,
        ...(dayOfWeek === '' ? {} : { schedule: { dayOfWeek, time } }),
        ...(placeName.trim() === '' ? {} : { placeName: placeName.trim() }),
      });
      showToast(`대진 ${result.createdCount}경기를 만들었어요.`, 'success');
    } catch (error) {
      showToast(extractErrorMessage(error, '대진을 만들지 못했어요.'), 'error');
    }
  };

  const onFieldBlur = (fixture: V1SeriesFixture, patch: { startsAt?: string; placeName?: string }) => {
    updateFixture.mutate(
      { teamMatchId: fixture.teamMatchId, body: patch },
      { onError: (error) => showToast(extractErrorMessage(error, '경기 정보를 저장하지 못했어요.'), 'error') },
    );
  };

  return (
    <div>
      <AdminPageHeader title={series.title} description={`${series.teamIds.length}팀 참가 · 대진 ${series.fixtures.length}경기`} />

      {series.fixtures.length === 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="weeks-count" className="mb-1 block text-sm font-medium text-gray-900">주차 수</label>
              <input
                id="weeks-count"
                type="number"
                min={1}
                max={52}
                value={weeksCount}
                onChange={(e) => setWeeksCount(Number(e.target.value))}
                className={`${inputClass} w-24`}
              />
            </div>
            <div>
              <label htmlFor="fixture-day-of-week" className="mb-1 block text-sm font-medium text-gray-900">요일</label>
              <select
                id="fixture-day-of-week"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value === '' ? '' : Number(e.target.value))}
                className={`${inputClass} w-32`}
              >
                <option value="">시작일 그대로</option>
                {WEEKDAY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fixture-time" className="mb-1 block text-sm font-medium text-gray-900">시각</label>
              <input
                id="fixture-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={dayOfWeek === ''}
                className={`${inputClass} w-28 disabled:opacity-50`}
              />
            </div>
            <div>
              <label htmlFor="fixture-place-name" className="mb-1 block text-sm font-medium text-gray-900">기본 장소</label>
              <input
                id="fixture-place-name"
                type="text"
                placeholder="장소 미정"
                value={placeName}
                onChange={(e) => setPlaceName(e.target.value)}
                className={`${inputClass} w-48`}
              />
            </div>
            <button
              type="button"
              onClick={onGenerate}
              disabled={generateFixtures.isPending}
              className="min-h-[44px] rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              라운드로빈 대진 생성
            </button>
          </div>
          {(series.recentVenues ?? []).length > 0 && (
            <div>
              <span className="mb-1 block text-sm font-medium text-gray-900">최근 사용한 장소</span>
              <div className="flex flex-wrap gap-2">
                {(series.recentVenues ?? []).map((venue) => (
                  <button
                    key={venue}
                    type="button"
                    onClick={() => setPlaceName(venue)}
                    aria-pressed={placeName === venue}
                    className={`flex min-h-[44px] items-center rounded-full border px-3 text-sm transition-colors ${
                      placeName === venue
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
                    }`}
                  >
                    {venue}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-gray-500">
            요일·시각을 정하면 매주 그 요일 그 시각으로 채워요. 비워두면 시작일 그대로 매주 반복돼요.
            생성 후 특정 주만 다르면 아래 표에서 개별 수정하면 돼요.
          </p>
        </div>
      ) : (
        <AdminDataTable<V1SeriesFixture>
          rows={series.fixtures}
          keyExtractor={(row) => row.teamMatchId}
          columns={[
            { key: 'title', header: '경기', render: (row) => row.title },
            {
              key: 'startAt',
              header: '일시',
              render: (row) => (
                <input
                  type="datetime-local"
                  aria-label={`${row.title} 일시`}
                  defaultValue={toDatetimeLocalValue(row.startAt)}
                  onBlur={(e) => {
                    const startsAt = fromDatetimeLocalValue(e.target.value);
                    if (!startsAt) return;
                    onFieldBlur(row, { startsAt });
                  }}
                  className={inputClass}
                />
              ),
            },
            {
              key: 'placeName',
              header: '구장',
              render: (row) => (
                <input
                  aria-label={`${row.title} 구장`}
                  defaultValue={row.placeName}
                  onBlur={(e) => onFieldBlur(row, { placeName: e.target.value })}
                  className={inputClass}
                />
              ),
            },
            { key: 'status', header: '상태', render: (row) => <AdminStatusPill status={row.status} /> },
          ]}
        />
      )}

      <AdminToasts toasts={toasts} />
    </div>
  );
}
