'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertBanner, Card, EmptyState, ErrorState, SectionTitle } from '@/components/v1-ui/primitives';
import { LoadLineupSheet, type LoadableLineup } from '@/components/lineup/load-lineup-sheet';
import { SavePresetDialog } from '@/components/lineup/save-preset-dialog';
import {
  buildRecentJerseyMap, describeSkipped, presetNamePlaceholder, resolveJerseyNumber, resolveLoadableEntries,
} from '@/components/lineup/lineup-source';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { PlusIcon } from '@/components/v1-ui/icons';
import { useShellOverride } from '@/components/v1-ui/shell-override';
import { GameRosterPlayerRow } from '@/components/game-roster/game-roster-player-row';
import { LineupJerseySheet, type LineupJerseyScope } from '@/components/lineup/lineup-jersey-sheet';
import { LateLineupAdditionSheet } from '@/components/team-matches/late-lineup-addition-sheet';
import { useV1TeamUnavailability } from '@/hooks/use-v1-game-roster';
import { DESKTOP_LIST_MEDIA_QUERY, useMediaQuery } from '@/hooks/use-media-query';
import {
  useV1ChangeMembershipJersey,
  useV1MyTeams,
  useV1SaveTeamMatchLineup,
  useV1SubmitTeamMatchLineup,
  useV1TeamMatch,
  useV1TeamMatchLineup,
  useV1TeamMembers,
  useV1CreateLineupPreset,
  useV1TeamLineupHistory,
  useV1TeamLineupPresets,
  useV1UpdateLineupPreset,
  useV1Game,
} from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import { formatTournamentDateShort, formatTournamentDateTimeLong } from '@/lib/date-utils';
import { josa } from '@/lib/korean';
import { friendlyRsvpLabel } from '@/lib/v1-status-labels';
import { getStatus } from '@/components/team-matches/team-matches.card-model';
import { randomUuid } from '@/lib/uuid';
import type { V1TeamMatchLineup } from '@/types/api';
import type { LineupEditorState, LineupEntryDraft, LineupNotice, RosterOption } from './lineup.view-model';
import {
  addAllRosterMembersToLineup,
  applySaveResult,
  applyVersionConflictReload,
  buildSavePayload,
  compareByJersey,
  competitionRosterHref,
  describeGoalkeeperNotice,
  describeLineupPhase,
  describeLineupSizeNotice,
  describeOpponentSkipped,
  describePublicationCountdown,
  describePublicationNotice,
  describeRemaining,
  formatPublicationTime,
  hydrateLineupEditorState,
  isCompetitionLineupRoute,
  serverRosterEntries,
  isRosterMemberPlaced,
  addGuestToLineup,
  addRosterMemberToLineup,
  findJerseyHolder,
  replaceEntries,
  removeEntry,
  resolveOwnTeamId,
  resolvePublicLineupAt,
  restoreEntry,
  setGoalkeeper,
  setJerseyNumber,
  validateLineupForSubmit,
} from './lineup.view-model';

