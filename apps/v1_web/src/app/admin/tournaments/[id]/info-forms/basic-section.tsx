'use client';

import { useImperativeHandle } from 'react';
import {
  GENDER_CHOICE_OPTIONS,
  TournamentGenderChoiceField,
  type GenderChoice,
} from '@/components/admin/tournaments/tournament-gender-choice-field';
import { useV1MasterSports } from '@/hooks/use-v1-api';
import { TOURNAMENT_FORMAT_NAMES } from '@/lib/tournament-format-labels';
import { saveStep } from '@/lib/sequential-save';
import type { V1Tournament, V1TournamentFormat, V1UpdateTournamentPayload } from '@/types/api';
import { Field, FormGroup, TextField, fieldBorderCls, fieldInputCls, infoFieldId, useSectionDraft } from './form-kit';
import type { InfoSectionDefinition, InfoSectionFormProps } from './types';

const TITLE_MAX_LENGTH = 100;
const FORMAT_FREE_HINT = '조나 대진을 만들기 전까지 바꿀 수 있어요.';

/** 진행 방식을 바꿀 수 없는 이유 — 바꿀 수 있으면 null. */
function formatLockReason(tournament: V1Tournament): string | null {
  if (tournament.stagePlan) return '여러 단계 대회는 진행 방식을 바꿀 수 없어요.';
  if (tournament.formatChangeBlockedReason) return tournament.formatChangeBlockedReason;
  if (tournament.status === 'in_progress' || tournament.status === 'completed') {
    return '대회가 시작된 뒤에는 진행 방식을 바꿀 수 없어요.';
  }
  return null;
}

const genderLabel = (choice: GenderChoice) => GENDER_CHOICE_OPTIONS.find(([value]) => value === choice)?.[1] ?? '구분 없음';

interface BasicDraft {
  sportId: string;
  title: string;
  format: V1TournamentFormat;
  gender: GenderChoice;
}

const toDraft = (tournament: V1Tournament): BasicDraft => ({
  sportId: tournament.sportId,
  title: tournament.title,
  format: tournament.format,
  gender: tournament.genderCategory ?? 'none',
});

function BasicForm({ base, disabled, ref, onDirtyChange }: InfoSectionFormProps) {
  const { draft, initial, set, fail, errorFor } = useSectionDraft(base, toDraft, onDirtyChange);
  const { data: sports } = useV1MasterSports();
  const lockReason = formatLockReason(base);
  const titleId = infoFieldId('title');

  useImperativeHandle(ref, () => ({
    buildSteps(ctx) {
      const title = draft.title.trim();
      if (!title) return fail(titleId, '대회명을 입력해 주세요.');
      const changes: Omit<V1UpdateTournamentPayload, 'expectedVersion'> = {};
      if (draft.sportId !== initial.sportId) changes.sportId = draft.sportId;
      if (title !== base.title) changes.title = title;
      if (draft.format !== initial.format) changes.format = draft.format;
      if (draft.gender !== initial.gender) changes.genderCategory = draft.gender === 'none' ? null : draft.gender;
      if (Object.keys(changes).length === 0) return { ok: true, steps: [] };
      return { ok: true, steps: [saveStep('basic', '기본', changes, () => ctx.patchTournament(changes))] };
    },
  }));

  return (
    <div>
      <FormGroup>
        <div className="flex flex-col gap-4">
          <Field id={infoFieldId('sportId')} label="종목">
            {(control) => (
              <select
                {...control}
                value={draft.sportId}
                onChange={(event) => set('sportId', event.target.value)}
                disabled={disabled || !sports}
                className={`${fieldInputCls} ${fieldBorderCls(false)}`}
              >
                {(sports ?? []).map((sport) => (
                  <option key={sport.id} value={sport.id}>{sport.name}</option>
                ))}
              </select>
            )}
          </Field>
          <TextField
            id={titleId}
            label="대회명"
            required
            value={draft.title}
            onChange={(value) => set('title', value)}
            error={errorFor(titleId)}
            disabled={disabled}
            maxLength={TITLE_MAX_LENGTH}
          />
          <Field id={infoFieldId('format')} label="진행 방식" hint={lockReason ?? FORMAT_FREE_HINT}>
            {(control) => (
              <select
                {...control}
                value={draft.format}
                onChange={(event) => set('format', event.target.value as V1TournamentFormat)}
                disabled={disabled || lockReason !== null}
                className={`${fieldInputCls} ${fieldBorderCls(false)}`}
              >
                {(Object.keys(TOURNAMENT_FORMAT_NAMES) as V1TournamentFormat[]).map((format) => (
                  <option key={format} value={format}>{TOURNAMENT_FORMAT_NAMES[format]}</option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </FormGroup>
      <FormGroup>
        <TournamentGenderChoiceField
          value={draft.gender}
          onChange={(value) => set('gender', value)}
          defaultValue="none"
          disabled={disabled}
        />
      </FormGroup>
    </div>
  );
}

export const basicSection: InfoSectionDefinition = {
  key: 'basic',
  rows({ tournament, sportName }) {
    const lockReason = formatLockReason(tournament);
    return [
      { key: 'sport', label: '종목', value: sportName ?? '—' },
      { key: 'title', label: '대회명', value: tournament.title },
      {
        key: 'format',
        label: '진행 방식',
        value: TOURNAMENT_FORMAT_NAMES[tournament.format],
        ...(lockReason ? { note: lockReason } : {}),
      },
      { key: 'gender', label: '성별', value: genderLabel(tournament.genderCategory ?? 'none') },
    ];
  },
  Form: BasicForm,
};
