'use client';

import { useImperativeHandle } from 'react';
import { TournamentDatetimeField } from '@/components/admin/tournaments/tournament-datetime-field';
import { PlacePicker } from '@/components/v1-ui/place-picker';
import { isoToKstDatetimeLocal, kstDatetimeLocalToIso } from '@/lib/kst-calendar';
import { PLACE_NAME_MAX_LENGTH, placeFromVenueFields, toVenuePayload, type PlaceValue } from '@/lib/place';
import type { V1Tournament, V1UpdateTournamentPayload } from '@/types/api';
import { formatDate, formatDateRange } from '../tournament-admin-shared';
import {
  Field,
  FormGroup,
  NEEDED_BADGE,
  OPTIONAL_BADGE,
  fieldBorderCls,
  fieldTextareaCls,
  infoFieldId,
  requiredNeedKeys,
  saveStep,
  textOrNull,
  useSectionDraft,
} from './form-kit';
import type { InfoSectionDefinition, InfoSectionFormProps } from './types';

const UNSET = '정하지 않음';
const DATE_FIELDS = ['scheduledAt', 'scheduledEndAt', 'registrationDeadlineAt', 'rosterDeadlineAt'] as const;

interface ScheduleDraft {
  scheduledAt: string;
  scheduledEndAt: string;
  registrationDeadlineAt: string;
  rosterDeadlineAt: string;
  venue: PlaceValue | null;
  parkingInfo: string;
}

const toDraft = (tournament: V1Tournament): ScheduleDraft => ({
  scheduledAt: isoToKstDatetimeLocal(tournament.scheduledAt),
  scheduledEndAt: isoToKstDatetimeLocal(tournament.scheduledEndAt),
  registrationDeadlineAt: isoToKstDatetimeLocal(tournament.registrationDeadlineAt),
  rosterDeadlineAt: isoToKstDatetimeLocal(tournament.rosterDeadlineAt),
  venue: placeFromVenueFields(tournament),
  parkingInfo: tournament.parkingInfo ?? '',
});

function isPast(value: string | null): boolean {
  if (!value) return false;
  const at = new Date(value).getTime();
  return !Number.isNaN(at) && at <= Date.now();
}