export function TeamMatchLineupPageClient({ teamMatchId }: { teamMatchId: string }) {
  const teamMatchQuery = useV1TeamMatch(teamMatchId);
  const myTeamsQuery = useV1MyTeams();
  const lineupQuery = useV1TeamMatchLineup(teamMatchId);
  // 1440(D-4)은 요약·제출이 목록 옆 카드로 간다 — 같은 글을 두 번 그리지 않게 한쪽만 렌더한다.
  const isDesktop = useMediaQuery(DESKTOP_LIST_MEDIA_QUERY);

  const ownTeamId = useMemo(
    () => resolveOwnTeamId(teamMatchQuery.data, myTeamsQuery.data),
    [teamMatchQuery.data, myTeamsQuery.data],
  );
  const isCompetition = isCompetitionLineupRoute({
    league: teamMatchQuery.data?.league,
    teamMatchErrorCode: extractErrorCode(teamMatchQuery.error),
    lineupLoaded: lineupQuery.isSuccess,
  });
  const competitionGameQuery = useV1Game(lineupQuery.data?.gameId, { enabled: isCompetition && ownTeamId === null });
  const rosterQuery = useV1TeamMembers(ownTeamId, { limit: 100 }, { enabled: Boolean(ownTeamId) && !isCompetition });
  const rsvpByUserId = useMemo(
    () => new Map((lineupQuery.data?.eligibleMembers ?? []).map((member) => [member.userId, member.rsvpStatus ?? null])),
    [lineupQuery.data],
  );
  const alsoOpponentUserIds = useMemo(
    () => new Set((lineupQuery.data?.eligibleMembers ?? []).filter((member) => member.alsoOpponentMember === true).map((member) => member.userId)),
    [lineupQuery.data],
  );
  const rosterPool: RosterOption[] = useMemo(
    () =>
      (rosterQuery.data?.items ?? [])
        .map((member) => ({
          userId: member.userId,
          displayName: member.displayName,
          role: member.role,
          jerseyNumber: member.jerseyNumber ?? null,
          membershipId: member.membershipId,
          rsvpStatus: rsvpByUserId.get(member.userId) ?? null,
          alsoOpponentMember: alsoOpponentUserIds.has(member.userId),
        }))
        .sort(compareByJersey),
    [rosterQuery.data, rsvpByUserId, alsoOpponentUserIds],
  );
  const changeTeamJersey = useV1ChangeMembershipJersey(ownTeamId);

  const [loadSheetOpen, setLoadSheetOpen] = useState(false);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [presetError, setPresetError] = useState<string | null>(null);
  // 시트를 열기 전에는 불러오지 않는다 — 대부분의 방문은 명단만 손보고 끝난다.
  const historyQuery = useV1TeamLineupHistory(ownTeamId, { enabled: loadSheetOpen });
  const presetsQuery = useV1TeamLineupPresets(ownTeamId, { enabled: loadSheetOpen || savePresetOpen });
  const createPreset = useV1CreateLineupPreset(ownTeamId);
  const updatePreset = useV1UpdateLineupPreset(ownTeamId);

  /** 지금 이 참석명단에 넣을 수 있는 활성 팀원. 참석 응답 여부와 무관하다. */
  const eligibleMembers = lineupQuery.data?.eligibleMembers ?? [];
  const [state, setState] = useState<LineupEditorState | null>(null);
  const hydratedRevisionRef = useRef<number | null>(null);
  useEffect(() => {
    // 최초 진입 시 딱 한 번만 서버 응답으로 수화한다 — 이후 재조회(refetch)로 lineupQuery.data가
    // 갱신돼도 편집 중인 로컬 상태를 덮어쓰지 않는다. 버전 충돌 "새로고침" 액션은
    // handleConflictReload()에서 별도로 명시적 재수화한다.
    if (lineupQuery.data && hydratedRevisionRef.current === null) {
      setState(hydrateLineupEditorState(lineupQuery.data));
      hydratedRevisionRef.current = lineupQuery.data.revision;
    }
  }, [lineupQuery.data]);

  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // 종목 이름은 "이전 참석명단 불러오기"가 **다른 종목의 명단을 끌어오지 않도록** 거르는 데
  // 쓴다(아래 sportName 필터). 코트 배치·포메이션 선택은 Task 163 에서 전술보드로 옮겨
  // 이 화면에서 사라졌다 — 그래서 종목별 코트 allowlist 도 여기 남지 않는다.
  const formationSupportedSportName = teamMatchQuery.data?.sport?.name ?? null;
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const saveMutation = useV1SaveTeamMatchLineup(teamMatchId);
  const submitMutation = useV1SubmitTeamMatchLineup(teamMatchId);
  const [lastSubmittedRevision, setLastSubmittedRevision] = useState<number | null>(null);

  const kickoffAt = teamMatchQuery.data?.startsAt;
  const matchCancelled = teamMatchQuery.data ? getStatus(teamMatchQuery.data) === 'cancelled' : false;
  const phase = lineupQuery.data
    ? describeLineupPhase(
        lineupQuery.data.state,
        lineupQuery.data.editable === true,
        lineupQuery.data.lockReason ?? null,
        matchCancelled,
        lineupQuery.data.lateAdditionAllowed === true,
      )
    : null;
  const editable = Boolean(phase?.editable) && isOnline;
  // 첫 기록 뒤: 편집은 닫히고 늦게 온 선수 추가만 열린다(H5 결정 A).
  const addOnly = !matchCancelled && lineupQuery.data?.lateAdditionAllowed === true && !phase?.editable && isOnline;
  // 친선 참석명단은 결장 기간으로 자동으로 빼지 않는다(제출하는 명단이다) — 고를 때 보이게만 한다(Task 179).
  const kickoffIso = kickoffAt && Number.isFinite(Date.parse(kickoffAt)) ? new Date(kickoffAt).toISOString() : null;
  const unavailabilityQuery = useV1TeamUnavailability(ownTeamId, kickoffIso, {
    enabled: !isCompetition && phase?.editable === true,
  });

  // ── 자동저장: 서버 ack 전에는 절대 "저장됨"이라 말하지 않는다 ──
  //
  // in-flight 가드(Task 15 blocker-4): 디바운스 타이머가 매번 곧장 saveMutation.mutate()를
  // 부르면, 느린 회선에서 사용자가 이전 저장이 아직 ack되기 전에 편집을 이어가는 동안
  // 두 번째 저장이 같은(아직 갱신되지 않은) expectedVersion을 들고 서버로 나갈 수 있다 —
  // 첫 저장이 revision을 올린 직후 두 번째가 도착하면 "다른 사람"이 아니라 자기 자신의
  // 직전 저장 때문에 409 VERSION_CONFLICT를 받고, "새로고침"은 부분 병합을 하지 않으므로
  // 방금 만든 편집이 통째로 사라진다. saveInFlightRef로 저장이 겹치지 않게 직렬화하고,
  // 겹쳤을 때는 버리지 않고 큐에 남겨 직전 저장이 끝나는 즉시(최신 state로) 이어서 보낸다.
  const latestStateRef = useRef(state);
  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);
  const latestEditableRef = useRef(editable);
  useEffect(() => {
    latestEditableRef.current = editable;
  }, [editable]);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);
  // 제출 버튼을 눌렀는데 아직 dirty(또는 저장이 진행 중)면, 자동저장 디바운스(900ms)를
  // 수동으로 기다리게 하지 않고 곧바로 저장을 한 번 밀어넣은 뒤 그 ack로 받은 revision으로
  // 이어서 제출한다("flush-then-submit" — insane review P0-1 완전판, 아래 handleSubmit 참고).
  // ref는 비동기 콜백(onSuccess/onError) 안에서 재진입 여부를 동기적으로 판정하는 용도,
  // submitFlowPending(state)은 버튼 disabled/라벨을 렌더링하는 용도 — 항상 같이 갱신한다.
  const pendingSubmitRef = useRef(false);
  const [submitFlowPending, setSubmitFlowPending] = useState(false);
  function runQueuedSave() {
    const current = latestStateRef.current;
    if (!current || !current.dirty || !latestEditableRef.current) return;
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      return;
    }
    saveInFlightRef.current = true;
    setSaveStatus('saving');
    setSaveErrorMessage(null);
    saveMutation.mutate(
      {
        idempotencyKey: randomUuid(),
        payload: buildSavePayload(current),
      },
      {
        onSuccess: (result) => {
          // 이 저장이 서버로 나가 있는 동안 사용자가 더 편집했는지는 setState 콜백(비동기
          // 스케줄링) 안이 아니라 latestStateRef로 지금 바로 동기적으로 판정한다 — ack가
          // 온 시점엔 그 사이의 모든 렌더·effect가 이미 커밋된 뒤이므로 안전하다.
          const editedDuringSave = latestStateRef.current !== current;
          setState((prev) => {
            if (!prev) return prev;
            const updated = applySaveResult(prev, result);
            // `prev`가 이 요청에 실제로 실어 보낸 `current`와 다르면, 이 저장이 서버로
            // 나가 있는 동안 사용자가 더 편집한 것이다 — 그 편집은 방금 받은 ack에
            // 포함되지 않았으므로 dirty를 되살려야 큐에 쌓인 다음 저장이 계속 예약된다
            // (그러지 않으면 baseRevision만 갱신되고 새 편집은 조용히 저장되지 않는다).
            return prev === current ? updated : { ...updated, dirty: true };
          });
          setSaveStatus('saved');
          if (pendingSubmitRef.current) {
            if (editedDuringSave) {
              // 방금 저장에 실리지 못한 편집이 남아 있다 — 디바운스를 기다리지 않고
              // onSettled가 곧장 한 번 더 저장을 밀어넣도록 예약한다(사용자는 지금
              // 제출을 기다리고 있다).
              saveQueuedRef.current = true;
            } else {
              pendingSubmitRef.current = false;
              setSubmitFlowPending(false);
              submitWithVersion(result.revision);
            }
          }
        },
        onError: (error) => {
          if (error instanceof V1ApiError && error.code === 'VERSION_CONFLICT') {
            setConflict(true);
          }
          setSaveStatus('error');
          if (pendingSubmitRef.current) {
            pendingSubmitRef.current = false;
            setSubmitFlowPending(false);
            setSaveErrorMessage('변경사항을 저장하지 못해 참석명단을 제출할 수 없어요. 다시 시도해 주세요.');
          } else {
            setSaveErrorMessage(extractErrorMessage(error, '변경사항을 저장하지 못했어요.'));
          }
        },
        onSettled: () => {
          saveInFlightRef.current = false;
          if (saveQueuedRef.current) {
            saveQueuedRef.current = false;
            runQueuedSave();
          }
        },
      },
    );
  }

  /** 저장이 이미 최신 상태로 끝난 뒤에만 호출되는 실제 제출 실행부 — expectedVersion은
   * 항상 방금 ack된(또는 애초에 dirty가 아니었던) baseRevision이다. */
  function submitWithVersion(expectedVersion: number) {
    submitMutation.mutate(
      { idempotencyKey: randomUuid(), expectedVersion },
      {
        onSuccess: () => {
          setLastSubmittedRevision(expectedVersion);
          // 불러오기·프리셋 저장 결과 안내는 제출 전 작업의 것이다 — 제출 뒤에도 남으면 지금 상태처럼 읽힌다.
          setLoadNotice(null);
        },
        onError: (error) => {
          if (error instanceof V1ApiError && error.code === 'VERSION_CONFLICT') {
            setConflict(true);
          }
          setSaveErrorMessage(extractErrorMessage(error, '참석명단을 제출하지 못했어요.'));
        },
      },
    );
  }

  // 미저장 변경이 있는 채로 탭을 닫거나 새로고침하면 브라우저 기본 경고를 띄운다 —
  // 자동저장을 없앤 대가로 "저장 안 하고 나가면 잃는다"는 위험이 생겼으므로, 그 위험을
  // 사용자가 모르고 지나치지 않게 막는 것까지가 이 변경의 범위다.
  useEffect(() => {
    if (!state?.dirty || !editable) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // 최신 브라우저는 문구를 무시하고 기본 경고만 보여주지만, returnValue 설정은 여전히
      // "경고를 띄우겠다"는 신호로 요구된다.
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [state?.dirty, editable]);

  function handleConflictReload() {
    lineupQuery.refetch().then((result) => {
      if (result.data) {
        setState(applyVersionConflictReload(result.data));
        hydratedRevisionRef.current = result.data.revision;
      }
    });
    setConflict(false);
    setSaveStatus('idle');
  }

  const [guestName, setGuestName] = useState('');
  const [lateSheetOpen, setLateSheetOpen] = useState(false);
  const [jerseyTargetKey, setJerseyTargetKey] = useState<string | null>(null);
  const [jerseyError, setJerseyError] = useState<string | null>(null);

  // insane review(P1-3, 2026-08 GPT Pro): "제외" 버튼은 실제로는 완전 삭제(moveEntry의
  // 선발↔후보 이동과 다르다) — 등번호·GK 지정·피치 좌표가 전부 소실되고, 재수화된 뒤라면
  // (userId가 없으므로) 다시 팀원 목록에서 찾지도 못해 처음부터 재입력해야 했다. 확인
  // 모달 대신 5초 실행취소 토스트로 되돌릴 수 있게 한다 — pendingRemoval이 지운 엔트리
  // 전체(등번호·GK·좌표 포함)와 원래 슬롯·인덱스를 들고 있다가, 실행취소 시 그 자리에
  // 그대로 복원한다(restoreEntry).
  const [pendingRemoval, setPendingRemoval] = useState<{ entry: LineupEntryDraft; index: number } | null>(
    null,
  );
  const pendingRemovalTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (pendingRemovalTimerRef.current !== null) {
        window.clearTimeout(pendingRemovalTimerRef.current);
      }
    };
  }, []);

  function handleRemoveEntry(entry: LineupEntryDraft, index: number) {
    setState((prev) => (prev ? removeEntry(prev, entry.key) : prev));
    if (pendingRemovalTimerRef.current !== null) {
      window.clearTimeout(pendingRemovalTimerRef.current);
    }
    setPendingRemoval({ entry, index });
    pendingRemovalTimerRef.current = window.setTimeout(() => {
      setPendingRemoval(null);
      pendingRemovalTimerRef.current = null;
    }, 5000);
  }

  function handleUndoRemoval() {
    if (!pendingRemoval) return;
    const { entry, index } = pendingRemoval;
    setState((prev) => (prev ? restoreEntry(prev, entry, index) : prev));
    if (pendingRemovalTimerRef.current !== null) {
      window.clearTimeout(pendingRemovalTimerRef.current);
      pendingRemovalTimerRef.current = null;
    }
    setPendingRemoval(null);
  }

  if (teamMatchQuery.isLoading || lineupQuery.isLoading || myTeamsQuery.isLoading) {
    return <PageSkeleton variant="detail" />;
  }

  if (isCompetition) {
    if (competitionGameQuery.isLoading) return <PageSkeleton variant="detail" />;
    return (
      <CompetitionRosterNotice
        href={competitionRosterHref(ownTeamId, lineupQuery.data, competitionGameQuery.data?.sides)}
      />
    );
  }

  if (lineupQuery.isError) {
    const code = lineupQuery.error instanceof V1ApiError ? lineupQuery.error.code : null;
    const message =
      code === 'PERMISSION_DENIED'
        ? '팀장 또는 매니저만 참석명단을 관리할 수 있어요.'
        : code === 'TEAM_MATCH_NOT_FOUND'
          ? '팀매치를 찾을 수 없어요.'
          : code === 'TEAM_MATCH_GAME_REQUIRED'
            ? '경기 정보가 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.'
            : extractErrorMessage(lineupQuery.error, '참석명단을 불러오지 못했어요.');
    return (
      <div style={{ padding: '40px 20px' }}>
        <ErrorState
          message={message}
          onRetry={code === 'PERMISSION_DENIED' || code === 'TEAM_MATCH_NOT_FOUND' ? undefined : () => void lineupQuery.refetch()}
        />
      </div>
    );
  }

  if (!lineupQuery.data || !state || !phase) {
    return <PageSkeleton variant="detail" />;
  }

  const lineup = lineupQuery.data;
  const waitingMembers = rosterPool.filter((member) => !isRosterMemberPlaced(state, member));
  // 두 팀 소속은 "모두 넣기"에서 빠진다(W4-V4). 그들만 남은 빈 명단은 시작 카드에 넣을 사람이 없으니
  // 후보 목록을 바로 보여 한 명씩 넣게 한다 — 안 그러면 넣을 길이 불러오기뿐이다.
  const addAllCount = waitingMembers.filter((member) => member.alsoOpponentMember !== true).length;
  const unavailableByUser = new Map((unavailabilityQuery.data?.items ?? []).map((item) => [item.userId, item]));
  // 편집할 수 없을 때는 서버가 가진 명단 그대로 — 추가만 모드에서 늦게 온 선수가 붙으면 바로 보인다.
  const rosterRows = (editable ? state.participants : serverRosterEntries(lineup)).slice().sort(compareByJersey);
  const showWaitingList = rosterRows.length > 0 || (addAllCount === 0 && waitingMembers.length > 0);
  const sizeNotice = editable ? describeLineupSizeNotice(state.participants.length, lineup.lineupConfig) : null;
  const goalkeeperNotice = editable ? describeGoalkeeperNotice(state.participants.filter((entry) => entry.goalkeeper).length) : null;
  const publicAt = resolvePublicLineupAt(lineup.publicLineupAt, kickoffAt);
  // 공개 안내는 공개 전에만 — 공개 뒤에는 카운트다운 줄이 "공개됐어요"를 말한다.
  const publicationNotice =
    matchCancelled || publicAt === null || Date.parse(publicAt) <= now ? null : describePublicationNotice(publicAt, kickoffAt, now);
  const lateCandidates = rosterPool.filter((member) => !rosterRows.some((row) => row.userId === member.userId));

  // 불러오기 목록(L8): "9/30 (수) vs 합정 유나이티드 · 8명", 편집 중인 이 경기 자신은 뺀다.
  const loadableHistory: LoadableLineup[] = (historyQuery.data?.items ?? [])
    .filter((item) => item.gameId !== lineup.gameId)
    .map((item) => ({
      key: `history:${item.lineupId}`,
      kind: 'history',
      title: [
        formatTournamentDateShort(item.playedAt),
        item.opponentName !== null ? `vs ${item.opponentName}` : null,
      ]
        .filter((part): part is string => part !== null)
        .join(' ')
        .concat(` · ${item.participants.length}명`),
      subtitle: item.sourceLabel,
      sportName: item.sportName,
      formation: item.formation,
      entries: item.participants,
    }));
  const loadablePresets: LoadableLineup[] = (presetsQuery.data?.items ?? []).map((preset) => ({
    key: `preset:${preset.presetId}`,
    kind: 'preset',
    title: preset.name,
    subtitle: `${preset.entries.length}명`,
    sportName: preset.sportName,
    formation: preset.formation,
    entries: preset.entries,
  }));

  /**
   * 고른 라인업으로 명단을 채운다.
   *
   * 활성 팀원은 참석 응답과 무관하게 모두 불러올 수 있다. 현재 팀에서 빠진 사람만
   * `not_in_team`으로 제외하고, 비연동 게스트는 그대로 허용한다.
   */
  function handleSelectLineup(lineup: LoadableLineup) {
    const recentJersey = buildRecentJerseyMap(historyQuery.data?.items ?? []);
    const resolved = resolveLoadableEntries({
      entries: lineup.entries,
      eligible: eligibleMembers.map((member) => ({
        userId: member.userId,
        displayName: member.displayName,
        jerseyNumber: member.jerseyNumber,
      })),
      // 팀 매치는 비연동 게스트(용병 등)를 명단에 둘 수 있다.
      allowGuests: true,
      missingReason: 'not_in_team',
    });
    const keepPlacement =
      lineup.sportName === null ||
      formationSupportedSportName === null ||
      lineup.sportName === formationSupportedSportName;

    setState((previous) =>
      previous === null
        ? previous
        : replaceEntries(
            previous,
            resolved.applied.map((item) => ({
              ...item,
              jerseyNumber: resolveJerseyNumber({
                loaded: item.jerseyNumber,
                recent: item.userId !== null ? recentJersey.get(item.userId) ?? null : null,
              }),
            })),
            { formation: lineup.formation, keepPlacement },
          ),
    );
    setLoadNotice(
      describeSkipped(resolved.applied.length, resolved.skipped) ??
        (keepPlacement
          ? `${resolved.applied.length}명을 불러왔어요.`
          : `${resolved.applied.length}명을 불러왔어요 · 종목이 달라 배치는 새로 잡아 주세요.`),
    );
    setLoadSheetOpen(false);
  }

  /** 아직 없는 팀원을 번호순으로 한 번에 넣는다(A-1). 겹치는 팀 번호는 비워 두고 누구인지 알린다. */
  function handleAddAll() {
    if (state === null) return;
    const result = addAllRosterMembersToLineup(state, rosterPool);
    setState(result.state);
    const notices = [
      describeOpponentSkipped(result.skippedOpponent),
      result.clearedJersey.length === 0
        ? null
        : `${result.clearedJersey.join(', ')}님은 팀 등번호가 다른 선수와 겹쳐 비워 뒀어요. 등번호를 직접 넣어 주세요.`,
    ].filter((notice): notice is string => notice !== null);
    setLoadNotice(notices.length === 0 ? null : notices.join(' '));
  }

  const jerseyTarget = jerseyTargetKey === null ? null : state.participants.find((entry) => entry.key === jerseyTargetKey) ?? null;
  const jerseyMember = jerseyTarget?.userId ? rosterPool.find((member) => member.userId === jerseyTarget.userId) ?? null : null;

  /** 번호 시트(D-5): 이 경기만이면 초안만, 팀 번호도 함께면 팀 번호를 먼저 저장한 뒤 초안까지 바꾼다. */
  function handleSaveJersey(jerseyNumber: number | null, scope: LineupJerseyScope) {
    if (jerseyTarget === null) return;
    const key = jerseyTarget.key;
    const applyToDraft = () => {
      setState((prev) => (prev ? setJerseyNumber(prev, key, jerseyNumber) : prev));
      setJerseyTargetKey(null);
    };
    setJerseyError(null);
    if (scope === 'match' || jerseyMember?.membershipId === undefined) {
      applyToDraft();
      return;
    }
    changeTeamJersey.mutate(
      { membershipId: jerseyMember.membershipId, jerseyNumber },
      {
        onSuccess: applyToDraft,
        onError: (error) => setJerseyError(extractErrorMessage(error, '팀 번호를 바꾸지 못했어요. 이 경기만 바꾸거나 다시 시도해 주세요.')),
      },
    );
  }

  /** 팀 등번호를 기본값으로 채우되, 명단의 다른 행이 이미 쓰는 번호면 비워 두고 알린다. */
  function handleAddMember(member: RosterOption) {
    if (state === null) return;
    const holder = member.jerseyNumber == null ? null : findJerseyHolder(state, member.jerseyNumber);
    setState((prev) => (prev ? addRosterMemberToLineup(prev, member) : prev));
    // 충돌이 없으면 떠 있던 안내(불러오기 결과 등)를 그대로 둔다.
    if (holder !== null && member.jerseyNumber != null) {
      setLoadNotice(
        `${member.displayName}님의 팀 등번호 ${member.jerseyNumber}번은 ${josa(holder, ['이', '가'])} 쓰고 있어서 비워 뒀어요. 등번호를 직접 넣어 주세요.`,
      );
    }
  }

  async function handleSavePreset(name: string) {
    if (state === null) return;
    setPresetError(null);
    // 프리셋은 **팀 내부 도구**라 이 태스크가 계약을 바꾸지 않는다(163: `V1TeamLineupPresetEntry`
    // 는 건드리지 않는다). 그래서 `started` 를 계속 싣되, 명단에 선발 구분이 없으므로
    // **전원 `true`** 로 보낸다 — 불러올 때 `replaceEntries` 가 그 값을 무시하고 전원을
    // 명단에 넣으므로 왕복이 성립한다.
    const entries = state.participants.map((entry) => ({
      ...(entry.userId !== null ? { userId: entry.userId } : {}),
      displayName: entry.displayName,
      ...(entry.jerseyNumber !== null ? { jerseyNumber: entry.jerseyNumber } : {}),
      ...(entry.position !== null ? { position: entry.position } : {}),
      ...(entry.positionX !== null && entry.positionY !== null
        ? { positionX: entry.positionX, positionY: entry.positionY }
        : {}),
      started: true,
      goalkeeper: entry.goalkeeper,
    }));
    const payload = {
      name,
      ...(state.formation !== null ? { formation: state.formation } : {}),
      ...(formationSupportedSportName !== null ? { sportName: formationSupportedSportName } : {}),
      entries,
    };
    try {
      const existing = (presetsQuery.data?.items ?? []).find((preset) => preset.name === name);
      if (existing !== undefined) {
        await updatePreset.mutateAsync({ presetId: existing.presetId, body: payload });
      } else {
        await createPreset.mutateAsync(payload);
      }
      setSavePresetOpen(false);
      setLoadNotice(`'${name}' 프리셋으로 저장했어요.`);
    } catch (error) {
      setPresetError(extractErrorMessage(error, '프리셋을 저장하지 못했어요.'));
    }
  }
  const validationErrors = validateLineupForSubmit(state);
  const publicationLabel = matchCancelled ? null : describePublicationCountdown(publicAt, now);
  const submittedWithoutChanges =
    !state.dirty &&
    (lineupQuery.data.state === 'SUBMITTED' ||
      lineupQuery.data.state === 'LOCKED' ||
      lastSubmittedRevision === state.baseRevision);

  // insane review(P0-1, 2026-08 GPT Pro): 제출은 항상 서버에 마지막 저장된 revision만 실어
  // 보내야 한다. 자동저장은 900ms 디바운스 뒤에야 실행되므로, 방금 입력을 마치자마자 제출을
  // 누르면 그 입력이 저장되기 전에 구버전 초안이 제출·잠금될 수 있었다 — 그래서 버튼을
  // dirty일 때 비활성화하는 것만으로는 부족하다("저장 진행 중 편집"까지는 못 막는다). 여기서는
  // 직렬 상태 머신으로 만든다: dirty거나 저장이 진행 중이면 디바운스를 기다리지 않고 곧장
  // 저장을 밀어넣고(runQueuedSave), 그 ack로 받은 새 revision으로만 제출한다. 저장이
  // 실패하거나 버전 충돌이면 제출 자체를 하지 않고 이유를 보여준다(runQueuedSave의
  // onError/pendingSubmitRef 분기).
  function handleSubmit() {
    if (!state) return;
    if (pendingSubmitRef.current) return; // 이미 flush 진행 중 — 중복 클릭 무시
    if (state.dirty || saveInFlightRef.current) {
      pendingSubmitRef.current = true;
      setSubmitFlowPending(true);
      if (!saveInFlightRef.current) {
        runQueuedSave();
      }
      return;
    }
    submitWithVersion(state.baseRevision);
  }

  const title = teamMatchQuery.data?.title ?? '팀매치';
  const badgeClass = `tm-badge ${phase.editable ? 'tm-badge-blue' : 'tm-badge-grey'}`;
  const submitButtons = editable ? (
    <SubmitButtons
      dirty={state.dirty}
      saving={saveStatus === 'saving'}
      submitPending={submitMutation.isPending}
      submitFlowPending={submitFlowPending}
      blocked={validationErrors.length > 0}
      submittedWithoutChanges={submittedWithoutChanges}
      onSave={() => runQueuedSave()}
      onSubmit={handleSubmit}
    />
  ) : null;

  return (
    <>
      <div className="tm-attendance-lineup-page">
        {!isOnline ? (
          <div style={{ marginBottom: 12 }}>
            <AlertBanner tone="warning" message="오프라인 상태예요. 연결이 끊긴 동안 변경사항은 저장되지 않아요." />
          </div>
        ) : null}

        {conflict ? (
          <div style={{ marginBottom: 12 }}>
            <Card pad={16} style={{ background: 'var(--red50)' }}>
              <p className="tm-text-label" style={{ color: 'var(--red700)', fontWeight: 700, marginBottom: 8 }}>
                참석명단이 그새 변경됐어요.
              </p>
              <p className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
                다른 곳에서 이미 저장된 내용이 있어요. 새로고침하면 최신 참석명단을 다시 불러와요(직접 만든 변경사항은 사라져요).
              </p>
              <button type="button" className="tm-btn tm-btn-sm tm-btn-primary" onClick={handleConflictReload}>
                새로고침
              </button>
            </Card>
          </div>
        ) : null}

        {pendingRemoval ? (
          <div style={{ marginBottom: 12 }}>
            <Card pad={16} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <p role="status" aria-live="polite" className="tm-text-caption" style={{ color: 'var(--text-muted)', flex: 1, margin: 0 }}>
                {pendingRemoval.entry.displayName} 선수를 명단에서 뺐어요.
              </p>
              <button type="button" className="tm-btn tm-btn-sm tm-btn-outline" onClick={handleUndoRemoval}>
                실행 취소
              </button>
            </Card>
          </div>
        ) : null}

        {/* 1440 은 목록 560px + 옆 요약(D-4) — 모바일 리듬을 그대로 두고 남는 자리에 제출 요약을 둔다. */}
        <div className="tm-attendance-lineup-layout">
        <div>
        {isDesktop ? null : (
        <Card pad={16} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div className="tm-text-body-lg" style={{ fontWeight: 700 }}>{title}</div>
            <span className={badgeClass}>{phase.label}</span>
          </div>
          {kickoffAt ? (
            <p className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
              {formatTournamentDateTimeLong(kickoffAt)} 킥오프
            </p>
          ) : null}
          {phase.helperText ? (
            <p className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
              {phase.helperText}
            </p>
          ) : null}
          {publicationNotice ? (
            <p className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
              {publicationNotice}
            </p>
          ) : null}
          {publicationLabel ? (
            <p className="tm-text-caption" style={{ color: 'var(--blue700)', marginTop: 4, fontWeight: 600, lineHeight: 1.6 }}>
              {publicationLabel}
            </p>
          ) : null}
        </Card>
        )}

        {/* 순서가 중요하다: 저장 실패는 dirty와 동시에 참이므로 먼저 걸러야 하고, "저장했어요"는
            **마지막 저장 이후 편집이 없을 때만** 참이다 — 예전에는 saveStatus만 보고 그렸기
            때문에 저장 후 계속 편집해도 "저장했어요."가 그대로 남아, 사용자가 이미 저장됐다고
            믿고 화면을 떠나면 그 편집을 잃었다. */}
        <div style={{ marginBottom: 12 }} aria-live="polite">
          {saveStatus === 'saving' ? (
            <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
              저장 중…
            </p>
          ) : saveStatus === 'error' && saveErrorMessage ? (
            <p role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>
              {saveErrorMessage}
            </p>
          ) : state.dirty ? (
            <p className="tm-text-caption" style={{ color: 'var(--orange700)' }}>
              저장하지 않은 변경사항이 있어요.
            </p>
          ) : saveStatus === 'saved' ? (
            <p className="tm-text-caption" style={{ color: 'var(--green700)' }}>
              저장했어요.
            </p>
          ) : null}
        </div>

        {/* 빈 명단은 아래 시작 카드가 같은 두 행동을 크게 보인다(A-1) — 여기 툴바는 명단이 있을 때만. */}
        {editable && ownTeamId !== null && state.participants.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {addAllCount > 0 ? (
              <button type="button" className="tm-btn tm-btn-sm tm-btn-outline" onClick={handleAddAll} style={{ minHeight: 44 }}>
                <PlusIcon size={16} aria-hidden="true" /> 팀원 전원 추가
              </button>
            ) : null}
            <button
              type="button"
              className="tm-btn tm-btn-sm tm-btn-outline"
              onClick={() => setLoadSheetOpen(true)}
              style={{ minHeight: 44 }}
            >
              이전 참석명단 불러오기
            </button>
            <button
              type="button"
              className="tm-btn tm-btn-sm tm-btn-outline"
              onClick={() => {
                setPresetError(null);
                setSavePresetOpen(true);
              }}
              style={{ minHeight: 44 }}
            >
              프리셋으로 저장
            </button>
          </div>
        ) : null}
        {addOnly ? (
          <div style={{ marginBottom: 12 }}>
            <button type="button" className="tm-btn tm-btn-sm tm-btn-outline" onClick={() => setLateSheetOpen(true)} style={{ minHeight: 44 }}>
              <PlusIcon size={16} aria-hidden="true" /> 늦게 온 선수 추가
            </button>
          </div>
        ) : null}
        {loadNotice !== null ? (
          <div style={{ marginBottom: 12 }}>
            <AlertBanner message={loadNotice} tone="info" />
          </div>
        ) : null}

        {/* 명단 = 출전자(정본 §3) — 한 섹션, 번호순. 행은 번호 칩 · 이름(+결장) · GK·빼기 한 줄(L6). */}
        <section aria-labelledby="lineup-roster-list-heading" style={{ marginBottom: 16 }}>
          <div className="tm-section-title" style={{ alignItems: 'flex-start' }}>
            <div>
              <div id="lineup-roster-list-heading" className="tm-text-body-lg">{`참석명단 (${rosterRows.length})`}</div>
              {sizeNotice ? <NoticeLine notice={sizeNotice} /> : null}
              {goalkeeperNotice ? <NoticeLine notice={goalkeeperNotice} /> : null}
            </div>
          </div>
          {rosterRows.length === 0 ? (
            editable ? (
              <EmptyLineupStart
                memberCount={addAllCount}
                canLoad={ownTeamId !== null}
                onAddAll={handleAddAll}
                onLoad={() => setLoadSheetOpen(true)}
              />
            ) : (
              <p className="tm-text-caption" style={{ color: 'var(--text-muted)', padding: '8px 0' }}>
                참석명단이 비어 있어요.
              </p>
            )
          ) : (
            <Card pad={0}>
              <RosterColumnHeader editable={editable} />
              <ul style={{ listStyle: 'none', margin: 0, padding: '0 12px' }}>
                {rosterRows.map((entry, index) => {
                  const away = entry.userId === null ? undefined : unavailableByUser.get(entry.userId);
                  return (
                    <li key={entry.key} style={index < rosterRows.length - 1 ? { borderBottom: '1px solid var(--border)' } : undefined}>
                      <GameRosterPlayerRow
                        jerseyNumber={entry.jerseyNumber}
                        displayName={entry.displayName}
                        accountLinked={entry.userId !== null}
                        status={away === undefined ? undefined : 'UNAVAILABLE'}
                        reason={away?.reason}
                        extraBadges={entry.userId !== null && alsoOpponentUserIds.has(entry.userId) ? <OpponentMemberChip /> : null}
                        onJerseyPress={
                          editable
                            ? () => {
                                setJerseyError(null);
                                setJerseyTargetKey(entry.key);
                              }
                            : undefined
                        }
                        trailing={
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <GoalkeeperToggle
                              displayName={entry.displayName}
                              goalkeeper={entry.goalkeeper}
                              editable={editable}
                              onToggle={() => setState((prev) => (prev ? setGoalkeeper(prev, entry.key) : prev))}
                            />
                            {editable ? (
                              <button
                                type="button"
                                className="tm-btn tm-btn-sm tm-btn-ghost"
                                style={{ minHeight: 44, padding: '0 8px' }}
                                aria-label={`${entry.displayName} 참석명단에서 빼기`}
                                onClick={() => handleRemoveEntry(entry, state.participants.indexOf(entry))}
                              >
                                빼기
                              </button>
                            ) : null}
                          </div>
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {editable && rosterRows.length === 0 && addAllCount > 0 ? (
            <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: '12px 0 0', lineHeight: 1.6 }}>
              팀에 없는 게스트는 목록이 채워진 뒤 이름만으로 추가할 수 있어요.
            </p>
          ) : null}
        </section>

        {editable && showWaitingList ? (
          <section aria-labelledby="lineup-roster-heading" style={{ marginBottom: 16 }}>
            <SectionTitle id="lineup-roster-heading" title={`추가할 팀원 (${waitingMembers.length})`} />
            {unavailabilityQuery.isError ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: 0 }}>
                  결장 정보를 불러오지 못해 결장 표시 없이 보여요.
                </p>
                <button
                  type="button"
                  className="tm-btn tm-btn-sm tm-btn-outline"
                  onClick={() => void unavailabilityQuery.refetch()}
                >
                  결장 정보 다시 불러오기
                </button>
              </div>
            ) : null}
            {rosterQuery.isLoading ? (
              <p className="tm-text-caption" style={{ color: 'var(--text-muted)', padding: '8px 0' }}>
                팀원 목록을 불러오는 중이에요…
              </p>
            ) : waitingMembers.length === 0 ? (
              <div style={{ marginTop: 8 }}>
                <EmptyState title="추가할 수 있는 팀원이 없어요" sub="모든 팀원이 명단에 있어요. 게스트는 아래에서 추가할 수 있어요." />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {waitingMembers.map((member) => {
                  const away = unavailableByUser.get(member.userId);
                  return (
                    <Card key={member.userId} pad={12}>
                      <GameRosterPlayerRow
                        jerseyNumber={member.jerseyNumber ?? null}
                        displayName={member.displayName}
                        accountLinked
                        status={away === undefined ? undefined : 'UNAVAILABLE'}
                        reason={away?.reason}
                        extraBadges={
                          <>
                            {member.rsvpStatus ? <RsvpChip status={member.rsvpStatus} /> : null}
                            {member.alsoOpponentMember ? <OpponentMemberChip /> : null}
                          </>
                        }
                        trailing={
                          // 행마다 반복되는 버튼이라 outline — 목록이 파랗게 차면 주 행동(제출)이 묻힌다.
                          <button
                            type="button"
                            className="tm-btn tm-btn-sm tm-btn-outline"
                            style={{ minHeight: 44 }}
                            aria-label={`${member.displayName} 참석명단에 추가`}
                            onClick={() => handleAddMember(member)}
                          >
                            추가
                          </button>
                        }
                      />
                    </Card>
                  );
                })}
              </div>
            )}
            <GuestAddCard guestName={guestName} onChange={setGuestName} onAdd={() => {
              setState((prev) => (prev ? addGuestToLineup(prev, guestName) : prev));
              setGuestName('');
            }} />
          </section>
        ) : null}
        {editable && rosterRows.length === 0 && waitingMembers.length === 0 && !rosterQuery.isLoading ? (
          <GuestAddCard guestName={guestName} onChange={setGuestName} onAdd={() => {
            setState((prev) => (prev ? addGuestToLineup(prev, guestName) : prev));
            setGuestName('');
          }} />
        ) : null}

        {validationErrors.length > 0 && editable && rosterRows.length > 0 ? (
          <div style={{ marginBottom: 16 }}>
            <AlertBanner tone="warning" message={validationErrors.join(' ')} />
          </div>
        ) : null}
        </div>

        {isDesktop ? (
        <aside className="tm-attendance-lineup-aside" aria-label="참석명단 요약">
          <Card pad={16}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <div className="tm-text-body-lg" style={{ fontWeight: 700 }}>{title}</div>
              <span className={badgeClass}>{phase.label}</span>
            </div>
            <SummaryRow label="킥오프" value={kickoffAt ? formatTournamentDateTimeLong(kickoffAt) : '일정 미정'} />
            <SummaryRow label="상대 공개" value={describePublicationSummary(publicAt, now)} />
            <SummaryRow label="상대 팀 제출" value={<OpponentSubmittedBadge lineup={lineup} />} />
            {phase.helperText ? (
              <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.6 }}>
                {phase.helperText}
              </p>
            ) : null}
            {submitButtons ? <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{submitButtons}</div> : null}
          </Card>
        </aside>
        ) : null}
        </div>
      </div>

      {submitButtons && !isDesktop ? (
        <div className="tm-fixed-cta">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{submitButtons}</div>
        </div>
      ) : null}

      {jerseyTarget !== null ? (
        <LineupJerseySheet
          open
          onClose={() => setJerseyTargetKey(null)}
          target={{
            displayName: jerseyTarget.displayName,
            jerseyNumber: jerseyTarget.jerseyNumber,
            teamJerseyNumber: jerseyMember?.jerseyNumber ?? null,
            canChangeTeamNumber: jerseyMember?.membershipId !== undefined,
          }}
          holderOf={(jerseyNumber) =>
            state.participants.find((entry) => entry.key !== jerseyTarget.key && entry.jerseyNumber === jerseyNumber)?.displayName ?? null
          }
          pending={changeTeamJersey.isPending}
          error={jerseyError}
          onSave={handleSaveJersey}
        />
      ) : null}

      <LateLineupAdditionSheet
        open={lateSheetOpen}
        onClose={() => setLateSheetOpen(false)}
        teamMatchId={teamMatchId}
        candidates={lateCandidates.map((member) => ({ userId: member.userId, displayName: member.displayName, jerseyNumber: member.jerseyNumber ?? null }))}
        takenNumbers={new Set(rosterRows.flatMap((row) => (row.jerseyNumber === null ? [] : [row.jerseyNumber])))}
      />

      <LoadLineupSheet
        open={loadSheetOpen}
        onClose={() => setLoadSheetOpen(false)}
        history={loadableHistory}
        presets={loadablePresets}
        currentSportName={formationSupportedSportName}
        loading={historyQuery.isLoading || presetsQuery.isLoading}
        onSelect={handleSelectLineup}
        subjectLabel="참석명단"
      />

      <SavePresetDialog
        open={savePresetOpen}
        onClose={() => setSavePresetOpen(false)}
        existingNames={(presetsQuery.data?.items ?? []).map((preset) => preset.name)}
        saving={createPreset.isPending || updatePreset.isPending}
        error={presetError}
        onSave={(name) => void handleSavePreset(name)}
        namePlaceholder={presetNamePlaceholder(formationSupportedSportName)}
      />
    </>
  );
}

