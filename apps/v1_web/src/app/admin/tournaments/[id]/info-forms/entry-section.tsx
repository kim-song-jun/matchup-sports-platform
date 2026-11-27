'use client';

import { useImperativeHandle } from 'react';
import { formatEntryFee } from '@/lib/date-utils';
import { formatWithComma, onlyDigits } from '@/lib/number-format';
import { saveStep } from '@/lib/sequential-save';
import type { V1Tournament, V1UpdateTournamentPayload } from '@/types/api';
import {
  DEFAULT_BADGE,
  FormGroup,
  NEEDED_BADGE,
  TextField,
  infoFieldId,
  requiredNeedKeys,
  textOrNull,
  useSectionDraft,
} from './form-kit';
import type { InfoSectionDefinition, InfoSectionFormProps, InfoSummaryRow } from './types';

const MAX_ENTRY_FEE = 100_000_000;
const QUOTA_FIELDS = [
  ['genderMinMale', '남성 최소'],
  ['genderMaxMale', '남성 최대'],
  ['genderMinFemale', '여성 최소'],
  ['genderMaxFemale', '여성 최대'],
] as const;
type QuotaKey = (typeof QUOTA_FIELDS)[number][0];
const BANK_FIELDS = [
  ['bankName', '은행명', 20],
  ['bankAccount', '계좌번호', 30],
  ['bankHolder', '예금주', 20],
] as const;

interface EntryDraft {
  teamCount: string;
  minMatchesPerTeam: string;
  minPlayers: string;
  maxPlayers: string;
  entryFee: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  quotaOn: boolean;
  genderMinMale: string;
  genderMaxMale: string;
  genderMinFemale: string;
  genderMaxFemale: string;
}

const numberText = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value));
/** 숫자만 받는 칸의 값 — 빈 칸은 null. */
const numberOrNull = (value: string): number | null => (value === '' ? null : Number(value));
const inRange = (value: number | null, min: number, max: number): value is number =>
  value !== null && Number.isInteger(value) && value >= min && value <= max;

const toDraft = (tournament: V1Tournament): EntryDraft => ({
  teamCount: String(tournament.teamCount),
  minMatchesPerTeam: numberText(tournament.minMatchesPerTeam),
  minPlayers: String(tournament.minPlayers),
  maxPlayers: numberText(tournament.maxPlayers),
  entryFee: String(tournament.entryFee),
  bankName: tournament.bankName ?? '',
  bankAccount: tournament.bankAccount ?? '',
  bankHolder: tournament.bankHolder ?? '',
  quotaOn: QUOTA_FIELDS.some(([key]) => tournament[key] !== null),
  genderMinMale: numberText(tournament.genderMinMale),
  genderMaxMale: numberText(tournament.genderMaxMale),
  genderMinFemale: numberText(tournament.genderMinFemale),
  genderMaxFemale: numberText(tournament.genderMaxFemale),
});