function ScheduleForm({ base, disabled, ref, onDirtyChange }: InfoSectionFormProps) {
  const { draft, initial, set, fail, errorFor } = useSectionDraft(base, toDraft, onDirtyChange);
  const ids = {
    scheduledAt: infoFieldId('scheduledAt'),
    scheduledEndAt: infoFieldId('scheduledEndAt'),
    registrationDeadlineAt: infoFieldId('registrationDeadlineAt'),
    rosterDeadlineAt: infoFieldId('rosterDeadlineAt'),
    venue: infoFieldId('venue'),
    parkingInfo: infoFieldId('parkingInfo'),
  };

  useImperativeHandle(ref, () => ({
    buildSteps(ctx) {
      // datetime-local 값은 같은 자릿수의 ISO 꼴이라 글자 비교가 곧 시각 비교다.
      if (draft.scheduledAt && draft.scheduledEndAt && draft.scheduledEndAt < draft.scheduledAt) {
        return fail(ids.scheduledEndAt, '대회 종료가 시작보다 빠를 수 없어요.');
      }
      // 서버와 같은 범위 — 두 마감 중 하나를 바꿀 때만 본다. 순서가 어긋난 채 만들어진 대회의 다른 칸 수정은 막지 않는다.
      const deadlineTouched =
        draft.registrationDeadlineAt !== initial.registrationDeadlineAt || draft.rosterDeadlineAt !== initial.rosterDeadlineAt;
      if (deadlineTouched && draft.registrationDeadlineAt && draft.rosterDeadlineAt && draft.rosterDeadlineAt < draft.registrationDeadlineAt) {
        return fail(ids.rosterDeadlineAt, '명단 제출 마감은 신청 마감과 같거나 그 뒤여야 해요.');
      }

      const changes: Omit<V1UpdateTournamentPayload, 'expectedVersion'> = {};
      for (const field of DATE_FIELDS) {
        if (draft[field] !== initial[field]) changes[field] = kstDatetimeLocalToIso(draft[field]);
      }
      // 이름이 바뀌면 서버가 장소 스냅샷 전체를 바꾸므로, 달라졌을 때만 장소 칸을 통째로 보낸다.
      if (JSON.stringify(toVenuePayload(draft.venue)) !== JSON.stringify(toVenuePayload(initial.venue))) {
        Object.assign(changes, draft.venue ? toVenuePayload(draft.venue) : { venue: null });
      }
      const parkingInfo = textOrNull(draft.parkingInfo);
      if (parkingInfo !== (base.parkingInfo ?? null)) changes.parkingInfo = parkingInfo;

      if (Object.keys(changes).length === 0) return { ok: true, steps: [] };
      return { ok: true, steps: [saveStep('schedule', '일정·장소', changes, () => ctx.patchTournament(changes))] };
    },
  }));

  return (
    <div>
      <FormGroup title="일정">
        <div className="flex flex-col gap-4">
          <TournamentDatetimeField
            id={ids.scheduledAt}
            label="대회 시작"
            value={draft.scheduledAt}
            onChange={(value) => set('scheduledAt', value)}
            disabled={disabled}
          />
          <TournamentDatetimeField
            id={ids.scheduledEndAt}
            label="대회 종료"
            value={draft.scheduledEndAt}
            onChange={(value) => set('scheduledEndAt', value)}
            disabled={disabled}
            min={draft.scheduledAt || undefined}
            hint="하루에 끝나면 비워 둬요."
            error={errorFor(ids.scheduledEndAt)}
          />
          <TournamentDatetimeField
            id={ids.registrationDeadlineAt}
            label="신청 마감"
            value={draft.registrationDeadlineAt}
            onChange={(value) => set('registrationDeadlineAt', value)}
            disabled={disabled}
          />
          <TournamentDatetimeField
            id={ids.rosterDeadlineAt}
            label="명단 제출 마감"
            value={draft.rosterDeadlineAt}
            onChange={(value) => set('rosterDeadlineAt', value)}
            disabled={disabled}
            hint="지나면 팀이 선수 명단을 바꿀 수 없어요."
            error={errorFor(ids.rosterDeadlineAt)}
          />
        </div>
      </FormGroup>
      <FormGroup title="장소">
        <div className="flex flex-col gap-4">
          <PlacePicker
            id={ids.venue}
            label="장소"
            maxLength={PLACE_NAME_MAX_LENGTH.tournament}
            value={draft.venue}
            onChange={(value) => set('venue', value)}
            disabled={disabled}
          />
          <Field id={ids.parkingInfo} label="주차 안내" hint="장소 아래에 보여요. 비우면 숨겨요.">
            {(control) => (
              <textarea
                {...control}
                value={draft.parkingInfo}
                onChange={(event) => set('parkingInfo', event.target.value)}
                disabled={disabled}
                maxLength={500}
                rows={3}
                placeholder="예: 건물 지하 주차장 2시간 무료"
                className={`${fieldTextareaCls} ${fieldBorderCls(false)}`}
              />
            )}
          </Field>
        </div>
      </FormGroup>
    </div>
  );
}

export const scheduleSection: InfoSectionDefinition = {
  key: 'schedule',
  rows({ tournament }) {
    const needed = requiredNeedKeys(tournament);
    const badgeIf = (key: Parameters<typeof needed.has>[0]) => (needed.has(key) ? { badge: NEEDED_BADGE } : {});
    return [
      {
        key: 'period',
        label: '대회 기간',
        value: tournament.scheduledAt ? formatDateRange(tournament.scheduledAt, tournament.scheduledEndAt) : UNSET,
        ...badgeIf('scheduled-at'),
      },
      {
        key: 'registrationDeadlineAt',
        label: '신청 마감',
        value: tournament.registrationDeadlineAt ? formatDate(tournament.registrationDeadlineAt) : UNSET,
        ...badgeIf('registration-deadline'),
      },
      {
        key: 'rosterDeadlineAt',
        label: '명단 제출 마감',
        value: tournament.rosterDeadlineAt ? formatDate(tournament.rosterDeadlineAt) : UNSET,
        ...badgeIf('roster-deadline'),
        ...(isPast(tournament.rosterDeadlineAt) ? { note: '지남 — 팀이 명단을 낼 수 없어요' } : {}),
      },
      { key: 'venue', label: '장소', value: tournament.venue?.trim() || UNSET, ...badgeIf('venue') },
      tournament.parkingInfo?.trim()
        ? { key: 'parkingInfo', label: '주차 안내', value: tournament.parkingInfo }
        : { key: 'parkingInfo', label: '주차 안내', value: '비어 있음', badge: OPTIONAL_BADGE },
    ];
  },
  Form: ScheduleForm,
};