/**
 * 저장·제출 두 버튼 — 모바일 고정 CTA 와 데스크톱 요약 카드가 같은 것을 쓴다.
 * 저장은 누른 순간에만 나간다(2026-08 사용자 요청). 제출은 dirty 면 먼저 저장을 밀어넣고 그 ack 의
 * revision 으로 이어 제출한다(flush-then-submit — 옛 revision 이 제출돼 잠기지 않게).
 */
function SubmitButtons(props: {
  dirty: boolean;
  saving: boolean;
  submitPending: boolean;
  submitFlowPending: boolean;
  blocked: boolean;
  submittedWithoutChanges: boolean;
  onSave: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className="tm-btn tm-btn-lg tm-btn-neutral"
        disabled={!props.dirty || props.saving || props.submitFlowPending}
        onClick={props.onSave}
      >
        {props.saving ? '저장 중…' : props.dirty ? '저장' : '저장됨'}
      </button>
      <button
        type="button"
        className="tm-btn tm-btn-lg tm-btn-primary"
        disabled={props.blocked || props.submitPending || props.submitFlowPending || props.submittedWithoutChanges}
        onClick={props.onSubmit}
      >
        {props.submitPending
          ? '제출 중…'
          : props.submitFlowPending
            ? '변경사항 저장 중…'
            : props.submittedWithoutChanges
              ? '제출 완료'
              : '참석명단 제출하기'}
      </button>
    </>
  );
}

