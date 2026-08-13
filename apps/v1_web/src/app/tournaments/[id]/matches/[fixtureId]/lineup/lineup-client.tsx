'use client';

import { useEffect, useState } from 'react';
import { AppChrome } from '@/components/v1-ui/shell';
import { AlertBanner, Card, EmptyState, ErrorState, SectionTitle } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { PlusIcon } from '@/components/v1-ui/icons';
import {
  buildFormationPresets, describeSquadSize, goalkeeperPositionCode, slotsWithGoalkeeper,
  type FormationPreset,
} from '@/components/lineup/formation-slots';
import { PitchFormationEditor } from '@/components/lineup/pitch-formation-editor';
import { matchSlotsToEntries, seatStartersInEmptySlots } from '@/app/team-matches/[id]/lineup/lineup.view-model';
import {
  useV1FixtureLineupAccess,
  useV1Game,
  useV1GameLineups,
  useV1SaveGameLineup,
  useV1SubmitGameLineup,
  useV1Tournament,
} from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import { josa } from '@/lib/korean';
import {
  addPlayer,
  applyFormationPreset,
  buildSavePayload,
  clearPlayerPosition,
  createEmptyFixtureLineupState,
  hydrateFixtureLineupState,
  moveToBench,
  moveToStarters,
  placeInSlot,
  removePlayer,
  selectFormation,
  setGoalkeeper,
  setJerseyNumber,
  setPlayerPosition,
  unplaceFromSlot,
  type FixtureLineupState,
} from './fixture-lineup.view-model';

/**
 * 대회 경기(tournament fixture) 참가팀 자기 서비스 라인업 화면 — team-match
 * 라인업(app/team-matches/[id]/lineup)과 같은 피치 배치 컴포넌트를 재사용하되,
 * 로스터 풀 연동 없이 이름을 직접 입력해 추가하는 더 단순한 MVP다(TODO: 대회
 * 등록 로스터 연동은 후속 작업). 자동저장 없이 명시적 저장/제출 버튼만 둔다 —
 * team-match 쪽 자동저장은 "명단이 없어지면 큰일" 성격의 시즌 매치용 배려인데,
 * 이 화면은 아직 임시 데이터 손실 시 되돌릴 UX(버전 충돌 재로드 등)가 없어
 * 명시적 저장이 더 안전하다.
 *
 * `bottomNav={false}` — 하단 고정 CTA(.tm-fixed-cta)나 바텀시트를 쓰는 화면은 하단
 * 탭바를 띄우지 않는 것이 이 저장소의 규약이다(team-match 라인업·대회 상세·참가 신청·
 * 매치 생성 모두 동일). .tm-fixed-cta 는 `bottom: 0` 이고 탭바는 74px 높이로 같은 자리를
 * 차지하므로, 둘을 함께 띄우면 저장/제출 버튼과 "배치 설정" 바텀시트 하단이 탭바에
 * 가려진다 — 이 화면만 규약에서 빠져 있어 모바일에서 실제로 잘려 보였다(2026-08-13
 * 사용자 제보 스크린샷). 탭바를 끄면 AppChrome 이 상단에 홈 단축키를 자동 노출해
 * (shell.tsx 의 showHomeShortcut) 이동 경로도 유지된다.
 */
