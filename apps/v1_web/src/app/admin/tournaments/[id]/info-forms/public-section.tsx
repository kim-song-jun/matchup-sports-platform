'use client';

import { useImperativeHandle } from 'react';
import {
  PrizeBreakdownEditor,
  createPrizeRowId,
  serializeTournamentPrizeRows,
  type TournamentPrizeRow,
} from '@/components/admin/tournaments/prize-breakdown-editor';
import { TournamentImagesField } from '@/components/admin/tournaments/tournament-images-field';
import { useV1MasterSports, useV1UploadImages } from '@/hooks/use-v1-api';
import { formatAmountNumber } from '@/lib/date-utils';
import { parsePrizeRows, prizeCategoryOf } from '@/lib/prize-breakdown';
import { saveStep } from '@/lib/sequential-save';
import type { V1Tournament, V1UpdateTournamentPayload } from '@/types/api';
import { DEFAULT_BADGE, Field, FormGroup, OPTIONAL_BADGE, fieldBorderCls, fieldTextareaCls, infoFieldId, textOrNull, useSectionDraft } from './form-kit';
import type { InfoSectionDefinition, InfoSectionFormProps, InfoSummaryRow } from './types';

const RULES_TEXT_MAX_LENGTH = 10_000;
const REFUND_POLICY_MAX_LENGTH = 2_000;
const PRIZE_SUMMARY_MAX_LENGTH = 500;

interface PublicDraft {
  coverImageUrl: string | null;
  listImageUrl: string | null;
  showDetailImage: boolean;
  prizePool: string;
  prizeSummary: string;
  prizeRows: TournamentPrizeRow[];
  rulesText: string;
  refundPolicyText: string;
}

const toDraft = (tournament: V1Tournament): PublicDraft => ({
  coverImageUrl: tournament.coverImageUrl ?? null,
  listImageUrl: tournament.listImageUrl ?? null,
  showDetailImage: tournament.showDetailImage ?? true,
  prizePool: tournament.prizePool === null || tournament.prizePool === undefined ? '' : String(tournament.prizePool),
  prizeSummary: tournament.prizeSummary ?? '',
  prizeRows: parsePrizeRows(tournament.prizeBreakdown ?? '').map((row) => ({
    id: createPrizeRowId(),
    label: row.label,
    category: prizeCategoryOf(row),
    value: row.amount,
  })),
  rulesText: tournament.rulesText ?? '',
  refundPolicyText: tournament.refundPolicyText ?? '',
});

/** 저장할 때의 꼴 — 처음 값도 같은 방식으로 정리해 견줘야 옛 글 꼴 상금을 열기만 한 것이 「바뀜」 이 되지 않는다. */
const prizePayload = (draft: PublicDraft) => ({
  prizePool: draft.prizePool === '' ? null : Number(draft.prizePool),
  prizeSummary: textOrNull(draft.prizeSummary),
  prizeBreakdown: serializeTournamentPrizeRows(draft.prizeRows) || null,
});

