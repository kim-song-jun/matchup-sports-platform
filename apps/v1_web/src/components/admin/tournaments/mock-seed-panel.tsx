'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FlaskConical } from 'lucide-react';
import {
  useV1CreateMockTournament,
  useV1MockSeedAvailability,
  type CreateMockTournamentInput,
  type CreateMockTournamentResult,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';

const FORMATS: Array<{ value: NonNullable<CreateMockTournamentInput['format']>; label: string }> = [
  { value: 'league', label: '리그' },
  { value: 'knockout', label: '토너먼트' },
  { value: 'group_knockout', label: '조별리그+토너먼트' },
];

const STATUSES: Array<{ value: NonNullable<CreateMockTournamentInput['status']>; label: string }> = [
  { value: 'open', label: '모집중' },
  { value: 'in_progress', label: '진행중' },
  { value: 'completed', label: '종료' },
];

const FIELD_CLASS =
  'h-[44px] px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-[var(--font-size-label)] text-gray-900 dark:text-white focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2';

/**
 * 검증용 목업 대회를 한 번에 만드는 패널 — alpha 전용.
 *
 * 서버가 V1_ENABLE_MOCK_SEED 로 잠그고, 꺼진 환경에서는 availability 가 false 라 이 패널 자체가
 * 렌더되지 않는다(프로덕션에서는 존재조차 하지 않는다).
 *
 * 명단은 항상 채우고 라인업은 항상 비워 둔다 — 라인업 제출을 손으로 테스트하는 게 목적이라
 * 시드가 대신 제출해 버리면 검증할 대상이 사라진다.
 */
export function MockSeedPanel() {
  const availability = useV1MockSeedAvailability();
  const createMock = useV1CreateMockTournament();
  const [format, setFormat] = useState<NonNullable<CreateMockTournamentInput['format']>>('group_knockout');
  const [teamCount, setTeamCount] = useState(4);
  const [status, setStatus] = useState<NonNullable<CreateMockTournamentInput['status']>>('in_progress');
  const [withResults, setWithResults] = useState(false);
  const [reviewReady, setReviewReady] = useState(false);
  const [created, setCreated] = useState<CreateMockTournamentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!availability.data?.enabled) return null;

  const submit = () => {
    setError(null);
    createMock.mutate(
      { format, teamCount, status, withResults, reviewReady },
      {
        onSuccess: (result) => setCreated(result),
        onError: (err) => setError(extractErrorMessage(err, '목업 대회를 만들지 못했어요.')),
      },
    );
  };

  return (
    <section
      className="mb-4 rounded-2xl border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/20 p-4"
      aria-labelledby="mock-seed-heading"
    >
      <div className="flex items-center gap-2">
        <FlaskConical size={16} className="text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <h2 id="mock-seed-heading" className="text-[var(--font-size-label)] font-semibold text-gray-900 dark:text-white">
          목업 대회 생성 (alpha 전용)
        </h2>
      </div>
      <p className="mt-1 text-[var(--font-size-caption)] text-gray-600 dark:text-gray-400">
        조건에 맞는 테스트 대회를 하나 만들어요. 팀 등록·명단까지 채우고 <strong>라인업은 비워 둡니다</strong> — 라인업 제출은 직접 테스트하세요.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[var(--font-size-caption)] text-gray-600 dark:text-gray-400">형식</span>
          <select className={FIELD_CLASS} value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
            {FORMATS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[var(--font-size-caption)] text-gray-600 dark:text-gray-400">팀 수</span>
          <input
            className={`${FIELD_CLASS} w-[88px]`}
            type="number"
            min={2}
            max={16}
            value={teamCount}
            onChange={(e) => setTeamCount(Number(e.target.value))}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[var(--font-size-caption)] text-gray-600 dark:text-gray-400">상태</span>
          <select className={FIELD_CLASS} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <label className="flex items-center gap-2 h-[44px]">
          <input type="checkbox" checked={withResults} onChange={(e) => setWithResults(e.target.checked)} className="w-4 h-4" />
          <span className="text-[var(--font-size-label)] text-gray-900 dark:text-white">경기 결과까지</span>
        </label>

        <label className="flex items-center gap-2 h-[44px]">
          <input type="checkbox" checked={reviewReady} onChange={(e) => setReviewReady(e.target.checked)} className="w-4 h-4" />
          <span className="text-[var(--font-size-label)] text-gray-900 dark:text-white">후기 작성 가능</span>
        </label>

        <button
          type="button"
          onClick={submit}
          disabled={createMock.isPending}
          className="inline-flex items-center gap-1.5 h-[44px] px-4 rounded-xl text-[var(--font-size-label)] font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 transition-colors focus-visible:outline-2 focus-visible:outline-amber-500 focus-visible:outline-offset-2"
        >
          {createMock.isPending ? '만드는 중…' : '목업 대회 만들기'}
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-[var(--font-size-caption)] text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {created ? (
        <p className="mt-3 text-[var(--font-size-caption)] text-gray-700 dark:text-gray-300">
          <strong>{created.title}</strong> 생성됨 · {created.teamCount}팀 · 경기 {created.fixtureCount}개{' '}
          <Link href={created.route} className="text-blue-600 dark:text-blue-400 underline">대회 보기</Link>
        </p>
      ) : null}
    </section>
  );
}