/** 막지 않는 안내 한 줄(L28) — 모자람만 강조를 주황으로, 넘침·GK 는 참고 톤. */
function NoticeLine({ notice }: { notice: LineupNotice }) {
  return (
    <p className="tm-text-caption" style={{ margin: '4px 0 0', color: 'var(--text-muted)', lineHeight: 1.5 }}>
      {notice.before}
      <span style={{ fontWeight: 700, color: notice.tone === 'warn' ? 'var(--orange700)' : 'var(--text-strong)' }}>
        {notice.emphasis}
      </span>
      {notice.after}
    </p>
  );
}

/** 빈 명단의 시작(A-1): 한 명씩 누르는 대신 전원 넣고 빼거나, 지난 경기 명단으로 채운다. */
function EmptyLineupStart({
  memberCount,
  canLoad,
  onAddAll,
  onLoad,
}: {
  memberCount: number;
  canLoad: boolean;
  onAddAll: () => void;
  onLoad: () => void;
}) {
  return (
    <Card pad={20} style={{ textAlign: 'center' }}>
      <div className="tm-text-body-lg" style={{ fontWeight: 700 }}>참석명단이 비어 있어요</div>
      <p className="tm-text-label" style={{ color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
        {memberCount > 0
          ? `팀원 ${memberCount}명을 한 번에 넣고, 오지 않는 사람만 빼면 돼요.`
          : '지난 경기 명단을 불러오거나 게스트를 이름으로 넣어 주세요.'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        {memberCount > 0 ? (
          <button type="button" className="tm-btn tm-btn-lg tm-btn-primary" style={{ minHeight: 44, width: '100%' }} onClick={onAddAll}>
            <PlusIcon size={18} aria-hidden="true" /> 팀원 {memberCount}명 모두 넣기
          </button>
        ) : null}
        {canLoad ? (
          <button type="button" className="tm-btn tm-btn-lg tm-btn-outline" style={{ minHeight: 44, width: '100%' }} onClick={onLoad}>
            지난 경기 명단으로 채우기
          </button>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * 열 머리글(W4-V1) — 행의 두 "+"(번호·골키퍼)가 무엇인지 목록 위에서 한 번만 말한다. 미지정 행에 글자를 다시 넣지
 * 않으려는 것이다(GK 토글 주석). 화면용이라 aria-hidden — 스크린리더는 각 버튼의 aria-label 로 같은 뜻을 듣는다.
 */
function RosterColumnHeader({ editable }: { editable: boolean }) {
  const label = { color: 'var(--text-muted)', fontWeight: 600 } as const;
  return (
    <div aria-hidden="true" style={{ padding: '0 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0 8px', borderBottom: '1px solid var(--border)' }}>
        {/* 번호 칸은 편집 땐 44px 버튼, 열람 땐 28px 글자다(GameRosterPlayerRow). */}
        <span className="tm-text-micro" style={{ ...label, flex: '0 0 auto', width: editable ? 44 : 28, textAlign: 'center' }}>번호</span>
        <span className="tm-text-micro" style={{ ...label, flex: '1 1 auto' }}>이름</span>
        <span style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="tm-text-micro" style={{ ...label, width: 44, textAlign: 'center' }}>골키퍼</span>
          {/* 행의 "빼기" 버튼과 같은 클래스로 폭만 잡는다 — 골키퍼 열이 토글 위에 정확히 선다. */}
          {editable ? <span className="tm-btn tm-btn-sm" style={{ visibility: 'hidden', minHeight: 0, padding: '0 8px' }}>빼기</span> : null}
        </span>
      </div>
    </div>
  );
}

/**
 * GK 토글 — "GK" 글자는 지정된 행에만(항상 띄우면 값으로 읽혀 "전원 GK" 로 오독됐다, 2026-09-08 확정), 미지정
 * 행은 누를 수 있을 때만 "+"(2026-09-29 확정). 지정 = orange700 채움, 미지정 = 점선 테두리.
 */
function GoalkeeperToggle({
  displayName,
  goalkeeper,
  editable,
  onToggle,
}: {
  displayName: string;
  goalkeeper: boolean;
  editable: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={goalkeeper}
      disabled={!editable}
      onClick={onToggle}
      // 화면엔 글자가 없을 수 있어 이 라벨이 유일한 안내다 — 조사는 받침에 따라 갈린다.
      aria-label={goalkeeper ? `${displayName}, 골키퍼 지정 해제` : `${josa(displayName, ['을', '를'])} 골키퍼로 지정`}
      style={{
        flexShrink: 0,
        minWidth: 44,
        minHeight: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-pill)',
        border: goalkeeper ? '1.5px solid var(--orange700)' : '1.5px dashed var(--grey300)',
        background: goalkeeper ? 'var(--orange700)' : 'transparent',
        color: goalkeeper ? 'var(--static-white)' : 'var(--text-caption)',
        fontSize: 'var(--font-size-caption)',
        fontWeight: goalkeeper ? 800 : 600,
        cursor: editable ? 'pointer' : 'default',
      }}
    >
      {goalkeeper ? 'GK' : editable ? <PlusIcon size={16} /> : null}
    </button>
  );
}

/** 팀 일정 응답 — 팀장 참고용 읽기 전용 칩(A-3). 미응답만 주황으로 눈에 띄게. */
function RsvpChip({ status }: { status: string }) {
  return (
    <span className={`tm-badge tm-badge-sm ${status === 'NO_RESPONSE' ? 'tm-badge-orange' : 'tm-badge-grey'}`}>
      {friendlyRsvpLabel(status)}
    </span>
  );
}

/** 상대 팀에도 소속(W4-V4) — 응답 칩과 같은 자리·모양의 읽기 전용 칩. 색이 아니라 글자로 말한다. */
function OpponentMemberChip() {
  return <span className="tm-badge tm-badge-sm tm-badge-grey">상대 팀에도 소속</span>;
}

function GuestAddCard({ guestName, onChange, onAdd }: { guestName: string; onChange: (value: string) => void; onAdd: () => void }) {
  return (
    <Card pad={12} style={{ marginTop: 12 }}>
      <p className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
        팀에 소속되지 않은 게스트를 이름만으로 추가할 수 있어요. 게스트는 팀 기록에만 반영되고 개인 기록에는 남지 않아요.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <label htmlFor="lineup-guest-name" className="sr-only">게스트 이름</label>
        <input
          id="lineup-guest-name"
          type="text"
          className="tm-input"
          style={{ flex: 1 }}
          placeholder="게스트 이름"
          value={guestName}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" className="tm-btn tm-btn-sm tm-btn-outline" style={{ minHeight: 44 }} aria-label="게스트 추가" onClick={onAdd}>
          <PlusIcon size={16} aria-hidden="true" /> 추가
        </button>
      </div>
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
      <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="tm-text-label" style={{ textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function OpponentSubmittedBadge({ lineup }: { lineup: V1TeamMatchLineup }) {
  const opponent = lineup.opponent;
  if (opponent === undefined || opponent.teamName === null) return <>상대 확정 전</>;
  return (
    <span className={`tm-badge tm-badge-sm ${opponent.submitted ? 'tm-badge-green' : 'tm-badge-grey'}`}>
      {opponent.submitted ? '제출 완료' : '제출 전'}
    </span>
  );
}

/** "오후 8:00 · 4시간 3분 남음" / "10/7 (수) 오후 8:00" / "오후 8:00 · 공개됨" — 데스크톱 요약 한 칸. */
function describePublicationSummary(publicAt: string | null, now: number): string {
  const time = formatPublicationTime(publicAt, now);
  if (time === null) return '킥오프 1시간 전';
  const remaining = describeRemaining(publicAt, now);
  if (remaining === null) return `${time} · 공개됨`;
  return remaining === 'days' || remaining === undefined ? time : `${time} · ${remaining} 남음`;
}

/** 대회·리그 경기로 열렸을 때 편집기 대신 경기 명단 화면을 안내한다. 자동 이동은 하지 않는다. */
function CompetitionRosterNotice({ href }: { href: string | null }) {
  useShellOverride({ title: '경기 명단' });
  return (
    <div style={{ padding: '40px 20px' }}>
      <EmptyState
        title="대회·리그 경기는 경기 명단에서 관리해요"
        sub={
          href === null
            ? '경기 명단은 참가 명단에서 정해져요. 빠지는 선수는 팀 상세의 다가오는 경기에서 명단을 열어 빼 주세요.'
            : '경기 명단은 참가 명단에서 정해져요. 이번 경기에 빠지는 선수만 경기 명단에서 빼 주세요.'
        }
        cta={href === null ? undefined : '경기 명단 열기'}
        ctaHref={href ?? undefined}
      />
    </div>
  );
}