export function FixtureLineupPageClient({ tournamentId, fixtureId }: { tournamentId: string; fixtureId: string }) {
  const access = useV1FixtureLineupAccess(tournamentId, fixtureId);
  const gameId = access.data?.gameId ?? null;
  const gameQuery = useV1Game(gameId, { enabled: gameId !== null });
  const lineupsQuery = useV1GameLineups(gameId, { enabled: gameId !== null });
  const saveMutation = useV1SaveGameLineup(gameId);
  const submitMutation = useV1SubmitGameLineup(gameId);
  // 피치 배치(코트 도형)는 지금은 축구/풋살 코트 모양(PitchFormationEditor)만 구현돼 있다
  // — team-matches/[id]/lineup/lineup-client.tsx 와 동일한 화이트리스트 판단(그 파일의
  // formationSupported 주석 참고, TODO: 종목별 코트 컴포넌트 후속 작업). fixture-lineup
  // access/game 응답에는 sport 정보가 없어(V1FixtureLineupAccess/V1Game 어디에도 없음)
  // tournamentId로 대회 상세를 별도 조회해 sport.name을 가져온다 — 그 결과, 이 가드가
  // 아예 없던 이전 버전은 배드민턴·농구 등 비축구 대회 경기에서도 축구 피치 도형을
  // 조건 없이 그렸다(2026-08 QA 지적, 실제 버그).
  const tournamentQuery = useV1Tournament(tournamentId);
  const formationSupportedSportName = tournamentQuery.data?.sport?.name ?? null;
  const formationSupported =
    formationSupportedSportName !== null && ['축구', '풋살'].includes(formationSupportedSportName);

  const [state, setState] = useState<FixtureLineupState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // 피치 배치가 늘 먼저 보이는 게 기본 기대치다(2026-08 사용자 지적) — 기본 탭도,
  // 탭 버튼 순서도, 데스크톱 2컬럼의 좌측 배치도 전부 피치 배치가 앞선다.
  const [activeView, setActiveView] = useState<'roster' | 'pitch'>('pitch');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  /**
   * 이슈 #378: SUBMITTED가 되면 editable이 영구히 false로 고정돼 재편집 진입점 자체가
   * 없었다. 서버 상태(lineupState)와는 분리된 순수 로컬 UI 플래그로 재편집 세션을 연다 —
   * "다시 편집하기"를 명시적으로 눌러야만 켜지고(제출 완료 상태를 카드에서 먼저 인지한
   * 뒤), 새로 제출(SUBMITTED)되거나 화면을 새로고침하면 다시 꺼진다(기본값 false). 게임이
   * 이미 시작됐으면(gameStarted) 이 플래그와 무관하게 재편집 진입점 자체를 숨긴다 — 백엔드
   * saveLineup의 LINEUP_DEADLINE_PASSED 가드(games.service.ts)와 같은 기준
   * (game.state !== SCHEDULED)을 프론트에서도 선반영해 헛된 라운드트립을 없앤다.
   */
  const [reopened, setReopened] = useState(false);
  /**
   * 대회 스태프는 어느 팀에도 속하지 않아 `mySideId` 가 null 이다. 예전엔 그걸 곧바로
   * "운영진은 운영 콘솔을 이용해 주세요" 로 막았는데, **운영 콘솔에는 라인업 화면이
   * 없다**(tournament-ops 아래에 operate·result-review·records·operations·staff 뿐).
   * 그래서 운영 콘솔의 "라인업 제출하러 가기" 가 이 화면으로 보내고, 이 화면이 다시
   * 운영 콘솔로 돌려보내는 순환 막다른 길이 됐다 — 라인업이 없으면 "경기 시작" 이
   * 비활성이므로, 팀 매니저가 없는 자리에서는 경기를 시작할 방법이 아예 없었다.
   *
   * 백엔드는 이미 이 경우를 예상하고 `isStaff`·`homeSideId`·`awaySideId`·팀 이름을
   * 함께 내려준다(`resolveFixtureLineupAccess`). 스태프면 편집할 팀을 직접 고르게 하고,
   * 나머지 편집 UI는 매니저와 완전히 동일한 것을 재사용한다(화면 복제 금지).
   */
  const [staffSideId, setStaffSideId] = useState<string | null>(null);
  const editingSideId = access.data?.mySideId ?? staffSideId;

  // [알파 감사 E] 이 종목의 실제 골키퍼 포지션 코드 — 축구 'GK', 풋살 'GOLEIRO'(D-7 사전).
  // lineupConfig가 아직 없으면(로딩 중 등) 기존 동작과 같은 'GK' 폴백을 쓴다.
  const goalkeeperCode = gameQuery.data?.lineupConfig
    ? goalkeeperPositionCode(gameQuery.data.lineupConfig.positions)
    : 'GK';

  useEffect(() => {
    if (hydrated || gameQuery.data === undefined || lineupsQuery.data === undefined) return;
    if (editingSideId === null) return; // 스태프가 아직 팀을 고르지 않았다.
    setState(hydrateFixtureLineupState(lineupsQuery.data, editingSideId, gameQuery.data.version, goalkeeperCode));
    setHydrated(true);
  }, [hydrated, gameQuery.data, lineupsQuery.data, editingSideId, goalkeeperCode]);

  // 이 화면은 원래부터 명시적 저장이라 미저장 상태로 나가면 편집이 그대로 사라진다 —
  // 브라우저 기본 경고로 한 번 막는다(team-match 라인업도 자동저장을 걷어내며 같은 가드를
  // 갖게 됐다).
  // 조건은 아래 `editable`(제출 후 정정 재편집 = SUBMITTED && reopened 포함)과 반드시 같아야
  // 한다 — DRAFT만 보면 제출 후 재편집 중 미저장 변경이 있어도 경고 없이 유실된다
  // (Copilot 리뷰 지적, 실제 결함). editable은 early return 뒤에 선언돼 여기서 쓸 수 없으므로
  // 같은 조건을 여기서 다시 계산한다.
  const hasUnsavedChanges =
    state?.dirty === true &&
    (state.lineupState === null || state.lineupState === 'DRAFT' || (state.lineupState === 'SUBMITTED' && reopened));
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // 최신 브라우저는 문구를 무시하지만 returnValue 설정은 여전히 "경고를 띄우겠다"는 신호다.
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);

  // D-17: 포메이션·포지션 데이터는 gameQuery(GET /games/:gameId, T1-5)의 lineupConfig에서만
  // 온다. formationSupported(위에서 이미 선언됨)는 별개로 "피치 SVG 모양이 축구/풋살만
  // 구현돼 있다"는 프론트 표시 제약일 뿐이다.
  const sportCatalog: FormationPreset[] = gameQuery.data?.lineupConfig
    ? buildFormationPresets(gameQuery.data.lineupConfig.positions, gameQuery.data.lineupConfig.formations)
    : [];
  // 선발 인원수로 선택지를 거르지 않는다. 예전에는 필드 인원이 정확히 일치하는 대형만
  // 남겼는데, 그러면 명단이 덜 찬 동안에는 고를 수 있는 대형이 하나도 없었고 인원이
  // 바뀔 때마다 목록이 통째로 갈려 고르던 포메이션이 사라졌다(사용자 제보: "5명 6명일 때
  // 따라 좀 달라지는 것 같다"). 이제 카탈로그 전체를 항상 보여주고, 인원이 대형과 맞지
  // 않는다는 사실은 드롭다운 아래 안내 문구로만 알린다(PitchFormationEditor).
  const formationOptions = sportCatalog;
  /**
   * 이 대회에 설정된 출전 인원(GK 포함). **범위**다 — canonical config가 축구 7~11, 풋살 3~6이고
   * 관리자가 상한만 고르므로 minPlayers와 maxPlayers가 서로 다를 수 있다
   * (competition-config.presets.ts, lineup-size.ts#buildLineupSizeConfig). maxPlayers만 단일
   * 값처럼 비교하면 7~11 대회에서 선발 9명(정상)에게 "11명인데 9명이에요"라는 틀린 경고가 뜬다.
   * 구버전 응답에는 두 필드가 없을 수 있어 null 허용.
   */
  const { label: squadSizeLabel, outOfRange: starterCountOutOfRange } = describeSquadSize(
    gameQuery.data?.lineupConfig?.minPlayers ?? null,
    gameQuery.data?.lineupConfig?.maxPlayers ?? null,
    state?.starters.length ?? 0,
  );

  // 서버 카탈로그에 아예 없는 formation 코드(대회 종목 설정이 바뀐 뒤 다시 연 옛 초안)만
  // 자유 배치로 되돌린다 — team-match 라인업 화면과 동일한 정리. 그대로 두면 슬롯 모드는
  // 이미 꺼졌는데(activeSlots=null → emptySlotCount=0) formation 라벨만 남아, 제출 게이트가
  // 풀리고 저장 페이로드에 유효하지 않은 코드가 실린다. 카탈로그가 아직 안 실린
  // 동안(sportCatalog=[])에는 아무것도 하지 않는다.
  useEffect(() => {
    if (sportCatalog.length === 0) return;
    if (state && state.formation !== null && !sportCatalog.some((preset) => preset.code === state.formation)) {
      setState((prev) => (prev ? selectFormation(prev, null) : prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sportCatalog, state?.formation]);

  if (access.isError) {
    // 접근권한 조회는 retry:false라 네트워크 일시 오류도 즉시 isError=true가 된다
    // (use-v1-api.ts의 useV1FixtureLineupAccess). 진짜 403(PERMISSION_DENIED)과
    // 그 외 원인(대상 없음·네트워크·서버 오류)을 구분하지 않으면 일시 오류에도 항상
    // "권한 없음" 문구가 뜨고 재시도할 방법도 없다 — team-matches/[id]/lineup의
    // lineupQuery.isError 분기(lineup-client.tsx)와 동일한 코드 분기 패턴을 따른다.
    const code = access.error instanceof V1ApiError ? access.error.code : null;
    if (code === 'PERMISSION_DENIED') {
      return (
        <AppChrome title="라인업" activeTab="tournaments" backHref={`/tournaments/${tournamentId}`} bottomNav={false} desktopHead>
          <EmptyState
            title="라인업을 관리할 수 없어요"
            sub="이 경기에 참가하는 팀의 매니저·오너만 라인업을 관리할 수 있어요."
          />
        </AppChrome>
      );
    }
    if (code === 'GAME_NOT_FOUND' || code === 'TOURNAMENT_FIXTURE_GAME_NOT_FOUND') {
      return (
        <AppChrome title="라인업" activeTab="tournaments" backHref={`/tournaments/${tournamentId}`} bottomNav={false} desktopHead>
          <EmptyState title="경기를 찾을 수 없어요" sub="대회 경기 정보가 삭제됐거나 아직 준비되지 않았어요." />
        </AppChrome>
      );
    }
    return (
      <AppChrome title="라인업" activeTab="tournaments" backHref={`/tournaments/${tournamentId}`} bottomNav={false} desktopHead>
        <div style={{ padding: '40px 20px' }}>
          <ErrorState
            message={extractErrorMessage(access.error, '접근 권한을 불러오지 못했어요.')}
            onRetry={() => void access.refetch()}
          />
        </div>
      </AppChrome>
    );
  }

  if (gameQuery.isError || lineupsQuery.isError) {
    // useV1GameLineups는 retry:false, useV1Game은 전역 기본값(retry:1)이라 재시도
    // 횟수는 다르지만 — 둘 다 실패가 확정되면 결국 isLoading이 false로 떨어진다
    // (use-v1-api.ts). 이걸 여기서 잡지 않으면 70~79행 hydrate useEffect가
    // gameQuery.data===undefined일 때 아무것도 하지 않아 state가 계속 null로 남고,
    // 바로 아래 `state === null` 스켈레톤 분기가 영원히 참이 돼 PageSkeleton에 갇힌다.
    const error = gameQuery.error ?? lineupsQuery.error;
    return (
      <AppChrome title="라인업" activeTab="tournaments" backHref={`/tournaments/${tournamentId}`} bottomNav={false} desktopHead>
        <div style={{ padding: '40px 20px' }}>
          <ErrorState
            message={extractErrorMessage(error, '라인업 정보를 불러오지 못했어요.')}
            onRetry={() => {
              if (gameQuery.isError) void gameQuery.refetch();
              if (lineupsQuery.isError) void lineupsQuery.refetch();
            }}
          />
        </div>
      </AppChrome>
    );
  }

  if (access.isLoading || !access.data || gameQuery.isLoading || lineupsQuery.isLoading) {
    return (
      <AppChrome title="라인업" activeTab="tournaments" backHref={`/tournaments/${tournamentId}`} bottomNav={false} desktopHead>
        <PageSkeleton variant="detail" />
      </AppChrome>
    );
  }

  // 팀에도 안 속하고 스태프도 아니면 이 경기 라인업을 볼 이유가 없다.
  if (access.data.mySideId === null && !access.data.isStaff) {
    return (
      <AppChrome title="라인업" activeTab="tournaments" backHref={`/tournaments/${tournamentId}`} bottomNav={false} desktopHead>
        <EmptyState
          title="이 경기의 라인업을 관리할 권한이 없어요"
          sub="참가팀 매니저 또는 대회 운영진만 라인업을 편집할 수 있어요."
        />
      </AppChrome>
    );
  }

  // 스태프가 아직 편집할 팀을 고르지 않았다 — 어느 팀 명단을 짤지 먼저 정한다.
  if (editingSideId === null) {
    const choices = [
      { sideId: access.data.homeSideId, teamName: access.data.homeTeamName, label: '홈' },
      { sideId: access.data.awaySideId, teamName: access.data.awayTeamName, label: '원정' },
    ].filter((c): c is { sideId: string; teamName: string | null; label: string } => c.sideId !== null);

    return (
      <AppChrome title="라인업" activeTab="tournaments" backHref={`/tournaments/${tournamentId}`} bottomNav={false} desktopHead>
        <div style={{ padding: '20px 20px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <h2 className="tm-text-body-lg" style={{ color: 'var(--text-strong)' }}>
              어느 팀의 명단을 짤까요?
            </h2>
            <p className="tm-text-caption" style={{ color: 'var(--text-caption)', marginTop: 4 }}>
              대회 운영진은 양 팀의 선발 명단을 대신 제출할 수 있어요.
            </p>
          </div>
          {choices.length === 0 ? (
            <EmptyState title="편성된 팀이 없어요" sub="대진이 확정되면 라인업을 짤 수 있어요." />
          ) : (
            choices.map((choice) => (
              <button
                key={choice.sideId}
                type="button"
                className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block"
                onClick={() => setStaffSideId(choice.sideId)}
              >
                {choice.teamName ?? choice.label} 명단 짜기
              </button>
            ))
          )}
        </div>
      </AppChrome>
    );
  }

  if (state === null) {
    return (
      <AppChrome title="라인업" activeTab="tournaments" backHref={`/tournaments/${tournamentId}`} bottomNav={false} desktopHead>
        <PageSkeleton variant="detail" />
      </AppChrome>
    );
  }

  const mySideId = editingSideId;
  // 경기가 시작되면(gameQuery.data.state가 SCHEDULED를 벗어나면) 어느 쪽도 더는
  // 라인업을 편집할 수 없다 — 백엔드 saveLineup의 LINEUP_DEADLINE_PASSED 가드와
  // 동일한 판정 기준이다(games.service.ts, game.state !== SCHEDULED).
  const gameStarted = gameQuery.data !== undefined && gameQuery.data.state !== 'SCHEDULED';
  const canReopen = state.lineupState === 'SUBMITTED' && !gameStarted;
  // gameStarted를 최우선으로 건다 — TOURNAMENT_FIXTURE는 양 사이드 모두 SUBMITTED/LOCKED
  // 라인업이 있어야 게임을 시작할 수 있으므로(assertLineupsSubmittedForStart) DRAFT
  // 상태에서 gameStarted가 참이 되는 경로는 실제로는 나타나지 않지만, 백엔드 가드
  // (game.state !== SCHEDULED면 무조건 거부)와 프론트 판정 기준을 값 하나로 완전히
  // 일치시켜 두면 별도로 다시 어긋날 여지가 없다.
  const editable =
    !gameStarted &&
    (state.lineupState === null || state.lineupState === 'DRAFT' || (state.lineupState === 'SUBMITTED' && reopened));
  // 안내는 두 갈래다: ① 이 종목에 등록된 대형이 아예 없을 때(축구처럼 서버 카탈로그가 빈
  // 경우), ② 대형은 있지만 선발 수가 이 대회가 허용하는 출전 인원 **범위**를 벗어났을 때.
  // ②는 이번에 서버가 출전 인원을 함께 내려주면서 처음 가능해졌다 — 예전에는 화면이 대회
  // 설정을 몰라 "몇 명이어야 맞는지"를 말할 수 없었다. 고른 대형과 선발 수의 차이 자체는
  // 여기가 아니라 PitchFormationEditor가 드롭다운 바로 아래에서 따로 알려준다.
  const starterCount = state.starters.length;
  const outfieldGuidance = !formationSupported
    ? null
    : formationOptions.length === 0
      ? '이 종목은 등록된 포지션 대형이 없어요. 자유 배치로 직접 배치해 주세요.'
      : starterCountOutOfRange && squadSizeLabel !== null
        ? `이 대회 출전 인원은 ${squadSizeLabel}인데 지금 선발은 ${starterCount}명이에요.`
        : null;
  const selectedPreset = state.formation !== null ? formationOptions.find((preset) => preset.code === state.formation) ?? null : null;
  const activeSlots = selectedPreset !== null ? slotsWithGoalkeeper(selectedPreset) : null;
  const emptySlotCount =
    activeSlots !== null ? matchSlotsToEntries(activeSlots, state.starters).filter((row) => row.entry === null).length : 0;
  // 제출을 막는 사유. null 이면 제출 가능하다 — 버튼의 disabled 조건과 하단 CTA 안내
  // 문구가 같은 값을 보므로 "버튼은 잠겼는데 이유는 안 보이는" 어긋남이 생기지 않는다.
  const submitBlockedReason = state.dirty
    ? '저장하지 않은 변경사항이 있어요 — 먼저 저장해 주세요.'
    : emptySlotCount > 0
      ? `포지션 자리 ${emptySlotCount}개가 비어 있어요.`
      : null;

  /**
   * 선발 명단을 바꾸는 편집 액션의 결과를 통과시키면, **이번에 새로 선발이 된 사람**과
   * **이번에 골키퍼로 지정된 사람**만 골라 지금 포메이션의 빈 자리에 앉힌다 — team-match
   * 라인업 화면과 같은 규칙이고, 자리 배정 자체는 seatStartersInEmptySlots 하나가 맡는다.
   * 사용자가 일부러 대기로 남겨둔 선수는 다른 사람을 등록해도 대기에 그대로 남는다.
   */
  function withSeatedNewcomers(prev: FixtureLineupState, next: FixtureLineupState): FixtureLineupState {
    if (next === prev || activeSlots === null) return next;
    const before = new Map(prev.starters.map((entry) => [entry.key, entry]));
    const seatKeys = next.starters
      .filter((entry) => {
        const previous = before.get(entry.key);
        return previous === undefined || (entry.goalkeeper && !previous.goalkeeper);
      })
      .map((entry) => entry.key);
    if (seatKeys.length === 0) return next;
    const starters = seatStartersInEmptySlots(next.starters, activeSlots, seatKeys);
    return starters === next.starters ? next : { ...next, starters, dirty: true };
  }

  async function handleSave() {
    if (state === null) return;
    setSaveError(null);
    setSaveStatus('saving');
    try {
      const result = await saveMutation.mutateAsync({ sideId: mySideId, payload: buildSavePayload(state, goalkeeperCode) });
      setState((prev) =>
        prev === null
          ? prev
          : { ...prev, gameVersion: result.version, lineupId: result.lineupId, lineupState: 'DRAFT', dirty: false },
      );
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('idle');
      setSaveError(extractErrorMessage(err, '저장하지 못했어요.'));
    }
  }

  async function handleSubmit() {
    if (state === null || state.lineupId === null) return;
    setSaveError(null);
    try {
      const result = await submitMutation.mutateAsync({ lineupId: state.lineupId, expectedVersion: state.gameVersion });
      setState((prev) =>
        prev === null ? prev : { ...prev, gameVersion: result.version, lineupState: 'SUBMITTED', dirty: false },
      );
      // 새로 제출됐으니 재편집 세션은 닫는다 — 다시 바꾸려면 "다시 편집하기"를 또 눌러야
      // 한다(제출 완료를 매번 인지한 뒤 편집하게 하려는 의도, 실수로 이어지는 편집 방지).
      setReopened(false);
    } catch (err) {
      setSaveError(extractErrorMessage(err, '제출하지 못했어요.'));
    }
  }

  const homeName = access.data.homeTeamName ?? '홈팀';
  const awayName = access.data.awayTeamName ?? '원정팀';

  return (
    <AppChrome title="라인업" activeTab="tournaments" backHref={`/tournaments/${tournamentId}`} bottomNav={false} desktopHead>
      <div style={{ padding: '0 16px 96px', display: 'grid', gap: 14 }}>
        <Card pad={16}>
          <div className="tm-text-body-lg">{homeName} vs {awayName}</div>
          <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>
            {state.lineupState === 'SUBMITTED' && reopened
              // 재편집을 여는 순간부터 미리 안내한다 — 저장하면 이미 제출된 라인업이
              // 곧바로 새 내용으로 대체된다는 걸 편집을 시작하기 전에 알아야 한다.
              ? '다시 편집하는 중이에요. 저장하면 제출했던 라인업이 새 내용으로 바뀌어요.'
              : state.lineupState === 'SUBMITTED'
                ? '제출됐어요. 대회 운영진이 확인해요.'
                : state.lineupState === 'LOCKED'
                  ? '잠긴 라인업이에요 — 더 이상 수정할 수 없어요.'
                  : '아직 초안이에요. 저장 후 제출하면 확정돼요.'}
          </div>
        </Card>

        {saveError ? <AlertBanner message={saveError} tone="error" /> : null}

        {/* 탭은 좁은 폭(모바일·태블릿) 전용 — 데스크톱(≥1024px)에서는 두 영역이
            .tm-fixture-lineup-grid로 동시에 보이므로 탭 자체가 필요 없다(tm-hide-desktop).
            순서·기본 선택 모두 피치 배치가 먼저다(2026-08 사용자 지적: "항상 피치 배치가
            먼저 나왔으면 좋겠다"). */}
        <div role="tablist" aria-label="라인업 뷰 전환" className="tm-hide-desktop" style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'pitch'}
            className={`tm-btn tm-btn-sm ${activeView === 'pitch' ? 'tm-btn-primary' : 'tm-btn-neutral'}`}
            onClick={() => setActiveView('pitch')}
          >
            피치 배치
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'roster'}
            className={`tm-btn tm-btn-sm ${activeView === 'roster' ? 'tm-btn-primary' : 'tm-btn-neutral'}`}
            onClick={() => setActiveView('roster')}
          >
            명단
          </button>
        </div>

        {/* 두 영역을 항상 함께 렌더한다(탭으로 마운트/언마운트하지 않음) — 모바일·태블릿에서는
            CSS가 활성 탭 쪽만 보여주고(.tm-fixture-lineup-pane.is-active), 데스크톱에서는
            같은 CSS가 두 pane을 나란히 그리드로 강제 노출한다. DOM 순서 자체도 피치가
            먼저라 데스크톱 2컬럼에서도 피치가 왼쪽(시각적으로 앞)에 온다. */}
        <div className="tm-fixture-lineup-grid">
          <section
            aria-labelledby="fixture-lineup-pitch-heading"
            className={`tm-fixture-lineup-pane${activeView === 'pitch' ? ' is-active' : ''}`}
          >
            <SectionTitle id="fixture-lineup-pitch-heading" title="피치 배치" />
            {!formationSupported ? (
              <EmptyState
                title="이 종목은 피치 배치를 아직 지원하지 않아요"
                sub={`${josa(formationSupportedSportName ?? '이 종목', ['은', '는'])} 축구·풋살과 코트 모양·포지션 개념이 달라 준비 중이에요. 명단 탭에서 선발·후보는 그대로 관리할 수 있어요.`}
              />
            ) : state.starters.length === 0 ? (
              <p className="tm-text-caption" style={{ color: 'var(--text-muted)', padding: '8px 0' }}>
                먼저 명단에서 선발을 등록해야 피치에 배치할 수 있어요.
              </p>
            ) : (
              <div style={{ marginTop: 8 }}>
                <PitchFormationEditor
                  starters={state.starters}
                  formation={state.formation}
                  formationOptions={formationOptions}
                  slots={activeSlots}
                  outfieldGuidance={outfieldGuidance}
                  editable={editable}
                  onSelectFormation={(nextFormation) =>
                    setState((prev) => {
                      if (!prev) return prev;
                      // 프리셋을 고르면 라벨만 바꾸는 게 아니라 배치된 선수를 새 슬롯으로
                      // 재배치한다 — 예전에는 좌표를 그대로 뒀기 때문에 새 프리셋에 없는
                      // 포지션의 선수가 피치에서 사라졌다. 자유 배치(null)는 슬롯이 없어
                      // 옮길 자리도 없으므로 라벨만 바꾼다(좌표는 그대로 유효하다).
                      const preset =
                        nextFormation === null
                          ? null
                          : formationOptions.find((option) => option.code === nextFormation) ?? null;
                      return preset === null
                        ? selectFormation(prev, nextFormation)
                        : applyFormationPreset(prev, preset.code, slotsWithGoalkeeper(preset));
                    })
                  }
                  onPlacePlayer={(key, x, y) => setState((prev) => (prev ? setPlayerPosition(prev, key, x, y) : prev))}
                  onUnplacePlayer={(key) => setState((prev) => (prev ? clearPlayerPosition(prev, key) : prev))}
                  onPlaceInSlot={(key, slot) => setState((prev) => (prev ? placeInSlot(prev, key, slot) : prev))}
                  onUnplaceFromSlot={(key) => setState((prev) => (prev ? unplaceFromSlot(prev, key) : prev))}
                />
              </div>
            )}
          </section>

          <section aria-label="명단" className={`tm-fixture-lineup-pane${activeView === 'roster' ? ' is-active' : ''}`}>
            {editable ? (
              <Card pad={16}>
                <div className="tm-text-body-lg">선수 추가</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input
                    type="text"
                    className="tm-input"
                    placeholder="선수 이름"
                    aria-label="추가할 선수 이름"
                    value={newPlayerName}
                    onChange={(event) => setNewPlayerName(event.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="tm-btn tm-btn-sm tm-btn-outline"
                    onClick={() => {
                      setState((prev) => (prev ? addPlayer(prev, newPlayerName) : prev));
                      setNewPlayerName('');
                    }}
                  >
                    <PlusIcon size={16} aria-hidden="true" /> 추가
                  </button>
                </div>
              </Card>
            ) : null}

            <section aria-labelledby="fixture-lineup-starters-heading">
              <SectionTitle id="fixture-lineup-starters-heading" title={`선발 (${state.starters.length})`} />
              {state.starters.length === 0 ? (
                <p className="tm-text-caption" style={{ color: 'var(--text-muted)', padding: '8px 0' }}>
                  선발 명단이 비어 있어요.
                </p>
              ) : (
                <Card pad={0} style={{ marginTop: 8 }}>
                  {state.starters.map((entry, index) => {
                    const jerseyInputId = `starter-jersey-${entry.key}`;
                    return (
                      <div key={entry.key} style={{ padding: 12, ...(index > 0 ? { borderTop: '1px solid var(--border)' } : {}) }}>
                        {/* 1줄: 골키퍼 지정 · 이름 · 이동/제외 액션. 등번호는 아래 줄에
                            라벨과 함께 독립된 자리를 준다(2026-08 사용자 지적: 등번호 입력이
                            "전혀 없는 것처럼" 보였다 — 이름·버튼들 사이에 낀 56px 빈 칸으로는
                            입력 가능한 필드라는 게 눈에 띄지 않았다). */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <button
                            type="button"
                            aria-pressed={entry.goalkeeper}
                            disabled={!editable}
                            onClick={() =>
                              setState((prev) => (prev ? withSeatedNewcomers(prev, setGoalkeeper(prev, entry.key)) : prev))
                            }
                            aria-label={
                              entry.goalkeeper
                                ? `${entry.displayName}, 골키퍼로 지정됨`
                                : josa(entry.displayName, ['을', '를']) + ' 골키퍼로 지정'
                            }
                            style={{
                              flexShrink: 0,
                              minWidth: 44,
                              minHeight: 44,
                              borderRadius: 999,
                              // 2026-08 QA 지적: 미지정 상태(점선 아웃라인 이전 버전)도 "GK"가
                              // 진하게 박힌 원이라 선발 전원이 골키퍼처럼 보였다. 지정된 1명만
                              // 피치 토큰(PlayerToken)과 동일한 orange700 채움 배지로 "확정"
                              // 느낌을 주고, 미지정은 점선 아웃라인(이 파일의 EmptySlotMarker와
                              // 같은 "탭해서 지정" 관용구)으로 눌리지 않은 토글임을 분명히 한다.
                              border: entry.goalkeeper ? '1.5px solid var(--orange700)' : '1.5px dashed var(--grey300)',
                              background: entry.goalkeeper ? 'var(--orange700)' : 'transparent',
                              color: entry.goalkeeper ? '#fff' : 'var(--text-caption)',
                              fontSize: 12,
                              fontWeight: entry.goalkeeper ? 800 : 600,
                              cursor: editable ? 'pointer' : 'default',
                            }}
                          >
                            GK
                          </button>
                          <span
                            className="tm-text-label"
                            style={{
                              flex: 1,
                              fontWeight: 600,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {entry.displayName}
                          </span>
                          {editable ? (
                            <>
                              <button
                                type="button"
                                className="tm-btn tm-btn-sm tm-btn-outline"
                                onClick={() => setState((prev) => (prev ? moveToBench(prev, entry.key) : prev))}
                              >
                                후보로
                              </button>
                              <button
                                type="button"
                                className="tm-btn tm-btn-sm tm-btn-outline"
                                aria-label={`${entry.displayName} 선발에서 제외`}
                                onClick={() => setState((prev) => (prev ? removePlayer(prev, entry.key) : prev))}
                              >
                                제외
                              </button>
                            </>
                          ) : null}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                          <label
                            htmlFor={jerseyInputId}
                            className="tm-text-caption"
                            style={{ color: 'var(--text-muted)', fontWeight: 700, flexShrink: 0 }}
                          >
                            등번호
                            {/* 등번호는 저장·제출 모두에서 필수가 아니다(fixture-lineup.view-model
                                buildSavePayload가 null이면 아예 필드를 생략) — "필수처럼 보여서
                                막힌 줄 알았다"는 오해를 막기 위해 선택 입력임을 라벨에서 바로
                                밝힌다(2026-08 QA 지적). */}
                            <span style={{ fontWeight: 400, color: 'var(--text-caption)' }}> (선택)</span>
                          </label>
                          <input
                            id={jerseyInputId}
                            type="number"
                            inputMode="numeric"
                            aria-label={`${entry.displayName} 등번호`}
                            className="tm-input"
                            placeholder="번호"
                            style={{ width: 72, textAlign: 'center', fontWeight: 700 }}
                            value={entry.jerseyNumber ?? ''}
                            disabled={!editable}
                            onChange={(event) =>
                              setState((prev) =>
                                prev
                                  ? setJerseyNumber(prev, entry.key, event.target.value === '' ? null : Number(event.target.value))
                                  : prev,
                              )
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </Card>
              )}
            </section>

            <section aria-labelledby="fixture-lineup-bench-heading">
              <SectionTitle id="fixture-lineup-bench-heading" title={`후보 (${state.bench.length})`} />
              {state.bench.length === 0 ? (
                <p className="tm-text-caption" style={{ color: 'var(--text-muted)', padding: '8px 0' }}>
                  후보 명단이 비어 있어요.
                </p>
              ) : (
                <Card pad={0} style={{ marginTop: 8 }}>
                  {state.bench.map((entry, index) => {
                    const jerseyInputId = `bench-jersey-${entry.key}`;
                    return (
                      <div key={entry.key} style={{ padding: 12, ...(index > 0 ? { borderTop: '1px solid var(--border)' } : {}) }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span
                            className="tm-text-label"
                            style={{
                              flex: 1,
                              fontWeight: 600,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {entry.displayName}
                          </span>
                          {editable ? (
                            <>
                              <button
                                type="button"
                                className="tm-btn tm-btn-sm tm-btn-outline"
                                onClick={() =>
                                  setState((prev) =>
                                    prev ? withSeatedNewcomers(prev, moveToStarters(prev, entry.key)) : prev,
                                  )
                                }
                              >
                                선발로
                              </button>
                              <button
                                type="button"
                                className="tm-btn tm-btn-sm tm-btn-outline"
                                aria-label={`${entry.displayName} 후보에서 제외`}
                                onClick={() => setState((prev) => (prev ? removePlayer(prev, entry.key) : prev))}
                              >
                                제외
                              </button>
                            </>
                          ) : null}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                          <label
                            htmlFor={jerseyInputId}
                            className="tm-text-caption"
                            style={{ color: 'var(--text-muted)', fontWeight: 700, flexShrink: 0 }}
                          >
                            등번호
                            {/* 등번호는 저장·제출 모두에서 필수가 아니다(fixture-lineup.view-model
                                buildSavePayload가 null이면 아예 필드를 생략) — "필수처럼 보여서
                                막힌 줄 알았다"는 오해를 막기 위해 선택 입력임을 라벨에서 바로
                                밝힌다(2026-08 QA 지적). */}
                            <span style={{ fontWeight: 400, color: 'var(--text-caption)' }}> (선택)</span>
                          </label>
                          <input
                            id={jerseyInputId}
                            type="number"
                            inputMode="numeric"
                            aria-label={`${entry.displayName} 등번호`}
                            className="tm-input"
                            placeholder="번호"
                            style={{ width: 72, textAlign: 'center', fontWeight: 700 }}
                            value={entry.jerseyNumber ?? ''}
                            disabled={!editable}
                            onChange={(event) =>
                              setState((prev) =>
                                prev
                                  ? setJerseyNumber(prev, entry.key, event.target.value === '' ? null : Number(event.target.value))
                                  : prev,
                              )
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </Card>
              )}
            </section>
          </section>
        </div>
      </div>

      {editable ? (
        <div className="tm-fixed-cta">
          {/* 제출이 막힌 사유는 버튼 라벨이 아니라 버튼 위 한 줄로 말한다 — 예전에는 사유
              전체("저장하지 않은 변경사항이 있어요 — 먼저 저장해 주세요")가 제출 버튼의
              라벨이었는데, 이 버튼은 저장 버튼과 1fr 1fr 로 폭을 나눠 갖는다. 모바일
              390px 에서 한 칸은 약 170px 이라 그 문장이 버튼 안에서 대여섯 줄로 부풀고
              하단이 잘려 보였다(2026-08-13 사용자 제보 스크린샷). 사유 자체는 그대로
              보여 주되(왜 막혔는지 모르면 갇힌다) 자리를 버튼 밖으로 옮긴 것이고,
              aria-describedby 로 제출 버튼과 묶어 스크린리더에서도 사유가 함께 읽힌다. */}
          {submitBlockedReason !== null ? (
            <p
              id="fixture-lineup-submit-blocked"
              className="tm-text-caption"
              style={{ color: 'var(--text-muted)', margin: '0 0 8px', textAlign: 'center' }}
            >
              {submitBlockedReason}
            </p>
          ) : null}
          <div style={{ display: 'grid', gridTemplateColumns: state.lineupId ? '1fr 1fr' : '1fr', gap: 8 }}>
            <button
              type="button"
              // tm-btn-neutral(회색 채움)은 globals.css의 .tm-btn:disabled 배경(--grey100)과
              // 완전히 같은 색이라 활성 상태도 비활성처럼 읽혔다(2026-08 QA 지적: "저장 버튼이
              // 회색이라 비활성처럼 보인다"). tm-btn-outline은 이 화면의 "후보로"/"제외" 등
              // 보조 액션과 이미 같은 언어(테두리 + 옅은 배경)라 활성 상태가 분명히 눌러지는
              // 버튼으로 보이면서도 파란 주 CTA(라인업 제출하기)를 침범하지 않는다.
              className="tm-btn tm-btn-lg tm-btn-outline"
              disabled={saveMutation.isPending}
              onClick={handleSave}
            >
              {/* "저장했어요"는 마지막 저장 이후 편집이 없을 때만 참이다 — 예전에는
                  saveStatus만 봤기 때문에 저장 후 계속 편집해도 문구가 그대로 남아, 이미
                  저장됐다고 믿고 화면을 떠나면 그 편집을 잃었다. */}
              {saveMutation.isPending ? '저장 중…' : state.dirty ? '저장' : saveStatus === 'saved' ? '저장했어요' : '저장'}
            </button>
            {state.lineupId ? (
              <button
                type="button"
                className="tm-btn tm-btn-lg tm-btn-primary"
                disabled={submitMutation.isPending || submitBlockedReason !== null}
                aria-describedby={submitBlockedReason !== null ? 'fixture-lineup-submit-blocked' : undefined}
                onClick={handleSubmit}
              >
                {submitMutation.isPending ? '제출 중…' : '라인업 제출하기'}
              </button>
            ) : null}
          </div>
        </div>
      ) : canReopen ? (
        // 이슈 #378: SUBMITTED 이후 재편집 진입점이 화면에 아예 없었다 — 경기 시작 전이면
        // 여기에 단독 CTA로 노출한다. 저장/제출 2버튼 그리드와 같은 tm-fixed-cta 컨테이너·
        // tm-btn-lg 높이를 그대로 써서 자리가 빈 것처럼 보이지 않게 하고, tm-btn-block으로
        // 폭 전체를 채워 2버튼 그리드와 시각적 무게를 맞춘다. 경기가 시작되면(gameStarted)
        // canReopen 자체가 false가 되어 이 진입점도 함께 사라진다.
        <div className="tm-fixed-cta">
          <button type="button" className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" onClick={() => setReopened(true)}>
            다시 편집하기
          </button>
        </div>
      ) : null}
    </AppChrome>
  );
}
