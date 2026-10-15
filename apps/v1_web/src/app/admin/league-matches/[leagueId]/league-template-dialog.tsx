'use client';

import { useId, useState } from 'react';
import type { V1PlaceView } from '@/types/api';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { extractErrorMessage } from '@/lib/error-message';
import { toKstDateString } from '@/lib/kst-calendar';
import { describeDateSelection } from '@/lib/league-fixture-calendar';
import { expandWeeklyFixtureDates, WEEKDAY_OPTIONS } from '@/lib/league-fixture-dates';
import { plannedGameCount, roundRobinRounds, type RoundRobinLegs } from '@/lib/league-round-robin-plan';
import type { V1ApplyLeagueTemplatePayload } from '@/types/league-match';
import { LeagueFixtureDatePicker } from './league-fixture-date-picker';
import {
  DEFAULT_LEAGUE_PLACE_CHOICE,
  isLeaguePlaceChoiceIncomplete,
  LeagueFixturePlaceField,
  leaguePlacePayload,
  type LeaguePlaceChoice,
} from './league-fixture-place-field';
import { PLACE_NAME_MAX_LENGTH } from '@/lib/place';
import { CompetitionTemplateCard } from '@/shared/ui/competition-template-card';

const TEAM_COUNT_MIN = 3;
const TEAM_COUNT_MAX = 20;
const GAMES_PER_DAY_MAX = 50;

/** 빈 칸 = null, 숫자가 아니면 NaN — 범위 검사는 부르는 쪽이 한다. */
const parseOptionalCount = (text: string): number | null => (text.trim() === '' ? null : /^\d{1,3}$/.test(text.trim()) ? Number(text.trim()) : Number.NaN);
const inRange = (value: number | null, min: number, max: number) => value === null || (value >= min && value <= max);

const inputClass =
  'h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

export interface LeagueTemplateDialogProps {
  /** 리그 시작일(ISO) — 요일로 채울 때 기준일. */
  leagueStartsOn: string;
  initialTeamCount: number;
  /** 리그 기본 장소. 비워 두면 새 경기가 이 장소를 이어받는다. */
  defaultPlace: V1PlaceView | null;
  /** 참가팀이 과거에 쓴 장소(추천 칩). 없으면 빈 배열. */
  recentVenues: readonly V1PlaceView[];
  /** 리그 피리어드 설정의 경기 시간(분) — 하루 경기 수를 넣었을 때 경기 시간 칸을 미리 채운다. */
  defaultGameMinutes?: number | null;
  /** 경기가 이미 있는 리그를 새 템플릿으로 바꾸는 중인가. */
  replaceExisting: boolean;
  isSubmitting: boolean;
  onSubmit: (payload: V1ApplyLeagueTemplatePayload) => Promise<unknown>;
  onClose: () => void;
}

