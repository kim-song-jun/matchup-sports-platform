'use client';

import { useId, useState } from 'react';
import { MapPin } from 'lucide-react';
import { PlacePicker } from '@/components/v1-ui/place-picker';
import { SectionTitle } from '@/components/v1-ui/primitives';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useV1UpdateLeagueVenue } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { placeFromView, toVenuePayload, type PlaceValue } from '@/lib/place';
import type { V1PlaceView } from '@/types/api';

const OUTLINE_BUTTON =
  'tm-text-body-sm inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--border-strong)] px-4 font-semibold text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const PRIMARY_BUTTON =
  'tm-text-body-sm inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl bg-[var(--blue500)] px-4 font-semibold text-white transition-colors hover:bg-[var(--blue600)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

type Feedback = { kind: 'saved' } | { kind: 'error'; message: string } | null;

/**
 * 리그 기본 장소 — 새로 만드는 경기가 상속한다. 바꿔도 이미 만든 경기는 그대로라
 * 경기별 장소는 일정 수정 모달에서 따로 바꾼다.
 */
export function LeagueVenueControl({
  leagueId,
  defaultPlace,
  recentVenues,
}: {
  leagueId: string;
  defaultPlace: V1PlaceView | null;
  recentVenues?: ReadonlyArray<V1PlaceView>;
}) {
  const headingId = useId();
  const canWrite = useAdminCanWrite();
  const save = useV1UpdateLeagueVenue(leagueId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PlaceValue | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const startEditing = () => {
    setFeedback(null);
    setDraft(placeFromView(defaultPlace));
    setEditing(true);
  };

  const submit = (body: Parameters<typeof save.mutate>[0]) => {
    setFeedback(null);
    save.mutate(body, {
      onSuccess: () => {
        setEditing(false);
        setFeedback({ kind: 'saved' });
      },
      onError: (err) => setFeedback({ kind: 'error', message: extractErrorMessage(err, '기본 장소를 저장하지 못했어요.') }),
    });
  };

  return (
    <section
      aria-labelledby={headingId}
      className="mb-6 flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4"
    >
      <SectionTitle title="기본 장소" id={headingId} compact />
      <p className="tm-text-body-sm text-[var(--text-muted)]">
        새로 만드는 경기가 이 장소를 이어받아요. 이미 만든 경기는 바뀌지 않아요.
      </p>
      {editing ? (
        <div className="flex flex-col gap-3">
          <PlacePicker
            label="기본 장소"
            value={draft}
            onChange={setDraft}
            recentVenues={recentVenues}
            disabled={save.isPending}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={draft === null || save.isPending}
              onClick={() => draft && submit(toVenuePayload(draft))}
            >
              {save.isPending ? '저장 중…' : '저장'}
            </button>
            <button type="button" className={OUTLINE_BUTTON} disabled={save.isPending} onClick={() => setEditing(false)}>
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            <MapPin size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
            {defaultPlace ? (
              <div className="min-w-0">
                <p className="tm-text-body-sm font-semibold text-[var(--text-strong)]">{defaultPlace.name}</p>
                {defaultPlace.address ? (
                  <p className="tm-text-caption text-[var(--text-muted)]">{defaultPlace.address}</p>
                ) : null}
              </div>
            ) : (
              <p className="tm-text-body-sm text-[var(--text-muted)]">기본 장소가 없어요</p>
            )}
          </div>
          {canWrite ? (
            <div className="flex shrink-0 gap-2">
              <button type="button" className={OUTLINE_BUTTON} disabled={save.isPending} onClick={startEditing}>
                {defaultPlace ? '바꾸기' : '장소 정하기'}
              </button>
              {defaultPlace ? (
                <button
                  type="button"
                  className={`${OUTLINE_BUTTON} text-[var(--text-muted)]`}
                  disabled={save.isPending}
                  onClick={() => submit({ venue: null })}
                >
                  지우기
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {feedback?.kind === 'saved' && (
        <p role="status" className="tm-text-body-sm text-[var(--green700)]">기본 장소를 저장했어요.</p>
      )}
      {feedback?.kind === 'error' && (
        <p role="alert" className="tm-text-body-sm text-[var(--red700)]">{feedback.message}</p>
      )}
    </section>
  );
}
