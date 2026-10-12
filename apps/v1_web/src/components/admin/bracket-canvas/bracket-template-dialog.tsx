'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useV1ApplyBracketTemplate } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import {
  BRACKET_TEMPLATE_MAX_FIXTURES,
  exceedsFixtureLimit,
  groupKnockoutShapes,
  planBracketTemplateCounts,
  recommendedKnockoutSize,
} from '@/lib/bracket-template-counts';
import type { BracketTemplateInput } from '@/types/api';
import { DEFAULT_GROUP_KNOCKOUT_VALUE, GroupKnockoutFields, type GroupKnockoutTemplateValue } from './bracket-group-knockout-fields';

export type BracketTemplateDialogProps = {
  open: boolean;
  tournamentId: string;
  format: 'knockout' | 'league' | 'group_knockout';
  allowSplitBracket?: boolean;
  confirmedTeamCount?: number;
  confirmedTeamCountStatus?: 'pending' | 'success' | 'error';
  hasExistingBracket: boolean;
  onClose: () => void;
  onApplied?: () => void;
  showToast: (message: string, variant?: 'success' | 'error') => void;
};

const TEAM_COUNT_PATTERN = /^\d{1,2}$/;
const KNOCKOUT_SIZES = [4, 8, 12, 16] as const;

function applyGroupShape(current: GroupKnockoutTemplateValue, shape: GroupKnockoutTemplateValue): GroupKnockoutTemplateValue {
  return { ...current, ...shape, qualificationMode: undefined, thirdPlace: shape.groupCount * shape.advancePerGroup === 2 ? false : current.thirdPlace };
}

function templateStagePreview(input: BracketTemplateInput): string {
  if (input.kind === 'knockout') {
    const rounds: Record<4 | 8 | 12 | 16, string[]> = {
      4: ['4강 2경기', '결승 1경기'],
      8: ['8강 4경기', '4강 2경기', '결승 1경기'],
      12: ['12강 4경기', '부전승 4자리', '8강 4경기', '4강 2경기', '결승 1경기'],
      16: ['16강 8경기', '8강 4경기', '4강 2경기', '결승 1경기'],
    };
    return [...rounds[input.size], ...(input.thirdPlace ? ['3·4위전 1경기'] : [])].join(' → ');
  }
  if (input.kind === 'league') {
    const rounds = (input.teamCount % 2 === 0 ? input.teamCount - 1 : input.teamCount) * input.legs;
    return `단일 리그 · ${rounds}라운드 · 라운드마다 ${Math.floor(input.teamCount / 2)}경기`;
  }
  if (input.qualificationMode === 'cross_group_round12') {
    return ['5개 조 · 조별 3라운드', '12강 4경기', '부전승 4자리', '8강 4경기', '4강 2경기', '결승 1경기', ...(input.thirdPlace ? ['3·4위전 1경기'] : [])].join(' → ');
  }
  const finalists = input.groupCount * input.advancePerGroup;
  const finals: Record<number, string[]> = {
    2: ['결승 1경기'],
    4: ['4강 2경기', '결승 1경기'],
    8: ['8강 4경기', '4강 2경기', '결승 1경기'],
    16: ['16강 8경기', '8강 4경기', '4강 2경기', '결승 1경기'],
  };
  const groupRounds = (input.teamsPerGroup % 2 === 0 ? input.teamsPerGroup - 1 : input.teamsPerGroup) * input.legs;
  return [`${input.groupCount}개 조 · 조별 ${groupRounds}라운드`, ...finals[finalists], ...(input.thirdPlace ? ['3·4위전 1경기'] : [])].join(' → ');
}

function radioRow(id: string, name: string, label: string, checked: boolean, onChange: () => void, disabled = false) {
  return (
    <label key={id} htmlFor={id} className="tm-text-label flex min-h-[44px] items-center gap-2" style={{ color: disabled ? 'var(--text-muted)' : 'var(--text-strong)' }}>
      <input id={id} type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} className="size-5" />
      {label}
    </label>
  );
}

