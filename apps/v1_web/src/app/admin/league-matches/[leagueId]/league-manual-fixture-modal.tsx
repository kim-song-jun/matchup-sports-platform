'use client';

import { useId, useMemo, useState } from 'react';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { extractErrorMessage } from '@/lib/error-message';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import type { V1CreateManualLeagueFixturePayload } from '@/types/league-match';
import { DATE_INPUT_MAX, kstDatetimeLocalToIso, kstMidnightMs } from '@/lib/kst-calendar';
import { kstWeekKey } from '@/lib/league-fixture-week';
import type { V1PlaceView } from '@/types/api';
import {
  DEFAULT_LEAGUE_PLACE_CHOICE,
  isLeaguePlaceChoiceIncomplete,
  LeagueFixturePlaceField,
  leaguePlacePayload,
  type LeaguePlaceChoice,
} from './league-fixture-place-field';
import { PLACE_NAME_MAX_LENGTH } from '@/lib/place';

/** 한 번에 만들 수 있는 경기 수 — 서버 묶음 추가 DTO 의 `@ArrayMaxSize(30)` 과 같다. */
const MAX_ROWS = 30;
/** 경기 시간을 비웠을 때 다음 줄 시작 시각을 띄우는 간격(분). 운영자가 줄마다 고칠 수 있다. */
const FALLBACK_GAP_MINUTES = 60;

type Row = { key: number; time: string; homeTeamId: string; awayTeamId: string };

/** 리그의 다른 경기 — 고른 날짜가 속한 주의 기존 경기와 같은 주 두 경기 팀을 보여 주는 데만 쓴다. */
export type LeagueManualFixtureContext = {
  startAt: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  cancelled: boolean;
};

/** `HH:mm` 에 분을 더한다. 자정을 넘기면 원래 시각 그대로 — 다음 날로 넘기는 것은 운영자가 정한다. */
export function nextKickoffTime(time: string, minutes: number): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (match === null) return time;
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  if (total >= 24 * 60) return time;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * 리그 경기 추가 창(2026-11-03 사용자 선택 A안 — 기존 '경기 하나 추가' 창을 키웠다).
 *
 * 날짜·경기 시간·장소는 한 번만 정하고 홈·원정·시작 시각을 줄마다 넣는다. 한 경기만 넣으면 예전의
 * 한 경기 추가(우천 순연·대체 경기)와 같다. 저장은 서버 묶음 추가 한 번이라 하나라도 거부되면
 * 아무 경기도 생기지 않는다 — 한 주차의 절반만 남지 않는다.
 *
 * ## 검증을 화면에서 먼저 한다
 * 서버도 막지만, 저장 순간에야 알면 운영자는 무엇이 틀렸는지 폼을 다시 훑어야 한다. 여기서 막는 것:
 * 날짜 없음 · 팀 미선택 · 같은 팀끼리 · 시작 시각 없음. 같은 주에 두 경기인 팀은 막지 않고 알려만 준다
 * (재대결·순연 경기는 정상 운영이다). 종료 시각은 받지 않는다 — 시작보다 이른 종료를 만들 수 있는 입력을
 * 애초에 두지 않는다(서버 DTO 도 `durationMinutes` 만 받는다).
 */
