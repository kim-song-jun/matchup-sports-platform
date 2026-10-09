'use client';

import { useId, useState } from 'react';
import { RecentVenueChips } from '@/components/v1-ui/create-form-fields';
import { SegmentedTabs } from '@/components/v1-ui/segmented-tabs';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { extractErrorMessage } from '@/lib/error-message';
import { toKstDateString } from '@/lib/kst-calendar';
import { describeDateSelection } from '@/lib/league-fixture-calendar';
import { expandWeeklyFixtureDates, WEEKDAY_OPTIONS } from '@/lib/league-fixture-dates';
import { plannedGameCount, roundRobinRounds, type RoundRobinLegs } from '@/lib/league-round-robin-plan';
import type { V1ApplyLeagueTemplatePayload } from '@/types/league-match';
import { LeagueFixtureDatePicker } from './league-fixture-date-picker';

const TEAM_COUNT_MIN = 3;
const TEAM_COUNT_MAX = 20;

const inputClass =
  'h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

export interface LeagueTemplateDialogProps {
  /** 리그 시작일(ISO) — 요일로 채울 때 기준일. */
  leagueStartsOn: string;
  initialTeamCount: number;
  /** 참가팀이 과거에 쓴 장소(추천 칩). 없으면 빈 배열. */
  recentVenues: readonly string[];
  /** 경기가 이미 있는 리그를 새 템플릿으로 바꾸는 중인가. */
  replaceExisting: boolean;
  isSubmitting: boolean;
  onSubmit: (payload: V1ApplyLeagueTemplatePayload) => Promise<unknown>;
  onClose: () => void;
}

