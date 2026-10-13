'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1LeagueFixture, V1UpdateLeagueFixturePayload } from '@/types/league-match';
import type { V1PlaceView } from '@/types/api';
import { isoToKstDatetimeLocal, kstDatetimeLocalToIso } from '@/lib/kst-calendar';
import { isUnsetPlace, placeFromView, toLeaguePlacePayload, PLACE_NAME_MAX_LENGTH } from '@/lib/place';
import { isSamePlace } from '@/lib/same-place';
import {
  isLeaguePlaceChoiceIncomplete,
  LeagueFixturePlaceField,
  type LeaguePlaceChoice,
} from './league-fixture-place-field';

/** 서버 PATCH 본문 — 바뀐 필드만 담는다. */
export type LeagueFixtureSchedulePatch = V1UpdateLeagueFixturePayload;

function fixtureCurrentPlace(fixture: V1LeagueFixture): V1PlaceView {
  return (
    fixture.place ?? {
      name: fixture.placeName,
      address: fixture.placeAddress ?? null,
      latitude: null,
      longitude: null,
      provider: null,
      providerPlaceId: null,
    }
  );
}

function placeChoiceKey(choice: LeaguePlaceChoice): string {
  return choice.mode === 'default' ? 'default' : JSON.stringify(toLeaguePlacePayload(choice.place));
}

const fieldClass =
  'h-[44px] w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

/**
 * 한 경기 수정 — 홈·원정 팀, 경기 이름, 일시, 장소. 대진 표는 읽기만 하고, 고치는 일은 행의 ⋯ 에서
 * 이 모달로 한다 — 표 안 입력칸이 열 폭을 먹고 탭만 지나가도 저장이 나가던 자리를 한 번의 명시적
 * 저장으로 바꾼 것이다. 값이 그대로면 저장 버튼이 눌리지 않아 불필요한 쓰기가 나가지 않는다.
 * 팀은 시작 전·결과 없는 경기만 바꿀 수 있고, 자리 방식 경기는 일정 보드의 자리에서 바꾼다(`teamLockedReason`).
 */
