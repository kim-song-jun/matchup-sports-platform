'use client';

import { useEffect, useState } from 'react';
import { AppChrome } from '@/components/v1-ui/shell';
import { AlertBanner, Card, EmptyState, SectionTitle } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { PlusIcon } from '@/components/v1-ui/icons';
import {
  buildFormationPresets, presetsForOutfieldCount, slotsWithGoalkeeper, type FormationPreset,
} from '@/components/lineup/formation-slots';
import { PitchFormationEditor } from '@/components/lineup/pitch-formation-editor';
import { matchSlotsToEntries } from '@/app/team-matches/[id]/lineup/lineup.view-model';
import {
  useV1FixtureLineupAccess,
  useV1Game,
  useV1GameLineups,
  useV1SaveGameLineup,
  useV1SubmitGameLineup,
  useV1Tournament,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import {
  addPlayer,
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
  const [activeView, setActiveView] = useState<'roster' | 'pitch'>('roster');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    if (hydrated || gameQuery.data === undefined || lineupsQuery.data === undefined) return;
    setState(hydrateFixtureLineupState(lineupsQuery.data, access.data?.mySideId ?? '', gameQuery.data.version));
    setHydrated(true);
  }, [hydrated, gameQuery.data, lineupsQuery.data, access.data?.mySideId]);

  if (access.isError) {
    return (
      <AppChrome title="라인업" activeTab="tournaments" backHref={`/tournaments/${tournamentId}`} desktopHead>
        <EmptyState
          title="라인업을 관리할 수 없어요"
          sub="이 경기에 참가하는 팀의 매니저·오너만 라인업을 관리할 수 있어요."
        />
      </AppChrome>
    );
  }

  if (access.isLoading || !access.data || gameQuery.isLoading || lineupsQuery.isLoading || state === null) {
    return (
      <AppChrome title="라인업" activeTab="tournaments" backHref={`/tournaments/${tournamentId}`} desktopHead>
        <PageSkeleton variant="detail" />
      </AppChrome>
    );
  }

  if (access.data.mySideId === null) {
    return (
      <AppChrome title="라인업" activeTab="tournaments" backHref={`/tournaments/${tournamentId}`} desktopHead>
        <EmptyState
          title="운영진은 대회 운영 콘솔을 이용해 주세요"
          sub="이 화면은 참가팀 매니저 전용이에요. 대회 스태프는 tournament-ops 콘솔에서 라인업을 관리할 수 있어요."
        />
      </AppChrome>
    );
  }

  const mySideId = access.data.mySideId;
  const editable = state.lineupState === null || state.lineupState === 'DRAFT';
  // D-17: 포메이션·포지션 데이터는 gameQuery(GET /games/:gameId, T1-5)의 lineupConfig에서만
  // 온다. formationSupported(위에서 이미 선언됨)는 별개로 "피치 SVG 모양이 축구/풋살만
  // 구현돼 있다"는 프론트 표시 제약일 뿐이다.
  const sportCatalog: FormationPreset[] = gameQuery.data?.lineupConfig
    ? buildFormationPresets(gameQuery.data.lineupConfig.positions, gameQuery.data.lineupConfig.formations)
    : [];
  const outfieldCount = state.starters.filter((entry) => !entry.goalkeeper).length;
  const formationOptions = presetsForOutfieldCount(sportCatalog, outfieldCount);
  const outfieldGuidance =
    formationSupported && formationOptions.length === 0 && outfieldCount > 0
      ? `현재 선발 ${outfieldCount}명 — 이 인원수에 맞는 정해진 포지션 대형이 없어요. 자유 배치를 사용해 주세요.`
      : null;
  const selectedPreset = state.formation !== null ? formationOptions.find((preset) => preset.code === state.formation) ?? null : null;
  const activeSlots = selectedPreset !== null ? slotsWithGoalkeeper(selectedPreset) : null;
  const emptySlotCount =
    activeSlots !== null ? matchSlotsToEntries(activeSlots, state.starters).filter((row) => row.entry === null).length : 0;

  async function handleSave() {
    if (state === null) return;
    setSaveError(null);
    setSaveStatus('saving');
    try {
      const result = await saveMutation.mutateAsync({ sideId: mySideId, payload: buildSavePayload(state) });
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
    } catch (err) {
      setSaveError(extractErrorMessage(err, '제출하지 못했어요.'));
    }
  }

  const homeName = access.data.homeTeamName ?? '홈팀';
  const awayName = access.data.awayTeamName ?? '원정팀';

  return (
    <AppChrome title="라인업" activeTab="tournaments" backHref={`/tournaments/${tournamentId}`} desktopHead>
      <div style={{ padding: '0 16px 96px', display: 'grid', gap: 14 }}>
        <Card pad={16}>
          <div className="tm-text-body-lg">{homeName} vs {awayName}</div>
          <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>
            {state.lineupState === 'SUBMITTED'
              ? '제출됐어요. 대회 운영진이 확인해요.'
              : state.lineupState === 'LOCKED'
                ? '잠긴 라인업이에요 — 더 이상 수정할 수 없어요.'
                : '아직 초안이에요. 저장 후 제출하면 확정돼요.'}
          </div>
        </Card>

        {saveError ? <AlertBanner message={saveError} tone="error" /> : null}

        <div role="tablist" aria-label="라인업 뷰 전환" style={{ display: 'flex', gap: 8 }}>
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
          <section aria-labelledby="fixture-lineup-pitch-heading">
            <SectionTitle id="fixture-lineup-pitch-heading" title="피치 배치" />
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
                <PitchFormationEditor
                  starters={state.starters}
                  formation={state.formation}
                  formationOptions={formationOptions}
                  slots={activeSlots}
                  outfieldGuidance={outfieldGuidance}
                  editable={editable}
                  onSelectFormation={(formation) => setState((prev) => (prev ? selectFormation(prev, formation) : prev))}
                  onPlacePlayer={(key, x, y) => setState((prev) => (prev ? setPlayerPosition(prev, key, x, y) : prev))}
                  onUnplacePlayer={(key) => setState((prev) => (prev ? clearPlayerPosition(prev, key) : prev))}
                  onPlaceInSlot={(key, slot) => setState((prev) => (prev ? placeInSlot(prev, key, slot) : prev))}
                  onUnplaceFromSlot={(key) => setState((prev) => (prev ? unplaceFromSlot(prev, key) : prev))}
                />
              </div>
            )}
          </section>
        ) : (
          <>
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
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', marginTop: 8 }} aria-hidden="true">
                    <span className="tm-text-micro" style={{ color: 'var(--text-muted)', fontWeight: 600, minWidth: 44 }}>GK</span>
                    <span className="tm-text-micro" style={{ flex: 1, color: 'var(--text-muted)', fontWeight: 600 }}>이름</span>
                    <span className="tm-text-micro" style={{ width: 56, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>등번호</span>
                  </div>
                  <Card pad={0} style={{ marginTop: 4 }}>
                    {state.starters.map((entry, index) => (
                      <div key={entry.key} style={{ padding: 12, ...(index > 0 ? { borderTop: '1px solid var(--border)' } : {}) }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                              // orange50 배경 위 orange500 텍스트는 대비 ~1.97:1로 WCAG AA
                              // 크게 미달(2026-08 QA 실측) — orange700(~4.92:1)으로 교체.
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
                                  ? setJerseyNumber(prev, entry.key, event.target.value === '' ? null : Number(event.target.value))
                                  : prev,
                              )
                            }
                          />
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
                      </div>
                    ))}
                  </Card>
                </>
              )}
            </section>

            <section aria-labelledby="fixture-lineup-bench-heading">
              <SectionTitle id="fixture-lineup-bench-heading" title={`후보 (${state.bench.length})`} />
              {state.bench.length === 0 ? (
                <p className="tm-text-caption" style={{ color: 'var(--text-muted)', padding: '8px 0' }}>
                  후보 명단이 비어 있어요.
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', marginTop: 8 }} aria-hidden="true">
                    <span className="tm-text-micro" style={{ flex: 1, color: 'var(--text-muted)', fontWeight: 600 }}>이름</span>
                    <span className="tm-text-micro" style={{ width: 56, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>등번호</span>
                  </div>
                  <Card pad={0} style={{ marginTop: 4 }}>
                    {state.bench.map((entry, index) => (
                      <div key={entry.key} style={{ padding: 12, ...(index > 0 ? { borderTop: '1px solid var(--border)' } : {}) }}>
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
                                  ? setJerseyNumber(prev, entry.key, event.target.value === '' ? null : Number(event.target.value))
                                  : prev,
                              )
                            }
                          />
                          {editable ? (
                            <>
                              <button
                                type="button"
                                className="tm-btn tm-btn-sm tm-btn-outline"
                                onClick={() => setState((prev) => (prev ? moveToStarters(prev, entry.key) : prev))}
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
                      </div>
                    ))}
                  </Card>
                </>
              )}
            </section>
          </>
        )}
      </div>

      {editable ? (
        <div className="tm-fixed-cta">
          <div style={{ display: 'grid', gridTemplateColumns: state.lineupId ? '1fr 1fr' : '1fr', gap: 8 }}>
            <button
              type="button"
              className="tm-btn tm-btn-lg tm-btn-neutral"
              disabled={saveMutation.isPending}
              onClick={handleSave}
            >
              {saveMutation.isPending ? '저장 중…' : saveStatus === 'saved' ? '저장했어요' : '저장'}
            </button>
            {state.lineupId ? (
              <button
                type="button"
                className="tm-btn tm-btn-lg tm-btn-primary"
                disabled={submitMutation.isPending || state.dirty || emptySlotCount > 0}
                onClick={handleSubmit}
              >
                {submitMutation.isPending
                  ? '제출 중…'
                  : emptySlotCount > 0
                    ? `포지션 자리 ${emptySlotCount}개가 비어 있어요`
                    : '라인업 제출하기'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </AppChrome>
  );
}
