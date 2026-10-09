'use client';

import { X } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useV1ApplyBracketTemplate } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import {
  BRACKET_TEMPLATE_MAX_FIXTURES,
  exceedsFixtureLimit,
  planBracketTemplateCounts,
} from '@/lib/bracket-template-counts';
import type { BracketTemplateInput } from '@/types/api';

export type BracketTemplateDialogProps = {
  open: boolean;
  tournamentId: string;
  format: 'knockout' | 'league';
  hasExistingBracket: boolean;
  onClose: () => void;
  showToast: (message: string, variant?: 'success' | 'error') => void;
};

const TEAM_COUNT_PATTERN = /^\d{1,2}$/;
const KNOCKOUT_SIZES = [4, 8, 12, 16] as const;

function radioRow(id: string, name: string, label: string, checked: boolean, onChange: () => void) {
  return (
    <label key={id} htmlFor={id} className="tm-text-label flex min-h-[44px] items-center gap-2" style={{ color: 'var(--text-strong)' }}>
      <input id={id} type="radio" name={name} checked={checked} onChange={onChange} className="size-5" />
      {label}
    </label>
  );
}

export function BracketTemplateDialog({ open, tournamentId, format, hasExistingBracket, onClose, showToast }: BracketTemplateDialogProps) {
  const idPrefix = useId();
  const apply = useV1ApplyBracketTemplate(tournamentId);
  const { confirm, ConfirmModal } = useConfirm();
  const { dialogRef, onBackdropClick, mounted, closing } = useModalA11y({ open, onClose, pending: apply.isPending });
  const [size, setSize] = useState<4 | 8 | 12 | 16>(8);
  const [thirdPlace, setThirdPlace] = useState(true);
  const [teamCountText, setTeamCountText] = useState('6');
  const [legs, setLegs] = useState<1 | 2>(1);

  const teamCount = TEAM_COUNT_PATTERN.test(teamCountText) ? Number(teamCountText) : null;
  const teamCountValid = teamCount !== null && teamCount >= 3 && teamCount <= 20;
  const input: BracketTemplateInput | null =
    format === 'knockout'
      ? { kind: 'knockout', size, thirdPlace }
      : teamCountValid
        ? { kind: 'league', teamCount, legs }
        : null;
  const counts = input === null ? null : planBracketTemplateCounts(input);
  const tooLarge = counts !== null && exceedsFixtureLimit(counts);
  const canSubmit = input !== null && counts !== null && !tooLarge;

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
          className={`tm-modal-panel w-full max-w-[440px] overflow-hidden bg-[var(--card-surface)] shadow-[var(--shadow-dropdown)]${closing ? ' is-closing' : ''}`}
          style={{ borderRadius: 'var(--radius-hero)' }}
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
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

          <div className="flex flex-col gap-4 px-5 py-5">
            {hasExistingBracket ? (
              <p className="tm-text-caption" style={{ color: 'var(--orange700)' }}>
                이미 대진이 있어요. 만들면 기존 대진이 모두 지워지고 새로 만들어져요.
              </p>
            ) : null}

            {format === 'knockout' ? (
              <>
                <fieldset className="flex flex-col">
                  <legend className="tm-text-label mb-1 font-semibold" style={{ color: 'var(--text-strong)' }}>팀 수</legend>
                  {KNOCKOUT_SIZES.map((value) => radioRow(`${idPrefix}-size-${value}`, `${idPrefix}-size`, `${value}팀`, size === value, () => setSize(value)))}
                  {size === 12 ? (
                    <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                      12강은 8팀이 12강을 치르고, 4팀은 부전승으로 8강에 올라가요.
                    </p>
                  ) : null}
                </fieldset>
                <label htmlFor={`${idPrefix}-third`} className="tm-text-label flex min-h-[44px] items-center gap-2" style={{ color: 'var(--text-strong)' }}>
                  <input id={`${idPrefix}-third`} type="checkbox" checked={thirdPlace} onChange={(event) => setThirdPlace(event.target.checked)} className="size-5" />
                  3·4위전도 만들기
                </label>
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
                    onChange={(event) => setTeamCountText(event.target.value)}
                    className="tm-input"
                    style={{ minHeight: 44 }}
                  />
                  {!teamCountValid ? (
                    <p role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>팀 수는 3팀부터 20팀까지 정할 수 있어요.</p>
                  ) : null}
                </div>
                <fieldset className="flex flex-col">
                  <legend className="tm-text-label mb-1 font-semibold" style={{ color: 'var(--text-strong)' }}>회전 수</legend>
                  {radioRow(`${idPrefix}-legs-1`, `${idPrefix}-legs`, '1회전', legs === 1, () => setLegs(1))}
                  {radioRow(`${idPrefix}-legs-2`, `${idPrefix}-legs`, '2회전', legs === 2, () => setLegs(2))}
                </fieldset>
              </>
            )}

            {counts !== null ? (
              <p className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>
                {counts.edges > 0 ? `경기 ${counts.fixtures}개 · 자리 ${counts.slots}개 · 연결 ${counts.edges}개` : `경기 ${counts.fixtures}개 · 자리 ${counts.slots}개`}
              </p>
            ) : null}
            {tooLarge ? (
              <p role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>
                {`경기가 ${BRACKET_TEMPLATE_MAX_FIXTURES}개를 넘어서 만들 수 없어요. 팀 수나 회전 수를 줄여 주세요.`}
              </p>
            ) : null}
          </div>

          <div className="flex gap-2 px-5 pb-5">
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
