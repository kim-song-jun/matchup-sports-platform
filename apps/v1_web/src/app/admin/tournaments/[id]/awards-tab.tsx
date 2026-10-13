'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useV1AdminTournamentRegistrations, useV1AdminTournamentPlayers, useV1AdminTournamentAwards, useV1SetTournamentAwards, useV1AdminTournamentPlayerRecords, useV1AdminTournamentAwardSets, useV1SetTournamentAwardSets } from '@/hooks/use-v1-api';
import { AdminEmpty, AdminTableSkeleton } from '@/components/admin';
import { AwardRecommendationChips, type AwardRecommendation } from '@/components/admin/award-recommendation-chips';
import type { V1TournamentAwardIconKey, V1TournamentAwardSetInput } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { legacyAwardIconKey, TOURNAMENT_AWARD_ICON_OPTIONS, TournamentAwardIcon } from '@/components/tournaments/tournament-award-icon';
import { EntityPicker, type EntityPickerItem } from '@/components/admin/entity-picker';
import { randomUuid } from '@/lib/uuid';
import { PrizeBreakdownEditor, createPrizeRowId, serializeTournamentPrizeRows, type TournamentPrizeRow } from '@/components/admin/tournaments/prize-breakdown-editor';
import { parsePrizeRows } from '@/lib/prize-breakdown';


// ── Tab: Individual Awards ────────────────────────────────────────────────

type AwardForm = { awardType: string; awardLabel: string; iconKey: V1TournamentAwardIconKey; recipientName: string; recipientUserId: string; teamName: string; note: string; bracketTrack: 'overall' | 'upper' | 'lower' };
type AwardSetDraft = { prizePool: string; prizeSummary: string; prizeRows: TournamentPrizeRow[] };