function PublicForm({ base, disabled, ref, onDirtyChange, onBusyChange }: InfoSectionFormProps) {
  const { draft, initial, set } = useSectionDraft(base, toDraft, onDirtyChange);
  const { data: sports } = useV1MasterSports();
  const uploadImages = useV1UploadImages();

  useImperativeHandle(ref, () => ({
    buildSteps(ctx) {
      const changes: Omit<V1UpdateTournamentPayload, 'expectedVersion'> = {};
      if (draft.coverImageUrl !== initial.coverImageUrl) changes.coverImageUrl = draft.coverImageUrl;
      if (draft.listImageUrl !== initial.listImageUrl) changes.listImageUrl = draft.listImageUrl;
      if (draft.showDetailImage !== initial.showDetailImage) changes.showDetailImage = draft.showDetailImage;

      const prize = prizePayload(draft);
      if (JSON.stringify(prize) !== JSON.stringify(prizePayload(initial))) Object.assign(changes, prize);

      const rulesText = textOrNull(draft.rulesText);
      if (rulesText !== (base.rulesText ?? null)) changes.rulesText = rulesText;
      const refundPolicyText = textOrNull(draft.refundPolicyText);
      if (refundPolicyText !== (base.refundPolicyText ?? null)) changes.refundPolicyText = refundPolicyText;

      if (Object.keys(changes).length === 0) return { ok: true, steps: [] };
      return { ok: true, steps: [saveStep('public', '공개 화면', changes, () => ctx.patchTournament(changes))] };
    },
  }));

  return (
    <div>
      <FormGroup title="이미지">
        <TournamentImagesField
          coverImageUrl={draft.coverImageUrl}
          listImageUrl={draft.listImageUrl}
          showDetailImage={draft.showDetailImage}
          sportName={sports?.find((sport) => sport.id === base.sportId)?.name}
          onImageChange={(field, value) => set(field, value)}
          onVisibilityChange={(visible) => set('showDetailImage', visible)}
          onUpload={async (file) => {
            const { urls } = await uploadImages.mutateAsync(file);
            if (!urls[0]) throw new Error('업로드된 이미지 URL을 받지 못했어요.');
            return urls[0];
          }}
          onUploadingChange={onBusyChange}
          disabled={disabled}
        />
      </FormGroup>

      <FormGroup title="상금과 시상" hint="대회 페이지의 상금 카드에 그대로 보여요.">
        <div className="flex flex-col gap-4">
          <PrizeBreakdownEditor
            rows={draft.prizeRows}
            onChange={(rows) => set('prizeRows', rows)}
            prizePool={draft.prizePool}
            onPrizePoolChange={(value) => set('prizePool', value)}
            disabled={disabled}
          />
          <Field id={infoFieldId('prizeSummary')} label="상금과 시상 요약">
            {(control) => (
              <textarea
                {...control}
                value={draft.prizeSummary}
                onChange={(event) => set('prizeSummary', event.target.value)}
                disabled={disabled}
                rows={2}
                maxLength={PRIZE_SUMMARY_MAX_LENGTH}
                placeholder="예: 우승팀 현금 100만원 + 트로피"
                className={`${fieldTextareaCls} ${fieldBorderCls(false)}`}
              />
            )}
          </Field>
        </div>
      </FormGroup>

      <FormGroup title="규정과 환불">
        <div className="flex flex-col gap-4">
          <Field id={infoFieldId('rulesText')} label="대회 규정" hint="참가 자격·경기 방식처럼 긴 글도 그대로 붙여 넣을 수 있어요.">
            {(control) => (
              <textarea
                {...control}
                value={draft.rulesText}
                onChange={(event) => set('rulesText', event.target.value)}
                disabled={disabled}
                rows={10}
                maxLength={RULES_TEXT_MAX_LENGTH}
                className={`${fieldTextareaCls} ${fieldBorderCls(false)}`}
              />
            )}
          </Field>
          <Field id={infoFieldId('refundPolicyText')} label="환불 정책" hint="입금 안내와 환불 기준을 적어요.">
            {(control) => (
              <textarea
                {...control}
                value={draft.refundPolicyText}
                onChange={(event) => set('refundPolicyText', event.target.value)}
                disabled={disabled}
                rows={6}
                maxLength={REFUND_POLICY_MAX_LENGTH}
                className={`${fieldTextareaCls} ${fieldBorderCls(false)}`}
              />
            )}
          </Field>
        </div>
      </FormGroup>
    </div>
  );
}

const EMPTY_ROW = { value: '비어 있음', badge: OPTIONAL_BADGE } as const;
const firstLine = (text: string) => text.trim().split('\n')[0];

export const publicSection: InfoSectionDefinition = {
  key: 'public',
  rows({ tournament }) {
    const hasOwnImage = Boolean(tournament.coverImageUrl || tournament.listImageUrl);
    const hidden = tournament.showDetailImage === false;
    const image: InfoSummaryRow = hasOwnImage
      ? { key: 'image', label: '이미지', value: '직접 올린 이미지', ...(hidden ? { note: '상세 화면에서는 숨김' } : {}) }
      : {
          key: 'image',
          label: '이미지',
          value: '목록·상세 모두 종목 기본 이미지',
          badge: DEFAULT_BADGE,
          ...(hidden ? { note: '상세 화면에서는 숨김' } : {}),
        };
    const prize = tournament.prizeSummary?.trim()
      || ((tournament.prizePool ?? 0) > 0 ? `총상금 ${formatAmountNumber(tournament.prizePool ?? 0)}원` : '')
      || (tournament.prizeBreakdown?.trim() ? '시상 항목을 적어 뒀어요' : '');
    return [
      image,
      prize ? { key: 'prize', label: '상금과 시상', value: prize } : { key: 'prize', label: '상금과 시상', ...EMPTY_ROW },
      tournament.rulesText?.trim()
        ? { key: 'rulesText', label: '대회 규정', value: firstLine(tournament.rulesText) }
        : { key: 'rulesText', label: '대회 규정', ...EMPTY_ROW },
      tournament.refundPolicyText?.trim()
        ? { key: 'refundPolicyText', label: '환불 정책', value: firstLine(tournament.refundPolicyText) }
        : { key: 'refundPolicyText', label: '환불 정책', ...EMPTY_ROW },
    ];
  },
  Form: PublicForm,
};