export function LeagueTemplateDialog({
  leagueStartsOn,
  initialTeamCount,
  recentVenues,
  replaceExisting,
  isSubmitting,
  onSubmit,
  onClose,
}: LeagueTemplateDialogProps) {
  const titleId = useId();
  const [teamCountText, setTeamCountText] = useState(String(initialTeamCount));
  const [legs, setLegs] = useState<RoundRobinLegs>(1);
  const [dayOfWeek, setDayOfWeek] = useState<number | ''>('');
  const [time, setTime] = useState('19:00');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [placeName, setPlaceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  // pending 을 넘겨 제출 중 ESC 로 닫히지 않게 한다 — 요청은 날아가는데 화면만 사라지면 결과를 알 수 없다.
  const { dialogRef } = useModalA11y({ open: true, onClose, pending: isSubmitting });

  const trimmedTeamCount = teamCountText.trim();
  const teamCount = /^\d{1,2}$/.test(trimmedTeamCount) ? Number(trimmedTeamCount) : null;
  const teamCountInRange = teamCount !== null && teamCount >= TEAM_COUNT_MIN && teamCount <= TEAM_COUNT_MAX;
  // 템플릿은 하루에 한 라운드를 치른다 — 필요한 경기 날짜 수가 곧 라운드 수다.
  const rounds = teamCountInRange ? roundRobinRounds(teamCount, legs) : 0;
  const hasStartsOn = !Number.isNaN(new Date(leagueStartsOn).getTime());

  const fillByWeekday =
    hasStartsOn && dayOfWeek !== '' && time.trim() !== '' && rounds > 0
      ? () =>
          setSelectedDates(
            expandWeeklyFixtureDates({ startsOn: leagueStartsOn, dayOfWeek, time, weeksCount: rounds, now: new Date() }),
          )
      : null;

  const submit = async () => {
    if (isSubmitting) return;
    setError(null);
    if (teamCount === null || !teamCountInRange) {
      setError(`팀 수는 ${TEAM_COUNT_MIN}팀에서 ${TEAM_COUNT_MAX}팀 사이로 입력해 주세요.`);
      return;
    }
    if (time.trim() === '') {
      setError('시작 시각을 입력해 주세요.');
      return;
    }
    if (describeDateSelection(selectedDates.length, rounds).state === 'short') {
      setError(`경기 날짜가 ${rounds}일 필요해요. ${selectedDates.length}일 골랐어요.`);
      return;
    }
    try {
      await onSubmit({
        teamCount,
        legs,
        schedule: { dates: selectedDates, time: time.trim() },
        ...(placeName.trim() === '' ? {} : { placeName: placeName.trim() }),
        ...(replaceExisting ? { replaceExisting: true } : {}),
      });
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err, '빈 경기를 만들지 못했어요.'));
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex flex-col bg-[var(--surface)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <h2 id={titleId} className="text-[length:var(--font-size-body-lg)] font-semibold text-[var(--text-strong)]">
          {replaceExisting ? '템플릿으로 다시 만들기' : '템플릿으로 빈 경기 만들기'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="닫기"
          className="tm-btn tm-btn-sm tm-btn-ghost"
          style={{ minHeight: 44, minWidth: 44 }}
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p className="mb-4 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
          팀 없이 경기 틀과 일정을 먼저 만들어요. 팀은 일정 보드에서 자리에 넣어요. 장소를 비우면 ‘장소 미정’으로 들어가고, 만든 뒤 경기마다 「일정 수정」에서 바꿀 수 있어요.
          자리에 팀을 모두 넣기 전에는 공개 화면에 경기가 나오지 않아요.
        </p>
        {replaceExisting ? (
          <p className="tm-on-tint mb-4 rounded-xl bg-[var(--tint-orange)] px-3 py-2 text-[length:var(--font-size-caption)] text-[var(--orange700)]">
            기존 경기는 취소되고 새 일정으로 바뀌어요. 이미 시작했거나 결과가 있는 경기가 있으면 만들 수 없어요.
          </p>
        ) : null}

        <div className="mb-4 grid grid-cols-2 items-start gap-3 md:max-w-xl">
          <div>
            <label htmlFor="league-template-team-count" className="mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">팀 수</label>
            <input
              id="league-template-team-count"
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={teamCountText}
              onChange={(event) => setTeamCountText(event.target.value)}
              className={`${inputClass} w-full`}
            />
          </div>
          <div>
            <p className="mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">방식</p>
            <SegmentedTabs
              ariaLabel="리그 방식"
              role="radiogroup"
              activeId={legs === 2 ? 'double' : 'single'}
              onSelect={(id) => setLegs(id === 'double' ? 2 : 1)}
              items={[
                { id: 'single', label: '단일 리그' },
                { id: 'double', label: '홈앤어웨이' },
              ]}
            />
          </div>
        </div>
        {teamCountInRange ? (
          <p className="mb-4 text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">
            {`${rounds}라운드 · ${plannedGameCount(teamCount, rounds)}경기를 만들어요`}
          </p>
        ) : null}

        <div className="mb-4 grid grid-cols-2 items-start gap-3 md:max-w-xl">
          <div>
            <label htmlFor="league-template-weekday" className="mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">요일</label>
            <select
              id="league-template-weekday"
              value={dayOfWeek}
              onChange={(event) => setDayOfWeek(event.target.value === '' ? '' : Number(event.target.value))}
              className={`${inputClass} w-full`}
            >
              <option value="">요일 고르기</option>
              {WEEKDAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="league-template-time" className="mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">시작 시각</label>
            <input
              id="league-template-time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className={`${inputClass} w-full`}
            />
          </div>
        </div>

        <div className="mb-4 md:max-w-xl">
          <label htmlFor="league-template-place-name" className="mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">기본 장소</label>
          <input
            id="league-template-place-name"
            type="text"
            maxLength={120}
            placeholder="장소 미정"
            value={placeName}
            onChange={(event) => setPlaceName(event.target.value)}
            className={`${inputClass} w-full`}
          />
          <RecentVenueChips
            items={recentVenues.map((venue) => ({ placeName: venue }))}
            selectedValue={placeName}
            onSelect={(venue) => setPlaceName(venue.placeName)}
          />
        </div>

        <p className="mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">경기 날짜</p>
        <LeagueFixtureDatePicker
          selectedDates={selectedDates}
          onChange={setSelectedDates}
          requiredCount={rounds}
          today={toKstDateString(new Date())}
          onFillByWeekday={fillByWeekday}
          fillDisabledReason={hasStartsOn ? '팀 수·요일·시각을 고르면 한 번에 채울 수 있어요.' : '리그 시작일이 없어 요일로 채울 수 없어요.'}
        />

        {error !== null ? (
          <p role="alert" className="mt-4 text-[length:var(--font-size-body-sm)] text-[var(--red700)]">{error}</p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        <button type="button" onClick={onClose} disabled={isSubmitting} className="tm-btn tm-btn-sm tm-btn-outline" style={{ minHeight: 44 }}>
          취소
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={isSubmitting}
          className="tm-btn tm-btn-sm tm-btn-primary"
          style={{ minHeight: 44 }}
        >
          {replaceExisting ? '다시 만들기' : '빈 경기 만들기'}
        </button>
      </div>
    </div>
  );
}