function EntryForm({ base, disabled, ref, onDirtyChange }: InfoSectionFormProps) {
  const { draft, set, fail, errorFor } = useSectionDraft(base, toDraft, onDirtyChange);
  const staged = Boolean(base.stagePlan);
  const isLeague = base.format === 'league';
  const isMixed = base.genderCategory === 'mixed';
  const paid = Number(draft.entryFee) > 0;
  const id = (field: keyof EntryDraft) => infoFieldId(field);
  const setDigits = (field: Exclude<keyof EntryDraft, 'quotaOn'>) => (value: string) => set(field, onlyDigits(value));

  useImperativeHandle(ref, () => ({
    buildSteps(ctx) {
      const changes: Omit<V1UpdateTournamentPayload, 'expectedVersion'> = {};

      if (!staged) {
        const teamCount = numberOrNull(draft.teamCount);
        const noUpperLimit = base.format === 'league_knockouts';
        if (!inRange(teamCount, 2, noUpperLimit ? Number.MAX_SAFE_INTEGER : 64)) {
          return fail(id('teamCount'), noUpperLimit ? '팀 수는 2 이상으로 입력해 주세요.' : '팀 수는 2~64 사이로 입력해 주세요.');
        }
        if (teamCount !== base.teamCount) changes.teamCount = teamCount;
      }

      if (isLeague) {
        const minMatches = numberOrNull(draft.minMatchesPerTeam);
        if (minMatches !== null && !inRange(minMatches, 1, 50)) {
          return fail(id('minMatchesPerTeam'), '팀당 최소 경기 수는 1~50 사이로 입력해 주세요.');
        }
        if (minMatches !== (base.minMatchesPerTeam ?? null)) changes.minMatchesPerTeam = minMatches;
      }

      const minPlayers = numberOrNull(draft.minPlayers);
      const maxPlayers = numberOrNull(draft.maxPlayers);
      // 최대 인원 제한이 없는 채로 온 대회는 비워 두면 그대로 둔다 — 서버는 이 칸을 null 로 받지 않는다.
      const maxUnlimited = maxPlayers === null && base.maxPlayers === null;
      if (!inRange(minPlayers, 1, 50) || (!maxUnlimited && (!inRange(maxPlayers, 1, 50) || minPlayers > maxPlayers))) {
        const minInvalid = !inRange(minPlayers, 1, 50);
        return fail(id(minInvalid ? 'minPlayers' : 'maxPlayers'), '명단 인원은 1~50명이고, 최소가 최대보다 클 수 없어요.');
      }
      if (minPlayers !== base.minPlayers) changes.minPlayers = minPlayers;
      if (maxPlayers !== null && maxPlayers !== base.maxPlayers) changes.maxPlayers = maxPlayers;

      const entryFee = numberOrNull(draft.entryFee);
      if (!inRange(entryFee, 0, MAX_ENTRY_FEE)) return fail(id('entryFee'), '참가비는 0원~1억 원 사이로 입력해 주세요.');
      if (entryFee !== base.entryFee) changes.entryFee = entryFee;

      // 무료면 계좌는 건드리지 않는다 — 적어 둔 계좌가 무료 전환 한 번으로 지워지지 않게.
      if (entryFee > 0) {
        for (const [key] of BANK_FIELDS) {
          const value = textOrNull(draft[key]);
          if (value !== (base[key] ?? null)) changes[key] = value;
        }
      }

      if (isMixed) {
        const quota = Object.fromEntries(
          QUOTA_FIELDS.map(([key]) => [key, draft.quotaOn ? numberOrNull(draft[key]) : null]),
        ) as Record<QuotaKey, number | null>;
        const cap = maxPlayers ?? Number.MAX_SAFE_INTEGER;
        const invalid =
          Object.values(quota).some((value) => value !== null && !inRange(value, 0, 50)) ||
          (quota.genderMinMale !== null && quota.genderMaxMale !== null && quota.genderMinMale > quota.genderMaxMale) ||
          (quota.genderMinFemale !== null && quota.genderMaxFemale !== null && quota.genderMinFemale > quota.genderMaxFemale) ||
          (quota.genderMinMale ?? 0) + (quota.genderMinFemale ?? 0) > cap ||
          (quota.genderMaxMale ?? 0) > cap ||
          (quota.genderMaxFemale ?? 0) > cap;
        if (invalid) return fail(id('genderMinMale'), '혼성 명단의 최소·최대 인원 조건을 다시 확인해 주세요.');
        for (const [key] of QUOTA_FIELDS) {
          if (quota[key] !== base[key]) changes[key] = quota[key];
        }
      }

      if (Object.keys(changes).length === 0) return { ok: true, steps: [] };
      return { ok: true, steps: [saveStep('entry', '참가', changes, () => ctx.patchTournament(changes))] };
    },
  }));

  return (
    <div>
      <FormGroup title="팀">
        <div className="flex flex-col gap-4">
          <TextField
            id={id('teamCount')}
            label="팀 수"
            unit="팀"
            inputMode="numeric"
            value={draft.teamCount}
            onChange={setDigits('teamCount')}
            disabled={disabled || staged}
            hint={staged ? '단계 편성의 정원 합계라 여기서는 바꿀 수 없어요.' : undefined}
            error={errorFor(id('teamCount'))}
          />
          {isLeague ? (
            <TextField
              id={id('minMatchesPerTeam')}
              label="팀당 최소 경기 수"
              unit="경기"
              inputMode="numeric"
              value={draft.minMatchesPerTeam}
              onChange={setDigits('minMatchesPerTeam')}
              disabled={disabled}
              hint="비우면 따로 확인하지 않아요."
              error={errorFor(id('minMatchesPerTeam'))}
            />
          ) : null}
        </div>
      </FormGroup>

      <FormGroup title="명단 인원" hint="한 팀이 신청할 때 등록하는 선수 수예요.">
        <div className="grid grid-cols-2 gap-3">
          <TextField
            id={id('minPlayers')}
            label="명단 최소 인원"
            unit="명"
            inputMode="numeric"
            value={draft.minPlayers}
            onChange={setDigits('minPlayers')}
            disabled={disabled}
            error={errorFor(id('minPlayers'))}
          />
          <TextField
            id={id('maxPlayers')}
            label="명단 최대 인원"
            unit="명"
            inputMode="numeric"
            value={draft.maxPlayers}
            onChange={setDigits('maxPlayers')}
            disabled={disabled}
            placeholder={base.maxPlayers === null ? '제한 없음' : undefined}
            error={errorFor(id('maxPlayers'))}
          />
        </div>
      </FormGroup>

      <FormGroup title="참가비">
        <div className="flex flex-col gap-4">
          <TextField
            id={id('entryFee')}
            label="참가비"
            unit="원"
            inputMode="numeric"
            value={formatWithComma(draft.entryFee)}
            onChange={setDigits('entryFee')}
            disabled={disabled}
            hint="0 이면 무료 대회예요."
            error={errorFor(id('entryFee'))}
          />
          <fieldset className="min-w-0">
            <legend className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">정산 계좌</legend>
            <p className="mt-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
              {paid ? '신청한 팀에게 입금할 곳으로 보여요.' : '참가비를 넣으면 적을 수 있어요.'}
            </p>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {BANK_FIELDS.map(([key, label, maxLength]) => (
                <TextField
                  key={key}
                  id={id(key)}
                  label={label}
                  value={draft[key]}
                  onChange={(value) => set(key, value)}
                  disabled={disabled || !paid}
                  maxLength={maxLength}
                />
              ))}
            </div>
          </fieldset>
        </div>
      </FormGroup>

      {isMixed ? (
        <FormGroup>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-strong)]">혼성 쿼터</p>
              <p className="mt-0.5 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">명단에 넣을 남녀 인원을 정해요. 비운 칸은 제한이 없어요.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.quotaOn}
              aria-label="혼성 쿼터"
              onClick={() => set('quotaOn', !draft.quotaOn)}
              disabled={disabled}
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50"
            >
              <span aria-hidden="true" className={`tm-toggle ${draft.quotaOn ? 'tm-toggle-on' : ''}`} />
            </button>
          </div>
          {draft.quotaOn ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {QUOTA_FIELDS.map(([key, label]) => (
                <TextField
                  key={key}
                  id={id(key)}
                  label={label}
                  unit="명"
                  inputMode="numeric"
                  value={draft[key]}
                  onChange={setDigits(key)}
                  disabled={disabled}
                  placeholder="제한 없음"
                  error={key === 'genderMinMale' ? errorFor(id('genderMinMale')) : undefined}
                />
              ))}
            </div>
          ) : null}
        </FormGroup>
      ) : null}
    </div>
  );
}

