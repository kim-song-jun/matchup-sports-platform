'use client';

import { useImperativeHandle, useState } from 'react';
import { PromoCardFields, type TournamentPromoCardValue } from '@/components/admin/tournaments/promo-card-fields';
import { useV1MasterSports, useV1UploadImages } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { saveStep } from '@/lib/sequential-save';
import { resolveTournamentImage } from '@/lib/tournament-promo';
import { PROMO_FACT_KEYS, buildTournamentPromoFactDefaults } from '@/lib/tournament-promo-defaults';
import type { V1Tournament, V1UpdateTournamentPayload } from '@/types/api';
import { FormGroup, useSectionDraft } from './form-kit';
import type { InfoSectionDefinition, InfoSectionFormProps, InfoSummaryRow } from './types';

const SLOTS = [
  { slot: 'home', prefix: 'promoHome', title: '홈 오늘의 추천' },
  { slot: 'list', prefix: 'promoList', title: '대회 목록 상단' },
] as const;
type Slot = (typeof SLOTS)[number]['slot'];
type Prefix = (typeof SLOTS)[number]['prefix'];

const TEXT_FIELDS = [
  ['title', 'Title'],
  ['subtitle', 'Subtitle'],
  ['imageUrl', 'ImageUrl'],
  ['badgeText', 'BadgeText'],
  ['dateText', 'DateText'],
  ['teamsText', 'TeamsText'],
  ['locationText', 'LocationText'],
  ['prizeText', 'PrizeText'],
] as const;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PRIORITY_ERROR = '우선순위는 숫자로 입력해 주세요.';

type PromoDraft = Record<Slot, TournamentPromoCardValue>;

function cardOf(tournament: V1Tournament, prefix: Prefix): TournamentPromoCardValue {
  const texts = Object.fromEntries(TEXT_FIELDS.map(([key, suffix]) => [key, tournament[`${prefix}${suffix}`] ?? ''])) as Pick<
    TournamentPromoCardValue,
    (typeof TEXT_FIELDS)[number][0]
  >;
  return { ...texts, enabled: tournament[`${prefix}Enabled`] ?? false, priority: String(tournament[`${prefix}Priority`] ?? 0) };
}

const toDraft = (tournament: V1Tournament): PromoDraft => ({
  home: cardOf(tournament, 'promoHome'),
  list: cardOf(tournament, 'promoList'),
});

