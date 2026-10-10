'use client';

import { useId } from 'react';
import { PlacePicker } from '@/components/v1-ui/place-picker';
import { toLeaguePlacePayload, type PlaceValue } from '@/lib/place';
import type { V1PlaceView } from '@/types/api';

/** 리그 경기 장소 선택: 기본 장소를 상속하거나(서버가 채운다) 경기마다 다른 장소를 직접 고른다. */
export type LeaguePlaceChoice = { mode: 'default' | 'custom'; place: PlaceValue | null };

export const DEFAULT_LEAGUE_PLACE_CHOICE: LeaguePlaceChoice = { mode: 'default', place: null };

/** "기본" 은 장소 필드를 하나도 보내지 않는다 — 서버가 리그 기본 장소(없으면 '장소 미정')를 상속한다. */
export function leaguePlacePayload(choice: LeaguePlaceChoice): ReturnType<typeof toLeaguePlacePayload> {
  return choice.mode === 'custom' ? toLeaguePlacePayload(choice.place) : {};
}

/** 다른 장소를 고르겠다고 했는데 아직 고르지 않았다. */
export function isLeaguePlaceChoiceIncomplete(choice: LeaguePlaceChoice): boolean {
  return choice.mode === 'custom' && choice.place === null;
}

export function LeagueFixturePlaceField({
  legend = '장소',
  customLabel = '이 경기만 다른 장소',
  defaultPlace,
  recentVenues,
  choice,
  onChange,
  disabled = false,
  maxLength,
}: {
  legend?: string;
  customLabel?: string;
  defaultPlace: V1PlaceView | null;
  recentVenues?: ReadonlyArray<V1PlaceView>;
  choice: LeaguePlaceChoice;
  onChange: (choice: LeaguePlaceChoice) => void;
  disabled?: boolean;
  /** 이 화면이 보내는 DTO 의 장소 이름 한도(`PLACE_NAME_MAX_LENGTH`). */
  maxLength: number;
}) {
  const name = useId();
  const options: Array<{ mode: LeaguePlaceChoice['mode']; label: string }> = [
    { mode: 'default', label: `기본 장소 사용 (${defaultPlace?.name ?? '장소 미정'})` },
    { mode: 'custom', label: customLabel },
  ];
  return (
    <fieldset className="col-span-full m-0 grid min-w-0 gap-2 border-0 p-0" disabled={disabled}>
      <legend className="mb-1 tm-text-body-sm font-medium text-[var(--text-strong)]">{legend}</legend>
      {options.map((option) => (
        <label
          key={option.mode}
          className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] px-3 tm-text-body-sm text-[var(--text-body)] has-[:checked]:border-[var(--blue500)] has-[:checked]:text-[var(--text-strong)]"
        >
          <input
            type="radio"
            name={name}
            checked={choice.mode === option.mode}
            onChange={() => onChange({ ...choice, mode: option.mode })}
            className="h-5 w-5 accent-[var(--blue500)]"
          />
          {option.label}
        </label>
      ))}
      {choice.mode === 'custom' ? (
        <PlacePicker
          label="다른 장소"
          value={choice.place}
          onChange={(place) => onChange({ ...choice, place })}
          recentVenues={recentVenues}
          disabled={disabled}
          maxLength={maxLength}
        />
      ) : null}
    </fieldset>
  );
}
