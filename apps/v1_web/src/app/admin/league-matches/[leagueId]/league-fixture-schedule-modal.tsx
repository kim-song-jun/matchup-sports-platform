'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1LeagueFixture } from '@/types/league-match';
import { isoToKstDatetimeLocal, kstDatetimeLocalToIso } from '@/lib/kst-calendar';

/** 서버 PATCH 본문 — 바뀐 필드만 담는다. */
export interface LeagueFixtureSchedulePatch {
  startsAt?: string;
  placeName?: string;
  placeAddress?: string;
}

const fieldClass =
  'h-[44px] w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

/**
 * 한 경기의 일정(일시·구장·주소) 수정. 대진 표는 이제 일정 위주로 읽기만 하고, 고치는 일은 행의 ⋯ 에서
 * 이 모달로 한다 — 표 안 입력칸이 열 폭을 먹고 탭만 지나가도 저장이 나가던 자리를 한 번의 명시적
 * 저장으로 바꾼 것이다. 값이 그대로면 저장 버튼이 눌리지 않아 불필요한 쓰기가 나가지 않는다.
 */
export function LeagueFixtureScheduleModal({
  fixture,
  matchupLabel,
  isSubmitting,
  onSubmit,
  onClose,
}: {
  fixture: V1LeagueFixture;
  matchupLabel: string;
  isSubmitting: boolean;
  onSubmit: (patch: LeagueFixtureSchedulePatch) => Promise<unknown>;
  onClose: () => void;
}) {
  const startsAtId = useId();
  const placeNameId = useId();
  const placeAddressId = useId();
  const initialStartsAt = isoToKstDatetimeLocal(fixture.startAt);
  const initialPlaceAddress = fixture.placeAddress ?? '';
  const [startsAtLocal, setStartsAtLocal] = useState(initialStartsAt);
  const [placeName, setPlaceName] = useState(fixture.placeName);
  const [placeAddress, setPlaceAddress] = useState(initialPlaceAddress);
  const [error, setError] = useState<string | null>(null);
  // 제출 중 ESC·배경 클릭으로 닫히면 요청은 날아가는데 화면은 사라져 저장 여부를 알 수 없다.
  const { dialogRef, onBackdropClick } = useModalA11y<HTMLElement, HTMLDivElement>({
    open: true,
    onClose,
    pending: isSubmitting,
  });

  const changed = {
    startAt: startsAtLocal !== initialStartsAt,
    placeName: placeName !== fixture.placeName,
    placeAddress: placeAddress !== initialPlaceAddress,
  };
  const dirty = changed.startAt || changed.placeName || changed.placeAddress;

  const submit = async () => {
    if (isSubmitting || !dirty) return;
    setError(null);
    const patch: LeagueFixtureSchedulePatch = {};
    if (changed.startAt) {
      const startsAt = kstDatetimeLocalToIso(startsAtLocal);
      if (startsAt === null) {
        setError('경기 시작 일시를 입력해 주세요.');
        return;
      }
      patch.startsAt = startsAt;
    }
    if (changed.placeName) patch.placeName = placeName;
    if (changed.placeAddress) patch.placeAddress = placeAddress;
    try {
      await onSubmit(patch);
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err, '일정을 저장하지 못했어요.'));
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
        aria-label="일정 수정"
        className="flex max-h-[90vh] w-full max-w-[440px] flex-col gap-4 overflow-y-auto rounded-t-2xl bg-[var(--card-surface)] p-5 sm:rounded-2xl"
      >
        <div>
          <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">일정 수정</h2>
          <p className="mt-0.5 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
            {matchupLabel} · {fixture.title}
          </p>
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
        <div>
          <label htmlFor={placeNameId} className="mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
            구장
          </label>
          <input id={placeNameId} value={placeName} onChange={(e) => setPlaceName(e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label htmlFor={placeAddressId} className="mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
            주소 <span className="font-normal text-[var(--text-muted)]">(선택)</span>
          </label>
          <input
            id={placeAddressId}
            value={placeAddress}
            onChange={(e) => setPlaceAddress(e.target.value)}
            placeholder="상세 주소"
            className={fieldClass}
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
