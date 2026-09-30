'use client';

import { useId, useRef, useState } from 'react';
import { Card } from '@/components/v1-ui/primitives';
import { ConfirmModal } from '@/components/v1-ui/confirm-modal';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import type { LineupEntryDraft } from '@/app/team-matches/[id]/lineup/lineup.view-model';
import { FutsalCourtLines, PitchLines, type CourtKind } from './pitch-lines';
import {
  describeFormationChange,
  planFormationAssignment,
  type FormationChangeSummary,
} from './formation-assignment';
import { GOALKEEPER_SLOT_CODE, slotsWithGoalkeeper, type FormationPreset, type FormationSlot } from './formation-slots';
import { sharedNamePrefixLength, stripSharedPrefix, tokenInitial, tokenNameLabel } from './pitch-token-label';

/**
 * 전술보드의 코트 + 코트 밖 대기 선수(Task 180 H7 A안). 순수 SVG 코트 위에 44px 선수 토큰을 올린다.
 *
 * 좌표는 항상 0~100 퍼센트(y=0 우리 골라인, y=100 상대 골라인)이고 픽셀 변환은 이 파일 안에서만 한다.
 *
 * 놓는 동작:
 * - 대형이 있으면 대기 칩을 **한 번** 누르면 흰 테두리 빈 자리(먼저 누른 자리, 없으면 첫 빈 자리)에 앉는다.
 * - 자유 배치는 칩을 고른 뒤 코트를 누른 곳에 놓는다(자리가 없으니 어디인지 사용자가 정해야 한다).
 * - 놓인 토큰은 끌어서 옮기고, × 로 코트 밖으로 뺀다.
 *
 * 대기 칩은 풋살 코트 옆에 세로로, 축구 피치(폭이 넓다) 아래에 가로로 둔다. 대형 고르기는
 * 모바일은 하단 시트, 데스크톱(≥1024px)은 옆 패널이다(.tm-show-desktop/.tm-hide-desktop).
 */

/**
 * 포메이션 자리 ↔ 코트 위 선수 매칭. 원래 `lineup.view-model` 에 있었는데, Task 163 이 라인업
 * 화면에서 배치를 들어내면서(정본 §3 — 포지션·좌표는 전술보드) 이 컴포넌트가 유일한 소비처가 됐다.
 */
function matchSlotsToEntries(
  slots: FormationSlot[],
  entries: LineupEntryDraft[],
): Array<{ slot: FormationSlot; entry: LineupEntryDraft | null }> {
  const plan = planFormationAssignment(slots, entries);
  const entryByKey = new Map(entries.map((entry) => [entry.key, entry]));
  return plan.slotAssignments.map(({ slot, entryKey }) => ({
    slot,
    entry: entryKey === null ? null : entryByKey.get(entryKey) ?? null,
  }));
}

const COURT_ASPECT: Record<CourtKind, string> = {
  football: '68 / 105', // FIFA 규격 105m×68m 를 세로로 세운 비율
  futsal: '1 / 2', // 40m×20m
};
const TOKEN_SIZE_PCT = 11; // 피치 너비 대비 토큰 지름 비율
/** 인터랙티브 요소 최소 터치 타겟(프로젝트 규칙). */
const TOUCH_TARGET_PX = 44;
/** 풋살 코트 옆 대기 칩 줄 폭 — 390 폭에서 코트가 약 234px 남는다(A-1). */
const WAITING_COLUMN_PX = 108;

export type PitchFormationEditorProps = {
  court: CourtKind;
  /** 코트에 놓인 선수(좌표가 있다). */
  onCourt: LineupEntryDraft[];
  /** 코트 밖 선수. 칩 순서는 호출부가 정한다. */
  waiting: LineupEntryDraft[];
  formation: string | null;
  /** 이 경기 인원에 맞는 대형 — 비어 있으면 "자유 배치"만 남는다(D-17: 화면에 대형을 하드코딩하지 않는다). */
  formationOptions: FormationPreset[];
  /** 대형 목록 아래 안내("5:5 경기예요. 필드 4명 대형만 보여요."). */
  formationNote: string | null;
  /** 지금 할 일이 없을 때 보드 아래에 보일 한 줄(코트 N명 · 대기 M명 등). */
  summary: string | null;
  editable: boolean;
  onSelectFormation: (formation: string | null) => void;
  onPlacePlayer: (key: string, positionX: number, positionY: number) => void;
  onPlaceInSlot: (key: string, slot: FormationSlot) => void;
  onUnplacePlayer: (key: string) => void;
};

