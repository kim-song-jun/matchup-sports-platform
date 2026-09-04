'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { AdminPageHeader, AdminDataTable, AdminReasonModal, AdminStatusPill, AdminTableSkeleton, AdminToasts, useAdminToast } from '@/components/admin';
import { EntityPicker, type EntityPickerItem } from '@/components/admin/entity-picker';
import { GateConfirmModal } from '@/components/admin/operation-flag-gate-confirm-modal';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import {
  useV1AddLeagueTeam,
  useV1AdminLeagueMatch,
  useV1RevertLeagueCompletion,
  useV1AdminLeagueTeams,
  useV1AdminTeam,
  useV1CancelLeagueFixture,
  useV1GenerateLeagueFixtures,
  useV1PreviewLeagueFixtures,
  useV1RecordLeagueForfeit,
  useV1RegenerateLeagueFixtures,
  useV1RemoveLeagueTeam,
  useV1Teams,
  useV1UpdateLeagueFixture,
} from '@/hooks/use-v1-api';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { expandWeeklyFixtureDates } from '@/lib/league-fixture-dates';
import { formatKstDateShort, formatKstTime } from '@/lib/date-utils';
import { fromDatetimeLocalValue, toDatetimeLocalValue } from '@/components/team-schedules/team-schedules.view-model';
import { RecentVenueChips } from '@/components/v1-ui/create-form-fields';
import {
  computeDailyPlan,
  dayOffsetLabel,
  groupPreviewByMatchday,
  suggestGamesPerTeamPerDay,
  type DailyPlan,
} from './league-fixture-timing.view-model';
import type {
  V1GenerateLeagueFixturesPayload,
  V1LeagueFixture,
  V1PreviewLeagueFixturesResult,
} from '@/types/league-match';

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

  // 그룹 B 감사 결함 1: 개설 후 참가팀 추가·제거.
  const addTeam = useV1AddLeagueTeam(leagueId);
  const removeTeam = useV1RemoveLeagueTeam(leagueId);
  const [teamPickerValue, setTeamPickerValue] = useState<EntityPickerItem | null>(null);
  const [teamSearch, setTeamSearch] = useState('');
  const trimmedTeamSearch = teamSearch.trim();
  // series?.sportId — 이 리그와 같은 종목 팀만 후보로 보여준다(생성 폼과 동일 규칙,
  // create()의 "리그 종목과 일치하는 활성 팀만" 규칙을 화면에서도 미리 좁힌다).
  const addTeamCandidatesQuery = useV1Teams(
    trimmedTeamSearch
      ? { query: trimmedTeamSearch, limit: 20 }
      : series?.sportId
        ? { sportId: series.sportId, limit: 20 }
        : { limit: 20 },
  );
  const existingTeamIds = new Set((teamsData?.teams ?? []).map((team) => team.teamId));
  const addTeamCandidates: EntityPickerItem[] = (addTeamCandidatesQuery.data?.items ?? [])
    .filter((team) => !existingTeamIds.has(team.id))
    .map((team) => ({ id: team.id, label: team.name, description: `${team.sportName} · ${team.regionName}` }));

  // 그룹 B 감사 결함 3: 최초 대진 생성/재생성 미리보기(dry-run). generate/regenerate 두
  // 폼이 같은 상태(weeksCount/dayOfWeek/time/placeName)를 공유하므로 미리보기 결과도
  // 하나만 두고 어느 폼에서 눌렀는지는 결과 패널을 각 폼 바로 아래 두는 것으로 구분한다.
  const previewFixtures = useV1PreviewLeagueFixtures(leagueId);
  const [previewResult, setPreviewResult] = useState<V1PreviewLeagueFixturesResult | null>(null);

  // 몰수패 처리 모달(R11) — 어느 대진을 처리 중인지만 들고, 팀 이름은 모달이 열릴 때만
  // useV1AdminTeam으로 조회한다(표 전체에 대해 팀마다 조회하지 않는다 — N+1 방지).
  const [forfeitFixture, setForfeitFixture] = useState<V1LeagueFixture | null>(null);
  const forfeitHostTeam = useV1AdminTeam(forfeitFixture?.homeTeamId ?? '');
  const forfeitAwayTeam = useV1AdminTeam(forfeitFixture?.awayTeamId ?? '');
  const [weeksCount, setWeeksCount] = useState(7);
  const [dayOfWeek, setDayOfWeek] = useState<number | ''>('');
  const [time, setTime] = useState('18:00');
  const [placeName, setPlaceName] = useState('');
  // 대진 timing(2026-08-25 사용자 확정: C안 시간창 역산 + B안 계산기·타임라인). 기존 필드처럼
  // 생성·재생성 두 폼이 같은 상태를 공유한다. ''=미입력 — 경기 시간이 비어 있으면 timing을
  // 아예 안 보내 기존 동작(같은 주차 동시 시각)을 유지한다. 종료 시각은 서버로 가지 않고
  // 팀당 하루 경기 수 역산 제안에만 쓴다.
  const [endTime, setEndTime] = useState('');
  const [gameDurationMinutes, setGameDurationMinutes] = useState('');
  const [breakMinutes, setBreakMinutes] = useState('');
  const [gamesPerTeamPerDay, setGamesPerTeamPerDay] = useState('');
  // R12: 취소 확인 대상 대진. null이면 모달을 닫는다.
  const [cancelTarget, setCancelTarget] = useState<V1LeagueFixture | null>(null);
  // 그룹 B 감사 결함 3: 참가팀 제외 확인 대상. null이면 모달을 닫는다.
  const [removeTarget, setRemoveTarget] = useState<{ teamId: string; teamName: string } | null>(null);
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

  // generate/regenerate/preview 세 호출이 전부 같은 폼 상태(weeksCount/dayOfWeek/time/
  // placeName)에서 같은 모양의 body를 만든다 — 세 곳에서 조립 규칙이 갈리면(예: 트림 여부)
  // "미리보기는 통과했는데 실제 생성은 다르게 실패"가 생긴다.
  // 서버 DTO가 @IsInt라 '15.5'·'1e2' 같은 값은 400으로 튕긴다 — 정수 문자열만 값으로
  // 인정하고, "비어 있지 않은데 정수가 아님"은 제출 전에 별도로 걸러 안내한다.
  const parseOptionalInt = (value: string): number | null => {
    const trimmed = value.trim();
    return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  };
  const isInvalidIntInput = (value: string) => value.trim() !== '' && !/^\d+$/.test(value.trim());
  const hasInvalidTimingInput = [gameDurationMinutes, breakMinutes, gamesPerTeamPerDay].some(isInvalidIntInput);
  const durationValue = parseOptionalInt(gameDurationMinutes);
  const breakValue = parseOptionalInt(breakMinutes);
  const gamesPerDayValue = parseOptionalInt(gamesPerTeamPerDay);
  const teamCount = series.teamIds.length;

  // C안: 시간창(시작~종료)과 경기 시간이 다 있으면 팀당 하루 경기 수를 역산해 제안한다.
  // 정수가 아닌 입력이 하나라도 있으면 제안·계산 카드를 아예 숨긴다 — ?? 폴백(휴식 0·팀당 1)으로
  // 계산하면 사용자가 입력한 값과 다른 결과를 "정상 계산"처럼 보여주게 된다.
  const timingSuggestion =
    !hasInvalidTimingInput && dayOfWeek !== '' && time.trim() !== '' && endTime.trim() !== '' && durationValue !== null
      ? suggestGamesPerTeamPerDay({
          startTime: time,
          endTime,
          gameDurationMinutes: durationValue,
          breakMinutes: breakValue ?? 0,
          teamCount,
        })
      : null;
  // teamCount < 2면 제안이 null인 원인이 시간창이 아니라 참가팀 부족이다 — 그때 이 경고를
  // 띄우면 운영자가 엉뚱한 원인(시간창)을 고치게 된다. 팀 부족은 생성 시도 시 서버 422
  // 메시지('리그에 등록된 팀이 2개 미만이에요')가 정확한 원인을 알려준다.
  const showTimingNoFit =
    !hasInvalidTimingInput && teamCount >= 2 &&
    dayOfWeek !== '' && time.trim() !== '' && endTime.trim() !== '' && durationValue !== null && timingSuggestion === null;
  // B안: 현재 폼 값 그대로의 "하루 운영 계산" — 팀당 경기 수를 안 채웠으면 서버 기본값 1로 보여준다.
  const dailyPlan =
    !hasInvalidTimingInput && durationValue !== null
      ? computeDailyPlan({
          gameDurationMinutes: durationValue,
          breakMinutes: breakValue ?? 0,
          gamesPerTeamPerDay: gamesPerDayValue ?? 1,
          teamCount,
          startTime: dayOfWeek !== '' && time.trim() !== '' ? time : undefined,
        })
      : null;

  // **요일을 날짜 목록으로 전개해서 보낸다.** 서버는 요일을 모른다(Task 164 BE-2) —
  // `schedule` 은 `{ dates, time }` 이고, 요일로 고르는 편의는 화면이 제공한다.
  // 전개 규칙(기준일 = max(리그 시작일, 오늘) · 정확히 weeksCount 개 · 첫 날의 시각이
  // 이미 지났으면 한 주 밀어냄)은 `lib/league-fixture-dates.ts` 가 소유하고 그 테스트가 지킨다.
  //
  // **시작일이 없으면 대진 조작 자체를 잠근다.** 전개 함수는 시작일이 필수라 던지는데,
  // 그걸 오늘로 떨어뜨려 넘기면 다음 달 시작 리그가 이번 주부터 경기를 갖는 **조용히 틀린
  // 대진**이 실제로 생성된다(서버는 과거만 거부한다). 응답에 이 필드가 없는 건 서버가
  // 구버전일 때뿐이므로, 만들지 못하게 막고 새로고침을 안내하는 쪽이 맞다. 표·참가팀·취소는
  // 그대로 쓸 수 있다 — 잠그는 건 생성·미리보기·재생성 세 버튼뿐이다.
  const leagueStartsOnAt = series.startsOn === undefined ? null : new Date(series.startsOn);
  const hasLeagueStartsOn = leagueStartsOnAt !== null && !Number.isNaN(leagueStartsOnAt.getTime());

  // **날짜는 렌더가 아니라 보내는 순간에 계산한다.** 렌더 시점 값을 들고 있으면 운영자가
  // 화면을 열어 둔 채 시각이 지났을 때(예: 금 17:59 에 열어 두고 18:05 에 누름) 이미 지난
  // 날짜를 보내 서버가 422 `LEAGUE_SCHEDULE_DATE_PAST` 로 거부한다 — 운영자는 값을 아무것도
  // 바꾸지 않았는데 갑자기 실패한다. `buildFixtureFormPayload` 는 생성·재생성·미리보기
  // 세 호출이 공유하므로 여기 한 곳만 옮기면 셋 다 클릭 시점 값을 쓴다.
  const buildFixtureFormPayload = (): V1GenerateLeagueFixturesPayload => {
    const dates =
      !hasLeagueStartsOn || dayOfWeek === '' || time.trim() === ''
        ? []
        : expandWeeklyFixtureDates({
            startsOn: series.startsOn,
            dayOfWeek,
            time,
            weeksCount,
            now: new Date(),
          });
    return {
      weeksCount,
      ...(dates.length === 0 ? {} : { schedule: { dates, time } }),
      ...(placeName.trim() === '' ? {} : { placeName: placeName.trim() }),
      ...(durationValue === null
        ? {}
        : {
            timing: {
              gameDurationMinutes: durationValue,
              ...(breakValue === null ? {} : { breakMinutes: breakValue }),
              ...(gamesPerDayValue === null ? {} : { gamesPerTeamPerDay: gamesPerDayValue }),
            },
          }),
    };
  };

  // 경기 시간 없이 휴식/팀당 경기 수만 채우면 서버가 400을 낸다(timing.gameDurationMinutes 필수) —
  // 요일-시각 짝 검증과 같은 방식으로 제출 전에 먼저 알려준다. 정수가 아닌 입력도 여기서 차단한다
  // (parseOptionalInt가 null로 만들면 timing이 조용히 누락돼 더 나쁘다).
  const validateTimingInputs = (): boolean => {
    if (hasInvalidTimingInput) {
      showToast('경기 시간·휴식·팀당 하루 경기 수는 정수로만 입력할 수 있어요.', 'error');
      return false;
    }
    if (durationValue === null && (breakValue !== null || gamesPerDayValue !== null)) {
      showToast('경기 시간(분)을 입력해야 휴식·팀당 하루 경기 수를 쓸 수 있어요.', 'error');
      return false;
    }
    // 서버 DTO 범위(@Min/@Max)와 동일한 상한을 제출 전에 안내한다 — number input의
    // min/max 속성은 직접 타이핑을 막지 못한다.
    const inRange = (value: number | null, min: number, max: number) => value === null || (value >= min && value <= max);
    if (!inRange(durationValue, 5, 240) || !inRange(breakValue, 0, 120) || !inRange(gamesPerDayValue, 1, 10)) {
      showToast('경기 시간은 5~240분, 휴식은 0~120분, 팀당 하루 경기는 1~10 사이로 입력해주세요.', 'error');
      return false;
    }
    return true;
  };

  // 감사 결함 2: 서버가 응답에 실어 준 경고(현재는 ODD_TEAM_COUNT_BYE 하나)를 성공 메시지에
  // 이어 붙인다 — AdminToast는 success/error 두 톤뿐이라 별도 토스트를 추가로 띄우지 않고,
  // code는 화면이 몰라도 message만으로 안내할 수 있게 서버가 문구까지 준다.
  const appendFixtureWarnings = (message: string, warnings: Array<{ code: string; message: string }>) =>
    warnings.length === 0 ? message : `${message} ${warnings.map((w) => w.message).join(' ')}`;

  const onGenerate = async () => {
    // 요일은 골랐는데 time input(type="time")을 비워 지운 상태로 제출하면 서버가 형식
    // 오류로 400을 내려 사용자는 이유를 모른 채 막힌다 — 제출 전에 여기서 먼저 알려준다.
    if (dayOfWeek !== '' && time.trim() === '') {
      showToast('요일을 골랐으면 시각도 입력해 주세요.', 'error');
      return;
    }
    if (!validateTimingInputs()) return;
    try {
      const result = await generateFixtures.mutateAsync(buildFixtureFormPayload());
      showToast(appendFixtureWarnings(`대진 ${result.createdCount}경기를 만들었어요.`, result.warnings), 'success');
      setPreviewResult(null);
    } catch (error) {
      showToast(extractErrorMessage(error, '대진을 만들지 못했어요.'), 'error');
    }
  };

  // 감사 결함 3: 최초 생성·재생성 공용 미리보기. DB를 바꾸지 않으므로 실패해도 폼 상태는
  // 그대로 둔다 — generateFixtures가 던지는 것과 같은 검증 오류를 미리 보여주는 것도
  // 미리보기의 역할이라, 여기서도 같은 방식으로 토스트한다.
  const onPreview = async () => {
    if (dayOfWeek !== '' && time.trim() === '') {
      showToast('요일을 골랐으면 시각도 입력해 주세요.', 'error');
      return;
    }
    if (!validateTimingInputs()) return;
    try {
      const result = await previewFixtures.mutateAsync(buildFixtureFormPayload());
      setPreviewResult(result);
    } catch (error) {
      setPreviewResult(null);
      showToast(extractErrorMessage(error, '미리보기를 만들지 못했어요.'), 'error');
    }
  };

  // 그룹 B 감사 결함 2: 공식 결과가 확정된 대진이 하나라도 있으면 서버는 재생성을
  // 409 LEAGUE_FIXTURES_HAVE_OFFICIAL_RESULTS로 영구 거부한다(regenerateFixtures) — 그런
  // 리그에 팀을 추가하고도 "재생성을 눌러 주세요"라고 안내하면 운영자는 실행 불가능한
  // 액션으로 안내받는다. 서버 응답(hasExistingFixtures)이 아니라 이미 화면이 들고 있는
  // series.fixtures의 resultStage로 직접 판정한다 — detail()이 대진마다 resultStage를
  // 내려주므로 별도 조회 없이 "재생성 가능한가"를 정확히 알 수 있다.
  const leagueHasOfficialResult = series.fixtures.some((fixture) => fixture.resultStage === 'official');

  // 그룹 B 감사 결함 1: 참가팀 추가. EntityPicker의 onChange가 넘기는 item이 null이면
  // (검색 초기화 등) 아무것도 하지 않는다.
  const onAddTeam = (item: EntityPickerItem | null) => {
    if (item === null) return;
    addTeam.mutate(
      { teamId: item.id },
      {
        onSuccess: (result) => {
          setTeamPickerValue(null);
          setTeamSearch('');
          showToast(
            !result.hasExistingFixtures
              ? `${item.label}을(를) 추가했어요.`
              : leagueHasOfficialResult
                ? `${item.label}을(를) 추가했어요. 다만 이 리그는 이미 확정된 결과가 있어 대진 재생성이 불가능해요 — 이 팀은 순위표에만 표시돼요.`
                : `${item.label}을(를) 추가했어요. 대진에 반영하려면 "대진 재생성"을 눌러 주세요.`,
            'success',
          );
        },
        onError: (error) => showToast(extractErrorMessage(error, '팀을 추가하지 못했어요.'), 'error'),
      },
    );
  };

  // 그룹 B 감사 결함 1: 참가팀 제거. 공식 결과가 확정된 대진이 낀 팀은 서버가 409로
  // 거부한다(checkLeagueTeamRemovalAllowed) — 여기서는 그 실패를 토스트로만 알린다.
  // 그룹 B 감사 결함 3: 실제 제거는 확인 모달(onConfirmRemoveTeam)에서만 실행한다 —
  // 이전에는 칩의 X 버튼이 확인 없이 곧바로 이 mutate를 호출해, 옆 팀을 잘못 눌러도
  // 즉시 실제 대진이 취소됐다.
  const onConfirmRemoveTeam = () => {
    if (!removeTarget) return;
    const { teamId, teamName } = removeTarget;
    removeTeam.mutate(teamId, {
      onSuccess: (result) => {
        setRemoveTarget(null);
        showToast(
          result.cancelledFixtureCount > 0
            ? `${teamName}을(를) 제외했어요. 관련 대진 ${result.cancelledFixtureCount}경기도 함께 취소됐어요.`
            : `${teamName}을(를) 제외했어요.`,
          'success',
        );
      },
      onError: (error) => showToast(extractErrorMessage(error, '팀을 제외하지 못했어요.'), 'error'),
    });
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
    if (!validateTimingInputs()) return;
    regenerateFixtures.mutate(
      { ...buildFixtureFormPayload(), reason },
      {
        onSuccess: (result) => {
          setRegenerateModalOpen(false);
          setPreviewResult(null);
          showToast(
            appendFixtureWarnings(
              `기존 대진 ${result.cancelledCount}경기를 취소하고 새 대진 ${result.createdCount}경기를 만들었어요.`,
              result.warnings,
            ),
            'success',
          );
        },
        onError: (error) => showToast(extractErrorMessage(error, '대진을 다시 만들지 못했어요.'), 'error'),
      },
    );
  };

  return (
    <div className="tm-content-enter">
      <AdminPageHeader
        eyebrow="플랫폼 · 리그"
        title={series.title}
        description={`${series.teamIds.length}팀 참가 · 대진 ${series.fixtures.length}경기`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <AdminStatusPill status={series.state} />
            {/* 경기 영상 관리 — 대회 운영 콘솔의 영상 화면과 같은 역할의 리그 판.
                대진이 없으면 그 화면이 빈 상태 안내를 대신한다. */}
            <Link
              href={`/admin/league-matches/${leagueId}/videos`}
              className="inline-flex min-h-[44px] items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text-strong)]"
            >
              경기 영상 관리
            </Link>
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

      {/* 참가 신청 관리 — 사용자 A안(FE-3). BE 는 진작에 `open-registration` 을 갖고
          있었는데 **부르는 화면이 없어** 리그는 신청을 열 방법이 API 직접 호출뿐이었다.
          목록은 대회 `RegistrationsTab` 을 그대로 재사용한다 — 어드민 신청 API 는 이미
          리그를 받으므로(`ALL_COMPETITION_KINDS`) 리그 id 를 그대로 넘기면 된다.
          A안 범위는 "신청 열기 + 목록" 이다. 그 밖의 화면을 새로 만들지 않는다. */}
      <LeagueRegistrationSummary
        leagueId={leagueId}
        registrationOpen={series?.registrationOpen ?? false}
        registrationDeadlineAt={series?.registrationDeadlineAt ?? null}
      />

      {/* 그룹 B 감사 결함 1: 개설 후 참가팀 추가·제거. 대진이 이미 있어도 로스터 자체는
          바꿀 수 있다 — 대진표에 반영하려면 아래 "대진 재생성"이 필요하다는 걸 추가 성공
          토스트로 안내한다(onAddTeam). 최소 2팀 규칙은 서버가 최종 판정하지만, 남은 팀이
          2개일 때 제거 버튼을 미리 비활성화해 뻔한 실패 요청을 걸러낸다. */}
      <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
        <p className="mb-1 text-sm font-semibold text-[var(--text-strong)]">참가팀 관리</p>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          팀을 추가하거나 뺄 수 있어요. 대진이 이미 있으면 재생성해야 새 구성이 반영돼요.
        </p>
        <ul className="mb-3 flex flex-wrap gap-2">
          {(teamsData?.teams ?? []).map((team) => (
            <li
              key={team.teamId}
              className="flex min-h-[44px] items-center gap-2 rounded-full bg-[var(--blue50)] px-3 text-sm text-[var(--blue700)]"
            >
              {team.name}
              <button
                type="button"
                aria-label={`${team.name} 제외`}
                disabled={removeTeam.isPending || (teamsData?.teams.length ?? 0) <= 2}
                title={(teamsData?.teams.length ?? 0) <= 2 ? '리그는 팀이 2개 이상이어야 해요' : undefined}
                onClick={() => setRemoveTarget({ teamId: team.teamId, teamName: team.name })}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center disabled:opacity-40"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <label htmlFor="league-team-picker" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">
          팀 추가
        </label>
        <EntityPicker
          id="league-team-picker"
          value={teamPickerValue}
          onChange={onAddTeam}
          items={addTeamCandidates}
          onSearch={setTeamSearch}
          showResultsWithoutQuery
          loading={addTeamCandidatesQuery.isFetching || addTeam.isPending}
          placeholder="팀 이름으로 검색"
          emptyText="검색 결과가 없어요"
        />
      </div>

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
                className={`${inputClass} w-40`}
              >
                <option value="">시작일 그대로</option>
                {WEEKDAY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fixture-time" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">시작 시각</label>
              <input
                id="fixture-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={dayOfWeek === ''}
                className={`${inputClass} w-36 disabled:opacity-50`}
              />
            </div>
            <FixtureTimingFields
              idPrefix="fixture"
              dayOfWeekUnset={dayOfWeek === ''}
              endTime={endTime}
              onEndTimeChange={setEndTime}
              gameDurationMinutes={gameDurationMinutes}
              onGameDurationChange={setGameDurationMinutes}
              breakMinutes={breakMinutes}
              onBreakMinutesChange={setBreakMinutes}
              gamesPerTeamPerDay={gamesPerTeamPerDay}
              onGamesPerTeamPerDayChange={setGamesPerTeamPerDay}
            />
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
            {/* 그룹 B 감사 결함 3: 실제 생성 전에 어떤 대진이 만들어질지 먼저 보여준다.
                DB를 바꾸지 않는다 — generateFixtures와 완전히 같은 검증을 통과해야 결과가
                나오므로, 미리보기가 성공했는데 실제 생성이 실패하는 불일치가 없다. */}
            <button
              type="button"
              onClick={onPreview}
              disabled={previewFixtures.isPending || !hasLeagueStartsOn}
              className="min-h-[44px] rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text-strong)] disabled:opacity-50"
            >
              미리보기
            </button>
            <button
              type="button"
              onClick={onGenerate}
              disabled={generateFixtures.isPending || !hasLeagueStartsOn}
              className="min-h-[44px] rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              라운드로빈 대진 생성
            </button>
          </div>
          {!hasLeagueStartsOn && <MissingStartsOnNotice />}
          <TimingSuggestionRow
            suggestion={timingSuggestion}
            showNoFit={showTimingNoFit}
            onApply={(games) => setGamesPerTeamPerDay(String(games))}
          />
          {dailyPlan !== null && <DailyPlanCard plan={dailyPlan} />}
          <RecentVenueChips
            items={(series.recentVenues ?? []).map((venue) => ({ placeName: venue }))}
            selectedValue={placeName}
            onSelect={(venue) => setPlaceName(venue.placeName)}
          />
          <FixturePreviewPanel result={previewResult} teamNameById={teamNameById} />
          <p className="text-xs text-[var(--text-muted)]">
            요일·시각을 정하면 매주 그 요일 그 시각으로 채워요. 비워두면 시작일 그대로 매주 반복돼요.
            경기 시간(분)을 넣으면 그날 경기들이 휴식 간격으로 연달아 배치되고, 종료 시각까지 넣으면
            팀당 하루 경기 수를 계산해 제안해요. 생성 후 특정 주만 다르면 아래 표에서 개별 수정하면 돼요.
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
                  className={`${inputClass} w-40`}
                >
                  <option value="">시작일 그대로</option>
                  {WEEKDAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="regen-time" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">시작 시각</label>
                <input
                  id="regen-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  disabled={dayOfWeek === ''}
                  className={`${inputClass} w-36 disabled:opacity-50`}
                />
              </div>
              <FixtureTimingFields
                idPrefix="regen"
                dayOfWeekUnset={dayOfWeek === ''}
                endTime={endTime}
                onEndTimeChange={setEndTime}
                gameDurationMinutes={gameDurationMinutes}
                onGameDurationChange={setGameDurationMinutes}
                breakMinutes={breakMinutes}
                onBreakMinutesChange={setBreakMinutes}
                gamesPerTeamPerDay={gamesPerTeamPerDay}
                onGamesPerTeamPerDayChange={setGamesPerTeamPerDay}
              />
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
              {/* 그룹 B 감사 결함 3: 재생성도 같은 미리보기를 공유한다 — 새 로스터로
                  대진을 다시 계산했을 때 실제로 뭐가 만들어지는지 typedChallenge 확인
                  전에 먼저 보여준다. */}
              <button
                type="button"
                onClick={onPreview}
                disabled={previewFixtures.isPending || !hasLeagueStartsOn}
                className="min-h-[44px] rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text-strong)] disabled:opacity-50"
              >
                미리보기
              </button>
              <button
                type="button"
                onClick={() => setRegenerateModalOpen(true)}
                disabled={!hasLeagueStartsOn}
                className="min-h-[44px] rounded-xl bg-[var(--button-fill-warning)] px-4 text-sm font-semibold text-white hover:bg-[var(--button-fill-warning-hover)] transition-colors disabled:opacity-50"
              >
                대진 재생성
              </button>
            </div>
            {!hasLeagueStartsOn && <MissingStartsOnNotice />}
            <div className="mt-3 flex flex-col gap-3">
              <TimingSuggestionRow
                suggestion={timingSuggestion}
                showNoFit={showTimingNoFit}
                onApply={(games) => setGamesPerTeamPerDay(String(games))}
              />
              {dailyPlan !== null && <DailyPlanCard plan={dailyPlan} />}
            </div>
            <FixturePreviewPanel result={previewResult} teamNameById={teamNameById} />
          </div>

          <AdminDataTable<V1LeagueFixture>
            rows={series.fixtures}
            keyExtractor={(row) => row.teamMatchId}
            rowTone={(row) => (row.status === 'cancelled' ? 'danger' : undefined)}
            actionsHeader="관리"
            stickyActions
            renderActions={(row) =>
              row.status === 'cancelled' ? (
                <span className="text-xs text-[var(--text-muted)]">취소됨</span>
              ) : (
                <div className="flex items-center gap-2">
                  {/* U1(A안): 상대팀이 확정된(awayTeamId not null) 대진만 결과 처리 대상이다.
                      resultStage 미확정 4단계(not_entered/draft/change_requested/voided)는
                      신규 입력, official 은 정정 — awaiting_approval(상대팀 승인 대기 중)만
                      운영자 직접 입력 대상이 아니라 링크를 내지 않는다.
                      voided(무효화된 결과)도 재입력 대상이라 포함한다 — 여기서 빼면
                      무효화된 경기로 들어갈 입구가 사라진다.

                      Task 165 BE-3: 이 자리는 이제 **콘솔 딥링크**다. 리그 전용 결과 입력
                      모달·엔드포인트는 지웠고, 운영자는 대회와 같은 결과 검토 화면
                      (`/admin/live/:leagueId/result-review?fixtureId=`)에서 입력·정정한다.
                      그 화면이 리그를 볼 수 있는 것은 #985(콘솔 목록)와 #982(결과 명령
                      경계)가 거울을 지원하기 때문이다. */}
                  {row.awayTeamId !== null &&
                  (row.resultStage === undefined ||
                    row.resultStage === 'not_entered' ||
                    row.resultStage === 'draft' ||
                    row.resultStage === 'change_requested' ||
                    row.resultStage === 'voided' ||
                    row.resultStage === 'official') ? (
                    <Link
                      // 확정된 경기는 **정정 화면**으로 보낸다. `result-review` 는 *검토
                      // 대기* 목록이라 확정된 경기가 거기 없다 — 라벨은 "결과 정정" 인데
                      // 열리는 화면은 "검토할 결과가 없어요" 인 데드엔드였다(alpha 실측).
                      // 두 화면 다 `?fixtureId=` 로 딥링크를 받는다.
                      href={
                        row.resultStage === 'official'
                          ? `/admin/live/${encodeURIComponent(leagueId)}/records/corrections?fixtureId=${encodeURIComponent(row.teamMatchId)}`
                          : `/admin/live/${encodeURIComponent(leagueId)}/result-review?fixtureId=${encodeURIComponent(row.teamMatchId)}`
                      }
                      aria-label={`${row.title} ${row.resultStage === 'official' ? '결과 정정' : '결과 입력'}`}
                      className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-lg bg-[var(--blue50)] px-3 text-sm font-medium text-[var(--blue700)] transition-colors hover:bg-[var(--blue100)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                    >
                      {row.resultStage === 'official' ? '결과 정정' : '결과 입력'}
                    </Link>
                  ) : null}
                  {/* R11(C-6): 상대팀이 확정된(matched) 대진만 몰수 처리 대상이다 — 아직 상대가
                      없거나(awayTeamId null) 이미 완료된 대진은 버튼을 숨긴다. */}
                  {row.status === 'matched' && row.awayTeamId !== null ? (
                    <button
                      type="button"
                      onClick={() => setForfeitFixture(row)}
                      aria-label={`${row.title} 몰수패 처리`}
                      className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-lg bg-[var(--red50)] px-3 text-sm font-medium text-[var(--red700)] transition-colors hover:bg-[var(--red100)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                    >
                      몰수패 처리
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setCancelTarget(row)}
                    aria-label={`${row.title} 취소`}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--red50)] px-3 text-sm font-medium text-[var(--red700)] transition-colors hover:bg-[var(--red100)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
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
              // 열 순서: '경기' 바로 뒤. 처음엔 '상태' 뒤(맨 끝)에 뒀는데 alpha 1440 실측에서
              // 표 스크롤러가 clientWidth 898 / scrollWidth 1201 이라 결과 열의 오른쪽 끝이
              // x=1394 — 보이는 영역(1171) 밖이었다. **가로로 스크롤해야 보이는 결과 열**은
              // 이 기능의 목적(운영자가 막힌 경기를 한눈에)을 달성하지 못한다.
              //
              // D6(2026-08-24 확정): '상태' 열은 그대로 두고 '결과' 열을 따로 둔다.
              // 두 값은 다른 축이다 — status 는 "대진이 성사됐는가", resultStage 는
              // "결과가 어디까지 왔는가". 합치면 취소·매칭 같은 대진 자체의 상태가
              // 결과 단계에 가려진다. 이 열이 없던 동안 운영자는 어느 경기가 미입력인지,
              // 어느 경기가 상대팀 승인을 기다리는지 화면에서 알 방법이 없었다.
              {
                key: 'result',
                header: '결과',
                render: (row) => {
                  // 취소된 대진에 결과 단계를 붙이면 "미입력"이 영원히 처리해야 할 일처럼
                  // 보인다 — 취소는 결과를 기다리지 않으므로 단계 자체를 그리지 않는다.
                  if (row.status === 'cancelled') {
                    return <span className="text-xs text-[var(--text-muted)]">—</span>;
                  }
                  const stage = row.resultStage ?? 'not_entered';
                  const hasScore = row.homeScore !== null && row.homeScore !== undefined;
                  return (
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <AdminStatusPill status={`result_${stage}`} />
                      {hasScore ? (
                        <span className="text-sm font-medium tabular-nums text-[var(--text-strong)]">
                          {row.homeScore} : {row.awayScore}
                        </span>
                      ) : null}
                    </span>
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

      {/* 그룹 B 감사 결함 3: 참가팀 제외 확인 — 이전에는 칩의 X 버튼이 확인 없이 곧바로
          제외 + 관련 대진 취소를 실행했다. 되돌릴 경로(재추가 + 재생성)가 있어
          GateConfirmModal의 typedChallenge까지는 과하지만, 최소한의 확인은 필요하다.
          취소될 대진 수는 이미 로딩된 series.fixtures로 정확히 계산해 보여준다. */}
      <RemoveTeamConfirmModal
        open={removeTarget !== null}
        pending={removeTeam.isPending}
        teamName={removeTarget?.teamName ?? ''}
        fixtureCount={
          removeTarget
            ? series.fixtures.filter(
                (fixture) =>
                  fixture.status !== 'cancelled' &&
                  (fixture.homeTeamId === removeTarget.teamId || fixture.awayTeamId === removeTarget.teamId),
              ).length
            : 0
        }
        onConfirm={onConfirmRemoveTeam}
        onClose={() => setRemoveTarget(null)}
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

/**
 * 그룹 B 감사 결함 3 — 참가팀 제외 확인 모달. GateConfirmModal을 그대로 재사용하지
 * 않은 이유: 그 컴포넌트는 사유 입력을 필수로 강제하는데, DELETE /:leagueId/teams/:teamId
 * 는 사유 필드를 받지 않는다(감사 로그도 teamId·cancelledFixtureCount만 남긴다) — 입력받은
 * 사유를 어디에도 보내지 않으면서 필수인 척하는 게 더 나쁜 UX다. 대신 이 조작은
 * 되돌릴 경로가 있다(팀 재추가 + 대진 재생성, 공식 결과가 없는 한)는 verifierContext
 * 판단을 따라 typedChallenge 없이 내용 확인 + 클릭 두 번만 요구한다.
 */
function RemoveTeamConfirmModal({
  open,
  pending,
  teamName,
  fixtureCount,
  onConfirm,
  onClose,
}: {
  open: boolean;
  pending: boolean;
  teamName: string;
  fixtureCount: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { dialogRef, initialFocusRef, onBackdropClick, mounted, closing } = useModalA11y<HTMLButtonElement>({ open, onClose, pending });
  if (!mounted) return null;
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px] tm-modal-scrim${closing ? ' is-closing' : ''}`}
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remove-team-confirm-title"
        aria-describedby="remove-team-confirm-desc"
        className={`bg-[var(--card-surface)] rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-[420px] overflow-hidden tm-modal-panel${closing ? ' is-closing' : ''}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2
            id="remove-team-confirm-title"
            className="text-[16px] font-bold text-[var(--text-strong)] flex items-center gap-2"
          >
            <AlertTriangle size={17} className="text-[var(--orange700)]" aria-hidden="true" />
            {teamName}을(를) 제외할까요?
          </h2>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            aria-label="모달 닫기"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-5 flex flex-col gap-4">
          <p
            id="remove-team-confirm-desc"
            className="text-[13px] leading-relaxed rounded-xl border px-4 py-3 text-[var(--orange700)] bg-[var(--tint-orange)] border-[var(--tint-orange-border)]"
          >
            {fixtureCount > 0
              ? `리그 로스터에서 이 팀을 빼요. 이 팀이 낀 예정 대진 ${fixtureCount}경기도 함께 취소돼요. 되돌리려면 팀을 다시 추가하고 대진을 재생성해야 해요.`
              : '리그 로스터에서 이 팀을 빼요.'}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="min-h-[44px] rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text-strong)] disabled:opacity-50"
            >
              취소
            </button>
            <button
              ref={initialFocusRef}
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="min-h-[44px] rounded-xl bg-[var(--button-fill-warning)] px-4 text-sm font-semibold text-white hover:bg-[var(--button-fill-warning-hover)] transition-colors disabled:opacity-50"
            >
              {pending ? '제외하는 중…' : '제외'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatPreviewDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/**
 * 그룹 B 감사 결함 3 — 최초 생성·재생성 공용 미리보기 패널. DB에 아무것도 쓰지 않은
 * 상태에서 "이 설정으로 만들면 이렇게 된다"를 그대로 보여준다. result가 null이면(아직
 * 안 눌렀거나 직전 생성/재생성이 성공해 초기화됐을 때) 아무것도 렌더하지 않는다.
 */
/**
 * 리그 시작일이 응답에 없을 때의 안내. 대진 생성·미리보기·재생성 버튼이 잠긴 이유를 알린다.
 *
 * 서버가 이 필드를 항상 내려주므로 정상 경로에서는 보이지 않는다 — 구버전 API 를 보고 있을 때만
 * 나온다. 그때 **막지 않으면 요일 선택이 조용히 무시된 채 대진이 만들어진다.**
 * `role="alert"` 로 스크린리더에도 알린다(버튼 disabled 만으로는 이유를 알 수 없다).
 */
function MissingStartsOnNotice() {
  return (
    <p role="alert" className="mt-2 text-sm text-[var(--orange700)]">
      리그 시작일 정보를 불러오지 못했어요. 새로고침해 주세요.
    </p>
  );
}

function FixturePreviewPanel({
  result,
  teamNameById,
}: {
  result: V1PreviewLeagueFixturesResult | null;
  teamNameById: Map<string, string>;
}) {
  if (result === null) return null;
  // timing을 보내면 서버가 경기별 matchday/endAt을 채워준다 — 그때는 flat 테이블 대신
  // 매치데이별 타임라인(B안)로 렌더한다. 레거시 응답(필드 없음)은 기존 테이블 유지.
  const isTimingPreview = result.fixtures.some((fixture) => fixture.matchday !== undefined && fixture.endAt != null);
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4">
      <p className="mb-1 text-sm font-semibold text-[var(--text-strong)]">
        미리보기 — {result.matchdayCount ?? result.rounds}주 · {result.fixtureCount}경기 · 기본 장소 &quot;{result.placeName}&quot;
      </p>
      {result.warnings.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-[var(--tint-orange)] px-3 py-2 text-xs text-[var(--orange700)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{result.warnings.map((w) => w.message).join(' ')}</span>
        </div>
      )}
      {isTimingPreview ? (
        <div className="max-h-80 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card-surface)]">
          {groupPreviewByMatchday(result.fixtures).map((group) => (
            <div key={group.matchday}>
              <p className="border-t border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-strong)] first:border-t-0">
                {group.matchday}주차 — {formatKstDateShort(group.items[0].startAt)} · {group.items.length}경기
              </p>
              {group.items.map((fixture, index) => (
                <div
                  key={`${fixture.round}-${fixture.homeTeamId}-${fixture.awayTeamId}-${index}`}
                  className="flex items-center gap-3 border-t border-[var(--border)] px-3 py-2 text-xs"
                >
                  <span className="w-[96px] shrink-0 tabular-nums text-[var(--text-muted)]">
                    {formatKstTime(fixture.startAt)}~{fixture.endAt != null ? formatKstTime(fixture.endAt) : ''}
                  </span>
                  <span aria-hidden="true" className="h-5 w-[3px] shrink-0 rounded bg-blue-500/60" />
                  <span className="text-[var(--text-strong)]">
                    {teamNameById.get(fixture.homeTeamId) ?? '홈팀'} vs {teamNameById.get(fixture.awayTeamId) ?? '원정팀'}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[var(--card-surface)] text-[var(--text-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">주차</th>
                <th className="px-3 py-2 font-medium">대진</th>
                <th className="px-3 py-2 font-medium">일시</th>
              </tr>
            </thead>
            <tbody>
              {result.fixtures.map((fixture, index) => (
                <tr key={`${fixture.round}-${fixture.homeTeamId}-${fixture.awayTeamId}-${index}`} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 text-[var(--text-muted)]">{fixture.round}주차</td>
                  <td className="px-3 py-2 text-[var(--text-strong)]">
                    {teamNameById.get(fixture.homeTeamId) ?? '홈팀'} vs {teamNameById.get(fixture.awayTeamId) ?? '원정팀'}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{formatPreviewDateTime(fixture.startAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// 대진 timing 입력 4종(종료 시각 + 경기 시간·휴식·팀당 하루 경기). 생성·재생성 두 폼이 같은
// 마크업을 공유한다 — 부모의 flex-wrap 행 안에서 fragment 자식들이 그대로 flex 아이템이 된다.
function FixtureTimingFields({
  idPrefix,
  dayOfWeekUnset,
  endTime,
  onEndTimeChange,
  gameDurationMinutes,
  onGameDurationChange,
  breakMinutes,
  onBreakMinutesChange,
  gamesPerTeamPerDay,
  onGamesPerTeamPerDayChange,
}: {
  idPrefix: string;
  dayOfWeekUnset: boolean;
  endTime: string;
  onEndTimeChange: (value: string) => void;
  gameDurationMinutes: string;
  onGameDurationChange: (value: string) => void;
  breakMinutes: string;
  onBreakMinutesChange: (value: string) => void;
  gamesPerTeamPerDay: string;
  onGamesPerTeamPerDayChange: (value: string) => void;
}) {
  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-end-time`} className="mb-1 block text-sm font-medium text-[var(--text-strong)]">종료 시각</label>
        <input
          id={`${idPrefix}-end-time`}
          type="time"
          value={endTime}
          onChange={(e) => onEndTimeChange(e.target.value)}
          disabled={dayOfWeekUnset}
          className={`${inputClass} w-28 disabled:opacity-50`}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-game-duration`} className="mb-1 block text-sm font-medium text-[var(--text-strong)]">경기 시간(분)</label>
        <input
          id={`${idPrefix}-game-duration`}
          type="number"
          min={5}
          max={240}
          placeholder="예: 15"
          value={gameDurationMinutes}
          onChange={(e) => onGameDurationChange(e.target.value)}
          className={`${inputClass} w-28`}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-break-minutes`} className="mb-1 block text-sm font-medium text-[var(--text-strong)]">휴식(분)</label>
        <input
          id={`${idPrefix}-break-minutes`}
          type="number"
          min={0}
          max={120}
          placeholder="0"
          value={breakMinutes}
          onChange={(e) => onBreakMinutesChange(e.target.value)}
          className={`${inputClass} w-24`}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-games-per-day`} className="mb-1 block text-sm font-medium text-[var(--text-strong)]">팀당 하루 경기</label>
        <input
          id={`${idPrefix}-games-per-day`}
          type="number"
          min={1}
          max={10}
          placeholder="1"
          value={gamesPerTeamPerDay}
          onChange={(e) => onGamesPerTeamPerDayChange(e.target.value)}
          className={`${inputClass} w-28`}
        />
      </div>
    </>
  );
}

// C안: 시간창 역산 제안. 제안이 없더라도 "한 라운드도 못 치르는 창"이면 그 사실을 알려준다 —
// 조용히 사라지면 운영자는 왜 제안이 안 뜨는지 알 수 없다.
function TimingSuggestionRow({
  suggestion,
  showNoFit,
  onApply,
}: {
  suggestion: { gamesPerTeamPerDay: number; plan: DailyPlan } | null;
  showNoFit: boolean;
  onApply: (games: number) => void;
}) {
  if (suggestion === null) {
    if (!showNoFit) return null;
    return (
      <div className="flex items-start gap-2 rounded-lg bg-[var(--tint-orange)] px-3 py-2 text-xs text-[var(--orange700)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>이 시간창엔 한 라운드도 못 치러요. 종료 시각을 늦추거나 경기 시간·휴식을 줄여주세요.</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-[var(--tint-blue-border)] px-3 py-2 text-xs text-[var(--text-strong)]">
      <span>
        이 시간창이면 <b>팀당 {suggestion.gamesPerTeamPerDay}경기 · 하루 {suggestion.plan.totalGamesPerDay}경기</b> 가능해요
        {suggestion.plan.lastGameEndTime !== null && (
          <> — {dayOffsetLabel(suggestion.plan.daysLater)}{suggestion.plan.lastGameEndTime} 종료</>
        )}
      </span>
      <button
        type="button"
        onClick={() => onApply(suggestion.gamesPerTeamPerDay)}
        className="min-h-[36px] rounded-lg border border-[var(--border-strong)] px-3 text-xs font-semibold text-[var(--text-strong)] hover:border-blue-500 hover:text-[var(--blue700)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
      >
        이대로 적용
      </button>
    </div>
  );
}

function formatMinutesLabel(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}분`;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

// B안: 하루 운영 계산 카드 — 현재 폼 값이 만들 하루치 스케줄을 입력 즉시 요약한다.
function DailyPlanCard({ plan }: { plan: DailyPlan }) {
  return (
    <div className="rounded-2xl border border-[var(--tint-blue-border)] bg-[var(--tint-blue)] p-4">
      <p className="mb-2 text-sm font-semibold text-[var(--text-strong)]">하루 운영 계산</p>
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        <div>
          <dt className="text-xs text-[var(--text-muted)]">하루 총 경기</dt>
          <dd className="m-0 text-lg font-bold tabular-nums text-[var(--blue700)]">{plan.totalGamesPerDay}경기</dd>
        </div>
        {plan.lastGameEndTime !== null && (
          <div>
            <dt className="text-xs text-[var(--text-muted)]">마지막 경기 종료</dt>
            <dd className="m-0 text-lg font-bold tabular-nums text-[var(--blue700)]">
              {dayOffsetLabel(plan.daysLater)}{plan.lastGameEndTime}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-[var(--text-muted)]">총 소요</dt>
          <dd className="m-0 text-lg font-bold tabular-nums text-[var(--blue700)]">{formatMinutesLabel(plan.totalMinutes)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-muted)]">팀당</dt>
          <dd className="m-0 text-lg font-bold tabular-nums text-[var(--blue700)]">{plan.gamesPerTeamPerDay}경기</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * 리그 참가 신청 요약 + 관리 화면 입구.
 *
 * 신청 열기 폼과 신청 목록은 **별도 라우트**
 * `/admin/league-matches/:leagueId/registrations`
 * (`registrations/league-registrations-client.tsx`)에 둔다. 이 파일은 이미
 * 1,400줄이 넘고, 목록은 대회 화면의
 * `RegistrationsTab`(`app/admin/tournaments/[id]/registrations-tab.tsx`)을 재사용하는데
 * 그게 훅을 여덟 개 넘게 쓴다 — 여기 인라인으로 넣으면 이 화면의 기존 테스트가 전부 그 훅들을 목킹해야 한다
 * (실제로 30건이 깨졌다). 관심사도 다르다: 여기는 대진, 저기는 신청이다.
 */
function LeagueRegistrationSummary({
  leagueId,
  registrationOpen,
  registrationDeadlineAt,
}: {
  leagueId: string;
  registrationOpen: boolean;
  registrationDeadlineAt: string | null;
}) {
  return (
    <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-[var(--text-strong)]">참가 신청</p>
        {registrationOpen ? (
          <span className="tm-badge tm-badge-blue">모집 중</span>
        ) : (
          <span className="tm-badge tm-badge-grey">신청 안 받는 중</span>
        )}
      </div>
      {/* **받는지는 `registrationOpen`, 마감 유무는 그 이유다.**
          2026-09-04 사용자 확정으로 리그의 신청 판정자는 `registrationDeadlineAt` 하나가
          됐다(`status` 는 수명주기 표시 전용). 정본 §6 이 그 대가를 명시한다 —
          **"안 정하면(`null`) 그 리그는 신청을 안 받는다."** 그래서 "기한 없이 열림" 이라는
          상태는 이제 없다(앞선 PR 에서 내가 반대로 적었던 것을 정본대로 되돌린다). */}
      <p className="mb-3 text-xs text-[var(--text-muted)]">
        {registrationOpen && registrationDeadlineAt !== null
          ? `${formatTournamentDateTimeShort(registrationDeadlineAt) ?? registrationDeadlineAt}까지 신청을 받아요.`
          : registrationDeadlineAt === null
            ? '신청 마감을 정하면 팀장이 리그 화면에서 바로 신청할 수 있어요.'
            : `신청이 마감됐어요. 마감은 ${formatTournamentDateTimeShort(registrationDeadlineAt) ?? registrationDeadlineAt} 였어요.`}
      </p>
      <Link
        href={`/admin/league-matches/${leagueId}/registrations`}
        className="tm-btn tm-btn-sm tm-btn-outline"
        style={{ minHeight: 44 }}
      >
        신청 관리
      </Link>
    </div>
  );
}
