'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AdminPageHeader, AdminToasts, useAdminToast } from '@/components/admin';
import { RegistrationsTab } from '@/app/admin/tournaments/[id]/registrations-tab';
import { useV1AdminLeagueMatch, useV1OpenLeagueRegistration } from '@/hooks/use-v1-api';
import { describeLeagueRegistrationWindow } from '@/lib/league-registration-copy';
import { extractErrorMessage } from '@/lib/error-message';
import { fromDatetimeLocalValue } from '@/components/team-schedules/team-schedules.view-model';

/**
 * 리그 참가 신청 관리 — **신청 열기(마감 지정) + 신청 목록**. 사용자 A안(Task 164 FE-3).
 *
 * ## 왜 별도 화면인가
 * 리그 대진 화면(`league-match-fixtures-client.tsx`)은 이미 1,400줄이 넘고 관심사가 대진이다.
 * 목록으로 쓰는 대회 `RegistrationsTab` 은 훅을 여덟 개 넘게 써서, 대진 화면에 인라인으로
 * 넣으면 그 화면의 기존 테스트가 전부 그 훅들을 목킹해야 한다(실제로 30건이 깨졌다).
 *
 * ## 목록을 재사용해도 되는 이유
 * 어드민 신청 API 는 이미 리그를 받는다(`ALL_COMPETITION_KINDS`) — 명단 표면과 달리 여긴
 * 처음부터 막혀 있지 않았다. 그래서 리그 id 를 그대로 넘기면 된다.
 *
 * ## 없던 것은 "신청을 여는 화면" 이었다
 * BE 는 `POST /admin/league-matches/:leagueId/open-registration` 을 갖고 있었는데 그걸 부르는
 * 프론트 코드가 **0건**이라(2026-09-04 실측), 리그 신청을 여는 방법이 API 직접 호출뿐이었다.
 */
export default function LeagueRegistrationsClient({ leagueId }: { leagueId: string }) {
  const { toasts, showToast } = useAdminToast();
  const { data: league } = useV1AdminLeagueMatch(leagueId);
  const [deadline, setDeadline] = useState('');
  const openRegistration = useV1OpenLeagueRegistration(leagueId);

  const state = league?.state ?? 'draft';
  const registrationOpen = league?.registrationOpen ?? false;
  const registrationDeadlineAt = league?.registrationDeadlineAt ?? null;

  const submit = () => {
    if (deadline.trim() === '') {
      showToast('신청 마감 일시를 입력해 주세요.', 'error');
      return;
    }
    // `datetime-local` → ISO 변환은 **공용 헬퍼**를 쓴다. 이 변환은 타임존이 걸린
    // 자리라(입력은 로컬 벽시계, 저장은 UTC) 화면마다 따로 구현하면 한 곳만 고쳐진다.
    const iso = fromDatetimeLocalValue(deadline);
    if (iso === undefined) {
      showToast('신청 마감 일시를 읽을 수 없어요.', 'error');
      return;
    }
    const at = new Date(iso);
    // 지난 시각으로 열면 **여는 즉시 닫힌 리그**가 된다.
    //
    // **서버와 같은 부등호를 쓴다(`<=`).** 서버는 `deadline <= now` 를 422
    // `LEAGUE_REGISTRATION_DEADLINE_PAST` 로 막는다(`league-match-admin.service.ts`) —
    // 여기서 `<` 를 쓰면 **마감이 지금과 정확히 같은 순간**에만 화면은 통과시키고 서버가
    // 거부해, 운영자는 값을 바꾸지 않았는데 실패를 본다. (앞서 공개 판정에서 고친 것과
    // 방향만 반대인 같은 부류다.)
    if (at.getTime() <= Date.now()) {
      showToast('신청 마감은 지금 이후여야 해요.', 'error');
      return;
    }
    openRegistration.mutate(
      { registrationDeadlineAt: iso },
      {
        onSuccess: () => showToast('참가 신청을 열었어요.', 'success'),
        onError: (error) => showToast(extractErrorMessage(error, '참가 신청을 열지 못했어요.'), 'error'),
      },
    );
  };

  return (
    <div className="pb-12">
      <AdminPageHeader
        title="참가 신청 관리"
        description={league?.title ?? '리그'}
        action={
          <Link
            href={`/admin/league-matches/${leagueId}`}
            className="tm-btn tm-btn-sm tm-btn-outline"
            style={{ minHeight: 44 }}
          >
            리그로 돌아가기
          </Link>
        }
      />

      <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-[var(--text-strong)]">신청 받기</p>
          {registrationOpen ? (
            <span className="tm-badge tm-badge-blue">모집 중</span>
          ) : (
            <span className="tm-badge tm-badge-grey">신청 안 받는 중</span>
          )}
        </div>
        {/* **판정자는 마감 하나이고, 닫힌 이유는 `state` 가 가른다.** 대진 화면의 요약
            카드와 같은 문장이라 판정을 `describeLeagueRegistrationWindow` 한 곳에 뒀다 —
            각자 갖고 있으면 한쪽만 고쳐진다(실제로 그랬다). */}
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          {describeLeagueRegistrationWindow({
            state,
            registrationOpen,
            registrationDeadlineAt,
            noDeadlineHint:
              '마감을 정해야 신청을 받아요. 정하기 전에는 팀장 화면에 신청 입구가 보이지 않아요.',
          })}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-[var(--text-muted)]" htmlFor="league-registration-deadline">
            신청 마감
            <input
              id="league-registration-deadline"
              type="datetime-local"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              className="mt-1 block min-h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)]"
            />
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={openRegistration.isPending}
            className="tm-btn tm-btn-sm tm-btn-primary"
            style={{ minHeight: 44 }}
          >
            {registrationOpen ? '마감 변경' : '신청 열기'}
          </button>
        </div>
      </div>

      {/* `requireCancelReason` — 정규 리그는 거부 사유가 필수다(D9). 서버가
          `LEAGUE_CANCEL_REASON_REQUIRED` 로 막는데 화면이 사유를 안 받아서, 그동안
          **어드민이 리그 신청을 거부할 방법이 아예 없었다.** 대회 화면은 이 값을 안 넘겨
          기존 계약(선택)이 그대로 유지된다. */}
      <RegistrationsTab tournamentId={leagueId} showToast={showToast} canWrite requireCancelReason />
      <AdminToasts toasts={toasts} />
    </div>
  );
}