function PromoForm({ base, disabled, ref, onDirtyChange, onBusyChange }: InfoSectionFormProps) {
  const { draft, initial, set } = useSectionDraft(base, toDraft, onDirtyChange);
  const { data: sports } = useV1MasterSports();
  const uploadImages = useV1UploadImages();
  const [uploadingSlot, setUploadingSlot] = useState<Slot | null>(null);
  const [imageError, setImageError] = useState<{ slot: Slot; message: string } | null>(null);
  const [priorityErrorSlot, setPriorityErrorSlot] = useState<Slot | null>(null);

  const factDefaults = buildTournamentPromoFactDefaults({
    scheduledAt: base.scheduledAt,
    scheduledEndAt: base.scheduledEndAt,
    venue: base.venue,
    prizePool: base.prizePool === null || base.prizePool === undefined ? null : String(base.prizePool),
    prizeSummary: base.prizeSummary,
  });
  const fallback = {
    title: base.title,
    venue: base.venue ?? null,
    sportName: sports?.find((sport) => sport.id === base.sportId)?.name ?? null,
  };

  useImperativeHandle(ref, () => ({
    buildSteps(ctx) {
      const changes: Omit<V1UpdateTournamentPayload, 'expectedVersion'> = {};
      for (const { slot, prefix } of SLOTS) {
        const card = draft[slot];
        const saved = initial[slot];
        if (!/^\d+$/.test(card.priority.trim())) {
          setPriorityErrorSlot(slot);
          return { ok: false, message: PRIORITY_ERROR, fieldId: `promo-${slot}-card` };
        }
        if (card.enabled !== saved.enabled) changes[`${prefix}Enabled`] = card.enabled;
        // 글 칸은 서버가 null 을 받지 않는다 — 비운 칸은 빈 문자열로 보낸다.
        for (const [key, suffix] of TEXT_FIELDS) {
          if (card[key].trim() !== saved[key].trim()) changes[`${prefix}${suffix}`] = card[key].trim();
        }
        if (Number(card.priority) !== Number(saved.priority)) changes[`${prefix}Priority`] = Number(card.priority);
      }
      if (Object.keys(changes).length === 0) return { ok: true, steps: [] };
      return { ok: true, steps: [saveStep('promo', '홍보', changes, () => ctx.patchTournament(changes))] };
    },
  }));

  const selectImage = async (slot: Slot, file: File) => {
    if (!file.type.startsWith('image/')) {
      setImageError({ slot, message: '이미지 파일만 첨부할 수 있어요.' });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError({ slot, message: '이미지는 5MB 이하로 첨부해 주세요.' });
      return;
    }
    setImageError(null);
    setUploadingSlot(slot);
    onBusyChange(true);
    try {
      const { urls } = await uploadImages.mutateAsync(file);
      if (!urls[0]) {
        setImageError({ slot, message: '업로드된 이미지 URL을 받지 못했어요.' });
        return;
      }
      set(slot, { ...draft[slot], imageUrl: urls[0] });
    } catch (error) {
      setImageError({ slot, message: extractErrorMessage(error, '이미지 업로드에 실패했어요.') });
    } finally {
      setUploadingSlot(null);
      onBusyChange(false);
    }
  };

  return (
    <div>
      <p className="pt-2 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
        비운 제목은 대회명이 대신 나와요. 날짜·장소·상금은 「다시 채우기」 로 넣어요.
      </p>
      {SLOTS.map(({ slot }) => {
        const card = draft[slot];
        const other = slot === 'home' ? 'list' : 'home';
        return (
          <FormGroup key={slot}>
            <div id={`promo-${slot}-card`} tabIndex={-1} className="flex flex-col gap-2 focus:outline-none">
              <PromoCardFields
                variant={slot}
                collapsible
                value={card}
                onChange={(value) => {
                  set(slot, value);
                  if (priorityErrorSlot === slot) setPriorityErrorSlot(null);
                }}
                fallback={fallback}
                onSelectImage={(file) => void selectImage(slot, file)}
                uploading={uploadingSlot === slot}
                disabled={disabled || uploadingSlot !== null}
                priorityError={priorityErrorSlot === slot ? PRIORITY_ERROR : undefined}
                onResetFacts={() => set(slot, { ...card, ...factDefaults })}
                canResetFacts={PROMO_FACT_KEYS.some((key) => card[key] !== factDefaults[key])}
                // 이 자리를 비웠을 때 실제로 나올 이미지 — 자기 자리를 뺀 폴백 결과를 넘겨야 미리보기가 공개 화면과 같다.
                defaultImageUrl={resolveTournamentImage(
                  {
                    coverImageUrl: base.coverImageUrl,
                    listImageUrl: base.listImageUrl,
                    promoHomeImageUrl: slot === 'home' ? null : draft[other].imageUrl,
                    promoListImageUrl: slot === 'list' ? null : draft[other].imageUrl,
                  },
                  slot,
                )}
              />
              {imageError?.slot === slot ? (
                <p role="alert" className="text-[length:var(--font-size-caption)] text-[var(--red700)]">{imageError.message}</p>
              ) : null}
            </div>
          </FormGroup>
        );
      })}
    </div>
  );
}

export const promoSection: InfoSectionDefinition = {
  key: 'promo',
  rows({ tournament }) {
    return SLOTS.map(({ slot, prefix, title }): InfoSummaryRow => {
      if (!tournament[`${prefix}Enabled`]) return { key: slot, label: title, value: '', badge: { tone: 'off', text: '꺼짐' } };
      return { key: slot, label: title, value: `켜짐 · ${tournament[`${prefix}Title`]?.trim() || '대회명 사용'}` };
    });
  },
  Form: PromoForm,
};