export function AwardsTab({
  tournamentId,
  canWrite,
  allowSplitAwards = false,
  showToast,
}: {
  readonly tournamentId: string;
  readonly canWrite: boolean;
  readonly allowSplitAwards?: boolean;
  readonly showToast: (msg: string, v?: 'success' | 'error') => void;
}) {
  const setAwards = useV1SetTournamentAwards(tournamentId);
  const setAwardSets = useV1SetTournamentAwardSets(tournamentId);
  const { data: savedAwardSets, isPending: awardSetsPending, isError: awardSetsError, refetch: refetchAwardSets } = useV1AdminTournamentAwardSets(tournamentId, allowSplitAwards);
  const {
    data: savedAwards,
    isPending: awardsPending,
    isError: awardsError,
    refetch: refetchAwards,
  } = useV1AdminTournamentAwards(tournamentId);
  const { data: awardRegData } = useV1AdminTournamentRegistrations(tournamentId);
  // EntityPicker 어댑터 — 소속 팀 선택지(제출은 계속 teamName 문자열)
  const awardTeamItems: EntityPickerItem[] = (awardRegData?.items ?? [])
    .filter((r) => r.status === 'confirmed')
    .map((r) => ({ id: r.id, label: r.teamName ?? r.teamId }));

  // 저장되지 않은 기본 어워드를 강제로 만들지 않는다. 관리자가 추가한 항목만 저장·표시한다.
  const [rows, setRows] = useState<AwardForm[]>([]);

  // 기존 저장된 어워드 로드 — 어드민 대회 상세 응답에는 awards가 없어
  // GET /admin/tournaments/:id/awards 로 별도 하이드레이션한다
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!savedAwards || loaded) return;
    setRows(savedAwards.map((award) => ({
      awardType: award.awardType,
      awardLabel: award.awardLabel,
      iconKey: award.iconKey ?? legacyAwardIconKey(award.awardType),
      recipientName: award.recipientName,
      recipientUserId: award.recipientUserId ?? '',
      teamName: award.teamName ?? '',
      note: award.note ?? '',
      bracketTrack: award.bracketTrack ?? 'overall',
    })));
    setLoaded(true);
  }, [loaded, savedAwards]);

  const emptyAwardSetDraft = (): AwardSetDraft => ({ prizePool: '', prizeSummary: '', prizeRows: [] });
  const [awardSetDrafts, setAwardSetDrafts] = useState<Record<'upper' | 'lower', AwardSetDraft>>({ upper: emptyAwardSetDraft(), lower: emptyAwardSetDraft() });
  const [awardSetsLoaded, setAwardSetsLoaded] = useState(false);
  const [activeAwardSet, setActiveAwardSet] = useState<'upper' | 'lower'>('upper');
  useEffect(() => {
    if (!savedAwardSets || awardSetsLoaded) return;
    const drafts = { upper: emptyAwardSetDraft(), lower: emptyAwardSetDraft() };
    for (const awardSet of savedAwardSets) {
      drafts[awardSet.bracketTrack] = {
        prizePool: awardSet.prizePool === null ? '' : String(awardSet.prizePool),
        prizeSummary: awardSet.prizeSummary ?? '',
        prizeRows: parsePrizeRows(awardSet.prizeBreakdown ?? '').map((row) => ({ id: createPrizeRowId(), label: row.label, value: row.amount })),
      };
    }
    setAwardSetDrafts(drafts);
    setAwardSetsLoaded(true);
  }, [awardSetsLoaded, savedAwardSets]);

  const update = (idx: number, field: keyof AwardForm, value: string) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addRow = () => {
    // Date.now()만으로는 같은 ms의 연속 추가가 같은 awardType이 돼 DB unique
    // (@@unique([tournamentId, awardType])) 위반으로 저장이 실패한다(리뷰 지적).
    // randomUuid()는 crypto.randomUUID 부재 WebView(Capacitor 구형)까지 흡수하는 헬퍼다.
    setRows((prev) => [...prev, { awardType: `custom_${randomUuid()}`, awardLabel: '', iconKey: 'trophy', recipientName: '', recipientUserId: '', teamName: '', note: '', bracketTrack: 'overall' }]);
  };

  // 회고 STATS-3 — 추천 근거 chip. 비게이팅 어드민 랭킹이라 미동의 1위도 그대로
  // 보인다(공개 랭킹을 쓰면 틀린 추천이 된다). chip을 탭하면 아는 값(이름·계정·
  // 소속팀)이 미리 채워진 항목이 추가된다 — 계정 미연결 후보는 recipientUserId가
  // 비어 저장 전 명단 picker로 채워야 하고, 그 필수 검증은 기존 handleSave가 한다.
  // 읽기 전용 접속(canWrite=false)은 chip을 렌더하지 않으므로 조회도 걸지 않는다.
  const playerRecords = useV1AdminTournamentPlayerRecords(canWrite ? tournamentId : '');
  const addRecommendedRow = ({ kind, row }: AwardRecommendation) => {
    setRows((prev) => [
      ...prev,
      {
        awardType: `custom_${randomUuid()}`,
        awardLabel: kind === 'goals' ? '득점왕' : '도움왕',
        iconKey: kind === 'goals' ? 'goal' : 'handshake',
        recipientName: row.name,
        recipientUserId: row.userId ?? '',
        teamName: row.teamName ?? '',
        note: '',
        bracketTrack: 'overall',
      },
    ]);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    const incompleteRow = rows.find((row) => !row.awardLabel.trim() || !row.teamName.trim() || !row.recipientName.trim() || !row.recipientUserId);
    if (incompleteRow) {
      showToast('각 항목의 어워드명, 소속 팀, 수상자를 모두 선택해 주세요.', 'error');
      return;
    }
    const awards = rows
      .map((r, i) => ({ ...r, awardLabel: r.awardLabel.trim(), recipientName: r.recipientName.trim(), teamName: r.teamName.trim() || undefined, note: r.note.trim() || undefined, sortOrder: i }));
    setAwards.mutate(awards, {
      onSuccess: () => showToast('개인 어워드가 저장됐어요.', 'success'),
      onError: (err) => showToast(extractErrorMessage(err, '개인 어워드를 저장하지 못했어요.'), 'error'),
    });
  };

  const saveAwardSets = () => {
    const awardSets: V1TournamentAwardSetInput[] = (['upper', 'lower'] as const).flatMap((bracketTrack) => {
      const draft = awardSetDrafts[bracketTrack];
      const pool = draft.prizePool.trim();
      const summary = draft.prizeSummary.trim();
      const breakdown = serializeTournamentPrizeRows(draft.prizeRows);
      if (pool === '' && summary === '' && breakdown === '') return [];
      return {
        bracketTrack,
        prizePool: pool === '' ? null : Math.floor(Number(pool)),
        prizeSummary: summary || null,
        prizeBreakdown: breakdown || null,
      };
    });
    const invalid = awardSets.find((awardSet) => typeof awardSet.prizePool === 'number' && (!Number.isFinite(awardSet.prizePool) || awardSet.prizePool < 0));
    if (invalid) {
      showToast('총상금은 0 이상의 숫자로 입력해 주세요.', 'error');
      return;
    }
    setAwardSets.mutate(awardSets, {
      onSuccess: () => showToast('상·하위 결선 시상을 저장했어요.', 'success'),
      onError: (error) => showToast(extractErrorMessage(error, '결선 시상을 저장하지 못했어요.'), 'error'),
    });
  };

  // 형제 탭(통계)과 같은 로딩·에러 가드 — 이 가드가 없어 조회 실패 시
  // 스켈레톤도 에러도 없는 무설명 빈 화면이 영구히 남았다.
  if (awardsPending) {
    return (
      <div className="p-4">
        <AdminTableSkeleton rows={4} cols={3} />
      </div>
    );
  }
  if (awardsError) {
    return (
      <div className="p-4">
        <AdminEmpty
          title="개인 어워드를 불러오지 못했어요."
          action={
            <button
              type="button"
              onClick={() => void refetchAwards()}
              className="min-h-[44px] px-4 rounded-lg border border-[var(--border)] font-semibold"
            >
              다시 시도
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="tm-content-enter p-4">
      {allowSplitAwards ? <section aria-label="팀 시상 안내" className="mb-8 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
        <div className="mb-4">
          <h3 className="text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)]">팀 시상 안내</h3>
          <p className="mt-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">대회 전체 시상은 대회 정보에서 관리하고, 상·하위 결선별 시상은 여기에서 저장해요.</p>
        </div>
        {awardSetsPending ? <AdminTableSkeleton rows={3} cols={2} /> : awardSetsError ? (
          <AdminEmpty title="결선 시상 안내를 불러오지 못했어요." action={<button type="button" onClick={() => void refetchAwardSets()} className="min-h-[44px] px-4 rounded-lg border border-[var(--border)] font-semibold">다시 시도</button>} />
        ) : (
          <>
            <label htmlFor="award-set-track" className="mb-2 block text-[length:var(--font-size-caption)] text-[var(--text-muted)]">편집할 결선</label>
            <select id="award-set-track" value={activeAwardSet} onChange={(event) => setActiveAwardSet(event.target.value as 'upper' | 'lower')} disabled={setAwardSets.isPending} className="mb-4 h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-label)] text-[var(--text-strong)]">
              <option value="upper">상위 결선</option>
              <option value="lower">하위 결선</option>
            </select>
            <PrizeBreakdownEditor
              rows={awardSetDrafts[activeAwardSet].prizeRows}
              onChange={(prizeRows) => setAwardSetDrafts((current) => ({ ...current, [activeAwardSet]: { ...current[activeAwardSet], prizeRows } }))}
              prizePool={awardSetDrafts[activeAwardSet].prizePool}
              onPrizePoolChange={(prizePool) => setAwardSetDrafts((current) => ({ ...current, [activeAwardSet]: { ...current[activeAwardSet], prizePool } }))}
              disabled={!canWrite || setAwardSets.isPending}
            />
            <label htmlFor="award-set-summary" className="mt-4 mb-1 block text-[length:var(--font-size-caption)] text-[var(--text-body)]">시상 안내</label>
            <textarea id="award-set-summary" rows={2} maxLength={500} value={awardSetDrafts[activeAwardSet].prizeSummary} onChange={(event) => setAwardSetDrafts((current) => ({ ...current, [activeAwardSet]: { ...current[activeAwardSet], prizeSummary: event.target.value } }))} disabled={!canWrite || setAwardSets.isPending} className="w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] p-3 text-[length:var(--font-size-label)] text-[var(--text-strong)]" />
            {canWrite ? <button type="button" onClick={saveAwardSets} disabled={setAwardSets.isPending || !awardSetsLoaded} className="mt-4 min-h-[44px] w-full rounded-xl bg-blue-600 px-4 font-semibold text-white disabled:opacity-50">{setAwardSets.isPending ? '저장 중…' : '상·하위 시상 저장'}</button> : null}
          </>
        )}
      </section> : null}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)]">개인 어워드</h3>
          <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)] mt-0.5">MVP, 득점왕 등 개인 수상자를 입력하세요. 사용자 페이지(시상·리뷰)에 표시돼요.</p>
        </div>
        {canWrite && (
          <button type="button" onClick={addRow} className="inline-flex items-center text-xs text-[var(--blue700)] font-semibold px-3 min-h-[36px] rounded-lg border border-[var(--tint-blue-border)] hover:bg-[var(--blue50)]">+ 항목 추가</button>
        )}
      </div>

      {canWrite && (
        <AwardRecommendationChips
          goals={playerRecords.data?.goals}
          assists={playerRecords.data?.assists}
          isError={playerRecords.isError}
          onRetry={() => void playerRecords.refetch()}
          onPick={addRecommendedRow}
        />
      )}

      <div className="flex flex-col gap-3">
        {loaded && rows.length === 0 && (
          <div className="tm-on-tint rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-5 text-center">
            <p className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-strong)]">등록된 개인 어워드가 없어요.</p>
            <p className="mt-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
              {canWrite ? '필요한 어워드만 항목 추가로 등록해 주세요.' : '아직 등록된 시상 내역이 없어요.'}
            </p>
          </div>
        )}
        {canWrite
          ? rows.map((row, idx) => (
              <AwardRow
                key={idx}
                idx={idx}
                row={row}
                update={update}
                removeRow={removeRow}
                tournamentId={tournamentId}
                teamItems={awardTeamItems}
                allowSplitAwards={allowSplitAwards}
              />
            ))
          : rows.map((row, idx) => <AwardRowReadOnly key={idx} row={row} />)}
      </div>

      <div className="mt-4 pt-4 border-t border-[var(--border)]">
        {canWrite ? (
          <button
            type="button"
            onClick={handleSave}
            disabled={setAwards.isPending}
            className="w-full h-[44px] inline-flex items-center justify-center bg-blue-600 text-white font-semibold rounded-xl text-[length:var(--font-size-label)] disabled:opacity-50 hover:bg-blue-700 transition-colors"
          >
            {setAwards.isPending ? '저장 중...' : '어워드 저장'}
          </button>
        ) : (
          <p
            className="tm-on-tint rounded-xl bg-[var(--surface-soft)] px-4 py-3 text-xs text-[var(--text-muted)]"
            role="status"
          >
            조회 전용 권한으로 접속했어요. 시상 내역을 수정하려면 운영 권한이 필요해요.
          </p>
        )}
      </div>
    </div>
  );
}

