'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AdminPageHeader, AdminDataTable, AdminReasonModal, AdminStatusPill, AdminTableSkeleton, AdminToasts, useAdminToast } from '@/components/admin';
import { GateConfirmModal } from '@/components/admin/operation-flag-gate-confirm-modal';
import {
  useV1AdminLeagueMatch,
  useV1RevertLeagueCompletion,
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
  const revertCompletion = useV1RevertLeagueCompletion(leagueId);
  const [revertModalOpen, setRevertModalOpen] = useState(false);
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
  // 감사 결함 1: 대진 표의 title은 자동 생성이라 리그 전체가 "N주차"로 똑같이 보인다 —
  // 어느 팀 경기인지는 표에 별도로 없는 teamId를 이름으로 바꿔야 알 수 있다. 행마다
  // useV1AdminTeam을 부르면 훅 규칙 위반 + N+1이라, 리그 참가팀 목록(이미 재생성 카드에
  // 쓰고 있는 teamsData)으로 id -> name 맵을 한 번만 만들어 표 렌더에서 조회한다.
  const teamNameById = new Map((teamsData?.teams ?? []).map((team) => [team.teamId, team.name]));
  // 감사 결함 4: 인라인 편집(일시/구장/주소) 실패가 토스트에만 뜨고 필드에는 안 남아,
  // 토스트를 놓치면 실패를 알 방법이 없다. teamMatchId -> 실패한 필드 key 집합으로
  // 추적해 해당 입력에 aria-invalid + 시각 표시(테두리 + 아이콘, 컬러 단독 아님)를 남긴다.
  const [failedFields, setFailedFields] = useState<Record<string, Set<'startAt' | 'placeName' | 'placeAddress'>>>({});

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

  // 감사 결함 4: 필드별 실패 표시를 지우거나(성공) 남기는(실패) 헬퍼. teamMatchId 하나에
  // 여러 필드가 동시에 실패해 있을 수 있어 Set으로 관리한다.
  const setFieldFailed = (teamMatchId: string, field: 'startAt' | 'placeName' | 'placeAddress', failed: boolean) => {
    setFailedFields((prev) => {
      const next = new Set(prev[teamMatchId]);
      if (failed) next.add(field);
      else next.delete(field);
      if (next.size === 0) {
        const { [teamMatchId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [teamMatchId]: next };
    });
  };

  const onFieldBlur = (
    fixture: V1LeagueFixture,
    field: 'startAt' | 'placeName' | 'placeAddress',
    patch: { startsAt?: string; placeName?: string; placeAddress?: string },
  ) => {
    updateFixture.mutate(
      { teamMatchId: fixture.teamMatchId, body: patch },
      {
        onSuccess: () => setFieldFailed(fixture.teamMatchId, field, false),
        onError: (error) => {
          setFieldFailed(fixture.teamMatchId, field, true);
          showToast(extractErrorMessage(error, '경기 정보를 저장하지 못했어요.'), 'error');
        },
      },
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
          // 감사 결함 2: alreadyProcessed=true라고 항상 성공은 아니다 — 서버는 이미 확정된
          // 몰수를 "다른 팀"으로 정정하려는 요청은 DB를 바꾸지 않고 requestMatchesStored:
          // false로 알려준다(league-lifecycle-rules.ts). 이걸 성공 토스트로 덮으면 운영자가
          // 정정이 반영됐다고 오인한다.
          if (result.alreadyProcessed && result.requestMatchesStored === false) {
            showToast('이미 다른 결과로 확정돼 있어 반영되지 않았어요. 되돌린 뒤 다시 처리해 주세요.', 'error');
            return;
          }
          showToast(
            result.alreadyProcessed ? '이미 몰수 처리된 대진이에요.' : '몰수패로 처리했어요.',
            'success',
          );
        },
        onError: (error) => showToast(extractErrorMessage(error, '몰수 처리에 실패했어요.'), 'error'),
      },
    );
  };

  // R6/D-3: 전 대진 확정 시 리그는 자동으로 completed 로 전이한다. 결과를 정정해야 하면
  // 운영자가 진행 중으로 되돌려야 하는데, 그동안 이 엔드포인트에 화면이 없어서 API 를 직접
  // 호출하지 않는 한 되돌릴 방법이 없었다(2026-08-21 재감사). 사유는 감사 로그에 남는다.
  const onConfirmRevert = (reason: string) => {
    revertCompletion.mutate(
      { reason: reason.trim() ? reason.trim() : undefined },
      {
        onSuccess: (result) => {
          setRevertModalOpen(false);
          showToast(
            result.alreadyProcessed ? '이미 진행 중인 리그예요.' : '리그를 진행 중으로 되돌렸어요.',
            'success',
          );
        },
        onError: (error) => showToast(extractErrorMessage(error, '리그를 되돌리지 못했어요.'), 'error'),
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
          if (result.alreadyProcessed) {
            showToast('이미 취소된 대진이에요.', 'success');
            return;
          }
          // 감사 결함 3: 마지막 미확정 대진을 취소하면 리그가 그 자리에서 completed로
          // 자동 전이한다(leagueCompleted). 대진 하나만 취소한 줄 알았던 운영자가 리그
          // 종료라는 큰 부수효과를 놓치지 않도록 별도 문구로 알린다.
          showToast(
            result.leagueCompleted
              ? '대진을 취소했어요. 남은 대진이 없어 리그가 종료 처리됐어요.'
              : '대진을 취소했어요.',
            'success',
          );
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
      <AdminPageHeader
        eyebrow="플랫폼 · 리그"
        title={series.title}
        description={`${series.teamIds.length}팀 참가 · 대진 ${series.fixtures.length}경기`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <AdminStatusPill status={series.state} />
            {/* 되돌리기는 completed 일 때만 의미가 있다 — draft/active 에서는 서버가
                409 LEAGUE_NOT_COMPLETED 로 막으므로 버튼 자체를 내지 않는다. */}
            {series.state === 'completed' && (
              <button
                type="button"
                onClick={() => setRevertModalOpen(true)}
                disabled={revertCompletion.isPending}
                className="inline-flex min-h-[44px] items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text-strong)] disabled:opacity-50"
              >
                진행 중으로 되돌리기
              </button>
            )}
          </div>
        }
      />

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
                      className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-lg bg-[var(--red50)] px-3 text-sm font-medium text-[var(--red700)] transition-colors hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                    >
                      몰수패 처리
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setCancelTarget(row)}
                    aria-label={`${row.title} 취소`}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--red50)] px-3 text-sm font-medium text-[var(--red700)] transition-colors hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                  >
                    취소
                  </button>
                </div>
              )
            }
            columns={[
              {
                key: 'title',
                header: '경기',
                render: (row) => {
                  // 감사 결함 1: title은 "N주차" 자동 생성이라 리그 전체가 똑같이 보인다 —
                  // teamNameById로 실제 매치업을 보여주고, 원래 title(주차 라벨)은 보조
                  // 텍스트로 남겨 어느 주차인지도 함께 알 수 있게 한다.
                  const homeName = teamNameById.get(row.homeTeamId) ?? '홈팀';
                  const matchupLabel = row.awayTeamId
                    ? `${homeName} vs ${teamNameById.get(row.awayTeamId) ?? '원정팀'}`
                    : `${homeName} 부전승`;
                  return (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-[var(--text-strong)]">{matchupLabel}</span>
                      <span className="text-xs text-[var(--text-muted)]">{row.title}</span>
                    </div>
                  );
                },
              },
              {
                key: 'startAt',
                header: '일시',
                render: (row) => {
                  const invalid = failedFields[row.teamMatchId]?.has('startAt') ?? false;
                  const errorId = `${row.teamMatchId}-startAt-error`;
                  return (
                    <div className="relative">
                      <input
                        type="datetime-local"
                        aria-label={`${row.title} 일시`}
                        aria-invalid={invalid}
                        aria-describedby={invalid ? errorId : undefined}
                        defaultValue={toDatetimeLocalValue(row.startAt)}
                        disabled={row.status === 'cancelled'}
                        onBlur={(e) => {
                          // 값이 그대로면 PATCH를 보내지 않는다 — 표를 탭으로 지나가기만 해도 쓰기가 발생하는 것 방지.
                          if (e.target.value === toDatetimeLocalValue(row.startAt)) return;
                          const startsAt = fromDatetimeLocalValue(e.target.value);
                          if (!startsAt) return;
                          onFieldBlur(row, 'startAt', { startsAt });
                        }}
                        className={`${inputClass} disabled:opacity-50 ${invalid ? 'border-[var(--red700)] pr-9 focus:border-[var(--red700)]' : ''}`}
                      />
                      {invalid ? (
                        <span id={errorId} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--red700)]">
                          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">저장하지 못했어요. 다시 시도해 주세요.</span>
                        </span>
                      ) : null}
                    </div>
                  );
                },
              },
              {
                key: 'placeName',
                header: '구장',
                render: (row) => {
                  const invalid = failedFields[row.teamMatchId]?.has('placeName') ?? false;
                  const errorId = `${row.teamMatchId}-placeName-error`;
                  return (
                    <div className="relative">
                      <input
                        aria-label={`${row.title} 구장`}
                        aria-invalid={invalid}
                        aria-describedby={invalid ? errorId : undefined}
                        defaultValue={row.placeName}
                        disabled={row.status === 'cancelled'}
                        onBlur={(e) => {
                          if (e.target.value === row.placeName) return;
                          onFieldBlur(row, 'placeName', { placeName: e.target.value });
                        }}
                        className={`${inputClass} disabled:opacity-50 ${invalid ? 'border-[var(--red700)] pr-9 focus:border-[var(--red700)]' : ''}`}
                      />
                      {invalid ? (
                        <span id={errorId} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--red700)]">
                          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">저장하지 못했어요. 다시 시도해 주세요.</span>
                        </span>
                      ) : null}
                    </div>
                  );
                },
              },
              {
                key: 'placeAddress',
                header: '주소',
                render: (row) => {
                  const invalid = failedFields[row.teamMatchId]?.has('placeAddress') ?? false;
                  const errorId = `${row.teamMatchId}-placeAddress-error`;
                  return (
                    <div className="relative">
                      <input
                        aria-label={`${row.title} 주소`}
                        aria-invalid={invalid}
                        aria-describedby={invalid ? errorId : undefined}
                        placeholder="상세 주소 (선택)"
                        defaultValue={row.placeAddress ?? ''}
                        disabled={row.status === 'cancelled'}
                        onBlur={(e) => {
                          if (e.target.value === (row.placeAddress ?? '')) return;
                          onFieldBlur(row, 'placeAddress', { placeAddress: e.target.value });
                        }}
                        className={`${inputClass} disabled:opacity-50 ${invalid ? 'border-[var(--red700)] pr-9 focus:border-[var(--red700)]' : ''}`}
                      />
                      {invalid ? (
                        <span id={errorId} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--red700)]">
                          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">저장하지 못했어요. 다시 시도해 주세요.</span>
                        </span>
                      ) : null}
                    </div>
                  );
                },
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
      {/* R6/D-3: 종료 역전이 확인. 취소·재생성과 달리 되돌릴 수 있는 조작이라
          typedChallenge 없이 사유만 받는다. */}
      <GateConfirmModal
        open={revertModalOpen}
        pending={revertCompletion.isPending}
        title="리그를 진행 중으로 되돌릴까요?"
        description="종료된 리그를 다시 진행 중으로 바꿔요. 결과를 정정한 뒤 전 대진이 다시 확정되면 자동으로 종료돼요."
        // 헤더 트리거("진행 중으로 되돌리기")와 접근 이름이 겹치지 않게 짧게 쓴다 —
        // 겹치면 스크린리더 사용자도 두 버튼을 구분하지 못한다(취소·재생성 모달도 같은 관례).
        confirmLabel="되돌리기"
        tone="amber"
        onConfirm={onConfirmRevert}
        onClose={() => setRevertModalOpen(false)}
      />

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