export function LeagueFixtureScheduleModal({
  fixture,
  defaultPlace,
  recentVenues,
  matchupLabel,
  teams,
  teamLockedReason,
  isSubmitting,
  onSubmit,
  onClose,
}: {
  fixture: V1LeagueFixture;
  defaultPlace: V1PlaceView | null;
  recentVenues?: ReadonlyArray<V1PlaceView>;
  matchupLabel: string;
  /** 리그 참가 확정 팀 — 홈·원정 선택지. */
  teams: ReadonlyArray<{ teamId: string; name: string }>;
  /** 팀을 못 바꾸는 이유. null 이면 바꿀 수 있다. */
  teamLockedReason: string | null;
  isSubmitting: boolean;
  onSubmit: (patch: LeagueFixtureSchedulePatch) => Promise<unknown>;
  onClose: () => void;
}) {
  const startsAtId = useId();
  const titleId = useId();
  const homeId = useId();
  const awayId = useId();
  const initialStartsAt = isoToKstDatetimeLocal(fixture.startAt);
  const currentPlace = fixtureCurrentPlace(fixture);
  // 리그 기본 장소와 다른 경기는 "다른 장소" 로 열어 지금 장소를 그대로 보여 준다. 기본 장소가 없을 때 서버가 넣은
  // '장소 미정'은 기본 장소를 따른 결과라 "기본 장소 사용"으로 연다 — 아니면 저장할 때마다 '장소 미정'이 직접 고른 장소로 굳는다.
  const initialChoice: LeaguePlaceChoice =
    (defaultPlace !== null && isSamePlace(currentPlace, defaultPlace)) || (defaultPlace === null && isUnsetPlace(currentPlace))
      ? { mode: 'default', place: null }
      : { mode: 'custom', place: placeFromView(currentPlace) };
  const [startsAtLocal, setStartsAtLocal] = useState(initialStartsAt);
  const [placeChoice, setPlaceChoice] = useState<LeaguePlaceChoice>(initialChoice);
  const [title, setTitle] = useState(fixture.title);
  const [homeTeamId, setHomeTeamId] = useState(fixture.homeTeamId ?? '');
  const [awayTeamId, setAwayTeamId] = useState(fixture.awayTeamId ?? '');
  const [error, setError] = useState<string | null>(null);
  // 제출 중 ESC·배경 클릭으로 닫히면 요청은 날아가는데 화면은 사라져 저장 여부를 알 수 없다.
  const { dialogRef, onBackdropClick } = useModalA11y<HTMLElement, HTMLDivElement>({
    open: true,
    onClose,
    pending: isSubmitting,
  });

  const changed = {
    startAt: startsAtLocal !== initialStartsAt,
    place: placeChoiceKey(placeChoice) !== placeChoiceKey(initialChoice),
    title: title.trim() !== fixture.title,
    home: homeTeamId !== (fixture.homeTeamId ?? ''),
    away: awayTeamId !== (fixture.awayTeamId ?? ''),
  };
  const dirty = Object.values(changed).some(Boolean);

  const submit = async () => {
    if (isSubmitting || !dirty) return;
    setError(null);
    const patch: LeagueFixtureSchedulePatch = {};
    if (changed.title) {
      if (title.trim() === '') {
        setError('경기 이름을 입력해 주세요.');
        return;
      }
      patch.title = title.trim();
    }
    if (changed.home || changed.away) {
      if (homeTeamId !== '' && homeTeamId === awayTeamId) {
        setError('같은 팀끼리 경기를 만들 수 없어요.');
        return;
      }
      if (changed.home && homeTeamId !== '') patch.homeTeamId = homeTeamId;
      if (changed.away && awayTeamId !== '') patch.awayTeamId = awayTeamId;
    }
    if (changed.startAt) {
      const startsAt = kstDatetimeLocalToIso(startsAtLocal);
      if (startsAt === null) {
        setError('경기 시작 일시를 입력해 주세요.');
        return;
      }
      patch.startsAt = startsAt;
    }
    if (changed.place) {
      if (isLeaguePlaceChoiceIncomplete(placeChoice)) {
        setError('다른 장소를 골라 주세요.');
        return;
      }
      // 수정에서 placeName 이 없으면 "변경 없음" 이다. 기본 장소로 되돌리려면 빈 문자열을 보내야 서버가 리셋한다.
      Object.assign(patch, placeChoice.mode === 'custom' ? toLeaguePlacePayload(placeChoice.place) : { placeName: '' });
    }
    try {
      await onSubmit(patch);
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err, '경기를 저장하지 못했어요.'));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 sm:items-center sm:p-4"
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="경기 수정"
        className="flex max-h-[90vh] w-full max-w-[440px] flex-col gap-4 overflow-y-auto rounded-t-2xl bg-[var(--card-surface)] p-5 sm:rounded-2xl"
      >
        <div>
          <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">경기 수정</h2>
          <p className="mt-0.5 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
            {matchupLabel} · {fixture.title}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {([
            { id: homeId, label: '홈 팀', value: homeTeamId, set: setHomeTeamId },
            { id: awayId, label: '원정 팀', value: awayTeamId, set: setAwayTeamId },
          ] as const).map((field) => (
            <div key={field.id}>
              <label htmlFor={field.id} className="mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
                {field.label}
              </label>
              <select
                id={field.id}
                value={field.value}
                disabled={teamLockedReason !== null || isSubmitting}
                onChange={(e) => field.set(e.target.value)}
                className={`${fieldClass} disabled:opacity-60`}
              >
                {field.value === '' ? <option value="">팀 미정</option> : null}
                {teams.map((team) => (
                  <option key={team.teamId} value={team.teamId}>{team.name}</option>
                ))}
              </select>
            </div>
          ))}
          {teamLockedReason ? (
            <p className="col-span-2 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{teamLockedReason}</p>
          ) : null}
        </div>
        <div>
          <label htmlFor={titleId} className="mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
            경기 이름
          </label>
          <input id={titleId} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label htmlFor={startsAtId} className="mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
            일시
          </label>
          <input
            id={startsAtId}
            type="datetime-local"
            value={startsAtLocal}
            onChange={(e) => setStartsAtLocal(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="grid">
          <LeagueFixturePlaceField
            maxLength={PLACE_NAME_MAX_LENGTH.leagueFixture}
            defaultPlace={defaultPlace}
            recentVenues={recentVenues}
            choice={placeChoice}
            onChange={setPlaceChoice}
            disabled={isSubmitting}
          />
        </div>
        {error ? (
          <p role="alert" className="text-[length:var(--font-size-label)] font-medium text-[var(--red700)]">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button variant="outline" block onClick={onClose} disabled={isSubmitting}>
            취소
          </Button>
          <Button variant="primary" block onClick={() => void submit()} disabled={!dirty} loading={isSubmitting}>
            저장
          </Button>
        </div>
      </div>
    </div>
  );
}