export function LeagueTemplateDialog({
  leagueStartsOn,
  initialTeamCount,
  defaultPlace,
  recentVenues,
  defaultGameMinutes = null,
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
  const [gamesPerDayText, setGamesPerDayText] = useState('');
  // null = 아직 안 건드림 — 리그 설정 시간을 보여 준다.
  const [durationInput, setDurationInput] = useState<string | null>(null);
  const [breakText, setBreakText] = useState('');
  const [placeChoice, setPlaceChoice] = useState<LeaguePlaceChoice>(DEFAULT_LEAGUE_PLACE_CHOICE);
  const [error, setError] = useState<string | null>(null);
  // pending 을 넘겨 제출 중 ESC 로 닫히지 않게 한다 — 요청은 날아가는데 화면만 사라지면 결과를 알 수 없다.
  const { dialogRef } = useModalA11y({ open: true, onClose, pending: isSubmitting });

  const trimmedTeamCount = teamCountText.trim();
  const teamCount = /^\d{1,2}$/.test(trimmedTeamCount) ? Number(trimmedTeamCount) : null;
  const teamCountInRange = teamCount !== null && teamCount >= TEAM_COUNT_MIN && teamCount <= TEAM_COUNT_MAX;
  const rounds = teamCountInRange ? roundRobinRounds(teamCount, legs) : 0;
  const singleRounds = teamCountInRange ? roundRobinRounds(teamCount, 1) : 0;
  const doubleRounds = teamCountInRange ? roundRobinRounds(teamCount, 2) : 0;
  const totalGames = teamCountInRange ? plannedGameCount(teamCount, rounds) : 0;
  const gamesPerDay = parseOptionalCount(gamesPerDayText);
  const gamesPerDayValid = gamesPerDay !== null && Number.isInteger(gamesPerDay) && gamesPerDay >= 1 && gamesPerDay <= GAMES_PER_DAY_MAX;
  const durationText = durationInput ?? (defaultGameMinutes === null ? '' : String(defaultGameMinutes));
  // 하루 경기 수가 없으면 하루에 한 라운드 — 필요한 날짜 수가 곧 라운드 수다. 있으면 총 경기 수 ÷ 하루 경기 수(올림).
  const requiredDays = gamesPerDayValid ? Math.ceil(totalGames / gamesPerDay) : rounds;
  const hasStartsOn = !Number.isNaN(new Date(leagueStartsOn).getTime());

  const fillByWeekday =
    hasStartsOn && dayOfWeek !== '' && time.trim() !== '' && rounds > 0
      ? () =>
          setSelectedDates(
            expandWeeklyFixtureDates({ startsOn: leagueStartsOn, dayOfWeek, time, weeksCount: requiredDays, now: new Date() }),
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
    const durationMinutes = parseOptionalCount(durationText);
    const breakMinutes = parseOptionalCount(breakText);
    if (gamesPerDayText.trim() !== '' && !gamesPerDayValid) {
      setError(`하루 경기 수는 1~${GAMES_PER_DAY_MAX} 사이로 입력해 주세요.`);
      return;
    }
    if (gamesPerDayValid && (!inRange(durationMinutes, 5, 240) || !inRange(breakMinutes, 0, 120))) {
      setError('경기 시간은 5~240분, 휴식은 0~120분 사이로 입력해 주세요.');
      return;
    }
    if (describeDateSelection(selectedDates.length, requiredDays).state === 'short') {
      setError(`경기 날짜가 ${requiredDays}일 필요해요. ${selectedDates.length}일 골랐어요.`);
      return;
    }
    if (isLeaguePlaceChoiceIncomplete(placeChoice)) {
      setError('다른 장소를 골라 주세요.');
      return;
    }
    try {
      await onSubmit({
        teamCount,
        legs,
        schedule: { dates: selectedDates, time: time.trim() },
        ...(gamesPerDayValid
          ? {
              gamesPerDay,
              ...(durationMinutes === null ? {} : { gameDurationMinutes: durationMinutes }),
              ...(breakMinutes === null ? {} : { breakMinutes }),
            }
          : {}),
        ...leaguePlacePayload(placeChoice),
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
          팀 없이 경기 틀과 일정을 먼저 만들어요. 팀은 일정 보드에서 자리에 넣어요. 기본 장소가 없으면 ‘장소 미정’으로 들어가고, 만든 뒤 경기마다 「일정 수정」에서 바꿀 수 있어요.
          자리에 팀을 모두 넣기 전에는 공개 화면에 경기가 나오지 않아요.
        </p>
        {replaceExisting ? (
          <p className="tm-on-tint mb-4 rounded-xl bg-[var(--tint-orange)] px-3 py-2 text-[length:var(--font-size-caption)] text-[var(--orange700)]">
            기존 경기는 목록에서 빠지고 새 일정으로 바뀌어요. 이미 시작했거나 결과가 있는 경기가 있으면 만들 수 없어요.
          </p>
        ) : null}

        <div className="mb-4 grid grid-cols-1 items-start gap-3 md:max-w-xl">
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
        </div>
        <fieldset className="mb-4 min-w-0 md:max-w-2xl">
          <legend className="mb-2 text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">경기 방식</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CompetitionTemplateCard mode="radio" name="league-template-legs" value="1" checked={legs === 1}
              onChange={() => setLegs(1)} graphic="league-single" title="단일 리그"
              description="모든 팀이 서로 한 번씩 경기해요." meta={teamCountInRange ? `${singleRounds}라운드 · ${plannedGameCount(teamCount, singleRounds)}경기` : '팀 수 3~20팀'} />
            <CompetitionTemplateCard mode="radio" name="league-template-legs" value="2" checked={legs === 2}
              onChange={() => setLegs(2)} graphic="league-double" title="홈·어웨이 리그"
              description="모든 팀이 서로 홈과 어웨이로 두 번 경기해요." meta={teamCountInRange ? `${doubleRounds}라운드 · ${plannedGameCount(teamCount, doubleRounds)}경기` : '팀 수 3~20팀'} />
          </div>
        </fieldset>
        {teamCountInRange ? (
          <p className="mb-4 text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">
            {`${rounds}라운드 · ${totalGames}경기를 만들어요`}
            {gamesPerDayValid ? ` · 하루 ${gamesPerDay}경기씩 ${requiredDays}일` : ''}
          </p>
        ) : null}

        <div className="mb-4 grid grid-cols-1 items-start gap-3 md:max-w-xl">
          <div>
            <label htmlFor="league-template-games-per-day" className="mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">하루 경기 수</label>
            <input
              id="league-template-games-per-day"
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={gamesPerDayText}
              onChange={(event) => setGamesPerDayText(event.target.value)}
              placeholder={teamCountInRange ? `비우면 하루 한 라운드(${plannedGameCount(teamCount, 1)}경기)` : '비우면 하루 한 라운드'}
              aria-describedby="league-template-games-per-day-hint"
              className={`${inputClass} w-full`}
            />
            <p id="league-template-games-per-day-hint" className="mt-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
              {gamesPerDayValid
                ? '그날 경기는 시작 시각부터 한 구장에서 경기 시간 + 휴식 간격으로 이어져요. 한 팀이 하루에 두 경기 이상 할 수 있어요.'
                : '비우면 하루에 한 라운드를 같은 시각에 시작해요.'}
            </p>
          </div>
          {gamesPerDayValid ? (
            <div className="grid grid-cols-2 items-start gap-3">
              <div>
                <label htmlFor="league-template-duration" className="mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">경기 시간(분)</label>
                <input
                  id="league-template-duration"
                  type="text"
                  inputMode="numeric"
                  maxLength={3}
                  value={durationText}
                  onChange={(event) => setDurationInput(event.target.value)}
                  placeholder="리그 설정 시간"
                  className={`${inputClass} w-full`}
                />
              </div>
              <div>
                <label htmlFor="league-template-break" className="mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">휴식(분)</label>
                <input
                  id="league-template-break"
                  type="text"
                  inputMode="numeric"
                  maxLength={3}
                  value={breakText}
                  onChange={(event) => setBreakText(event.target.value)}
                  placeholder="0"
                  className={`${inputClass} w-full`}
                />
              </div>
            </div>
          ) : null}
        </div>

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

        <div className="mb-4 grid md:max-w-xl">
          <LeagueFixturePlaceField
            maxLength={PLACE_NAME_MAX_LENGTH.leagueFixture}
            legend="장소"
            customLabel="다른 장소 사용"
            defaultPlace={defaultPlace}
            recentVenues={recentVenues}
            choice={placeChoice}
            onChange={setPlaceChoice}
            disabled={isSubmitting}
          />
        </div>

        <p className="mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">경기 날짜</p>
        <LeagueFixtureDatePicker
          selectedDates={selectedDates}
          onChange={setSelectedDates}
          requiredCount={requiredDays}
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