// ── 조회 전용 어워드 행 ────────────────────────────────────────────────
function AwardRowReadOnly({ row }: { readonly row: AwardForm }) {
  return (
    <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--card-surface)]">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]" aria-hidden="true">
          <TournamentAwardIcon iconKey={row.iconKey} />
        </span>
        <div className="min-w-0">
          <p className="text-[length:var(--font-size-label)] font-bold text-[var(--text-strong)] truncate">{row.awardLabel} · {row.bracketTrack === 'upper' ? '상위 결선' : row.bracketTrack === 'lower' ? '하위 결선' : '전체'}</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)] truncate">
            {row.recipientName}
            {row.teamName ? ` · ${row.teamName}` : ''}
          </p>
        </div>
      </div>
      {row.note && (
        <p className="mt-2 text-xs text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">{row.note}</p>
      )}
    </div>
  );
}

// ── AwardsTab 행 컴포넌트 ────────────────────────────────────────────────
// 팀이 선택된 행만 useV1AdminTournamentPlayers로 로스터를 조회해야 하므로(훅 규칙상
// 조건/루프 내 훅 호출 금지) rows.map 내부가 아닌 별도 컴포넌트로 분리한다.
function AwardRow({
  idx,
  row,
  update,
  removeRow,
  tournamentId,
  teamItems,
  allowSplitAwards,
}: {
  idx: number;
  row: AwardForm;
  update: (idx: number, field: keyof AwardForm, value: string) => void;
  removeRow: (idx: number) => void;
  tournamentId: string;
  teamItems: EntityPickerItem[];
  allowSplitAwards: boolean;
}) {
  const teamNameTrimmed = row.teamName.trim();
  const selectedTeamItem: EntityPickerItem | null = teamNameTrimmed
    ? (teamItems.find((it) => it.label === row.teamName) ?? { id: '', label: row.teamName })
    : null;
  const selectedRegistrationId = selectedTeamItem?.id ?? '';

  // 어드민 화면이므로 어드민 엔드포인트를 쓴다. 소비자 엔드포인트는 "그 팀의 멤버인가" 를
  // 검사하므로, 자기가 속하지 않은 참가팀을 고른 어드민에게는 403 이 떨어진다. 그런데 화면은
  // 그 에러를 따로 보여주지 않고 빈 목록으로 처리해서 "명단에 선수가 없다" 처럼 보였다.
  const { data: roster, isFetching: rosterFetching } =
    useV1AdminTournamentPlayers(selectedRegistrationId);
  const playerItems: EntityPickerItem[] = (roster?.players ?? []).map((p) => ({
    id: p.userId,
    label: p.realName,
  }));
  const recipientValue: EntityPickerItem | null = row.recipientName
    ? (playerItems.find((it) => it.id === row.recipientUserId) ?? { id: row.recipientUserId, label: row.recipientName })
    : null;

  return (
    <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--card-surface)]">
      <div className="flex items-center gap-2 mb-2">
        <input
          type="text"
          value={row.awardLabel}
          onChange={(e) => update(idx, 'awardLabel', e.target.value)}
          placeholder="어워드명 (예: MVP)"
          className="min-w-0 flex-1 text-[length:var(--font-size-label)] font-semibold border-0 bg-[var(--surface-soft)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        {/* 파괴적 동작이므로 손가락으로 정확히 누를 수 있어야 한다 — 히트 영역 44px. */}
        <button type="button" onClick={() => removeRow(idx)} className="text-[var(--text-muted)] hover:text-red-500 inline-flex items-center justify-center min-h-11 min-w-11 shrink-0" aria-label="항목 삭제"><X size={16} /></button>
      </div>
      <div className="mb-2">
        <label htmlFor={`award-icon-${idx}`} className="text-[length:var(--font-size-caption)] text-[var(--text-muted)] mb-1 block">아이콘</label>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]" aria-hidden="true">
            <TournamentAwardIcon iconKey={row.iconKey} />
          </span>
          <select
            id={`award-icon-${idx}`}
            value={row.iconKey}
            onChange={(event) => update(idx, 'iconKey', event.target.value)}
            className="h-11 flex-1 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-label)] text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {TOURNAMENT_AWARD_ICON_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mb-2">
        <label htmlFor={`award-track-${idx}`} className="text-[length:var(--font-size-caption)] text-[var(--text-muted)] mb-1 block">수상 범위</label>
        <select id={`award-track-${idx}`} value={row.bracketTrack} disabled={!allowSplitAwards} onChange={(event) => update(idx, 'bracketTrack', event.target.value)} className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-label)] text-[var(--text-strong)] disabled:opacity-70">
          {allowSplitAwards || row.bracketTrack === 'overall' ? <option value="overall">대회 전체</option> : null}
          {allowSplitAwards || row.bracketTrack === 'upper' ? <option value="upper">상위 결선</option> : null}
          {allowSplitAwards || row.bracketTrack === 'lower' ? <option value="lower">하위 결선</option> : null}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`award-recipient-${idx}`} className="text-[length:var(--font-size-caption)] text-[var(--text-muted)] mb-1 block">수상자 이름 *</label>
          <EntityPicker
            id={`award-recipient-${idx}`}
            value={recipientValue}
            onChange={(item) => {
              update(idx, 'recipientName', item?.label ?? '');
              update(idx, 'recipientUserId', item?.id ?? '');
            }}
            items={playerItems}
            loading={!!selectedRegistrationId && rosterFetching}
            placeholder="명단에서 선택"
            emptyText={selectedRegistrationId ? '명단에 없는 선수예요' : '검색 결과가 없어요'}
          />
          {!teamNameTrimmed && (
            <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)] mt-1">소속 팀을 먼저 선택하면 명단에서 고를 수 있어요</p>
          )}
        </div>
        <div>
          <label htmlFor={`award-team-${idx}`} className="text-[length:var(--font-size-caption)] text-[var(--text-muted)] mb-1 block">소속 팀 *</label>
          <EntityPicker
            id={`award-team-${idx}`}
            value={selectedTeamItem}
            onChange={(item) => {
              update(idx, 'teamName', item?.label ?? '');
              update(idx, 'recipientName', '');
              update(idx, 'recipientUserId', '');
            }}
            items={teamItems}
            placeholder="참가 팀에서 선택"
          />
        </div>
      </div>
      {row.note !== undefined && (
        <div className="mt-2">
          <input
            type="text"
            value={row.note}
            onChange={(e) => update(idx, 'note', e.target.value)}
            placeholder="비고 (선택, 예: 3골 1어시스트)"
            className="w-full text-xs border border-[var(--border)] rounded-xl px-3 py-2 bg-[var(--surface-soft)] focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
      )}
    </div>
  );
}