export function BracketTemplateDialog({ open, tournamentId, format, allowSplitBracket = false, confirmedTeamCount = 0, confirmedTeamCountStatus = 'success', hasExistingBracket, onClose, onApplied, showToast }: BracketTemplateDialogProps) {
  const idPrefix = useId();
  const apply = useV1ApplyBracketTemplate(tournamentId);
  const { confirm, ConfirmModal } = useConfirm();
  const { dialogRef, onBackdropClick, mounted, closing } = useModalA11y({ open, onClose, pending: apply.isPending });
  const defaultTeamCount = format === 'league' ? 6 : 8;
  const initialTeamCount = confirmedTeamCountStatus !== 'success'
    ? ''
    : String(confirmedTeamCount > 0 ? confirmedTeamCount : defaultTeamCount);
  const initialTeamCountValue = initialTeamCount === '' ? defaultTeamCount : Number(initialTeamCount);
  const draftTouchedRef = useRef(false);
  const wasOpenRef = useRef(open);
  const previousConfirmedCountRef = useRef(confirmedTeamCount);
  const previousConfirmedStatusRef = useRef(confirmedTeamCountStatus);
  const [size, setSize] = useState<4 | 8 | 12 | 16>(() => recommendedKnockoutSize(confirmedTeamCount) ?? 8);
  const [thirdPlace, setThirdPlace] = useState(true);
  const [teamCountText, setTeamCountText] = useState(initialTeamCount);
  const [legs, setLegs] = useState<1 | 2>(1);
  const [groupKnockout, setGroupKnockout] = useState<GroupKnockoutTemplateValue>(() => {
    return { ...DEFAULT_GROUP_KNOCKOUT_VALUE, ...(groupKnockoutShapes(initialTeamCountValue)[0] ?? {}) };
  });

  useEffect(() => {
    const opening = open && !wasOpenRef.current;
    const confirmedCountChanged = previousConfirmedCountRef.current !== confirmedTeamCount;
    const confirmedStatusChanged = previousConfirmedStatusRef.current !== confirmedTeamCountStatus;
    wasOpenRef.current = open;
    previousConfirmedCountRef.current = confirmedTeamCount;
    previousConfirmedStatusRef.current = confirmedTeamCountStatus;
    if (!open) return;

    if (opening) draftTouchedRef.current = false;
    if (!opening && ((!confirmedCountChanged && !confirmedStatusChanged) || draftTouchedRef.current)) return;

    const nextTeamCount = confirmedTeamCount > 0 ? confirmedTeamCount : defaultTeamCount;
    setTeamCountText(confirmedTeamCountStatus === 'success' ? String(nextTeamCount) : '');
    if (confirmedTeamCountStatus !== 'success') return;
    const nextKnockoutSize = recommendedKnockoutSize(nextTeamCount);
    if (nextKnockoutSize !== null) setSize(nextKnockoutSize);
    if (format === 'group_knockout') {
      const nextGroupShape = groupKnockoutShapes(nextTeamCount)[0];
      if (nextGroupShape) setGroupKnockout((current) => applyGroupShape(current, { ...current, ...nextGroupShape }));
    }
  }, [confirmedTeamCount, confirmedTeamCountStatus, defaultTeamCount, format, open]);

  const teamCount = TEAM_COUNT_PATTERN.test(teamCountText) ? Number(teamCountText) : null;
  const teamCountValid = teamCount !== null && teamCount >= 3 && teamCount <= 20;
  const groupTeamCountValid = teamCount !== null && teamCount >= 6 && teamCount <= 48;
  const knockoutRecommendation = teamCount === null ? null : recommendedKnockoutSize(teamCount);
  const knockoutTeamCountSupported = knockoutRecommendation !== null;
  const groupShapes = teamCount === null ? [] : groupKnockoutShapes(teamCount);
  const groupShape = groupShapes.find((shape) => shape.groupCount === groupKnockout.groupCount && shape.teamsPerGroup === groupKnockout.teamsPerGroup && shape.advancePerGroup === groupKnockout.advancePerGroup) ?? null;
  const input: BracketTemplateInput | null =
    format === 'knockout'
      ? knockoutTeamCountSupported && size === teamCount
        ? { kind: 'knockout', size, thirdPlace }
        : null
      : format === 'group_knockout'
        ? groupKnockout.qualificationMode === 'cross_group_round12'
          ? teamCount === 20 ? {
              kind: 'group_knockout',
              groupCount: groupKnockout.groupCount,
              teamsPerGroup: groupKnockout.teamsPerGroup,
              advancePerGroup: groupKnockout.advancePerGroup,
              legs: groupKnockout.legs,
              thirdPlace: groupKnockout.thirdPlace,
              qualificationMode: 'cross_group_round12',
            } : null
          : groupTeamCountValid && groupShape !== null
            ? {
                kind: 'group_knockout',
                ...groupShape,
                legs: groupKnockout.legs,
                thirdPlace: groupKnockout.thirdPlace,
                ...(allowSplitBracket && groupKnockout.lowerBracket ? { lowerBracket: true } : {}),
              }
            : null
        : teamCountValid
          ? { kind: 'league', teamCount, legs }
          : null;
  const counts = input === null ? null : planBracketTemplateCounts(input);
  const tooLarge = counts !== null && exceedsFixtureLimit(counts);
  const canSubmit = confirmedTeamCountStatus === 'success' && input !== null && counts !== null && !tooLarge;

  const handleSubmit = async () => {
    if (input === null || !canSubmit) return;
    if (hasExistingBracket) {
      const ok = await confirm({
        title: '기존 대진 교체',
        message: '기존 대진이 모두 삭제되고 새로 만들어져요. 이미 시작했거나 결과가 있는 경기가 있으면 교체할 수 없어요. 계속할까요?',
        confirmLabel: '교체',
        tone: 'danger',
      });
      if (!ok) return;
    }
    apply.mutate(hasExistingBracket ? { ...input, replaceExisting: true } : input, {
      onSuccess: (result) => {
        showToast(`경기 ${result.fixtures}개와 자리 ${result.slots}개를 만들었어요.`, 'success');
        onApplied?.();
        onClose();
      },
      onError: (error) => showToast(describeBracketCanvasError(error, '대진을 만들지 못했어요.'), 'error'),
    });
  };

  if (!mounted) return ConfirmModal;
  const titleId = `${idPrefix}-title`;

  return (
    <>
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px] tm-modal-scrim${closing ? ' is-closing' : ''}`}
        onClick={onBackdropClick}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`tm-modal-panel flex max-h-[calc(100dvh-32px)] w-full max-w-[440px] flex-col overflow-hidden bg-[var(--card-surface)] shadow-[var(--shadow-dropdown)]${closing ? ' is-closing' : ''}`}
          style={{ borderRadius: 'var(--radius-hero)' }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <h2 id={titleId} className="tm-text-body-lg font-bold" style={{ color: 'var(--text-strong)' }}>
              템플릿으로 대진 만들기
            </h2>
            <button
              type="button"
              aria-label="모달 닫기"
              onClick={() => !apply.isPending && onClose()}
              disabled={apply.isPending}
              className="flex size-11 items-center justify-center transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-40"
              style={{ borderRadius: 'var(--radius-control)', color: 'var(--text-muted)' }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
            <div className="flex flex-col gap-4">
            {hasExistingBracket ? (
              <p className="tm-text-caption" style={{ color: 'var(--orange700)' }}>
                이미 대진이 있어요. 만들면 기존 대진이 모두 지워지고 새로 만들어져요.
              </p>
            ) : null}

            {confirmedTeamCountStatus === 'pending' ? (
              <p role="status" className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>확정 참가팀 수를 불러오는 중이에요. 잠시 후 다시 시도해 주세요.</p>
            ) : confirmedTeamCountStatus === 'error' ? (
              <p role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>확정 참가팀 수를 불러오지 못했어요. 참가팀 목록을 다시 불러온 뒤 대진을 만들어 주세요.</p>
            ) : null}

            {format === 'knockout' ? (
              <>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${idPrefix}-teams`} className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>참가 팀 수</label>
                  <input id={`${idPrefix}-teams`} type="text" inputMode="numeric" maxLength={2} value={teamCountText} onChange={(event) => {
                    draftTouchedRef.current = true;
                    setTeamCountText(event.target.value);
                    const nextCount = /^\d{1,2}$/.test(event.target.value) ? Number(event.target.value) : null;
                    const recommendation = nextCount === null ? null : recommendedKnockoutSize(nextCount);
                    if (recommendation !== null) setSize(recommendation);
                  }} className="tm-input" style={{ minHeight: 44 }} />
                  {knockoutRecommendation === null ? (
                    <p role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>녹아웃 템플릿은 참가팀 수가 정확히 4·8·12·16팀일 때만 만들 수 있어요. 다른 인원은 대진을 직접 편성해 주세요.</p>
                  ) : confirmedTeamCount > 0 && teamCount !== confirmedTeamCount ? (
                    <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>확정 참가팀은 {confirmedTeamCount}팀이에요. 템플릿 팀 수를 실제 참가 인원에 맞춰 확인해 주세요.</p>
                  ) : null}
                </div>
                <fieldset className="flex flex-col">
                  <legend className="tm-text-label mb-1 font-semibold" style={{ color: 'var(--text-strong)' }}>팀 수</legend>
                  {KNOCKOUT_SIZES.map((value) => radioRow(`${idPrefix}-size-${value}`, `${idPrefix}-size`, `${value}팀 대진 틀${value !== teamCount ? ' · 참가팀 수와 다름' : ''}`, size === value && value === teamCount, () => { draftTouchedRef.current = true; setSize(value); }, value !== teamCount))}
                  {knockoutRecommendation !== null ? (
                    <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                      참가팀 수와 같은 {knockoutRecommendation}팀 대진 틀을 사용해요.
                    </p>
                  ) : null}
                  {size === 12 ? (
                    <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                      12강은 8팀이 12강을 치르고, 4팀은 부전승으로 8강에 올라가요.
                    </p>
                  ) : null}
                </fieldset>
                <label htmlFor={`${idPrefix}-third`} className="tm-text-label flex min-h-[44px] items-center gap-2" style={{ color: 'var(--text-strong)' }}>
                  <input id={`${idPrefix}-third`} type="checkbox" checked={thirdPlace} onChange={(event) => { draftTouchedRef.current = true; setThirdPlace(event.target.checked); }} className="size-5" />
                  3·4위전도 만들기
                </label>
              </>
            ) : format === 'group_knockout' ? (
              <>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${idPrefix}-teams`} className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>참가 팀 수</label>
                  <input id={`${idPrefix}-teams`} type="text" inputMode="numeric" maxLength={2} value={teamCountText} onChange={(event) => {
                    draftTouchedRef.current = true;
                    setTeamCountText(event.target.value);
                    const nextCount = /^\d{1,2}$/.test(event.target.value) ? Number(event.target.value) : null;
                    const shapes = nextCount === null ? [] : groupKnockoutShapes(nextCount);
                    if (shapes[0]) setGroupKnockout((current) => applyGroupShape(current, { ...current, ...shapes[0] }));
                  }} className="tm-input" style={{ minHeight: 44 }} />
                  {confirmedTeamCount > 0 && teamCount !== confirmedTeamCount ? (
                    <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>확정 참가팀은 {confirmedTeamCount}팀이에요. 참가 인원과 구성을 확인해 주세요.</p>
                  ) : null}
                </div>
                {groupKnockout.qualificationMode === 'cross_group_round12' ? (
                  <p className="tm-text-caption text-[var(--text-muted)]">5개 조 × 조당 4팀 · 조 간 성적 비교로 12팀 진출</p>
                ) : groupShapes.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${idPrefix}-group-shape`} className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>가능한 조 편성</label>
                    <select id={`${idPrefix}-group-shape`} className="tm-input" style={{ minHeight: 44 }} value={groupShape ? `${groupShape.groupCount}:${groupShape.teamsPerGroup}:${groupShape.advancePerGroup}` : ''} onChange={(event) => {
                      const shape = groupShapes.find((item) => `${item.groupCount}:${item.teamsPerGroup}:${item.advancePerGroup}` === event.target.value);
                      if (shape) {
                        draftTouchedRef.current = true;
                        setGroupKnockout((current) => applyGroupShape(current, { ...current, ...shape }));
                      }
                    }}>
                      {groupShapes.map((shape) => <option key={`${shape.groupCount}:${shape.teamsPerGroup}:${shape.advancePerGroup}`} value={`${shape.groupCount}:${shape.teamsPerGroup}:${shape.advancePerGroup}`}>{`${shape.groupCount}개 조 × 조당 ${shape.teamsPerGroup}팀 · 조 ${shape.advancePerGroup}위까지 · 결선 ${shape.groupCount * shape.advancePerGroup}팀`}</option>)}
                    </select>
                  </div>
                ) : (
                  <p role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>현재 지원 범위(2~8개 조, 조당 3~6팀, 결선 2·4·8·16팀)에 맞는 조 편성이 없어요. 팀 수를 바꾸거나 녹아웃 템플릿을 선택해 주세요.</p>
                )}
                 <GroupKnockoutFields value={groupKnockout} onChange={(value) => { draftTouchedRef.current = true; setGroupKnockout(value); setTeamCountText(String(value.groupCount * value.teamsPerGroup)); }} disabled={apply.isPending} lockShape allowLowerBracket={allowSplitBracket} />
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${idPrefix}-teams`} className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>팀 수</label>
                  <input
                    id={`${idPrefix}-teams`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={teamCountText}
                    onChange={(event) => { draftTouchedRef.current = true; setTeamCountText(event.target.value); }}
                    className="tm-input"
                    style={{ minHeight: 44 }}
                  />
                  {!teamCountValid ? (
                    <p role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>팀 수는 3팀부터 20팀까지 정할 수 있어요.</p>
                  ) : null}
                </div>
                <fieldset className="flex flex-col">
                  <legend className="tm-text-label mb-1 font-semibold" style={{ color: 'var(--text-strong)' }}>회전 수</legend>
                  {radioRow(`${idPrefix}-legs-1`, `${idPrefix}-legs`, '1회전', legs === 1, () => { draftTouchedRef.current = true; setLegs(1); })}
                  {radioRow(`${idPrefix}-legs-2`, `${idPrefix}-legs`, '2회전', legs === 2, () => { draftTouchedRef.current = true; setLegs(2); })}
                </fieldset>
              </>
            )}

            {counts !== null && input !== null ? (
              <div className="flex flex-col gap-1">
                <p className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>
                  {counts.edges > 0 ? `경기 ${counts.fixtures}개 · 자리 ${counts.slots}개 · 연결 ${counts.edges}개` : `경기 ${counts.fixtures}개 · 자리 ${counts.slots}개`}
                </p>
                <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>진행 순서: {templateStagePreview(input)}</p>
              </div>
            ) : null}
            {tooLarge ? (
              <p role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>
                {`경기가 ${BRACKET_TEMPLATE_MAX_FIXTURES}개를 넘어서 만들 수 없어요. 팀 수나 회전 수를 줄여 주세요.`}
              </p>
            ) : null}
            </div>
          </div>

          <div className="flex shrink-0 gap-2 px-5 pb-5">
            <Button type="button" variant="neutral" size="md" className="flex-1" onClick={onClose} disabled={apply.isPending}>
              취소
            </Button>
            <Button type="button" variant="primary" size="md" className="flex-1" disabled={!canSubmit} loading={apply.isPending} onClick={() => void handleSubmit()}>
              대진 만들기
            </Button>
          </div>
        </div>
      </div>
      {ConfirmModal}
    </>
  );
}
