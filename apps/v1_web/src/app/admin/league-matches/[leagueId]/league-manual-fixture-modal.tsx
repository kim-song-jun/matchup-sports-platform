'use client';

import { useState } from 'react';
import { EntityPicker, type EntityPickerItem } from '@/components/admin/entity-picker';
import { fromDatetimeLocalValue } from '@/components/team-schedules/team-schedules.view-model';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1CreateManualLeagueFixturePayload } from '@/types/league-match';

/**
 * 리그에 **한 경기만** 추가하는 모달(사용자 B안, 2026-09-04 — 전체화면 모달 + EntityPicker 재사용).
 *
 * ## 왜 필요한가
 * 지금까지 리그 경기는 **라운드로빈 일괄 생성**으로만 만들 수 있었다. 그래서 우천 순연으로
 * 한 경기를 다시 잡거나, 대체 경기를 끼워 넣는 일이 화면에서 불가능했다 — BE 는
 * `POST …/fixtures/manual` 을 진작에 갖고 있었는데 **부르는 화면이 없었다**(FE 호출 0건).
 *
 * ## 검증을 화면에서 먼저 한다
 * 서버도 막지만, 저장 순간에야 알면 운영자는 무엇이 틀렸는지 폼을 다시 훑어야 한다.
 * 여기서 막는 것: 두 팀 미선택 · **같은 팀끼리** · 시작 일시 없음/형식 오류.
 * 종료 시각은 받지 않는다 — **시작보다 이른 종료를 만들 수 있는 입력을 애초에 두지 않는다**
 * (서버 DTO 도 같은 이유로 `durationMinutes` 만 받는다).
 */