export function LeagueManualFixtureModal({
  teams,
  fixtures = [],
  initialDate,
  initialTime = '10:00',
  weekLabel = null,
  defaultPlace,
  recentVenues,
  defaultDuration = null,
  isSubmitting,
  onSubmit,
  onClose,
}: {
  /** 리그 참가팀. 홈·어웨이 후보는 여기서만 고른다 — 리그 밖 팀은 서버가 거부한다. */
  teams: ReadonlyArray<{ id: string; label: string }>;
  /** 리그의 기존 경기. 고른 날짜의 주에 이미 있는 경기를 보여 주고 같은 주 두 경기 팀을 알린다. */
  fixtures?: ReadonlyArray<LeagueManualFixtureContext>;
  /** 처음 채울 날짜(KST `YYYY-MM-DD`). 주차 칸에서 열면 그 주의 경기일이다. */
  initialDate: string;
  /** 첫 줄 시작 시각(KST `HH:mm`). */
  initialTime?: string;
  /** 주차 칸에서 열었으면 '2주차' — 창 제목에 붙인다. */
  weekLabel?: string | null;
  /** 리그 기본 장소 — "기본 장소 사용" 이 가리키는 곳. */
  defaultPlace: V1PlaceView | null;
  recentVenues?: ReadonlyArray<V1PlaceView>;
  /** 리그 피리어드 설정의 경기 시간 — 일괄 생성 폼과 같은 값으로 경기 시간 칸을 미리 채운다. */
  defaultDuration?: { minutes: number; label: string } | null;
  isSubmitting: boolean;
  /**
   * **계약 타입을 그대로 쓴다** — 인라인으로 다시 적으면 서버 DTO 가 바뀌었을 때
   * 이 창만 옛 모양으로 남아도 타입이 잡아 주지 않는다.
   */
  onSubmit: (payloads: V1CreateManualLeagueFixturePayload[]) => Promise<unknown>;
  onClose: () => void;
}) {
  const id = useId();
  const [date, setDate] = useState(initialDate);
  // null = 아직 안 건드림 — 리그 설정 값을 보여 준다. 설정이 늦게 와도 그대로 따라온다.
  const [durationInput, setDuration] = useState<string | null>(null);
  const duration = durationInput ?? (defaultDuration === null ? '' : String(defaultDuration.minutes));
  const [rows, setRows] = useState<Row[]>([{ key: 0, time: initialTime, homeTeamId: '', awayTeamId: '' }]);
  const [nextKey, setNextKey] = useState(1);
  const [placeChoice, setPlaceChoice] = useState<LeaguePlaceChoice>(DEFAULT_LEAGUE_PLACE_CHOICE);
  const [error, setError] = useState<string | null>(null);
  // ESC·focus trap·body 스크롤 잠금은 어드민 모달 공용 훅이 담당한다. **`pending` 을 넘기는
  // 것이 핵심** — 제출 중 ESC 로 닫히면 요청은 날아가는데 화면은 사라져, 운영자는 경기가
  // 만들어졌는지 알 수 없고 입력도 잃는다. 이 창은 **전체화면**이라 backdrop 클릭 닫기를 쓰지 않는다.
  const { dialogRef } = useModalA11y({ open: true, onClose, pending: isSubmitting });

  const teamName = useMemo(() => new Map(teams.map((team) => [team.id, team.label])), [teams]);
  const nameOf = (teamId: string | null) => (teamId === null ? '미정' : teamName.get(teamId) ?? '팀');

  const weekKey = /^\d{4}-\d{2}-\d{2}$/.test(date) ? kstWeekKey(new Date(kstMidnightMs(date))) : null;
  const weekFixtures = weekKey === null
    ? []
    : fixtures
        .filter((fixture) => !fixture.cancelled && kstWeekKey(new Date(fixture.startAt)) === weekKey)
        .sort((left, right) => left.startAt.localeCompare(right.startAt));
  const gamesByTeam = new Map<string, number>();
  for (const teamId of [
    ...weekFixtures.flatMap((fixture) => [fixture.homeTeamId, fixture.awayTeamId]),
    ...rows.flatMap((row) => [row.homeTeamId, row.awayTeamId]),
  ]) {
    if (teamId) gamesByTeam.set(teamId, (gamesByTeam.get(teamId) ?? 0) + 1);
  }
  const doubleBooked = [...gamesByTeam].filter(([, count]) => count > 1).map(([teamId]) => nameOf(teamId));

  const updateRow = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addRow = () => {
    const gap = /^\d{1,3}$/.test(duration.trim()) ? Number(duration) : FALLBACK_GAP_MINUTES;
    const last = rows[rows.length - 1];
    setRows((current) => [...current, { key: nextKey, time: nextKickoffTime(last.time, gap), homeTeamId: '', awayTeamId: '' }]);
    setNextKey((key) => key + 1);
  };

  const submit = async () => {
    if (isSubmitting) return;
    setError(null);
    if (weekKey === null) {
      setError('날짜를 골라 주세요.');
      return;
    }
    const startsAts: string[] = [];
    for (const [index, row] of rows.entries()) {
      const nth = `${index + 1}번째 경기`;
      if (!row.homeTeamId || !row.awayTeamId) {
        setError(`${nth}의 홈 팀과 어웨이 팀을 모두 골라 주세요.`);
        return;
      }
      if (row.homeTeamId === row.awayTeamId) {
        // 서버도 막지만, 두 칸에 같은 팀이 들어간 것은 **화면에서 보이는 실수**라 여기서 잡는다.
        setError(`${nth}는 같은 팀끼리예요. 다른 팀을 골라 주세요.`);
        return;
      }
      const startsAt = kstDatetimeLocalToIso(`${date}T${row.time}`);
      if (startsAt === null) {
        setError(`${nth}의 시작 시각을 입력해 주세요.`);
        return;
      }
      startsAts.push(startsAt);
    }
    const trimmedDuration = duration.trim();
    if (trimmedDuration !== '' && !/^\d{1,3}$/.test(trimmedDuration)) {
      // `type="number"` 는 `e`·`-` 를 badInput 으로 보고 값을 빈 문자열로 준다 — 화면엔
      // 글자가 보이는데 코드는 "미입력" 으로 읽는다(등번호에서 겪은 것과 같은 자리).
      setError('경기 시간은 숫자(분)로 입력해 주세요.');
      return;
    }
    const durationMinutes = trimmedDuration === '' ? undefined : Number(trimmedDuration);
    if (durationMinutes !== undefined && (durationMinutes < 1 || durationMinutes > 600)) {
      setError('경기 시간은 1분에서 600분 사이로 입력해 주세요.');
      return;
    }
    if (isLeaguePlaceChoiceIncomplete(placeChoice)) {
      setError('다른 장소를 골라 주세요.');
      return;
    }
    try {
      await onSubmit(
        rows.map((row, index) => ({
          homeTeamId: row.homeTeamId,
          awayTeamId: row.awayTeamId,
          startsAt: startsAts[index],
          ...(durationMinutes === undefined ? {} : { durationMinutes }),
          ...leaguePlacePayload(placeChoice),
        })),
      );
      onClose();
    } catch (err) {
      // 레포 표준 — axios 에러의 서버 메시지를 먼저 꺼낸다. `err.message` 만 보면
      // "Request failed with status code 409" 같은 문자열이 그대로 운영자에게 간다.
      setError(extractErrorMessage(err, '경기를 만들지 못했어요.'));
    }
  };

  const selectClass = 'tm-input min-h-[44px] w-full';

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-heading`}
      className="fixed inset-0 z-50 flex flex-col bg-[var(--surface)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <h2 id={`${id}-heading`} className="text-base font-semibold text-[var(--text-strong)]">
          {weekLabel ? `${weekLabel} 경기 추가` : '경기 추가'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          // 제출 중에는 취소 버튼과 **같이** 잠근다. 한쪽만 잠그면 운영자는 잠긴 버튼 옆의
          // 안 잠긴 버튼을 눌러 같은 이탈을 하게 된다.
          disabled={isSubmitting}
          aria-label="닫기"
          className="tm-btn tm-btn-sm tm-btn-ghost"
          style={{ minHeight: 44, minWidth: 44 }}
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <p className="text-xs text-[var(--text-muted)]">
            날짜·경기 시간·장소는 한 번만 정하고 경기를 줄마다 넣어요. 저장하면 모두 한 번에 만들고, 하나라도 문제가 있으면 아무것도 만들지 않아요.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-date`} className="mb-1 block text-sm font-medium text-[var(--text-strong)]">
                날짜
              </label>
              <input
                id={`${id}-date`}
                type="date"
                max={DATE_INPUT_MAX}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="tm-input min-h-[44px] w-full"
              />
            </div>
            <div>
              <label htmlFor={`${id}-duration`} className="mb-1 block text-sm font-medium text-[var(--text-strong)]">
                경기 시간(분)
              </label>
              {/* 종료 시각을 직접 받지 않는다 — 시작보다 이른 종료를 만들 수 있는 입력을 두지 않는다. */}
              <input
                id={`${id}-duration`}
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                placeholder="비우면 종료 시각 없이 만들어요"
                aria-describedby={durationInput === null && defaultDuration !== null ? `${id}-duration-hint` : undefined}
                className="tm-input min-h-[44px] w-full"
              />
              {durationInput === null && defaultDuration !== null ? (
                <p id={`${id}-duration-hint`} className="mt-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                  이 리그의 피리어드 설정({defaultDuration.label})에서 가져왔어요. 일정의 종료 시각에만 쓰여요.
                </p>
              ) : null}
            </div>
          </div>

          <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" disabled={isSubmitting}>
            <legend className="mb-1 text-sm font-medium text-[var(--text-strong)]">경기</legend>
            {rows.map((row, index) => {
              const nth = `${index + 1}번째 경기`;
              return (
                <div key={row.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)_44px] items-center gap-2">
                  <input
                    type="time"
                    aria-label={`${nth} 시작 시각`}
                    value={row.time}
                    onChange={(event) => updateRow(row.key, { time: event.target.value })}
                    className="tm-input min-h-[44px] w-full"
                  />
                  <select
                    aria-label={`${nth} 홈 팀`}
                    value={row.homeTeamId}
                    onChange={(event) => updateRow(row.key, { homeTeamId: event.target.value })}
                    className={selectClass}
                  >
                    <option value="">홈 팀</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id} disabled={team.id === row.awayTeamId}>
                        {team.label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`${nth} 어웨이 팀`}
                    value={row.awayTeamId}
                    onChange={(event) => updateRow(row.key, { awayTeamId: event.target.value })}
                    className={selectClass}
                  >
                    <option value="">어웨이 팀</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id} disabled={team.id === row.homeTeamId}>
                        {team.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={`${nth} 지우기`}
                    onClick={() => setRows((current) => current.filter((candidate) => candidate.key !== row.key))}
                    disabled={rows.length === 1}
                    className="tm-btn tm-btn-sm tm-btn-ghost disabled:opacity-40"
                    style={{ minHeight: 44, minWidth: 44 }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={addRow}
              disabled={rows.length >= MAX_ROWS}
              className="min-h-[44px] rounded-xl border border-dashed border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text-body)] disabled:opacity-50"
            >
              + 경기 줄 추가
            </button>
            <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
              새 줄의 시작 시각은 앞 경기 시작에 경기 시간을 더해 채워요. 한 번에 {MAX_ROWS}경기까지 만들 수 있어요.
            </p>
          </fieldset>

          <div className="grid">
            <LeagueFixturePlaceField
              customLabel="이 경기들만 다른 장소"
              maxLength={PLACE_NAME_MAX_LENGTH.leagueManualFixture}
              defaultPlace={defaultPlace}
              recentVenues={recentVenues}
              choice={placeChoice}
              onChange={setPlaceChoice}
              disabled={isSubmitting}
            />
          </div>

          <section
            aria-label="이 주의 경기"
            className="tm-on-tint flex flex-col gap-1 rounded-xl bg-[var(--surface-soft)] px-4 py-3 text-[length:var(--font-size-body-sm)] text-[var(--text-body)]"
          >
            <p className="font-semibold text-[var(--text-strong)]">
              {weekFixtures.length === 0 ? '이 주에는 아직 경기가 없어요' : `이 주에 이미 있는 경기 ${weekFixtures.length}`}
            </p>
            {weekFixtures.length > 0 ? (
              <ul className="flex flex-col gap-0.5">
                {weekFixtures.map((fixture, index) => (
                  <li key={`${fixture.startAt}-${index}`}>
                    {formatTournamentDateTimeShort(fixture.startAt)} · {nameOf(fixture.homeTeamId)} vs {nameOf(fixture.awayTeamId)}
                  </li>
                ))}
              </ul>
            ) : null}
            {doubleBooked.length > 0 ? (
              <p className="font-semibold text-[var(--orange700)]">같은 주에 두 경기 이상: {doubleBooked.join(', ')}</p>
            ) : null}
          </section>

          {error !== null && (
            <p role="alert" className="text-xs text-[var(--red700)]">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-t border-[var(--border)] px-5 py-4">
        <button
          type="button"
          onClick={onClose}
          className="tm-btn tm-btn-md tm-btn-neutral flex-1"
          style={{ minHeight: 44 }}
          disabled={isSubmitting}
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          className="tm-btn tm-btn-md tm-btn-primary flex-1 [--button-fill-primary:var(--static-blue)] [--button-fill-primary-hover:color-mix(in_srgb,var(--static-blue)_88%,var(--static-black))]"
          style={{ minHeight: 44 }}
          disabled={isSubmitting}
        >
          {isSubmitting ? '만드는 중…' : `경기 ${rows.length}개 만들기`}
        </button>
      </div>
    </div>
  );
}
