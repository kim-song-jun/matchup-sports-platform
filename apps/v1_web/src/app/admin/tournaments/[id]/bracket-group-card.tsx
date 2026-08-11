'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { EntityPicker, type EntityPickerItem } from '@/components/admin/entity-picker';
import { AdminDataTable, AdminEmpty, type AdminTableColumn } from '@/components/admin';
import { extractErrorMessage } from '@/lib/error-message';
import type { useV1AssignGroupTeam, useV1CreateFixture } from '@/hooks/use-v1-api';
import type { V1AdminBracketFixture, V1AdminBracketGroup, V1AdminBracketStanding } from '@/types/api';
import { computeQualifyingShortlist, isGroupReady } from './bracket-group-helpers';
import { inputCls, submitBtnCls } from './bracket-shared-styles';

// ── 팀 스테이징 피커: 검색/추천으로 담아뒀다가 한 번에 일괄 배정 ────────────────
// EntityPicker 자체는 6개 무관 화면이 쓰는 공유 컴포넌트라(회귀 리스크) 다중선택 모드를
// 그 안에 넣지 않고, 단건 선택 EntityPicker를 감싸 "선택 즉시 칩으로 담고 초기화"하는
// 방식으로 다중 배정을 흉내낸다.
function TeamStagingPicker({
  pickerId,
  suggestedTeams,
  searchPoolItems,
  isSubmitting,
  onBatchAssign,
}: {
  pickerId: string;
  suggestedTeams: EntityPickerItem[];
  searchPoolItems: EntityPickerItem[];
  isSubmitting: boolean;
  onBatchAssign: (registrationIds: string[]) => void;
}) {
  const [stagedIds, setStagedIds] = useState<string[]>([]);
  const [manualSearchOpen, setManualSearchOpen] = useState(suggestedTeams.length === 0);
  const [pickerValue, setPickerValue] = useState<EntityPickerItem | null>(null);

  const labelById = new Map<string, string>();
  for (const it of suggestedTeams) labelById.set(it.id, it.label);
  for (const it of searchPoolItems) labelById.set(it.id, it.label);

  const stagedSet = new Set(stagedIds);
  const availableSuggested = suggestedTeams.filter((t) => !stagedSet.has(t.id));
  const searchItems = searchPoolItems.filter((t) => !stagedSet.has(t.id));

  function addStaged(id: string) {
    setStagedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }
  function removeStaged(id: string) {
    setStagedIds((prev) => prev.filter((x) => x !== id));
  }

  return (
    <div className="flex flex-col gap-3">
      {suggestedTeams.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-[var(--text-muted)]">
            예선 상위 진출팀이에요. 목록에 없으면 직접 검색해서 담아 보세요.
          </p>
          {availableSuggested.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {availableSuggested.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => addStaged(t.id)}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1 h-[44px] px-3 rounded-full text-[13px] font-medium text-[var(--blue700)] bg-[var(--blue50)] border border-[var(--tint-blue-border)] hover:bg-blue-100 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                >
                  <Plus size={12} aria-hidden="true" />
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {manualSearchOpen ? (
        <div className="flex flex-col gap-1">
          {suggestedTeams.length > 0 && (
            <label htmlFor={pickerId} className="text-[13px] text-[var(--text-strong)]">
              다른 팀 검색
            </label>
          )}
          <EntityPicker
            id={pickerId}
            value={pickerValue}
            onChange={(item) => {
              if (item) addStaged(item.id);
              setPickerValue(null);
            }}
            items={searchItems}
            disabled={isSubmitting}
            placeholder="팀 검색"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setManualSearchOpen(true)}
          className="self-start inline-flex items-center min-h-[44px] text-xs text-[var(--blue700)] underline underline-offset-2 hover:opacity-80 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
        >
          다른 팀 검색
        </button>
      )}

      {stagedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="담은 팀">
          {stagedIds.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-[var(--surface-soft)] text-xs text-[var(--text-body)]"
            >
              {labelById.get(id) ?? id}
              <button
                type="button"
                onClick={() => removeStaged(id)}
                aria-label={`${labelById.get(id) ?? '팀'} 담기 취소`}
                className="inline-flex items-center justify-center w-[20px] h-[20px] rounded-full text-gray-400 hover:text-red-500 hover:bg-[var(--red50)] transition-colors"
              >
                <X size={11} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      {stagedIds.length > 0 && (
        <button
          type="button"
          onClick={() => {
            onBatchAssign(stagedIds);
            setStagedIds([]);
          }}
          disabled={isSubmitting}
          className={submitBtnCls + ' self-start'}
        >
          {stagedIds.length}팀 배정
        </button>
      )}
    </div>
  );
}

// ── 조 카드 ────────────────────────────────────────────────────────────────

interface BracketGroupCardProps {
  group: V1AdminBracketGroup;
  allGroups: V1AdminBracketGroup[];
  allStandings: V1AdminBracketStanding[];
  /** 이 대회 전체 픽스처(카드 내부에서 group.id로 필터) — 준비완료 판정·라운드 중복배정 감지용 */
  fixtures: V1AdminBracketFixture[];
  confirmedTeamItems: EntityPickerItem[];
  assignGroupTeam: ReturnType<typeof useV1AssignGroupTeam>;
  createFixture: ReturnType<typeof useV1CreateFixture>;
  isAutoGenerating: boolean;
  onAutoGenerate: (groupId: string) => void;
  onEditGroup: (group: V1AdminBracketGroup) => void;
  onDeleteGroup: (group: V1AdminBracketGroup) => void;
  onRemoveGroupTeam: (groupTeamId: string, teamName: string) => void;
  /** 방금 이 조를 만들었으면 true — 마운트 직후 한 번 스크롤+포커스한다. */
  autoFocus: boolean;
  showToast: (msg: string, v?: 'success' | 'error') => void;
}

export function BracketGroupCard({
  group,
  allGroups,
  allStandings,
  fixtures,
  confirmedTeamItems,
  assignGroupTeam,
  createFixture,
  isAutoGenerating,
  onAutoGenerate,
  onEditGroup,
  onDeleteGroup,
  onRemoveGroupTeam,
  autoFocus,
  showToast,
}: BracketGroupCardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const groupFixtures = fixtures.filter((f) => f.groupId === group.id);
  // 준비완료 여부는 마운트 시점 한 번만 계산해서 초기 접힘 기본값으로 쓴다 — 매 렌더마다
  // 다시 계산하면 "방금 4팀 배정 + 대진 생성까지 끝낸" 카드가 사용자 눈앞에서 접혀버린다.
  const [expanded, setExpanded] = useState(() => !isGroupReady(group, groupFixtures));
  const [isBatchAssigning, setIsBatchAssigning] = useState(false);
  const [manualFixtureOpen, setManualFixtureOpen] = useState(false);
  const [fixtureRound, setFixtureRound] = useState('');
  const [fixtureNumber, setFixtureNumber] = useState('1');
  const [fixtureHomeRegId, setFixtureHomeRegId] = useState('');
  const [fixtureAwayRegId, setFixtureAwayRegId] = useState('');

  useEffect(() => {
    if (autoFocus) {
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // autoFocus는 부모가 방금 생성된 조에만 한 번 true로 넘긴다 — 마운트 시 1회만 반응
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const teamCount = group.groupTeams.length;
  const fixtureCount = groupFixtures.length;
  const ready = teamCount > 0 && fixtureCount > 0;
  const teamLabel = teamCount === 0 ? '배정 대기' : `${teamCount}명 배정됨`;
  const fixtureLabel = fixtureCount === 0 ? '대진 미생성' : `대진 ${fixtureCount}경기`;

  const assignedIds = new Set(group.groupTeams.map((gt) => gt.registrationId));
  const suggestedTeams = computeQualifyingShortlist(group, allGroups, allStandings).filter(
    (c) => !assignedIds.has(c.id),
  );
  const searchPoolItems = confirmedTeamItems.filter((it) => !assignedIds.has(it.id));

  function handleBatchAssign(registrationIds: string[]) {
    if (registrationIds.length === 0) return;
    setIsBatchAssigning(true);
    (async () => {
      try {
        for (const registrationId of registrationIds) {
          await new Promise<void>((resolve, reject) => {
            assignGroupTeam.mutate(
              { groupId: group.id, registrationId },
              { onSuccess: () => resolve(), onError: reject },
            );
          });
        }
        showToast(registrationIds.length === 1 ? '팀을 배정했어요.' : `${registrationIds.length}팀을 배정했어요.`, 'success');
      } catch (err) {
        showToast(extractErrorMessage(err, '팀 배정에 실패했어요.'), 'error');
      } finally {
        setIsBatchAssigning(false);
      }
    })();
  }

  const isKnockout = group.phase === 'semi' || group.phase === 'final' || group.phase === 'third_place';
  const roundOptions: string[] = isKnockout
    ? ['16강', '8강', '4강', '결승', '3·4위전']
    : ['조별 1라운드', '조별 2라운드', '조별 3라운드', '조별 4라운드', '조별 5라운드'];

  const bookedInRound = new Set<string>();
  if (fixtureRound) {
    groupFixtures
      .filter((f) => f.round === fixtureRound)
      .forEach((f) => {
        if (f.homeRegistrationId) bookedInRound.add(f.homeRegistrationId);
        if (f.awayRegistrationId) bookedInRound.add(f.awayRegistrationId);
      });
  }
  const homeBooked = fixtureHomeRegId ? bookedInRound.has(fixtureHomeRegId) : false;
  const awayBooked = fixtureAwayRegId ? bookedInRound.has(fixtureAwayRegId) : false;
  const sameTeam = !!(fixtureHomeRegId && fixtureHomeRegId === fixtureAwayRegId);
  const hasBookingWarn = !sameTeam && (homeBooked || awayBooked);

  function handleCreateFixture(e: React.FormEvent) {
    e.preventDefault();
    if (!fixtureRound.trim() || !fixtureNumber) return;
    if (fixtureHomeRegId && fixtureHomeRegId === fixtureAwayRegId) {
      showToast('홈과 어웨이에 같은 팀을 선택할 수 없어요.', 'error');
      return;
    }
    createFixture.mutate(
      {
        round: fixtureRound.trim(),
        fixtureNumber: parseInt(fixtureNumber, 10),
        groupId: group.id,
        ...(fixtureHomeRegId ? { homeRegistrationId: fixtureHomeRegId } : {}),
        ...(fixtureAwayRegId ? { awayRegistrationId: fixtureAwayRegId } : {}),
      },
      {
        onSuccess: () => {
          setFixtureRound('');
          setFixtureNumber('1');
          setFixtureHomeRegId('');
          setFixtureAwayRegId('');
          showToast('경기 일정을 추가했어요.', 'success');
        },
        onError: (err) => showToast(extractErrorMessage(err, '경기 일정 추가에 실패했어요.'), 'error'),
      },
    );
  }

  const standings = allStandings.filter((s) => s.groupId === group.id);
  const standingColumns: AdminTableColumn<V1AdminBracketStanding>[] = [
    { key: 'position', header: '순위', align: 'center', width: 'w-[56px]', render: (s) => <span className="tabular-nums text-[var(--text-muted)]">{s.position}</span> },
    { key: 'teamName', header: '팀', render: (s) => <span className="font-medium text-[var(--text-strong)]">{s.teamName ?? s.registrationId}</span> },
    { key: 'wins', header: '승', align: 'center', width: 'w-[52px]', render: (s) => <span className="tabular-nums">{s.wins}</span> },
    { key: 'draws', header: '무', align: 'center', width: 'w-[52px]', render: (s) => <span className="tabular-nums">{s.draws}</span> },
    { key: 'losses', header: '패', align: 'center', width: 'w-[52px]', render: (s) => <span className="tabular-nums">{s.losses}</span> },
    { key: 'goalsFor', header: '득점', align: 'center', width: 'w-[60px]', render: (s) => <span className="tabular-nums">{s.goalsFor}</span> },
    { key: 'goalsAgainst', header: '실점', align: 'center', width: 'w-[60px]', render: (s) => <span className="tabular-nums">{s.goalsAgainst}</span> },
    { key: 'points', header: '승점', align: 'right', width: 'w-[64px]', render: (s) => <span className="tabular-nums font-semibold text-[var(--text-strong)]">{s.points}</span> },
  ];
  const knockoutEmpty = isKnockout && standings.length === 0;
  const bodyId = `bracket-group-${group.id}-body`;

  return (
    <div ref={rootRef} className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] overflow-hidden">
      <div className="flex items-start gap-2 px-5 py-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={bodyId}
          className="flex flex-1 min-w-0 items-start gap-2 text-left rounded-lg -m-1 p-1 hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          <ChevronRight
            size={18}
            aria-hidden="true"
            className={`shrink-0 mt-0.5 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[15px] font-bold text-[var(--text-strong)]">{group.name}</span>
              {ready && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500 text-white shrink-0">
                  <Check size={11} aria-hidden="true" />
                  준비완료
                </span>
              )}
            </span>
            <span className="block text-xs text-[var(--text-muted)] mt-0.5">
              {teamLabel} · {fixtureLabel}
              {group.advanceCount != null && ` · 상위 ${group.advanceCount}팀 진출`}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onEditGroup(group)}
            aria-label={`${group.name} 수정`}
            className="inline-flex items-center justify-center w-[44px] h-[44px] rounded-lg text-gray-400 hover:text-[var(--blue700)] hover:bg-[var(--blue50)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onDeleteGroup(group)}
            aria-label={`${group.name} 삭제`}
            className="inline-flex items-center justify-center w-[44px] h-[44px] rounded-lg text-gray-400 hover:text-red-500 hover:bg-[var(--red50)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {expanded && (
        <div id={bodyId} className="px-5 pb-5 pt-1 border-t border-[var(--border)] flex flex-col gap-5">
          {/* ── 배정된 팀 + 순위표 ── */}
          <div className="flex flex-col gap-2">
            {group.groupTeams.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {group.groupTeams.map((gt) => (
                  <span
                    key={gt.id}
                    className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-[var(--surface-soft)] text-xs text-[var(--text-body)]"
                  >
                    {gt.teamName ?? gt.registrationId}
                    <button
                      type="button"
                      onClick={() => onRemoveGroupTeam(gt.id, gt.teamName ?? '이 팀')}
                      aria-label={`${gt.teamName ?? '팀'} 배정 해제`}
                      className="inline-flex items-center justify-center w-[20px] h-[20px] rounded-full text-gray-400 hover:text-red-500 hover:bg-[var(--red50)] transition-colors"
                    >
                      <X size={11} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {knockoutEmpty ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--surface-soft)] border border-dashed border-[var(--border)]">
                <span className="text-xs text-[var(--text-muted)]">아직 배정된 팀이 없어요</span>
              </div>
            ) : standings.length > 0 || group.groupTeams.length > 0 ? (
              <AdminDataTable<V1AdminBracketStanding>
                columns={standingColumns}
                rows={standings}
                keyExtractor={(s) => s.id}
                scrollOnMobile
                empty={
                  group.groupTeams.length > 0 ? (
                    <AdminEmpty title="순위가 아직 없어요" description="배정은 됐지만 순위는 아직 계산 전이에요. '순위 재계산'을 눌러 주세요." />
                  ) : (
                    <AdminEmpty title="팀이 없어요" description="배정된 팀이 없어요." />
                  )
                }
              />
            ) : null}
          </div>

          {/* ── 팀 배정 ── */}
          <TeamStagingPicker
            pickerId={`bracket-group-${group.id}-team-search`}
            suggestedTeams={suggestedTeams}
            searchPoolItems={searchPoolItems}
            isSubmitting={isBatchAssigning || assignGroupTeam.isPending}
            onBatchAssign={handleBatchAssign}
          />

          {/* ── 경기 일정 ── */}
          <div className="flex flex-col gap-3 pt-1 border-t border-[var(--border)]">
            <div className="flex flex-wrap items-center gap-2 pt-4">
              <button
                type="button"
                onClick={() => onAutoGenerate(group.id)}
                disabled={isAutoGenerating || createFixture.isPending}
                className={submitBtnCls}
              >
                <RefreshCw size={14} aria-hidden="true" />
                {isAutoGenerating ? '생성 중…' : '대진 자동 생성'}
              </button>
              <button
                type="button"
                onClick={() => setManualFixtureOpen((v) => !v)}
                className="inline-flex items-center min-h-[44px] px-2 text-xs text-[var(--text-muted)] hover:text-[var(--blue700)] underline underline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
                aria-expanded={manualFixtureOpen}
              >
                직접 입력 {manualFixtureOpen ? '닫기' : '›'}
              </button>
            </div>

            {manualFixtureOpen && (
              <form onSubmit={handleCreateFixture} noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor={`fixture-round-${group.id}`} className="text-[13px] text-[var(--text-strong)]">라운드</label>
                  <select
                    id={`fixture-round-${group.id}`}
                    value={fixtureRound}
                    onChange={(e) => setFixtureRound(e.target.value)}
                    disabled={createFixture.isPending}
                    className={inputCls}
                  >
                    <option value="">라운드 선택</option>
                    {roundOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`fixture-number-${group.id}`} className="text-[13px] text-[var(--text-strong)]">번호</label>
                  <input
                    id={`fixture-number-${group.id}`}
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={fixtureNumber}
                    onChange={(e) => setFixtureNumber(e.target.value)}
                    disabled={createFixture.isPending}
                    className={inputCls}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`fixture-home-${group.id}`} className="text-[13px] text-[var(--text-strong)]">
                    홈 팀 (선택)
                    {homeBooked && <span className="ml-1 text-xs text-[var(--orange700)]" aria-live="polite">이미 해당 라운드에 배정됨</span>}
                  </label>
                  <EntityPicker
                    id={`fixture-home-${group.id}`}
                    value={confirmedTeamItems.find((it) => it.id === fixtureHomeRegId) ?? null}
                    onChange={(item) => setFixtureHomeRegId(item?.id ?? '')}
                    items={confirmedTeamItems.filter((it) => it.id !== fixtureAwayRegId)}
                    disabled={createFixture.isPending}
                    clearLabel="미정"
                    placeholder="홈 팀 검색"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`fixture-away-${group.id}`} className="text-[13px] text-[var(--text-strong)]">
                    어웨이 팀 (선택)
                    {awayBooked && <span className="ml-1 text-xs text-[var(--orange700)]" aria-live="polite">이미 해당 라운드에 배정됨</span>}
                  </label>
                  <EntityPicker
                    id={`fixture-away-${group.id}`}
                    value={confirmedTeamItems.find((it) => it.id === fixtureAwayRegId) ?? null}
                    onChange={(item) => setFixtureAwayRegId(item?.id ?? '')}
                    items={confirmedTeamItems.filter((it) => it.id !== fixtureHomeRegId)}
                    disabled={createFixture.isPending}
                    clearLabel="미정"
                    placeholder="어웨이 팀 검색"
                  />
                </div>
                <div className="flex flex-col gap-1 items-start sm:col-span-2">
                  {(sameTeam || hasBookingWarn) && (
                    <p className="text-xs text-[var(--orange700)]" role="alert">
                      {sameTeam ? '홈과 어웨이에 같은 팀을 선택할 수 없어요.' : '해당 라운드에 이미 배정된 팀이 있어요. 확인 후 추가해 주세요.'}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={!fixtureRound || !fixtureNumber || sameTeam || createFixture.isPending}
                    className={submitBtnCls + ' w-full sm:w-auto'}
                  >
                    <Plus size={14} aria-hidden="true" />경기 일정 추가
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