export function LeagueManualFixtureModal({
  teams,
  isSubmitting,
  onSubmit,
  onClose,
}: {
  /** 리그 참가팀. 홈·어웨이 후보는 여기서만 고른다 — 리그 밖 팀은 서버가 거부한다. */
  teams: EntityPickerItem[];
  isSubmitting: boolean;
  /**
   * **계약 타입을 그대로 쓴다** — 인라인으로 다시 적으면 서버 DTO 가 바뀌었을 때
   * 이 모달만 옛 모양으로 남아도 타입이 잡아 주지 않는다.
   */
  onSubmit: (payload: V1CreateManualLeagueFixturePayload) => Promise<unknown>;
  onClose: () => void;
}) {
  const [home, setHome] = useState<EntityPickerItem | null>(null);
  const [away, setAway] = useState<EntityPickerItem | null>(null);
  const [startsAtLocal, setStartsAtLocal] = useState('');
  const [duration, setDuration] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  // ESC·focus trap·body 스크롤 잠금은 어드민 모달 공용 훅이 담당한다. **`pending` 을 넘기는
  // 것이 핵심** — 제출 중 ESC 로 닫히면 요청은 날아가는데 화면은 사라져, 운영자는 경기가
  // 만들어졌는지 알 수 없고 입력도 잃는다.
  // `initialFocusRef` 는 안 쓴다 — 훅이 패널 안 첫 focusable(홈 팀 입력)로 폴백한다.
  // `onBackdropClick` 도 안 쓴다: 이 모달은 **전체화면**이라 backdrop 이 없고, 배경처럼
  // 보이는 영역이 곧 패널이다. 붙이면 폼 여백을 클릭한 것이 닫기가 된다.
  const { dialogRef } = useModalA11y({
    open: true,
    onClose,
    pending: isSubmitting,
  });

  const submit = async () => {
    if (isSubmitting) return;
    setError(null);
    if (home === null || away === null) {
      setError('홈 팀과 어웨이 팀을 모두 골라 주세요.');
      return;
    }
    if (home.id === away.id) {
      // 서버도 막지만, 두 칸에 같은 팀이 들어간 것은 **화면에서 보이는 실수**라 여기서 잡는다.
      setError('같은 팀끼리는 경기를 만들 수 없어요.');
      return;
    }
    const startsAt = fromDatetimeLocalValue(startsAtLocal);
    if (startsAt === undefined) {
      setError('경기 시작 일시를 입력해 주세요.');
      return;
    }
    const trimmedDuration = duration.trim();
    if (trimmedDuration !== '' && !/^\d{1,3}$/.test(trimmedDuration)) {
      // `type="number"` 는 `e`·`-` 를 badInput 으로 보고 값을 빈 문자열로 준다 — 화면엔
      // 글자가 보이는데 코드는 "미입력" 으로 읽는다(등번호에서 겪은 것과 같은 자리).
      setError('경기 시간은 숫자(분)로 입력해 주세요.');
      return;
    }
    const durationMinutes = trimmedDuration === '' ? undefined : Number(trimmedDuration);
    if (durationMinutes !== undefined && (durationMinutes < 1 || durationMinutes > 600)) {
      setError('경기 시간은 1분에서 600분 사이로 입력해 주세요.');
      return;
    }
    try {
      await onSubmit({
        homeTeamId: home.id,
        awayTeamId: away.id,
        startsAt,
        ...(durationMinutes === undefined ? {} : { durationMinutes }),
        ...(placeName.trim() === '' ? {} : { placeName: placeName.trim() }),
      });
      onClose();
    } catch (err) {
      // 레포 표준 — axios 에러의 서버 메시지를 먼저 꺼낸다. `err.message` 만 보면
      // "Request failed with status code 409" 같은 문자열이 그대로 운영자에게 간다.
      setError(extractErrorMessage(err, '경기를 만들지 못했어요.'));
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-fixture-heading"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--surface)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <h2 id="manual-fixture-heading" className="text-base font-semibold text-[var(--text-strong)]">
          경기 하나 추가
        </h2>
        <button
          type="button"
          onClick={onClose}
          // 제출 중에는 취소 버튼과 **같이** 잠근다. 한쪽만 잠그면 운영자는 잠긴 버튼 옆의
          // 안 잠긴 버튼을 눌러 같은 이탈을 하게 된다.
          disabled={isSubmitting}
          aria-label="닫기"
          className="tm-btn tm-btn-sm tm-btn-ghost"
          style={{ minHeight: 44, minWidth: 44 }}
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p className="mb-4 text-xs text-[var(--text-muted)]">
          라운드로빈 일괄 생성과 별개로 한 경기만 만들어요. 우천 순연 재편성이나 대체 경기에 써요.
        </p>

        <div className="mb-4">
          <label htmlFor="manual-fixture-home" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">
            홈 팀
          </label>
          <EntityPicker
            id="manual-fixture-home"
            value={home}
            onChange={setHome}
            items={teams}
            placeholder="참가팀에서 고르기"
            emptyText="참가팀이 없어요"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="manual-fixture-away" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">
            어웨이 팀
          </label>
          <EntityPicker
            id="manual-fixture-away"
            value={away}
            onChange={setAway}
            items={teams}
            placeholder="참가팀에서 고르기"
            emptyText="참가팀이 없어요"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="manual-fixture-starts-at" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">
            시작 일시
          </label>
          <input
            id="manual-fixture-starts-at"
            type="datetime-local"
            value={startsAtLocal}
            onChange={(event) => setStartsAtLocal(event.target.value)}
            className="tm-input min-h-[44px] w-full"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="manual-fixture-duration" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">
            경기 시간(분)
          </label>
          {/* 종료 시각을 직접 받지 않는다 — 시작보다 이른 종료를 만들 수 있는 입력을 두지 않는다. */}
          <input
            id="manual-fixture-duration"
            type="text"
            inputMode="numeric"
            maxLength={3}
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            placeholder="비우면 종료 시각 없이 만들어요"
            className="tm-input min-h-[44px] w-full"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="manual-fixture-place" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">
            장소
          </label>
          <input
            id="manual-fixture-place"
            type="text"
            maxLength={100}
            value={placeName}
            onChange={(event) => setPlaceName(event.target.value)}
            placeholder="예: 성산 풋살파크 A구장"
            className="tm-input min-h-[44px] w-full"
          />
        </div>

        {error !== null && (
          <p role="alert" className="text-xs text-[var(--red700)]">
            {error}
          </p>
        )}
      </div>

      <div className="flex gap-2 border-t border-[var(--border)] px-5 py-4">
        <button
          type="button"
          onClick={onClose}
          className="tm-btn tm-btn-md tm-btn-neutral flex-1"
          style={{ minHeight: 44 }}
          disabled={isSubmitting}
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          className="tm-btn tm-btn-md tm-btn-primary flex-1"
          style={{ minHeight: 44 }}
          disabled={isSubmitting}
        >
          {isSubmitting ? '만드는 중…' : '경기 만들기'}
        </button>
      </div>
    </div>
  );
}
