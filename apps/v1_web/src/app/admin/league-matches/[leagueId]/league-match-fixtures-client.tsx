'use client';

import { useState } from 'react';
import { AdminPageHeader, AdminDataTable, AdminReasonModal, AdminStatusPill, AdminTableSkeleton, AdminToasts, useAdminToast } from '@/components/admin';
import { GateConfirmModal } from '@/components/admin/operation-flag-gate-confirm-modal';
import {
  useV1AdminLeagueMatch,
  useV1AdminLeagueTeams,
  useV1AdminTeam,
  useV1CancelLeagueFixture,
  useV1GenerateLeagueFixtures,
  useV1RecordLeagueForfeit,
  useV1RegenerateLeagueFixtures,
  useV1UpdateLeagueFixture,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { fromDatetimeLocalValue, toDatetimeLocalValue } from '@/components/team-schedules/team-schedules.view-model';
import { RecentVenueChips } from '@/components/v1-ui/create-form-fields';
import type { V1LeagueFixture } from '@/types/league-match';

const inputClass =
  'h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

const WEEKDAY_OPTIONS = [
  { value: 0, label: '일요일' },
  { value: 1, label: '월요일' },
  { value: 2, label: '화요일' },
  { value: 3, label: '수요일' },
  { value: 4, label: '목요일' },
  { value: 5, label: '금요일' },
  { value: 6, label: '토요일' },
];

export default function LeagueMatchFixturesClient({ leagueId }: { leagueId: string }) {
  const { data: series, isPending, isError, error, refetch } = useV1AdminLeagueMatch(leagueId);
  const generateFixtures = useV1GenerateLeagueFixtures(leagueId);
  const updateFixture = useV1UpdateLeagueFixture(leagueId);
  const cancelFixture = useV1CancelLeagueFixture(leagueId);
  const regenerateFixtures = useV1RegenerateLeagueFixtures(leagueId);
  const { data: teamsData } = useV1AdminLeagueTeams(leagueId);
  const recordForfeit = useV1RecordLeagueForfeit(leagueId);
  const { toasts, showToast } = useAdminToast();

  // 몰수패 처리 모달(R11) — 어느 대진을 처리 중인지만 들고, 팀 이름은 모달이 열릴 때만
  // useV1AdminTeam으로 조회한다(표 전체에 대해 팀마다 조회하지 않는다 — N+1 방지).
  const [forfeitFixture, setForfeitFixture] = useState<V1LeagueFixture | null>(null);
  const forfeitHostTeam = useV1AdminTeam(forfeitFixture?.homeTeamId ?? '');
  const forfeitAwayTeam = useV1AdminTeam(forfeitFixture?.awayTeamId ?? '');
  const [weeksCount, setWeeksCount] = useState(7);
  const [dayOfWeek, setDayOfWeek] = useState<number | ''>('');
  const [time, setTime] = useState('18:00');
  const [placeName, setPlaceName] = useState('');
  // R12: 취소 확인 대상 대진. null이면 모달을 닫는다.
  const [cancelTarget, setCancelTarget] = useState<V1LeagueFixture | null>(null);
  // R13: 대진 재생성 확인 모달 열림 상태.
  const [regenerateModalOpen, setRegenerateModalOpen] = useState(false);

  if (isPending) {
    return (
      <div className="animate-pulse">
        <div className="mb-4 h-4 bg-[var(--surface-soft)] rounded-lg w-24" />
        <div className="h-7 bg-[var(--surface-soft)] rounded-lg w-64 mb-2" />
        <div className="h-4 bg-[var(--surface-soft)] rounded-lg w-48 mb-6" />
        <AdminTableSkeleton cols={4} />
      </div>
    );
  }

  if (isError || !series) {
    return (
      <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] py-10 px-4 flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-[var(--red700)] font-medium">
          {extractErrorMessage(error, '리그 정보를 불러오지 못했어요.')}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-sm text-[var(--blue700)] hover:bg-[var(--blue50)] underline underline-offset-2 min-h-[44px] px-3 rounded transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          다시 시도하기
        </button>
      </div>
    );
  }

  const onGenerate = async () => {
    // 요일은 골랐는데 time input(type="time")을 비워 지운 상태로 제출하면 서버가 형식
    // 오류로 400을 내려 사용자는 이유를 모른 채 막힌다 — 제출 전에 여기서 먼저 알려준다.
    if (dayOfWeek !== '' && time.trim() === '') {
      showToast('요일을 골랐으면 시각도 입력해 주세요.', 'error');
      return;
    }
    try {
      const result = await generateFixtures.mutateAsync({
        weeksCount,
        ...(dayOfWeek === '' ? {} : { schedule: { dayOfWeek, time } }),
        ...(placeName.trim() === '' ? {} : { placeName: placeName.trim() }),
      });
      showToast(`대진 ${result.createdCount}경기를 만들었어요.`, 'success');
    } catch (error) {
      showToast(extractErrorMessage(error, '대진을 만들지 못했어요.'), 'error');
    }
  };

  const onFieldBlur = (fixture: V1LeagueFixture, patch: { startsAt?: string; placeName?: string; placeAddress?: string }) => {
    updateFixture.mutate(
      { teamMatchId: fixture.teamMatchId, body: patch },
      { onError: (error) => showToast(extractErrorMessage(error, '경기 정보를 저장하지 못했어요.'), 'error') },
    );
  };

  // R11(C-6): AdminReasonModal의 "상태" 선택을 "어느 팀이 불참했는지" 선택으로 재사용한다
  // (컴포넌트 재사용 원칙 — 새 모달을 만들지 않는다).
  const onForfeitSubmit = (noShowTeamId: string, reason: string) => {
    if (!forfeitFixture) return;
    recordForfeit.mutate(
      { teamMatchId: forfeitFixture.teamMatchId, body: { noShowTeamId, reason } },
      {
        onSuccess: (result) => {
          setForfeitFixture(null);
          showToast(
            result.alreadyProcessed ? '이미 몰수 처리된 대진이에요.' : '몰수패로 처리했어요.',
            'success',
          );
        },
        onError: (error) => showToast(extractErrorMessage(error, '몰수 처리에 실패했어요.'), 'error'),
      },
    );
  };

  // R12: 취소는 되돌릴 수 없는 조작이라 GateConfirmModal로 사유를 받은 뒤에만 실행한다.
  const onConfirmCancel = (reason: string) => {
    if (!cancelTarget) return;
    cancelFixture.mutate(
      { teamMatchId: cancelTarget.teamMatchId, body: { reason } },
      {
        onSuccess: (result) => {
          setCancelTarget(null);
          showToast(result.alreadyProcessed ? '이미 취소된 대진이에요.' : '대진을 취소했어요.', 'success');
        },
        onError: (error) => showToast(extractErrorMessage(error, '대진을 취소하지 못했어요.'), 'error'),
      },
    );
  };

  // R13: 재생성은 리그의 대진 전체를 교체하는 조작이라 typedChallenge로 이중 확인을 받는다.
  const onConfirmRegenerate = (reason: string) => {
    if (dayOfWeek !== '' && time.trim() === '') {
      showToast('요일을 골랐으면 시각도 입력해 주세요.', 'error');
      return;
    }
    regenerateFixtures.mutate(
      {
        weeksCount,
        reason,
        ...(dayOfWeek === '' ? {} : { schedule: { dayOfWeek, time } }),
        ...(placeName.trim() === '' ? {} : { placeName: placeName.trim() }),
      },
      {
        onSuccess: (result) => {
          setRegenerateModalOpen(false);
          showToast(`기존 대진 ${result.cancelledCount}경기를 취소하고 새 대진 ${result.createdCount}경기를 만들었어요.`, 'success');
        },
        onError: (error) => showToast(extractErrorMessage(error, '대진을 다시 만들지 못했어요.'), 'error'),
      },
    );
  };

  return (
    <div>
      <AdminPageHeader eyebrow="플랫폼 · 리그" title={series.title} description={`${series.teamIds.length}팀 참가 · 대진 ${series.fixtures.length}경기`} />

      {series.fixtures.length === 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="weeks-count" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">주차 수</label>
              <input
                id="weeks-count"
                type="number"
                min={1}
                max={52}
                value={weeksCount}
                onChange={(e) => setWeeksCount(Number(e.target.value))}
                className={`${inputClass} w-24`}
              />
            </div>
            <div>
              <label htmlFor="fixture-day-of-week" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">요일</label>
              <select
                id="fixture-day-of-week"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value === '' ? '' : Number(e.target.value))}
                className={`${inputClass} w-32`}
              >
                <option value="">시작일 그대로</option>
                {WEEKDAY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fixture-time" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">시각</label>
              <input
                id="fixture-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={dayOfWeek === ''}
                className={`${inputClass} w-28 disabled:opacity-50`}
              />
            </div>
            <div>
              <label htmlFor="fixture-place-name" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">기본 장소</label>
              <input
                id="fixture-place-name"
                type="text"
                placeholder="장소 미정"
                value={placeName}
                onChange={(e) => setPlaceName(e.target.value)}
                className={`${inputClass} w-48`}
              />
            </div>
            <button
              type="button"
              onClick={onGenerate}
              disabled={generateFixtures.isPending}
              className="min-h-[44px] rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              라운드로빈 대진 생성
            </button>
          </div>
          <RecentVenueChips
            items={(series.recentVenues ?? []).map((venue) => ({ placeName: venue }))}
            selectedValue={placeName}
            onSelect={(venue) => setPlaceName(venue.placeName)}
          />
          <p className="text-xs text-[var(--text-muted)]">
            요일·시각을 정하면 매주 그 요일 그 시각으로 채워요. 비워두면 시작일 그대로 매주 반복돼요.
            생성 후 특정 주만 다르면 아래 표에서 개별 수정하면 돼요.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* R13: 대진 재생성 — 기존 대진을 전부 취소하고 같은 팀 로스터로 새로 만드는
              파괴적 조작이라, 위 생성 폼과 시각 구분되게 amber 톤 카드에 담는다. */}
          <div className="rounded-2xl border border-[var(--tint-orange-border)] bg-[var(--tint-orange)] p-4">
            <p className="mb-2 text-sm font-semibold text-[var(--orange700)]">대진 재생성</p>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              팀 구성이 바뀌었거나 주차·요일을 다시 정해야 하면, 아래 설정으로 기존 대진을 전부
              취소하고 새로 만들어요. 공식 결과가 확정된 대진이 하나라도 있으면 만들 수 없어요.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="regen-weeks-count" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">주차 수</label>
                <input
                  id="regen-weeks-count"
                  type="number"
                  min={1}
                  max={52}
                  value={weeksCount}
                  onChange={(e) => setWeeksCount(Number(e.target.value))}
                  className={`${inputClass} w-24`}
                />
              </div>
              <div>
                <label htmlFor="regen-day-of-week" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">요일</label>
                <select
                  id="regen-day-of-week"
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(e.target.value === '' ? '' : Number(e.target.value))}
                  className={`${inputClass} w-32`}
                >
                  <option value="">시작일 그대로</option>
                  {WEEKDAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="regen-time" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">시각</label>
                <input
                  id="regen-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  disabled={dayOfWeek === ''}
                  className={`${inputClass} w-28 disabled:opacity-50`}
                />
              </div>
              <div>
                <label htmlFor="regen-place-name" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">기본 장소</label>
                <input
                  id="regen-place-name"
                  type="text"
                  placeholder="장소 미정"
                  value={placeName}
                  onChange={(e) => setPlaceName(e.target.value)}
                  className={`${inputClass} w-48`}
                />
              </div>
              <button
                type="button"
                onClick={() => setRegenerateModalOpen(true)}
                className="min-h-[44px] rounded-xl bg-[var(--button-fill-warning)] px-4 text-sm font-semibold text-white hover:bg-[var(--button-fill-warning-hover)] transition-colors"
              >
                대진 재생성
              </button>
            </div>
          </div>

          <AdminDataTable<V1LeagueFixture>
            rows={series.fixtures}
            keyExtractor={(row) => row.teamMatchId}
            rowTone={(row) => (row.status === 'cancelled' ? 'danger' : undefined)}
            actionsHeader="관리"
            renderActions={(row) =>
              row.status === 'cancelled' ? (
                <span className="text-xs text-[var(--text-muted)]">취소됨</span>
              ) : (
                <div className="flex items-center gap-2">
                  {/* R11(C-6): 상대팀이 확정된(matched) 대진만 몰수 처리 대상이다 — 아직 상대가
                      없거나(awayTeamId null) 이미 완료된 대진은 버튼을 숨긴다. */}
                  {row.status === 'matched' && row.awayTeamId !== null ? (
                    <button
                      type="button"
                      onClick={() => setForfeitFixture(row)}
                      aria-label={`${row.title} 몰수패 처리`}
                      className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-lg bg-[var(--red50)] px-3 text-[13px] font-medium text-[var(--red700)] transition-colors hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                    >
                      몰수패 처리
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setCancelTarget(row)}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--red50)] px-3 text-[13px] font-medium text-[var(--red700)] transition-colors hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                  >
                    취소
                  </button>
                </div>
              )
            }
            columns={[
              { key: 'title', header: '경기', render: (row) => row.title },
              {
                key: 'startAt',
                header: '일시',
                render: (row) => (
                  <input
                    type="datetime-local"
                    aria-label={`${row.title} 일시`}
                    defaultValue={toDatetimeLocalValue(row.startAt)}
                    disabled={row.status === 'cancelled'}
                    onBlur={(e) => {
                      // 값이 그대로면 PATCH를 보내지 않는다 — 표를 탭으로 지나가기만 해도 쓰기가 발생하는 것 방지.
                      if (e.target.value === toDatetimeLocalValue(row.startAt)) return;
                      const startsAt = fromDatetimeLocalValue(e.target.value);
                      if (!startsAt) return;
                      onFieldBlur(row, { startsAt });
                    }}
                    className={`${inputClass} disabled:opacity-50`}
                  />
                ),
              },
              {
                key: 'placeName',
                header: '구장',
                render: (row) => (
                  <input
                    aria-label={`${row.title} 구장`}
                    defaultValue={row.placeName}
                    disabled={row.status === 'cancelled'}
                    onBlur={(e) => {
                      if (e.target.value === row.placeName) return;
                      onFieldBlur(row, { placeName: e.target.value });
                    }}
                    className={`${inputClass} disabled:opacity-50`}
                  />
                ),
              },
              {
                key: 'placeAddress',
                header: '주소',
                render: (row) => (
                  <input
                    aria-label={`${row.title} 주소`}
                    placeholder="상세 주소 (선택)"
                    defaultValue={row.placeAddress ?? ''}
                    disabled={row.status === 'cancelled'}
                    onBlur={(e) => {
                      if (e.target.value === (row.placeAddress ?? '')) return;
                      onFieldBlur(row, { placeAddress: e.target.value });
                    }}
                    className={`${inputClass} disabled:opacity-50`}
                  />
                ),
              },
              { key: 'status', header: '상태', render: (row) => <AdminStatusPill status={row.status} /> },
            ]}
          />
        </div>
      )}

      {/* R11(C-6): 몰수패·부전승 처리 모달 — 되돌리기 어려운 조작이라 사유를 필수로 받는다. */}
      <AdminReasonModal
        open={forfeitFixture !== null}
        title="몰수패 처리"
        statusOptions={
          forfeitFixture
            ? [
                { value: forfeitFixture.homeTeamId, label: `${forfeitHostTeam.data?.name ?? '홈팀'} 불참` },
                ...(forfeitFixture.awayTeamId
                  ? [{ value: forfeitFixture.awayTeamId, label: `${forfeitAwayTeam.data?.name ?? '원정팀'} 불참` }]
                  : []),
              ]
            : []
        }
        onSubmit={onForfeitSubmit}
        onClose={() => setForfeitFixture(null)}
        pending={recordForfeit.isPending}
      />

      <AdminToasts toasts={toasts} />

      {/* R12: 대진 취소 확인 — 되돌릴 수 없으므로 사유를 필수로 받는다. */}
      <GateConfirmModal
        open={cancelTarget !== null}
        pending={cancelFixture.isPending}
        title="대진을 취소할까요?"
        description={
          cancelTarget
            ? `"${cancelTarget.title}" 대진을 취소해요. 순위 집계에서 즉시 제외되고 되돌릴 수 없어요.`
            : ''
        }
        confirmLabel="대진 취소"
        tone="amber"
        onConfirm={onConfirmCancel}
        onClose={() => setCancelTarget(null)}
      />

      {/* R13: 대진 재생성 확인 — 리그의 대진 전체를 교체하는 조작이라 typedChallenge로
          이중 확인을 받는다. */}
      <GateConfirmModal
        open={regenerateModalOpen}
        pending={regenerateFixtures.isPending}
        title="대진을 다시 만들까요?"
        description={`대진 ${series.fixtures.length}경기를 전부 취소하고 새로 만들어요.${
          teamsData ? ` 참가팀: ${teamsData.teams.map((t) => t.name).join(', ')}` : ''
        } 공식 결과가 확정된 대진이 있으면 실패해요.`}
        confirmLabel="대진 재생성"
        tone="amber"
        typedChallenge="재생성"
        onConfirm={onConfirmRegenerate}
        onClose={() => setRegenerateModalOpen(false)}
      />
    </div>
  );
}
