'use client';

import { useImperativeHandle } from 'react';
import {
  GENDER_CHOICE_OPTIONS,
  TournamentGenderChoiceField,
  type GenderChoice,
} from '@/components/admin/tournaments/tournament-gender-choice-field';
import { useV1MasterSports } from '@/hooks/use-v1-api';
import { TOURNAMENT_FORMAT_NAMES } from '@/lib/tournament-format-labels';
import { TOURNAMENT_TITLE_MAX_LENGTH } from '@/lib/tournament-limits';
import { saveStep } from '@/lib/sequential-save';
import type { V1Tournament, V1TournamentFormat, V1UpdateTournamentPayload } from '@/types/api';
import { Field, FormGroup, TextField, fieldBorderCls, fieldInputCls, infoFieldId, useSectionDraft } from './form-kit';
import type { InfoSectionDefinition, InfoSectionFormProps } from './types';

const FORMAT_FREE_HINT = '조나 대진을 만들기 전까지 바꿀 수 있어요.';
const STAGED_FORMAT_HINT = '여러 단계는 새 대회를 만들 때 고를 수 있어요.';

const FORMAT_LOCKED_BY_BRACKET = '대진이 있어서 진행 방식을 바꿀 수 없어요. 바꾸려면 「대진」에서 경기와 조를 모두 지워 주세요.';

/**
 * 진행 방식을 바꿀 수 없는 이유 — 바꿀 수 있으면 null.
 * 서버 사유는 시작된 뒤와 대진·조가 있을 때 둘뿐이라, 시작 여부를 먼저 걸러 내면 남은 서버 사유는 대진·조 때문이다.
 */
function formatLockReason(tournament: V1Tournament): string | null {
  if (tournament.stagePlan) return '여러 단계 대회는 진행 방식을 바꿀 수 없어요.';
  if (tournament.status === 'in_progress' || tournament.status === 'completed') {
    return '대회가 시작된 뒤에는 진행 방식을 바꿀 수 없어요.';
  }
  return tournament.formatChangeBlockedReason ? FORMAT_LOCKED_BY_BRACKET : null;
}

/** 여러 단계는 단계 편성과 함께 만들 때만 의미가 있어(서버가 기존 대회에 편성을 붙이는 것을 막는다) 이미 그 형식인 대회에서만 고르게 둔다. */
const canPickStagedFormat = (current: V1TournamentFormat) => current === 'league_knockouts';

function selectableFormats(current: V1TournamentFormat): V1TournamentFormat[] {
  return (Object.keys(TOURNAMENT_FORMAT_NAMES) as V1TournamentFormat[]).filter(
    (format) => format !== 'league_knockouts' || canPickStagedFormat(current),
  );
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
  const formats = selectableFormats(base.format);
  const formatHint = lockReason ?? (canPickStagedFormat(base.format) ? FORMAT_FREE_HINT : `${FORMAT_FREE_HINT} ${STAGED_FORMAT_HINT}`);
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
            maxLength={TOURNAMENT_TITLE_MAX_LENGTH}
          />
          <Field id={infoFieldId('format')} label="진행 방식" hint={formatHint}>
            {(control) => (
              <select
                {...control}
                value={draft.format}
                onChange={(event) => set('format', event.target.value as V1TournamentFormat)}
                disabled={disabled || lockReason !== null}
                className={`${fieldInputCls} ${fieldBorderCls(false)}`}
              >
                {formats.map((format) => (
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
