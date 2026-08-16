'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useV1AdminTournamentRegistrations, useV1AdminTournamentPlayers, useV1AdminTournamentAwards, useV1SetTournamentAwards } from '@/hooks/use-v1-api';
import type { V1TournamentAwardIconKey } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { legacyAwardIconKey, TOURNAMENT_AWARD_ICON_OPTIONS, TournamentAwardIcon } from '@/components/tournaments/tournament-award-icon';
import { EntityPicker, type EntityPickerItem } from '@/components/admin/entity-picker';


// ── Tab: Individual Awards ────────────────────────────────────────────────

type AwardForm = { awardType: string; awardLabel: string; iconKey: V1TournamentAwardIconKey; recipientName: string; teamName: string; note: string };

export function AwardsTab({
  tournamentId,
  showToast,
}: {
  tournamentId: string;
  showToast: (msg: string, v?: 'success' | 'error') => void;
}) {
  const setAwards = useV1SetTournamentAwards(tournamentId);
  const { data: savedAwards } = useV1AdminTournamentAwards(tournamentId);
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
      teamName: award.teamName ?? '',
      note: award.note ?? '',
    })));
    setLoaded(true);
  }, [loaded, savedAwards]);

  const update = (idx: number, field: keyof AwardForm, value: string) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { awardType: `custom_${Date.now()}`, awardLabel: '', iconKey: 'trophy', recipientName: '', teamName: '', note: '' }]);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    const incompleteRow = rows.find((row) => !row.awardLabel.trim() || !row.recipientName.trim());
    if (incompleteRow) {
      showToast('각 항목의 어워드명과 수상자를 모두 입력해 주세요.', 'error');
      return;
    }
    const awards = rows
      .map((r, i) => ({ ...r, awardLabel: r.awardLabel.trim(), recipientName: r.recipientName.trim(), teamName: r.teamName.trim() || undefined, note: r.note.trim() || undefined, sortOrder: i }));
    setAwards.mutate(awards, {
      onSuccess: () => showToast('개인 어워드가 저장됐어요.', 'success'),
      onError: (err) => showToast(extractErrorMessage(err, '개인 어워드를 저장하지 못했어요.'), 'error'),
    });
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-bold text-[var(--text-strong)]">개인 어워드</h3>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">MVP, 득점왕 등 개인 수상자를 입력하세요. 사용자 페이지(시상·리뷰)에 표시돼요.</p>
        </div>
        <button type="button" onClick={addRow} className="inline-flex items-center text-xs text-[var(--blue700)] font-semibold px-3 min-h-[36px] rounded-lg border border-[var(--tint-blue-border)] hover:bg-[var(--blue50)]">+ 항목 추가</button>
      </div>

      <div className="flex flex-col gap-3">
        {loaded && rows.length === 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-5 text-center">
            <p className="text-[13px] font-semibold text-[var(--text-strong)]">등록된 개인 어워드가 없어요.</p>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">필요한 어워드만 항목 추가로 등록해 주세요.</p>
          </div>
        )}
        {rows.map((row, idx) => (
          <AwardRow
            key={idx}
            idx={idx}
            row={row}
            update={update}
            removeRow={removeRow}
            tournamentId={tournamentId}
            teamItems={awardTeamItems}
          />
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-[var(--border)]">
        <button
          type="button"
          onClick={handleSave}
          disabled={setAwards.isPending}
          className="w-full h-[44px] inline-flex items-center justify-center bg-blue-600 text-white font-semibold rounded-xl text-[13px] disabled:opacity-50 hover:bg-blue-700 transition-colors"
        >
          {setAwards.isPending ? '저장 중...' : '어워드 저장'}
        </button>
      </div>
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
}: {
  idx: number;
  row: AwardForm;
  update: (idx: number, field: keyof AwardForm, value: string) => void;
  removeRow: (idx: number) => void;
  tournamentId: string;
  teamItems: EntityPickerItem[];
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
    id: p.id,
    label: p.realName,
  }));
  const recipientValue: EntityPickerItem | null = row.recipientName
    ? (playerItems.find((it) => it.label === row.recipientName) ?? { id: '', label: row.recipientName })
    : null;

  return (
    <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--card-surface)]">
      <div className="flex items-center gap-2 mb-2">
        <input
          type="text"
          value={row.awardLabel}
          onChange={(e) => update(idx, 'awardLabel', e.target.value)}
          placeholder="어워드명 (예: MVP)"
          className="flex-1 text-[13px] font-semibold border-0 bg-[var(--surface-soft)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        {/* 파괴적 동작이므로 손가락으로 정확히 누를 수 있어야 한다 — 히트 영역 44px. */}
        <button type="button" onClick={() => removeRow(idx)} className="text-[var(--text-muted)] hover:text-red-500 inline-flex items-center justify-center min-h-11 min-w-11 shrink-0" aria-label="항목 삭제"><X size={16} /></button>
      </div>
      <div className="mb-2">
        <label htmlFor={`award-icon-${idx}`} className="text-[var(--font-size-caption)] text-[var(--text-muted)] mb-1 block">아이콘</label>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]" aria-hidden="true">
            <TournamentAwardIcon iconKey={row.iconKey} />
          </span>
          <select
            id={`award-icon-${idx}`}
            value={row.iconKey}
            onChange={(event) => update(idx, 'iconKey', event.target.value)}
            className="h-11 flex-1 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[13px] text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {TOURNAMENT_AWARD_ICON_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`award-recipient-${idx}`} className="text-[var(--font-size-caption)] text-[var(--text-muted)] mb-1 block">수상자 이름 *</label>
          <EntityPicker
            id={`award-recipient-${idx}`}
            value={recipientValue}
            onChange={(item) => update(idx, 'recipientName', item?.label ?? '')}
            items={playerItems}
            loading={!!selectedRegistrationId && rosterFetching}
            placeholder="명단에서 선택"
            emptyText={selectedRegistrationId ? '명단에 없는 선수예요' : '검색 결과가 없어요'}
          />
          {!teamNameTrimmed && (
            <p className="text-[var(--font-size-caption)] text-[var(--text-muted)] mt-1">소속 팀을 먼저 선택하면 명단에서 고를 수 있어요</p>
          )}
        </div>
        <div>
          <label htmlFor={`award-team-${idx}`} className="text-[var(--font-size-caption)] text-[var(--text-muted)] mb-1 block">소속 팀 (선택)</label>
          <EntityPicker
            id={`award-team-${idx}`}
            value={selectedTeamItem}
            onChange={(item) => update(idx, 'teamName', item?.label ?? '')}
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
            className="w-full text-xs border border-[var(--border)] rounded-xl px-3 py-1.5 bg-[var(--surface-soft)] focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
      )}
    </div>
  );
}
