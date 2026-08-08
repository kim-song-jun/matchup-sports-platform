'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppChrome } from '@/components/v1-ui/shell';
import { AlertBanner, Card, EmptyState, ErrorState, SectionTitle } from '@/components/v1-ui/primitives';
import {
  buildFormationPresets, presetsForOutfieldCount, slotsWithGoalkeeper, type FormationPreset,
} from '@/components/lineup/formation-slots';
import { PitchFormationEditor } from '@/components/lineup/pitch-formation-editor';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { PlusIcon } from '@/components/v1-ui/icons';
import {
  useV1MyTeams,
  useV1RequestTeamMatchLineupChange,
  useV1SaveTeamMatchLineup,
  useV1SubmitTeamMatchLineup,
  useV1TeamMatch,
  useV1TeamMatchLineup,
  useV1TeamMembers,
} from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import { formatTournamentDateTimeLong } from '@/lib/date-utils';
import { randomUuid } from '@/lib/uuid';
import type { LineupEditorState, LineupEntryDraft, LineupSlot, RosterOption } from './lineup.view-model';
import {
  addGuestToBench,
  addGuestToStarters,
  addRosterMemberToBench,
  addRosterMemberToStarters,
  applySaveResult,
  applyVersionConflictReload,
  buildSavePayload,
  clearPlayerPosition,
  deriveLineupCounts,
  describeLineupPhase,
  describePublicationCountdown,
  extractConflictCurrentVersion,
  hydrateLineupEditorState,
  isRosterMemberPlaced,
  moveEntry,
  placeInSlot,
  removeEntry,
  resolveOwnTeamId,
  restoreEntry,
  selectFormation,
  setGoalkeeper,
  setJerseyNumber,
  setPlayerPosition,
  unplaceFromSlot,
  validateLineupForSubmit,
} from './lineup.view-model';

const AUTOSAVE_DEBOUNCE_MS = 900;