export function PitchFormationEditor({
  court,
  onCourt,
  waiting,
  formation,
  formationOptions,
  formationNote,
  summary,
  editable,
  onSelectFormation,
  onPlacePlayer,
  onPlaceInSlot,
  onUnplacePlayer,
}: PitchFormationEditorProps) {
  const pitchRef = useRef<HTMLDivElement>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [selectedWaitingKey, setSelectedWaitingKey] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** 사용자가 먼저 누른 빈 자리(슬롯 인덱스). 없으면 첫 빈 자리가 다음 자리다. */
  const [pickedSlotIndex, setPickedSlotIndex] = useState<number | null>(null);
  const [showFullNotice, setShowFullNotice] = useState(false);
  /** 확인 대기 중인 포메이션 프리셋 코드 — 배치된 선수를 옮겨야 할 때만 채워진다. */
  const [pendingFormation, setPendingFormation] = useState<string | null>(null);
  /**
   * 드래그를 시작한 순간의 "토큰 중심 − 포인터" 차이(퍼센트). 없으면 토큰 가장자리를 잡는 순간
   * 토큰이 포인터 아래로 최대 22px 순간이동한다. 렌더에 쓰이지 않으므로 ref 에 둔다.
   */
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null);

  const selectedPreset = formation === null ? null : (formationOptions.find((preset) => preset.code === formation) ?? null);
  const slots = selectedPreset === null ? null : slotsWithGoalkeeper(selectedPreset);
  const slotMode = slots !== null;
  const matched = slotMode ? matchSlotsToEntries(slots, onCourt) : [];
  const matchedKeys = new Set(matched.flatMap((row) => (row.entry === null ? [] : [row.entry.key])));
  // 자리를 못 받은 선수도 자기 좌표에 그린다 — 코트에서 조용히 사라지지 않게.
  const freeTokens = onCourt.filter((entry) => !matchedKeys.has(entry.key));
  const emptyIndexes = matched.flatMap((row, index) => (row.entry === null ? [index] : []));
  const targetIndex =
    pickedSlotIndex !== null && emptyIndexes.includes(pickedSlotIndex) ? pickedSlotIndex : (emptyIndexes[0] ?? null);
  const selectedWaitingEntry = slotMode ? null : (waiting.find((entry) => entry.key === selectedWaitingKey) ?? null);
  const prefixLength = sharedNamePrefixLength([...onCourt, ...waiting].map((entry) => entry.displayName));
  const courtNoun = court === 'futsal' ? '코트' : '피치';

  function placeFromWaiting(key: string) {
    if (!editable) return;
    if (!slotMode) {
      setSelectedWaitingKey((current) => (current === key ? null : key));
      return;
    }
    if (targetIndex === null) {
      setShowFullNotice(true);
      return;
    }
    onPlaceInSlot(key, matched[targetIndex].slot);
    setPickedSlotIndex(null);
  }

  function unplace(key: string) {
    setShowFullNotice(false);
    onUnplacePlayer(key);
  }

  function clampPct(value: number): number {
    return Math.min(100, Math.max(0, value));
  }

  /** 0.1퍼센트 단위로 맞춘다 — 더 촘촘한 소수는 화면에서 구분되지 않으면서 저장값만 길어진다. */
  function roundPct(value: number): number {
    return Math.round(value * 10) / 10;
  }

  function pointToPitchPct(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = pitchRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const x = roundPct(clampPct(((clientX - rect.left) / rect.width) * 100));
    // 화면 y축은 아래로 증가하지만 좌표계는 "상대 골대가 위(y 큼)"이므로 뒤집는다.
    const y = roundPct(clampPct(100 - ((clientY - rect.top) / rect.height) * 100));
    return { x, y };
  }

  // 고르면 시트를 닫는다 — 시트에는 대형만 있고, 바뀐 코트를 바로 봐야 한다.
  function applyFormation(code: string | null) {
    setSheetOpen(false);
    setPickedSlotIndex(null);
    setShowFullNotice(false);
    setSelectedWaitingKey(null);
    onSelectFormation(code);
  }

  /**
   * 포메이션 칩을 눌렀을 때의 관문. 코트 위 선수를 옮기거나 대기로 내려야 할 때만 확인 모달을
   * 띄우고, 바뀔 게 없으면 곧바로 적용한다. 자유 배치(null)는 좌표가 그대로 남아 묻지 않는다.
   */
  function requestFormation(code: string | null) {
    const preset = code === null ? undefined : formationOptions.find((option) => option.code === code);
    if (code === null || code === formation || preset === undefined) {
      applyFormation(code);
      return;
    }
    const summaryOfChange = describeFormationChange(slotsWithGoalkeeper(preset), onCourt);
    if (summaryOfChange.movedCount === 0 && summaryOfChange.unplacedNames.length === 0) {
      applyFormation(code);
      return;
    }
    setPendingFormation(code);
    setSheetOpen(false);
  }

  const pendingSummary = (() => {
    if (pendingFormation === null) return null;
    const preset = formationOptions.find((option) => option.code === pendingFormation);
    if (preset === undefined) return null;
    return describeFormationChange(slotsWithGoalkeeper(preset), onCourt);
  })();

  function handlePitchClick(event: React.MouseEvent<HTMLDivElement>) {
    if (slotMode || !editable || selectedWaitingKey === null) return;
    const point = pointToPitchPct(event.clientX, event.clientY);
    if (point === null) return;
    onPlacePlayer(selectedWaitingKey, point.x, point.y);
    setSelectedWaitingKey(null);
  }

  function handleTokenPointerDown(entry: LineupEntryDraft) {
    return (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!editable) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const point = pointToPitchPct(event.clientX, event.clientY);
      dragOffsetRef.current =
        point === null || entry.positionX === null || entry.positionY === null
          ? null
          : { dx: entry.positionX - point.x, dy: entry.positionY - point.y };
      setDraggingKey(entry.key);
    };
  }

  function handleTokenPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!editable || draggingKey === null) return;
    const point = pointToPitchPct(event.clientX, event.clientY);
    if (point === null) return;
    const offset = dragOffsetRef.current;
    const x = roundPct(clampPct(point.x + (offset?.dx ?? 0)));
    const y = roundPct(clampPct(point.y + (offset?.dy ?? 0)));
    onPlacePlayer(draggingKey, x, y);
  }

  function handleTokenPointerUp() {
    setDraggingKey(null);
    dragOffsetRef.current = null;
  }

  function tokenFor(entry: LineupEntryDraft) {
    return (
      <PlayerToken
        key={entry.key}
        entry={entry}
        editable={editable}
        label={tokenNameLabel(entry.displayName, prefixLength)}
        initial={tokenInitial(entry.displayName, prefixLength)}
        dragging={draggingKey === entry.key}
        onPointerDown={handleTokenPointerDown(entry)}
        onPointerMove={handleTokenPointerMove}
        onPointerUp={handleTokenPointerUp}
        onUnplace={() => unplace(entry.key)}
      />
    );
  }

  const controls = (
    <FormationControls
      court={court}
      formation={formation}
      formationOptions={formationOptions}
      formationNote={formationNote}
      editable={editable}
      onSelectFormation={requestFormation}
    />
  );

  const choosingPoint = !slotMode && editable && selectedWaitingKey !== null;
  const pitch = (
    <div
      ref={pitchRef}
      role="application"
      aria-label={`${courtNoun} 배치 보드`}
      data-court={court}
      onClick={handlePitchClick}
      // tm-pitch-board: 데스크톱(≥1024px)에서 뷰포트 높이에 맞춰 폭 상한을 내려 준다
      // (desktop/tournaments.css) — 높이만 자르면 비율이 깨진다.
      className="tm-pitch-board"
      style={{
        position: 'relative',
        ...(court === 'futsal'
          ? { flex: '0 1 var(--tm-court-max-width, 320px)', minWidth: 0 }
          : { width: '100%', maxWidth: 'var(--tm-pitch-max-width, 420px)' }),
        aspectRatio: COURT_ASPECT[court],
        borderRadius: 'var(--radius-control)',
        overflow: 'hidden',
        background: `${TURF_STRIPES}, #1f8a4c`,
        cursor: choosingPoint ? 'crosshair' : 'default',
        // 드래그가 필요한 건 토큰뿐이다 — 빈 잔디까지 'none' 이면 모바일 세로 스크롤이 죽는다.
        touchAction: 'pan-y',
        // 자유 배치에서 선수를 고른 뒤 다음 탭을 기다리는 상태를 테두리로도 드러낸다(모바일엔 커서가 없다).
        boxShadow: choosingPoint ? '0 0 0 3px var(--blue500)' : 'none',
        transition: 'box-shadow 120ms ease',
      }}
    >
      {court === 'futsal' ? <FutsalCourtLines /> : <PitchLines />}
      {matched.map(({ slot, entry }, index) =>
        entry ? (
          tokenFor(entry)
        ) : (
          <EmptySlotMarker
            key={`${slot.positionCode}-${slot.x}-${slot.y}-${index}`}
            slot={slot}
            editable={editable}
            isTarget={editable && index === targetIndex}
            onSelect={() => {
              setShowFullNotice(false);
              setPickedSlotIndex(index);
            }}
          />
        ),
      )}
      {freeTokens.map(tokenFor)}
    </div>
  );

  const guidance: { text: string; live: boolean } | null = !editable
    ? null
    : slotMode
      ? showFullNotice && targetIndex === null
        ? { text: `빈 자리가 없어요. ${courtNoun}에서 선수를 빼면(×) 그 자리에 놓을 수 있어요.`, live: true }
        : targetIndex !== null && waiting.length > 0
          ? {
              text: '대기 선수를 누르면 흰 테두리 자리에 놓여요. 자리를 먼저 누르면 그 자리에 놓여요. 놓은 선수는 끌어서 옮겨요.',
              live: false,
            }
          : null
      : selectedWaitingEntry !== null
        ? { text: `${selectedWaitingEntry.displayName} 선수를 놓을 자리를 ${courtNoun}에서 눌러 주세요.`, live: true }
        : waiting.length > 0
          ? { text: `대기 선수를 고른 뒤 ${courtNoun}를 누르면 그 자리에 놓여요. 놓은 선수는 끌어서 옮겨요.`, live: false }
          : null;
  // 지금 반응해야 하는 안내(live)는 코트 **위**에 둔다 — 코트 아래는 390 에서 하단 고정 저장 바에
  // 가려져, 꽉 찬 코트에 칩을 눌러도 아무 일도 없는 것처럼 보였다(W3-V2). 설명·요약은 아래에 남는다.
  const liveGuidance = guidance?.live ? guidance.text : null;
  const footnote = guidance !== null && !guidance.live ? guidance.text : summary;

  // 모바일 진입점에 지금 무엇이 골라져 있는지 시트 안 목록과 **같은 문구**로 보여준다.
  const mobileFormationLabel =
    selectedPreset !== null
      ? `${selectedPreset.code} · ${selectedPreset.label} (필드 ${selectedPreset.outfield}명)`
      : '자유 배치';

  const waitingChips = (
    <WaitingChips
      entries={waiting}
      layout={court === 'futsal' ? 'column' : 'row'}
      editable={editable}
      slotMode={slotMode}
      courtNoun={courtNoun}
      selectedKey={selectedWaitingKey}
      prefixLength={prefixLength}
      onTap={placeFromWaiting}
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 모바일 포메이션 진입점 → 하단 시트. 무엇을 고르는 자리인지(라벨), 지금 무엇인지(대형),
          누를 수 있다는 것(캐럿)을 셋 다 보이게 한다 — 작은 회색 칩이었을 때 아무도 못 찾았다. */}
      <div className="tm-hide-desktop">
        <button
          type="button"
          className="tm-pressable"
          onClick={() => setSheetOpen(true)}
          disabled={!editable}
          aria-haspopup={editable ? 'dialog' : undefined}
          aria-label={editable ? `포메이션 ${mobileFormationLabel}, 변경하기` : `포메이션 ${mobileFormationLabel}`}
          style={{
            width: '100%',
            minHeight: 56,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderRadius: 'var(--radius-control)',
            border: '1px solid var(--border)',
            background: 'var(--card-surface)',
            textAlign: 'left',
            cursor: editable ? 'pointer' : 'default',
            opacity: editable ? 1 : 0.6,
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="tm-text-caption" style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 700 }}>
              포메이션
            </span>
            <span
              className="tm-text-label"
              style={{
                display: 'block',
                marginTop: 2,
                fontWeight: 700,
                color: 'var(--text-strong)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {mobileFormationLabel}
            </span>
          </span>
          {editable ? (
            <span
              aria-hidden="true"
              style={{ flexShrink: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-body-lg)', lineHeight: 1 }}
            >
              ⌄
            </span>
          ) : null}
        </button>
      </div>

      {liveGuidance !== null ? (
        <div
          role="status"
          className="tm-text-caption"
          style={{ color: 'var(--blue700)', fontWeight: 700, lineHeight: 1.5 }}
        >
          {liveGuidance}
          {selectedWaitingEntry !== null ? (
            <button
              type="button"
              onClick={() => setSelectedWaitingKey(null)}
              className="tm-btn tm-btn-ghost tm-inline-action"
            >
              선택 취소
            </button>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', justifyContent: 'center', flexWrap: 'wrap' }}>
        {court === 'futsal' ? (
          <div style={{ display: 'flex', gap: 8, flex: '1 1 0', minWidth: 0, justifyContent: 'center' }}>
            {pitch}
            {waitingChips}
          </div>
        ) : (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: '1 1 0', minWidth: 0, alignItems: 'center' }}
          >
            {pitch}
            {waitingChips}
          </div>
        )}
        <Card pad={16} className="tm-show-desktop" style={{ width: 260, flexShrink: 0 }}>
          {controls}
        </Card>
      </div>

      {footnote !== null ? (
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {footnote}
        </div>
      ) : null}

      <FormationSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        {controls}
      </FormationSheet>

      {/* 포메이션 전환 확인 — 문구는 실제 적용과 같은 계획(describeFormationChange)에서 뽑는다. */}
      <ConfirmModal
        open={pendingFormation !== null && pendingSummary !== null}
        title={`포메이션을 ${pendingFormation ?? ''}로 바꿀까요?`}
        message={buildFormationChangeMessage(pendingSummary)}
        confirmLabel="포메이션 바꾸기"
        onConfirm={() => {
          const next = pendingFormation;
          setPendingFormation(null);
          if (next !== null) applyFormation(next);
        }}
        onCancel={() => setPendingFormation(null)}
      />
    </div>
  );
}

/** 확인 모달 본문. 대기로 내려가는 사람이 누구인지가 취소를 누를지 정하는 근거라 이름을 적는다. */
function buildFormationChangeMessage(summary: FormationChangeSummary | null): string {
  if (summary === null) return '';
  const parts: string[] = [];
  if (summary.movedCount > 0) parts.push(`배치된 선수 ${summary.movedCount}명이 새 자리로 옮겨져요.`);
  if (summary.unplacedNames.length > 0) {
    const shown = summary.unplacedNames.slice(0, 3).join(', ');
    const rest = summary.unplacedNames.length - 3;
    const names = rest > 0 ? `${shown} 외 ${rest}명` : shown;
    parts.push(`${names}은 새 포메이션에 자리가 없어 대기로 내려가요.`);
  }
  if (summary.emptySlotCount > 0) parts.push(`빈 자리 ${summary.emptySlotCount}개는 다시 채워야 해요.`);
  return parts.join(' ');
}

/**
 * 코트 밖 선수 칩. 풋살은 코트 옆 세로 줄(코트 높이만큼, 넘치면 그 안에서 스크롤), 축구는 피치 아래
 * 가로 줄이다. 칩 이름은 공통 앞부분만 떼고 5자로 줄이지 않는다 — 전체 이름은 스크린리더 라벨에 있다.
 * 읽기 전용이면 버튼도, 칩 모양(테두리·알약)도 아닌 목록 글자로 그린다 — 팀장 화면의 눌리는 칩과
 * 같아 보이면 눌러도 반응이 없는 이유를 모른다.
 */
function WaitingChips({
  entries,
  layout,
  editable,
  slotMode,
  courtNoun,
  selectedKey,
  prefixLength,
  onTap,
}: {
  entries: LineupEntryDraft[];
  layout: 'column' | 'row';
  editable: boolean;
  slotMode: boolean;
  courtNoun: string;
  selectedKey: string | null;
  prefixLength: number;
  onTap: (key: string) => void;
}) {
  const headingId = useId();
  const heading = (
    <div id={headingId} className="tm-text-caption" style={{ color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8 }}>
      대기 {entries.length}명
    </div>
  );
  const list = (
    <ul
      aria-labelledby={headingId}
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: layout === 'column' ? 'column' : 'row',
        flexWrap: layout === 'row' ? 'wrap' : 'nowrap',
        gap: 8,
      }}
    >
      {entries.map((entry) => {
        const selected = !slotMode && selectedKey === entry.key;
        const readOnlyStyle: React.CSSProperties = {
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 0',
          color: 'var(--text-strong)',
        };
        const chipStyle: React.CSSProperties = {
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          width: layout === 'column' ? '100%' : undefined,
          minHeight: TOUCH_TARGET_PX,
          padding: '0 12px',
          borderRadius: 'var(--radius-pill)',
          border: selected ? '2px solid var(--blue500)' : '1px solid var(--border)',
          background: selected ? 'var(--tint-blue)' : 'var(--card-surface)',
          color: 'var(--text-strong)',
          textAlign: 'left',
        };
        const numberLabel = entry.jerseyNumber === null ? '번호 없음' : `${entry.jerseyNumber}번`;
        const content = (
          <>
            <span
              className="tab-num"
              style={{
                flexShrink: 0,
                minWidth: 16,
                textAlign: 'right',
                fontSize: 'var(--font-size-caption)',
                fontWeight: 800,
                color: entry.goalkeeper ? 'var(--orange700)' : 'var(--text-strong)',
              }}
            >
              {entry.jerseyNumber ?? ''}
            </span>
            <span
              className="tm-text-caption"
              style={{ minWidth: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {stripSharedPrefix(entry.displayName, prefixLength)}
            </span>
            {/* 골키퍼를 번호 색에만 기대지 않고 글자로도 적는다. */}
            {entry.goalkeeper ? (
              <span style={{ flexShrink: 0, fontSize: 'var(--font-size-caption)', fontWeight: 800, color: 'var(--orange700)' }}>
                GK
              </span>
            ) : null}
          </>
        );
        return (
          <li key={entry.key}>
            {editable ? (
              <button
                type="button"
                className="tm-on-tint"
                aria-pressed={slotMode ? undefined : selected}
                aria-label={`${entry.displayName}(${numberLabel}${entry.goalkeeper ? ', 골키퍼' : ''}) ${courtNoun}에 놓기`}
                onClick={() => onTap(entry.key)}
                style={{ ...chipStyle, cursor: 'pointer' }}
              >
                {content}
              </button>
            ) : (
              <span title={entry.displayName} style={readOnlyStyle}>
                {content}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );

  if (layout === 'row') {
    return (
      <div style={{ width: '100%', maxWidth: 'var(--tm-pitch-max-width, 420px)' }}>
        {heading}
        {list}
      </div>
    );
  }
  // 목록이 코트 높이를 늘리지 않도록 절대 위치로 띄운다 — 줄의 높이는 코트가 정하고, 넘치면 여기서 스크롤한다.
  return (
    <div style={{ position: 'relative', flex: `0 0 ${WAITING_COLUMN_PX}px`, alignSelf: 'stretch' }}>
      <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        {heading}
        {list}
      </div>
    </div>
  );
}

/** 대형 칩 목록 + 안내. 데스크톱 옆 패널과 모바일 시트가 같은 내용을 쓴다. */
function FormationControls({
  court,
  formation,
  formationOptions,
  formationNote,
  editable,
  onSelectFormation,
}: {
  court: CourtKind;
  formation: string | null;
  formationOptions: FormationPreset[];
  formationNote: string | null;
  editable: boolean;
  onSelectFormation: (formation: string | null) => void;
}) {
  // 같은 화면에 두 번(옆 패널·시트) 렌더되므로 칩 그룹이 가리키는 id 를 인스턴스마다 만든다.
  const selectId = `${useId()}-formation`;
  return (
    <div>
      <span id={selectId} className="tm-text-caption" style={{ display: 'block', color: 'var(--text-muted)', marginBottom: 8 }}>
        포메이션
      </span>
      <div
        role="group"
        aria-labelledby={selectId}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 8 }}
      >
        <FormationChip
          court={court}
          selected={formation === null}
          title="자유 배치"
          caption="칸 없이 직접"
          slots={null}
          disabled={!editable}
          onSelect={() => onSelectFormation(null)}
        />
        {formationOptions.map((preset) => (
          <FormationChip
            key={preset.code}
            court={court}
            selected={formation === preset.code}
            title={preset.code}
            caption={`${preset.label} · 필드 ${preset.outfield}명`}
            slots={slotsWithGoalkeeper(preset)}
            disabled={!editable}
            onSelect={() => onSelectFormation(preset.code)}
          />
        ))}
      </div>
      {formationNote ? (
        <p className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
          {formationNote}
        </p>
      ) : null}
    </div>
  );
}

/** 포메이션 하나를 고르는 칩 — 배치 모양을 미니 코트로 함께 보여준다. 단일 선택이지만 이 저장소의
 * 관례대로 `aria-pressed` 토글 버튼 그룹이다(radio 는 화살표 키 로빙 포커스를 직접 관리해야 한다). */
function FormationChip({
  court,
  selected,
  title,
  caption,
  slots,
  disabled,
  onSelect,
}: {
  court: CourtKind;
  selected: boolean;
  title: string;
  caption: string;
  /** null이면 "자유 배치" — 점 없는 빈 코트를 보여준다. */
  slots: FormationSlot[] | null;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${title} ${caption}`}
      disabled={disabled}
      onClick={onSelect}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '12px 8px',
        minHeight: TOUCH_TARGET_PX,
        borderRadius: 10,
        border: `1px solid ${selected ? 'var(--blue500)' : 'var(--border)'}`,
        background: selected ? 'var(--tint-blue)' : 'var(--card-surface)',
        color: 'var(--text-strong)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'border-color 120ms ease, background-color 120ms ease',
      }}
    >
      <MiniFormationPreview court={court} slots={slots} />
      <span style={{ fontSize: 'var(--font-size-label)', fontWeight: 700, lineHeight: 1.2 }}>{title}</span>
      <span className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.3, textAlign: 'center' }}>
        {caption}
      </span>
    </button>
  );
}

/** 칩 안의 미니 코트. 실제 보드와 **같은 좌표계**라 칩에서 본 모양이 그대로 코트에 놓인다 —
 * viewBox 를 코트 비율로 두면 점이 원 그대로다. 이 크기에서는 하프라인 하나만 그린다. */
function MiniFormationPreview({ court, slots }: { court: CourtKind; slots: FormationSlot[] | null }) {
  const [width, height] = court === 'futsal' ? [44, 88] : [68, 105];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={court === 'futsal' ? { width: 36, height: 72, display: 'block' } : { width: 44, height: 68, display: 'block' }}
    >
      <rect x={0} y={0} width={width} height={height} rx={3} fill="#1f8a4c" />
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.55)" strokeWidth={1.2} />
      {slots?.map((slot, index) => (
        <circle
          key={`${slot.positionCode}-${slot.x}-${slot.y}-${index}`}
          cx={(slot.x * width) / 100}
          cy={((100 - slot.y) * height) / 100}
          r={court === 'futsal' ? 4.5 : 5}
          fill={slot.positionCode === GOALKEEPER_SLOT_CODE ? 'var(--player-marker-orange)' : 'var(--player-marker-blue)'}
        />
      ))}
    </svg>
  );
}

/** 모바일 전용 하단 시트("배치 설정"). 데스크톱은 옆 패널을 쓰므로 `.tm-hide-desktop` 으로 숨는다.
 * focus 저장/복원·ESC·Tab focus trap·스크롤 잠금·backdrop 닫기는 공용 훅에 맡긴다. */
function FormationSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const idPrefix = useId();
  const titleId = `${idPrefix}-formation-sheet-title`;
  const { dialogRef, onBackdropClick } = useModalA11y<HTMLElement, HTMLDivElement>({ open, onClose });

  if (!open) return null;

  return (
    <div className="tm-hide-desktop" style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
      <div
        aria-hidden="true"
        onClick={onBackdropClick}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }}
      />
      <div
        ref={dialogRef}
        className="tm-lineup-formation-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'var(--card-surface)',
          borderRadius: 'var(--radius-container) var(--radius-container) 0 0',
          padding: '16px 20px calc(32px + var(--v1-shell-safe-bottom))',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.18)',
        }}
      >
        <div
          aria-hidden="true"
          style={{ width: 36, height: 4, borderRadius: 'var(--radius-pill)', background: 'var(--grey100)', margin: '0 auto 16px' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 id={titleId} className="tm-text-body-lg" style={{ fontWeight: 700 }}>
            배치 설정
          </h3>
          <button type="button" onClick={onClose} aria-label="닫기" className="tm-btn tm-btn-icon tm-btn-ghost">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** 잔디 결 — 밝기가 다른 가로 띠를 교대로 깐다. SVG 라인과 분리해 배경으로만 쓴다. */
const TURF_STRIPES =
  'repeating-linear-gradient(180deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 8%, rgba(0,0,0,0.04) 8%, rgba(0,0,0,0.04) 16%)';

/** 빈 자리. 다음에 선수가 앉을 자리는 흰 테두리(`isTarget`)로 보이고, 누르면 그 자리가 다음 자리가 된다. */
function EmptySlotMarker({
  slot,
  editable,
  isTarget,
  onSelect,
}: {
  slot: FormationSlot;
  editable: boolean;
  isTarget: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        if (editable) onSelect();
      }}
      disabled={!editable}
      aria-pressed={editable ? isTarget : undefined}
      aria-label={`${slot.label} 자리, 비어 있음${isTarget ? ' — 다음에 놓일 자리' : ''}`}
      style={{
        position: 'absolute',
        left: `${slot.x}%`,
        top: `${100 - slot.y}%`,
        transform: 'translate(-50%, -50%)',
        width: TOUCH_TARGET_PX,
        height: TOUCH_TARGET_PX,
        padding: 0,
        borderRadius: 'var(--radius-circle)',
        border: '2px dashed rgba(255,255,255,0.85)',
        background: 'rgba(255,255,255,0.14)',
        color: '#fff',
        // 44px 원 안에 포지션 약칭 2~3자라 12px 여유.
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 'var(--font-size-caption)',
        fontWeight: 700,
        cursor: editable ? 'pointer' : 'default',
        boxShadow: isTarget ? '0 0 0 3px #fff' : 'none',
      }}
    >
      {slot.label}
    </button>
  );
}

/**
 * 코트 위 선수(N-1). 원 안은 등번호, 번호가 없으면 첫 글자 + 점선 원(숫자로 오해하지 않게).
 * 골키퍼는 주황 원 + "GK" 글자 — 색에만 기대지 않는다.
 *
 * 원 색은 테마 무관 고정 칩 색(--player-marker-blue/orange, 흰 글씨 4.5:1 이상)이다. --blue700/
 * --orange700 은 다크모드에서 "카드 위 텍스트용" 밝은 값으로 바뀌어 흰 글씨 배경으로 쓰면 무너진다.
 */
function PlayerToken({
  entry,
  editable,
  dragging,
  label,
  initial,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onUnplace,
}: {
  entry: LineupEntryDraft;
  editable: boolean;
  dragging: boolean;
  /** 토큰 아래 이름표(공통 앞부분 뗌 + 5자). */
  label: string;
  /** 번호가 없을 때 원 안 글자. */
  initial: string;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onUnplace: () => void;
}) {
  const x = entry.positionX ?? 50;
  // y=100(상대 골라인)이 위, y=0(우리 골라인)이 아래 — 화면 top%는 반대로 계산한다.
  const topPct = 100 - (entry.positionY ?? 50);
  /** 코트 아래쪽 끝(골키퍼 y=6 → 화면 94%)의 이름표는 토큰 위로 올린다 — 아래에 두면 보드의
   * overflow:hidden 에 잘려 이름을 못 읽는다(alpha 실측). 88% 는 토큰 반지름 + 이름표 높이의 선. */
  const labelAbove = topPct > 88;
  const hasNumber = entry.jerseyNumber !== null;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${topPct}%`,
        transform: 'translate(-50%, -50%)',
        width: `${TOKEN_SIZE_PCT}%`,
        minWidth: TOUCH_TARGET_PX,
        zIndex: dragging ? 2 : 1,
      }}
    >
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label={`${entry.displayName}${entry.goalkeeper ? ' (골키퍼)' : ''}, 등번호 ${entry.jerseyNumber ?? '없음'}`}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1 / 1',
          minWidth: TOUCH_TARGET_PX,
          minHeight: TOUCH_TARGET_PX,
          padding: 0,
          borderRadius: 'var(--radius-circle)',
          border: hasNumber ? '2px solid #fff' : '2px dashed #fff',
          background: entry.goalkeeper
            ? 'var(--player-marker-orange)'
            : hasNumber
              ? 'var(--player-marker-blue)'
              : 'rgba(0,0,0,0.35)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 'var(--font-size-label)',
          fontWeight: 800,
          cursor: editable ? 'grab' : 'default',
          boxShadow: dragging ? '0 4px 14px rgba(0,0,0,0.35)' : '0 2px 6px rgba(0,0,0,0.25)',
          touchAction: 'none',
        }}
      >
        {hasNumber ? entry.jerseyNumber : initial}
      </button>
      {entry.goalkeeper ? (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: -4,
            left: -4,
            fontSize: 'var(--font-size-caption)',
            fontWeight: 800,
            lineHeight: 1,
            color: '#fff',
            background: 'var(--player-marker-orange)',
            border: '1px solid #fff',
            borderRadius: 'var(--radius-tight)',
            padding: '2px 3px',
          }}
        >
          GK
        </span>
      ) : null}
      {/* 이름표는 토큰 폭에 매이지 않게 따로 위치를 잡는다 — 5자 규칙이 폭을 이미 묶는다. */}
      <span
        title={entry.displayName}
        aria-hidden="true"
        style={{
          position: 'absolute',
          // 위로 올릴 때 8px 은 GK 배지가 토큰 위로 4px 삐져나오기 때문이다.
          ...(labelAbove ? { bottom: '100%', marginBottom: 8 } : { top: '100%', marginTop: 3 }),
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: 84,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'center',
          fontSize: 'var(--font-size-caption)',
          fontWeight: 600,
          color: '#fff',
          background: 'rgba(0,0,0,0.6)',
          padding: '1px 8px',
          borderRadius: 6,
        }}
      >
        {label}
      </span>
      {editable ? (
        // 배치 취소(×). 코트 클릭(자유 배치 탭)으로 버블링되면 같은 탭이 고른 선수를 그 자리에 놓아
        // 의도하지 않은 "교체"가 된다 — stopPropagation. 보이는 원은 18px, 누르는 영역은 44px.
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onUnplace();
          }}
          aria-label={`${entry.displayName} 배치 취소`}
          style={{
            position: 'absolute',
            top: -17,
            right: -17,
            width: TOUCH_TARGET_PX,
            height: TOUCH_TARGET_PX,
            borderRadius: 'var(--radius-circle)',
            border: 'none',
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 18,
              height: 18,
              borderRadius: 'var(--radius-circle)',
              border: '1px solid var(--border)',
              background: 'var(--card-surface)',
              color: 'var(--text-strong)',
              fontSize: 'var(--font-size-caption)',
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </span>
        </button>
      ) : null}
    </div>
  );
}