function quotaText(label: string, min: number | null, max: number | null): string | null {
  if (min !== null && max !== null) return `${label} ${min}~${max}명`;
  if (min !== null) return `${label} ${min}명 이상`;
  if (max !== null) return `${label} ${max}명 이하`;
  return null;
}

export const entrySection: InfoSectionDefinition = {
  key: 'entry',
  rows({ tournament }) {
    const rows: InfoSummaryRow[] = [
      { key: 'teamCount', label: '팀 수', value: `${tournament.teamCount}팀`, note: `지금 신청 ${tournament.registrationCount}팀` },
    ];
    if (tournament.format === 'league') {
      rows.push({
        key: 'minMatchesPerTeam',
        label: '팀당 최소 경기 수',
        value: tournament.minMatchesPerTeam === null ? '확인하지 않음' : `${tournament.minMatchesPerTeam}경기`,
      });
    }
    rows.push(
      {
        key: 'players',
        label: '명단 인원',
        value: `최소 ${tournament.minPlayers}명 · ${tournament.maxPlayers === null ? '최대 제한 없음' : `최대 ${tournament.maxPlayers}명`}`,
      },
      { key: 'entryFee', label: '참가비', value: formatEntryFee(tournament.entryFee) },
    );
    if (tournament.entryFee === 0) {
      rows.push({ key: 'bank', label: '정산 계좌', value: '무료 대회라 필요 없어요' });
    } else if (tournament.bankAccount?.trim()) {
      const holder = tournament.bankHolder?.trim() ? ` (${tournament.bankHolder.trim()})` : '';
      rows.push({ key: 'bank', label: '정산 계좌', value: `${[tournament.bankName, tournament.bankAccount].filter(Boolean).join(' ')}${holder}` });
    } else {
      rows.push({
        key: 'bank',
        label: '정산 계좌',
        value: '없음',
        ...(requiredNeedKeys(tournament).has('bank-account') ? { badge: NEEDED_BADGE } : {}),
      });
    }
    if (tournament.genderCategory === 'mixed') {
      const quota = [
        quotaText('남성', tournament.genderMinMale, tournament.genderMaxMale),
        quotaText('여성', tournament.genderMinFemale, tournament.genderMaxFemale),
      ].filter((text): text is string => text !== null);
      rows.push(
        quota.length > 0
          ? { key: 'quota', label: '혼성 쿼터', value: quota.join(' · ') }
          : { key: 'quota', label: '혼성 쿼터', value: '제한 없음', badge: DEFAULT_BADGE },
      );
    }
    return rows;
  },
  Form: EntryForm,
};