export function TeamMatchLineupPageClient({ teamMatchId }: { teamMatchId: string }) {
  const teamMatchQuery = useV1TeamMatch(teamMatchId);
  const myTeamsQuery = useV1MyTeams();
  const lineupQuery = useV1TeamMatchLineup(teamMatchId);

  const ownTeamId = useMemo(
    () => resolveOwnTeamId(teamMatchQuery.data, myTeamsQuery.data),
    [teamMatchQuery.data, myTeamsQuery.data],
  );
  const rosterQuery = useV1TeamMembers(ownTeamId, { limit: 100 }, { enabled: Boolean(ownTeamId) });
  const rosterPool: RosterOption[] = useMemo(
    () => (rosterQuery.data?.items ?? []).map((member) => ({ userId: member.userId, displayName: member.displayName, role: member.role })),
    [rosterQuery.data],
  );

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
  // 명단(선발·후보·추가 가능한 팀원 편집)과 피치 배치(포메이션 시각화)는 같은 화면
  // 두 가지 뷰다 — 기본은 명단(기존 화면과 동일한 첫인상 유지), 사용자가 "피치 배치"를
  // 눌러야 전환된다.
  const [activeView, setActiveView] = useState<'roster' | 'pitch'>('roster');
  // 피치 배치(코트 위 포지션 시각화)는 지금은 축구/풋살 코트 도형(PitchFormationEditor)만
  // 구현돼 있다. 농구·배드민턴·아이스하키 등은 코트 모양·포지션 개념이 아예 다르므로
  // 이 컴포넌트를 그대로 재사용할 수 없다 — TODO: 종목별 코트 배치 컴포넌트를 추가하고
  // 이 allowlist를 확장한다. team-match 응답이 안정적인 sport.code를 아직 노출하지
  // 않아 한글 이름으로 매칭한다(코드가 추가되면 교체).
  const formationSupportedSportName = teamMatchQuery.data?.sport?.name ?? null;
  const formationSupported =
    formationSupportedSportName !== null && ['축구', '풋살'].includes(formationSupportedSportName);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const saveMutation = useV1SaveTeamMatchLineup(teamMatchId);
  const submitMutation = useV1SubmitTeamMatchLineup(teamMatchId);
  const changeRequestMutation = useV1RequestTeamMatchLineupChange(teamMatchId);

  const kickoffAt = teamMatchQuery.data?.startsAt;
  const deadlinePassed = Boolean(kickoffAt) && now >= new Date(kickoffAt as string).getTime();
  const phase = lineupQuery.data ? describeLineupPhase(lineupQuery.data.state, deadlinePassed) : null;
  const editable = Boolean(phase?.editable) && isOnline;

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
      { idempotencyKey: randomUuid(), payload: buildSavePayload(current) },
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
            setSaveErrorMessage('변경사항을 저장하지 못해 라인업을 제출할 수 없어요. 다시 시도해 주세요.');
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
        onError: (error) => {
          if (error instanceof V1ApiError && error.code === 'VERSION_CONFLICT') {
            setConflict(true);
          }
          setSaveErrorMessage(extractErrorMessage(error, '라인업을 제출하지 못했어요.'));
        },
      },
    );
  }

  useEffect(() => {
    if (!state || !state.dirty || !editable) return;
    const timer = window.setTimeout(runQueuedSave, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // state 객체 참조가 바뀔 때마다(모든 편집 액션이 새 객체를 만든다) 디바운스를 다시 잰다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, editable]);

  // D-17: 종목별 포메이션·포지션 사전은 서버 lineupConfig가 유일한 출처다 — 종목명으로
  // 하드코딩 카탈로그를 스위치하지 않는다. lineupConfig가 아직 없는(구버전 응답) 경우
  // sportCatalog는 빈 배열이 되고, formationOptions도 자연히 비어 "자유 배치"만 남는다.
  const sportCatalog: FormationPreset[] = lineupQuery.data?.lineupConfig
    ? buildFormationPresets(lineupQuery.data.lineupConfig.positions, lineupQuery.data.lineupConfig.formations)
    : [];
  const outfieldCount = state?.starters.filter((entry) => !entry.goalkeeper).length ?? 0;
  const formationOptions = presetsForOutfieldCount(sportCatalog, outfieldCount);

  // Copilot review finding (PR #277): 선발/골키퍼 변경으로 outfieldCount가 바뀌어 지금
  // 선택된 formation이 더 이상 formationOptions에 없으면(예: 5명→4명으로 줄어 "1-1-2"
  // 프리셋이 사라짐) 자유 배치로 되돌린다. 그대로 두면 화면은 이전 formation 라벨을
  // 계속 보여주면서도 슬롯 모드는 이미 꺼져(selectedPreset=null → activeSlots=null)
  // 제출 검증이 빈 슬롯 체크를 건너뛰고, 저장 페이로드에도 더 이상 유효하지 않은
  // formation 코드가 그대로 실릴 수 있었다.
  useEffect(() => {
    if (state && state.formation !== null && !formationOptions.some((preset) => preset.code === state.formation)) {
      setState((prev) => (prev ? selectFormation(prev, null) : prev));
    }
    // formationOptions/starters 참조가 바뀔 때마다(포메이션 프리셋 목록이 재계산될 때마다)
    // 다시 검사한다 — state 전체를 deps에 넣으면 selectFormation 자체가 새 state를 만들어
    // 무한 루프가 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formationOptions, state?.formation, state?.starters]);

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
  const [guestSlot, setGuestSlot] = useState<LineupSlot>('bench');
  const [changeRequestOpen, setChangeRequestOpen] = useState(false);
  const [changeRequestReason, setChangeRequestReason] = useState('');
  const [changeRequestError, setChangeRequestError] = useState<string | null>(null);

  // insane review(P1-3, 2026-08 GPT Pro): "제외" 버튼은 실제로는 완전 삭제(moveEntry의
  // 선발↔후보 이동과 다르다) — 등번호·GK 지정·피치 좌표가 전부 소실되고, 재수화된 뒤라면
  // (userId가 없으므로) 다시 팀원 목록에서 찾지도 못해 처음부터 재입력해야 했다. 확인
  // 모달 대신 5초 실행취소 토스트로 되돌릴 수 있게 한다 — pendingRemoval이 지운 엔트리
  // 전체(등번호·GK·좌표 포함)와 원래 슬롯·인덱스를 들고 있다가, 실행취소 시 그 자리에
  // 그대로 복원한다(restoreEntry).
  const [pendingRemoval, setPendingRemoval] = useState<{ entry: LineupEntryDraft; slot: LineupSlot; index: number } | null>(
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

  function handleRemoveEntry(slot: LineupSlot, entry: LineupEntryDraft, index: number) {
    setState((prev) => (prev ? removeEntry(prev, slot, entry.key) : prev));
    if (pendingRemovalTimerRef.current !== null) {
      window.clearTimeout(pendingRemovalTimerRef.current);
    }
    setPendingRemoval({ entry, slot, index });
    pendingRemovalTimerRef.current = window.setTimeout(() => {
      setPendingRemoval(null);
      pendingRemovalTimerRef.current = null;
    }, 5000);
  }

  function handleUndoRemoval() {
    if (!pendingRemoval) return;
    const { entry, slot, index } = pendingRemoval;
    setState((prev) => (prev ? restoreEntry(prev, slot, entry, index) : prev));
    if (pendingRemovalTimerRef.current !== null) {
      window.clearTimeout(pendingRemovalTimerRef.current);
      pendingRemovalTimerRef.current = null;
    }
    setPendingRemoval(null);
  }

  function submitChangeRequest() {
    const reason = changeRequestReason.trim();
    if (reason.length === 0) {
      setChangeRequestError('사유를 입력해 주세요.');
      return;
    }
    setChangeRequestError(null);
    const attempt = (expectedVersion: number) =>
      changeRequestMutation.mutate(
        { idempotencyKey: randomUuid(), expectedVersion, reason },
        {
          onSuccess: () => {
            setChangeRequestOpen(false);
            setChangeRequestReason('');
          },
          onError: (error) => {
            if (error instanceof V1ApiError && error.code === 'VERSION_CONFLICT' && expectedVersion === 0) {
              const currentVersion = extractConflictCurrentVersion(error.details);
              if (currentVersion !== null) {
                attempt(currentVersion);
                return;
              }
            }
            setChangeRequestError(extractErrorMessage(error, '정정 요청을 보내지 못했어요.'));
          },
        },
      );
    // 상대팀 사이드를 조회하는 API가 없어 현재 revision을 미리 알 방법이 없다 — 0으로 첫
    // 시도를 보내고, 409로 돌아오는 details.currentVersion으로 정확한 값을 얻어 한 번 더
    // 시도한다(위 백엔드 수정으로 details가 실제로 전달된다).
    attempt(0);
  }

  if (teamMatchQuery.isLoading || lineupQuery.isLoading || myTeamsQuery.isLoading) {
    return (
      <AppChrome title="라인업" backHref={`/team-matches/${teamMatchId}`} bottomNav={false} desktopHead>
        <PageSkeleton variant="detail" />
      </AppChrome>
    );
  }

  if (lineupQuery.isError) {
    const code = lineupQuery.error instanceof V1ApiError ? lineupQuery.error.code : null;
    const message =
      code === 'PERMISSION_DENIED'
        ? '팀장 또는 매니저만 라인업을 관리할 수 있어요.'
        : code === 'TEAM_MATCH_NOT_FOUND'
          ? '팀 매치를 찾을 수 없어요.'
          : code === 'TEAM_MATCH_GAME_REQUIRED'
            ? '경기 정보가 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.'
            : extractErrorMessage(lineupQuery.error, '라인업을 불러오지 못했어요.');
    return (
      <AppChrome title="라인업" backHref={`/team-matches/${teamMatchId}`} bottomNav={false} desktopHead>
        <div style={{ padding: '40px 20px' }}>
          <ErrorState
            message={message}
            onRetry={code === 'PERMISSION_DENIED' || code === 'TEAM_MATCH_NOT_FOUND' ? undefined : () => void lineupQuery.refetch()}
          />
        </div>
      </AppChrome>
    );
  }

  if (!lineupQuery.data || !state || !phase) {
    return (
      <AppChrome title="라인업" backHref={`/team-matches/${teamMatchId}`} bottomNav={false} desktopHead>
        <PageSkeleton variant="detail" />
      </AppChrome>
    );
  }

  const counts = deriveLineupCounts(state, rosterPool);
  const waitingMembers = rosterPool.filter((member) => !isRosterMemberPlaced(state, member));
  const outfieldGuidance =
    formationSupported && formationOptions.length === 0 && outfieldCount > 0
      ? `현재 선발 ${outfieldCount}명 — 이 인원수에 맞는 정해진 포지션 대형이 없어요. 자유 배치를 사용해 주세요.`
      : null;
  const selectedPreset = state.formation !== null ? formationOptions.find((preset) => preset.code === state.formation) ?? null : null;
  const activeSlots = selectedPreset !== null ? slotsWithGoalkeeper(selectedPreset) : null;
  const validationErrors = validateLineupForSubmit(state, activeSlots);
  const publicationLabel = describePublicationCountdown(lineupQuery.data.publicLineupAt, now);

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

  return (
    <AppChrome title="라인업" backHref={`/team-matches/${teamMatchId}`} bottomNav={false} desktopHead>
      <div style={{ padding: '16px 20px 168px' }}>
        {!isOnline ? (
          <div style={{ marginBottom: 12 }}>
            <AlertBanner tone="warning" message="오프라인 상태예요. 연결이 끊긴 동안 변경사항은 저장되지 않아요." />
          </div>
        ) : null}

        {conflict ? (
          <div style={{ marginBottom: 12 }}>
            <Card pad={14} style={{ background: 'var(--red50)' }}>
              <p className="tm-text-label" style={{ color: 'var(--red600, #c0392b)', fontWeight: 700, marginBottom: 8 }}>
                라인업이 그새 변경됐어요.
              </p>
              <p className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
                다른 곳에서 이미 저장된 내용이 있어요. 새로고침하면 최신 라인업을 다시 불러와요(직접 만든 변경사항은 사라져요).
              </p>
              <button type="button" className="tm-btn tm-btn-sm tm-btn-primary" onClick={handleConflictReload}>
                새로고침
              </button>
            </Card>
          </div>
        ) : null}

        {pendingRemoval ? (
          <div style={{ marginBottom: 12 }}>
            <Card pad={14} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <p role="status" aria-live="polite" className="tm-text-caption" style={{ color: 'var(--text-muted)', flex: 1, margin: 0 }}>
                {pendingRemoval.entry.displayName} 선수를 명단에서 제거했어요.
              </p>
              <button type="button" className="tm-btn tm-btn-sm tm-btn-outline" onClick={handleUndoRemoval}>
                실행 취소
              </button>
            </Card>
          </div>
        ) : null}

        <Card pad={16} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div className="tm-text-body-lg" style={{ fontWeight: 700 }}>
              {teamMatchQuery.data?.title ?? '팀 매치'}
            </div>
            <span className={`tm-badge ${phase.editable ? 'tm-badge-blue' : 'tm-badge-grey'}`}>{phase.label}</span>
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
          {publicationLabel ? (
            <p className="tm-text-caption" style={{ color: 'var(--blue500)', marginTop: 4, fontWeight: 600 }}>
              {publicationLabel}
            </p>
          ) : null}
        </Card>

        <div style={{ marginBottom: 12 }} aria-live="polite">
          {saveStatus === 'saving' ? (
            <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
              저장 중…
            </p>
          ) : saveStatus === 'saved' ? (
            <p className="tm-text-caption" style={{ color: 'var(--green500)' }}>
              저장했어요.
            </p>
          ) : saveStatus === 'error' && saveErrorMessage ? (
            <p role="alert" className="tm-text-caption" style={{ color: 'var(--red500)' }}>
              {saveErrorMessage}
            </p>
          ) : null}
        </div>

        <div
          role="tablist"
          aria-label="라인업 뷰 전환"
          style={{ display: 'flex', gap: 8, marginBottom: 16 }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'roster'}
            className={`tm-btn tm-btn-sm ${activeView === 'roster' ? 'tm-btn-primary' : 'tm-btn-neutral'}`}
            onClick={() => setActiveView('roster')}
          >
            명단
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'pitch'}
            className={`tm-btn tm-btn-sm ${activeView === 'pitch' ? 'tm-btn-primary' : 'tm-btn-neutral'}`}
            onClick={() => setActiveView('pitch')}
          >
            피치 배치
          </button>
        </div>

        {activeView === 'pitch' ? (
          <section
            aria-labelledby="lineup-pitch-heading"
            // 편집 가능한 상태에서는 화면 하단에 고정된 "라인업 제출하기" 바(.tm-fixed-cta)가
            // 겹칠 수 있는 여유 공간을 아래에 둔다 — 안 그러면 피치 하단(자기 진영 골대 쪽,
            // 골키퍼 토큰 위치)이 고정 바에 가려 보이지 않는다(실제 화면 확인으로 발견).
            style={{ marginBottom: phase?.editable ? 112 : 16 }}
          >
            <SectionTitle id="lineup-pitch-heading" title="피치 배치" />
            {!formationSupported ? (
              <EmptyState
                title="이 종목은 피치 배치를 아직 지원하지 않아요"
                sub={`${formationSupportedSportName ?? '이 종목'}은 축구·풋살과 코트 모양·포지션 개념이 달라 준비 중이에요. 명단 탭에서 선발·후보는 그대로 관리할 수 있어요.`}
              />
            ) : state.starters.length === 0 ? (
              <p className="tm-text-caption" style={{ color: 'var(--text-muted)', padding: '8px 0' }}>
                먼저 명단에서 선발을 등록해야 피치에 배치할 수 있어요.
              </p>
            ) : (
              <div style={{ marginTop: 8 }}>
                {/* insane review(P1-2, 2026-08 GPT Pro): 명단 편집은 `editable`(phase.editable &&
                    isOnline)로 잠기는데, 여기는 phase.editable만 봐서 오프라인 배너가 떠도
                    피치에서는 선수 이동·배치취소·포메이션 변경이 계속 됐다 — 위에서 이미 정의한
                    `editable` 상수를 그대로 재사용해 두 뷰가 같은 규칙을 따르게 한다. */}
                <PitchFormationEditor
                  starters={state.starters}
                  formation={state.formation}
                  formationOptions={formationOptions}
                  slots={activeSlots}
                  outfieldGuidance={outfieldGuidance}
                  editable={editable}
                  onSelectFormation={(formation) =>
                    setState((prev) => (prev ? selectFormation(prev, formation) : prev))
                  }
                  onPlacePlayer={(key, x, y) =>
                    setState((prev) => (prev ? setPlayerPosition(prev, key, x, y) : prev))
                  }
                  onUnplacePlayer={(key) => setState((prev) => (prev ? clearPlayerPosition(prev, key) : prev))}
                  onPlaceInSlot={(key, slot) => setState((prev) => (prev ? placeInSlot(prev, key, slot) : prev))}
                  onUnplaceFromSlot={(key) => setState((prev) => (prev ? unplaceFromSlot(prev, key) : prev))}
                />
              </div>
            )}
          </section>
        ) : null}

        <div style={{ display: activeView === 'roster' ? 'contents' : 'none' }}>
        <section aria-labelledby="lineup-starters-heading" style={{ marginBottom: 16 }}>
          <SectionTitle id="lineup-starters-heading" title={`선발 (${counts.starterCount})`} />
          {state.starters.length === 0 ? (
            <p className="tm-text-caption" style={{ color: 'var(--text-muted)', padding: '8px 0' }}>
              선발 명단이 비어 있어요.
            </p>
          ) : (
            <>
              {/* 행마다 숫자만 덩그러니 보이면 등번호인지 알 수 없다(QA 지적) — 열 이름을
                  붙여 시각적으로만 표시한다. 스크린리더는 각 행의 aria-label(예: "영동
                  등번호")로 이미 문맥을 얻으므로 헤더 자체는 장식으로 숨긴다. */}
              <div
                aria-hidden="true"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', marginTop: 8 }}
              >
                <span className="tm-text-micro" style={{ color: 'var(--text-muted)', fontWeight: 600, minWidth: 44 }}>
                  GK
                </span>
                <span className="tm-text-micro" style={{ flex: 1, color: 'var(--text-muted)', fontWeight: 600 }}>
                  이름
                </span>
                <span
                  className="tm-text-micro"
                  style={{ width: 56, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}
                >
                  등번호
                </span>
              </div>
              <Card pad={0} style={{ marginTop: 4 }}>
              {state.starters.map((entry, index) => (
                <div
                  key={entry.key}
                  style={{
                    padding: 12,
                    ...(index > 0 ? { borderTop: '1px solid var(--border)' } : {}),
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* 예전엔 네이티브 라디오 + "선택됐을 때만 보이는 GK 텍스트"였는데, 브라우저
                        기본 라디오가 작고(터치 타겟 미달) 밋밋해서 "이게 뭘 누르는 버튼인지"
                        한눈에 안 읽힌다는 지적(QA)을 받았다. 항상 "GK" 글자가 보이는 토글 칩으로
                        바꿔 미지정 상태도 눈에 띄게 하고, 색은 피치 배치 화면의 골키퍼 토큰 색과
                        맞춰 두 화면에서 같은 의미가 같은 색으로 읽히게 한다. orange50 배경 위
                        orange500 텍스트는 대비 ~1.97:1로 WCAG AA 크게 미달(2026-08 QA 실측) —
                        orange700(~4.92:1)으로 교체. */}
                    <button
                      type="button"
                      aria-pressed={entry.goalkeeper}
                      disabled={!editable}
                      onClick={() => setState((prev) => (prev ? setGoalkeeper(prev, entry.key) : prev))}
                      aria-label={`${entry.displayName}${entry.goalkeeper ? ', 골키퍼로 지정됨' : '을 골키퍼로 지정'}`}
                      style={{
                        flexShrink: 0,
                        minWidth: 44,
                        minHeight: 44,
                        borderRadius: 999,
                        border: entry.goalkeeper ? '1.5px solid var(--orange700)' : '1px solid var(--border)',
                        background: entry.goalkeeper ? 'var(--orange50)' : 'var(--card-surface)',
                        color: entry.goalkeeper ? 'var(--orange700)' : 'var(--text-muted)',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: editable ? 'pointer' : 'default',
                      }}
                    >
                      GK
                    </button>
                    <span className="tm-text-label" style={{ flex: 1, fontWeight: 600 }}>
                      {entry.displayName}
                      {entry.position ? (
                        <span
                          className="tm-text-micro"
                          style={{ marginLeft: 6, color: 'var(--text-muted)', fontWeight: 400 }}
                        >
                          {entry.position}
                        </span>
                      ) : null}
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      aria-label={`${entry.displayName} 등번호`}
                      className="tm-input"
                      style={{ width: 56, textAlign: 'center' }}
                      value={entry.jerseyNumber ?? ''}
                      disabled={!editable}
                      onChange={(event) =>
                        setState((prev) =>
                          prev
                            ? setJerseyNumber(
                                prev,
                                'starter',
                                entry.key,
                                event.target.value === '' ? null : Number(event.target.value),
                              )
                            : prev,
                        )
                      }
                    />
                    {editable ? (
                      <>
                        <button
                          type="button"
                          className="tm-btn tm-btn-sm tm-btn-outline"
                          onClick={() => setState((prev) => (prev ? moveEntry(prev, 'starter', entry.key, 'bench') : prev))}
                        >
                          후보로
                        </button>
                        <button
                          type="button"
                          className="tm-btn tm-btn-sm tm-btn-ghost"
                          aria-label={`${entry.displayName} 선발 명단에서 제거`}
                          onClick={() => handleRemoveEntry('starter', entry, index)}
                        >
                          명단에서 제거
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
              </Card>
            </>
          )}
        </section>

        <section aria-labelledby="lineup-bench-heading" style={{ marginBottom: 16 }}>
          <SectionTitle id="lineup-bench-heading" title={`후보 (${counts.benchCount})`} />
          {state.bench.length === 0 ? (
            <p className="tm-text-caption" style={{ color: 'var(--text-muted)', padding: '8px 0' }}>
              후보 명단이 비어 있어요.
            </p>
          ) : (
            <>
              <div
                aria-hidden="true"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', marginTop: 8 }}
              >
                <span className="tm-text-micro" style={{ flex: 1, color: 'var(--text-muted)', fontWeight: 600 }}>
                  이름
                </span>
                <span
                  className="tm-text-micro"
                  style={{ width: 56, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}
                >
                  등번호
                </span>
              </div>
              <Card pad={0} style={{ marginTop: 4 }}>
              {state.bench.map((entry, index) => (
                <div
                  key={entry.key}
                  style={{
                    padding: 12,
                    ...(index > 0 ? { borderTop: '1px solid var(--border)' } : {}),
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="tm-text-label" style={{ flex: 1, fontWeight: 600 }}>{entry.displayName}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      aria-label={`${entry.displayName} 등번호`}
                      className="tm-input"
                      style={{ width: 56, textAlign: 'center' }}
                      value={entry.jerseyNumber ?? ''}
                      disabled={!editable}
                      onChange={(event) =>
                        setState((prev) =>
                          prev
                            ? setJerseyNumber(
                                prev,
                                'bench',
                                entry.key,
                                event.target.value === '' ? null : Number(event.target.value),
                              )
                            : prev,
                        )
                      }
                    />
                    {editable ? (
                      <>
                        <button
                          type="button"
                          className="tm-btn tm-btn-sm tm-btn-outline"
                          onClick={() => setState((prev) => (prev ? moveEntry(prev, 'bench', entry.key, 'starter') : prev))}
                        >
                          선발로
                        </button>
                        <button
                          type="button"
                          className="tm-btn tm-btn-sm tm-btn-ghost"
                          aria-label={`${entry.displayName} 후보 명단에서 제거`}
                          onClick={() => handleRemoveEntry('bench', entry, index)}
                        >
                          명단에서 제거
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
              </Card>
            </>
          )}
        </section>

        {editable ? (
          <section aria-labelledby="lineup-roster-heading" style={{ marginBottom: 16 }}>
            <SectionTitle id="lineup-roster-heading" title={`추가 가능한 팀원 (${counts.waitingCount})`} />
            {/* 참석 여부로 미리 걸러 보여줄 방법이 없다(Task 15 blocker-5): 일정별 참석자
                명단을 조회하는 API가 없어 여기 뜨는 목록은 "활성 팀원 전체"다. 실제 등록
                가능 여부(참석으로 응답했는지 등)는 서버가 저장 시점에 최종 검증하고,
                해당하지 않으면 위 자동저장 오류 메시지로 이유를 알려준다. */}
            <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: '4px 0 8px' }}>
              참석 여부와 무관하게 활성 팀원 전체가 표시돼요. 불참으로 응답한 팀원을 추가하면 저장할 때 알려드려요.
            </p>
            {rosterQuery.isLoading ? (
              <p className="tm-text-caption" style={{ color: 'var(--text-muted)', padding: '8px 0' }}>
                팀원 목록을 불러오는 중이에요…
              </p>
            ) : waitingMembers.length === 0 ? (
              <div style={{ marginTop: 8 }}>
                <EmptyState
                  title="추가할 수 있는 팀원이 없어요"
                  sub="모든 팀원이 이미 배치됐거나 활성 팀원이 없어요. 게스트를 추가할 수 있어요."
                />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {waitingMembers.map((member) => (
                  <Card key={member.userId} pad={12}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="tm-text-label" style={{ flex: 1, fontWeight: 600 }}>{member.displayName}</span>
                      <button
                        type="button"
                        className="tm-btn tm-btn-sm tm-btn-primary"
                        onClick={() => setState((prev) => (prev ? addRosterMemberToStarters(prev, member) : prev))}
                      >
                        선발 추가
                      </button>
                      <button
                        type="button"
                        className="tm-btn tm-btn-sm tm-btn-outline"
                        onClick={() => setState((prev) => (prev ? addRosterMemberToBench(prev, member) : prev))}
                      >
                        후보 추가
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            )}

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
                  onChange={(event) => setGuestName(event.target.value)}
                />
                <select
                  aria-label="게스트를 추가할 명단"
                  className="tm-input"
                  value={guestSlot}
                  onChange={(event) => setGuestSlot(event.target.value as LineupSlot)}
                  style={{ width: 96 }}
                >
                  <option value="starter">선발</option>
                  <option value="bench">후보</option>
                </select>
                <button
                  type="button"
                  className="tm-btn tm-btn-sm tm-btn-outline"
                  aria-label="게스트 추가"
                  onClick={() => {
                    setState((prev) => {
                      if (!prev) return prev;
                      return guestSlot === 'starter' ? addGuestToStarters(prev, guestName) : addGuestToBench(prev, guestName);
                    });
                    setGuestName('');
                  }}
                >
                  <PlusIcon size={16} aria-hidden="true" /> 추가
                </button>
              </div>
            </Card>
          </section>
        ) : null}
        </div>

        <section aria-labelledby="lineup-change-request-heading" style={{ marginBottom: 16 }}>
          <SectionTitle id="lineup-change-request-heading" title="상대팀 라인업 정정 요청" />
          <Card pad={14} style={{ marginTop: 8 }}>
            <p className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 10 }}>
              상대팀이 제출한 라인업에 문제가 있다면 재작성을 요청할 수 있어요. 상대팀 라인업 내용은 직접 볼 수 없고, 사유만 남겨 다시 작성해 달라고 요청하는 기능이에요.
            </p>
            <button type="button" className="tm-btn tm-btn-sm tm-btn-outline" onClick={() => setChangeRequestOpen(true)}>
              정정 요청 보내기
            </button>
          </Card>
        </section>

        {validationErrors.length > 0 && editable ? (
          <div style={{ marginBottom: 96 }}>
            <AlertBanner tone="warning" message={validationErrors.join(' ')} />
          </div>
        ) : null}
      </div>

      {editable ? (
        <div className="tm-fixed-cta">
          {/* insane review(P0-1, 2026-08 GPT Pro): 편집 중(dirty)에는 버튼을 그냥 막지 않는다
              — 자동저장이 900ms 뒤에야 도는데 그동안 무작정 비활성화만 하면 사용자는 자기가
              막 끝낸 편집이 저장될 때까지 그냥 기다렸다가 다시 눌러야 한다. 대신 클릭 자체를
              "flush-then-submit" 트리거로 쓴다: handleSubmit이 dirty를 보면 디바운스를
              기다리지 않고 즉시 저장을 밀어넣고, 그 ack로 받은 새 revision으로 이어서
              제출한다(submitFlowPending이 true인 동안). 버튼은 그 진행 중에만, 그리고 실제
              제출 mutation이 나가 있는 동안만 비활성화한다 — validationErrors/일반 dirty와는
              분리된 상태라서 "편집 후 방금 클릭"과 "지금 flush 진행 중이라 중복 클릭 막아야
              함"을 구분할 수 있다. 저장이 실패·충돌하면 submitFlowPending이 즉시 풀리고
              제출은 나가지 않는다(runQueuedSave의 onError 참고) — saveErrorMessage로 이유를
              보여준다. */}
          <button
            type="button"
            className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
            disabled={validationErrors.length > 0 || submitMutation.isPending || submitFlowPending}
            onClick={handleSubmit}
          >
            {submitMutation.isPending
              ? '제출 중…'
              : submitFlowPending
                ? '변경사항 저장 중…'
                : '라인업 제출하기'}
          </button>
        </div>
      ) : null}

      {changeRequestOpen ? (
        <div
          role="presentation"
          onClick={() => setChangeRequestOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(25,31,40,0.32)', padding: 20 }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="lineup-change-request-dialog-title"
            onClick={(event) => event.stopPropagation()}
            style={{ width: 'min(100%, 420px)', borderRadius: 18, background: 'var(--bg)', boxShadow: 'var(--shadow-modal)', padding: 18 }}
          >
            <h2 id="lineup-change-request-dialog-title" className="tm-text-subhead" style={{ margin: 0 }}>
              상대팀에 정정을 요청할까요?
            </h2>
            <label htmlFor="lineup-change-request-reason" className="tm-text-caption" style={{ display: 'block', margin: '12px 0 6px', color: 'var(--text-muted)' }}>
              사유
            </label>
            <textarea
              id="lineup-change-request-reason"
              className="tm-input"
              rows={3}
              value={changeRequestReason}
              onChange={(event) => setChangeRequestReason(event.target.value)}
              placeholder="예: 등번호가 중복된 것 같아요"
            />
            {changeRequestError ? (
              <p role="alert" className="tm-text-caption" style={{ color: 'var(--red500)', marginTop: 6 }}>
                {changeRequestError}
              </p>
            ) : null}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8, marginTop: 16 }}>
              <button type="button" className="tm-btn tm-btn-md tm-btn-neutral" onClick={() => setChangeRequestOpen(false)}>
                취소
              </button>
              <button
                type="button"
                className="tm-btn tm-btn-md tm-btn-primary"
                disabled={changeRequestMutation.isPending}
                onClick={submitChangeRequest}
              >
                {changeRequestMutation.isPending ? '보내는 중…' : '요청 보내기'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </AppChrome>
  );
}
