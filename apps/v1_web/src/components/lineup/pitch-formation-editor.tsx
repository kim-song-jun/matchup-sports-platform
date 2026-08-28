'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Card } from '@/components/v1-ui/primitives';
import { ConfirmModal } from '@/components/v1-ui/confirm-modal';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { matchSlotsToEntries, type LineupEntryDraft } from '@/app/team-matches/[id]/lineup/lineup.view-model';
import { describeFormationChange, type FormationChangeSummary } from './formation-assignment';
import { GOALKEEPER_SLOT_CODE, slotsWithGoalkeeper, type FormationPreset, type FormationSlot } from './formation-slots';

/**
 * 피치 위에 선발 선수를 아이콘으로 배치하는 에디터(FIFA 온라인 스타일). 순수 SVG로 그린
 * 축구/풋살 코트 위에 선수 원형 토큰을 올린다 — 이미지 에셋 없이 코트 라인만으로 충분히
 * 알아볼 수 있다(SVG 우선 원칙).
 *
 * 배치 좌표는 항상 0~100 퍼센트(구장 전체 기준: y=0 우리 골라인, y=50 하프라인,
 * y=100 상대 골라인)로 다루고, 실제 픽셀 변환은 이 컴포넌트 내부에서만 한다 —
 * 호출부(view-model)는 좌표계를 몰라도 된다.
 *
 * 상호작용 두 가지를 함께 지원한다:
 * - 드래그: 이미 배치된 토큰을 피치 위에서 끌어 옮긴다(포인터 이벤트라 마우스·터치 공용).
 * - 탭 배치: 대기 목록에서 선수를 선택한 뒤 피치를 탭하면 그 자리에 놓인다 — 드래그가
 *   어려운 환경(정밀 터치 어려움, 키보드 포커스)을 위한 대체 경로.
 *
 * 반응형: 포메이션 프리셋 + 대기 목록("배치 설정")은 데스크톱(≥1024px)에서 피치 옆
 * 사이드 패널로 항상 보이고, 모바일에서는 "배치 설정" 버튼으로 여는 하단 드로어에
 * 들어간다 — 콘텐츠는 하나(FormationControls)를 두 자리에 각각 렌더링하고 CSS
 * (.tm-show-desktop/.tm-hide-desktop, globals.css에 이미 있는 관례)로 무엇을 보일지
 * 결정한다. 라인업/명단 뷰 자체의 전환(피치 배치 ↔ 명단)은 상위 lineup-client.tsx가
 * 맡는다 — 이 컴포넌트는 피치 하나만 책임진다.
 */

/**
 * 피치 토큰 아래에 붙는 짧은 이름. 토큰 라벨은 폭이 84px 뿐이라 긴 이름은 잘려서
 * 누구인지 못 읽는다(alpha 실측: "E2E 알파 A팀 선수1" → "E2E 알파 A..."). 등록 명단의
 * 표시 이름이 **팀명으로 시작하는 경우**가 흔한데, 피치에 놓인 토큰은 이미 그 팀의
 * 라인업이라 팀명은 되풀이일 뿐이다 — 그 접두사만 걷어내 이름 쪽에 폭을 돌려준다.
 *
 * 접두사를 걷어낸 결과가 비면(이름이 팀명과 완전히 같은 경우) 원본을 그대로 쓴다.
 * 잘라내는 기준은 "팀명으로 시작하는가" 하나뿐이다 — 공백으로 쪼개 마지막 조각만
 * 쓰는 식은 "김 철수" 같은 이름에서 성을 지워 다른 사람으로 보이게 만든다.
 */
export function shortPitchLabel(displayName: string, teamName?: string | null): string {
  const team = teamName?.trim();
  if (team === undefined || team === '') return displayName;
  if (!displayName.startsWith(team)) return displayName;
  const rest = displayName.slice(team.length).trim();
  return rest === '' ? displayName : rest;
}

const PITCH_ASPECT = 68 / 105; // FIFA 규격 축구장 비율(가로 105m : 세로 68m)을 세로로 세운 형태
const TOKEN_SIZE_PCT = 11; // 피치 너비 대비 토큰 지름 비율
/** 인터랙티브 요소 최소 터치 타겟(프로젝트 규칙). 기존 PlayerToken은 36px이었다 — 이번
 * 슬롯 UX 작업 범위 안에서 함께 44px로 올린다(같은 파일을 손대는 김에 기술부채 해결). */
const TOUCH_TARGET_PX = 44;

/**
 * 피치 바깥(명단 패널)에서 끌어온 선수를 어디에 놓을지 이 컴포넌트가 대신 판정해 주는
 * 창구. 좌표계(피치 rect → % 변환, y축 뒤집기)와 슬롯 배치 규칙은 전부 이 파일 안에만
 * 있는 지식이라, 바깥에서 같은 계산을 다시 짜면 두 벌이 갈린다 — 그래서 판정만 노출하고
 * 실제 상태 변경은 호출부(라인업 화면)가 자기 뷰모델로 한다.
 */
export type PitchDropTarget =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'slot'; slot: FormationSlot };

export type PitchDropResolver = {
  /** 화면 좌표가 피치 밖이면 null. 슬롯 모드에서 빈 자리가 없어도 null(놓을 곳이 없다). */
  resolve: (clientX: number, clientY: number) => PitchDropTarget | null;
};

export type PitchFormationEditorProps = {
  starters: LineupEntryDraft[];
  formation: string | null;
  /** 지금 인원수(outfieldCount)에 맞는 프리셋 목록 — presetsForOutfieldCount의 결과를
   * 그대로 받는다. 비어 있으면 "자유 배치"만 칩으로 남는다(D-17: 하드코딩 없음). */
  formationOptions: FormationPreset[];
  /** 선택된 프리셋의 slotsWithGoalkeeper() 결과, 또는 자유 배치 모드일 때 null. */
  slots: FormationSlot[] | null;
  /** formationOptions가 비었을 때 보여줄 안내 문구 — 프리셋 섹션을 숨기지 않고 이
   * 문구 + "자유 배치" 칩을 함께 보여준다. */
  outfieldGuidance: string | null;
  editable: boolean;
  onSelectFormation: (formation: string | null) => void;
  onPlacePlayer: (key: string, positionX: number, positionY: number) => void;
  onUnplacePlayer: (key: string) => void;
  onPlaceInSlot: (key: string, slot: FormationSlot) => void;
  onUnplaceFromSlot: (key: string) => void;
  /** 명단 패널에서 피치로 끌어다 놓는 경로를 쓰려면 이 ref 를 넘긴다(선택). */
  dropResolverRef?: React.MutableRefObject<PitchDropResolver | null>;
  /** 이 라인업을 짜는 팀 이름. 토큰 라벨에서 팀명 접두사를 떼는 데만 쓴다(선택). */
  teamName?: string | null;
};

export function PitchFormationEditor({
  starters,
  formation,
  formationOptions,
  slots,
  outfieldGuidance,
  editable,
  onSelectFormation,
  onPlacePlayer,
  onUnplacePlayer,
  onPlaceInSlot,
  onUnplaceFromSlot,
  dropResolverRef,
  teamName,
}: PitchFormationEditorProps) {
  const pitchRef = useRef<HTMLDivElement>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [selectedWaitingKey, setSelectedWaitingKey] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeSlotTarget, setActiveSlotTarget] = useState<FormationSlot | null>(null);
  /** 확인 대기 중인 포메이션 프리셋 코드 — 배치된 선수를 옮겨야 할 때만 채워진다. */
  const [pendingFormation, setPendingFormation] = useState<string | null>(null);
  /**
   * 드래그를 시작한 순간의 "토큰 중심 − 포인터" 차이(퍼센트). 이걸 기록하지 않으면
   * pointermove가 포인터 절대 위치를 토큰 중심으로 그대로 삼아버려, 토큰 가장자리를 잡는
   * 순간 토큰이 포인터 아래로 순간이동한다(터치 타겟이 44px이라 최대 22px 점프 — 사용자가
   * "좌표가 튄다"고 지적한 동작이 바로 이것이다). 렌더에 쓰이지 않으므로 state가 아니라
   * ref에 둔다.
   */
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null);

  const slotMode = slots !== null;
  const matched = slotMode ? matchSlotsToEntries(slots, starters) : [];
  const matchedKeys = new Set(matched.map((row) => row.entry?.key).filter((key): key is string => key !== undefined));
  const slotWaiting = slotMode ? starters.filter((entry) => !matchedKeys.has(entry.key)) : [];

  // 자유 배치 모드: 예전 그대로 좌표 유무로 placed/waiting을 가른다.
  const placed = starters.filter((entry) => entry.positionX !== null && entry.positionY !== null);
  const waiting = starters.filter((entry) => entry.positionX === null || entry.positionY === null);
  const selectedWaitingEntry = waiting.find((entry) => entry.key === selectedWaitingKey) ?? null;

  // 모바일 하단 드로어에서 선수를 고르면 그 즉시 드로어를 닫아 피치가 바로 보이게 한다 —
  // 예전엔 선택 후에도 드로어가 열려 있어 "선수는 골랐는데 피치가 안 보여서 다음에
  // 뭘 해야 할지 모르겠다"는 게 가장 큰 혼란 포인트였다(QA 지적). 데스크톱 사이드
  // 패널은 애초에 피치 옆에 항상 떠 있어 닫을 드로어가 없다.
  function selectWaiting(key: string, options?: { closeSheetAfter?: boolean }) {
    setSelectedWaitingKey((current) => (current === key ? null : key));
    if (options?.closeSheetAfter) setSheetOpen(false);
  }

  function clampPct(value: number): number {
    return Math.min(100, Math.max(0, value));
  }

  /** 0.1퍼센트(420px 피치에서 약 0.4px) 단위로 맞춘다 — 픽셀보다 촘촘한 소수는 화면에서
   * 구분되지 않으면서 pointermove마다 새 상태를 만들어 리렌더를 유발하고, 저장 페이로드에도
   * 의미 없는 긴 소수로 실린다. */
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

  /**
   * 포메이션 칩을 눌렀을 때의 관문. 이미 배치된 선수를 옮기거나 대기로 내려야 하는 경우에만
   * 확인 모달을 띄우고, 바뀔 게 없으면(배치된 선수가 없거나 이미 그 프리셋 좌표와 동일)
   * 곧바로 적용한다 — 아무 변화도 없는데 모달을 띄우면 프리셋을 훑어보는 동작이 매번 막힌다.
   *
   * 자유 배치(null)로의 전환은 슬롯만 사라지고 좌표는 그대로 남아 선수를 잃지 않으므로
   * 확인 없이 적용한다.
   */
  function requestFormation(code: string | null) {
    if (code === null || code === formation) {
      onSelectFormation(code);
      return;
    }
    const preset = formationOptions.find((option) => option.code === code);
    if (preset === undefined) {
      onSelectFormation(code);
      return;
    }
    const summary = describeFormationChange(slotsWithGoalkeeper(preset), starters);
    if (summary.movedCount === 0 && summary.unplacedNames.length === 0) {
      onSelectFormation(code);
      return;
    }
    setPendingFormation(code);
    setSheetOpen(false);
  }

  const pendingSummary = (() => {
    if (pendingFormation === null) return null;
    const preset = formationOptions.find((option) => option.code === pendingFormation);
    if (preset === undefined) return null;
    return describeFormationChange(slotsWithGoalkeeper(preset), starters);
  })();

  function handlePitchClick(event: React.MouseEvent<HTMLDivElement>) {
    if (slotMode || !editable || selectedWaitingKey === null) return;
    const point = pointToPitchPct(event.clientX, event.clientY);
    if (point === null) return;
    onPlacePlayer(selectedWaitingKey, point.x, point.y);
    setSelectedWaitingKey(null);
  }

  // 명단 패널에서 끌어온 선수의 착지점 판정. 매 렌더마다 최신 슬롯 상태로 갈아 끼운다 —
  // 클로저가 오래된 `matched` 를 잡고 있으면 이미 찬 자리에 또 놓게 된다.
  useEffect(() => {
    if (dropResolverRef === undefined) return;
    dropResolverRef.current = {
      resolve(clientX: number, clientY: number) {
        if (!editable) return null;
        const rect = pitchRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return null;
        // `pointToPitchPct` 는 값을 0~100 으로 clamp 하므로 피치 밖에서 놓아도 가장자리
        // 좌표를 돌려준다 — 바깥에 떨어뜨린 것을 "가장자리에 놓았다"로 오해하지 않도록
        // rect 안인지 먼저 본다.
        if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
          return null;
        }
        const point = pointToPitchPct(clientX, clientY);
        if (point === null) return null;
        if (!slotMode) return { kind: 'point', x: point.x, y: point.y };

        // 슬롯 모드에서는 임의 좌표가 아니라 "빈 자리"에만 앉는다. 놓은 지점에서 가장
        // 가까운 빈 자리를 고른다 — 자리가 다 찼으면 놓을 곳이 없다는 뜻으로 null.
        const emptySlots = matched.filter((row) => row.entry === null).map((row) => row.slot);
        if (emptySlots.length === 0) return null;
        let nearest = emptySlots[0];
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const slot of emptySlots) {
          const distance = (slot.x - point.x) ** 2 + (slot.y - point.y) ** 2;
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = slot;
          }
        }
        return { kind: 'slot', slot: nearest };
      },
    };
    return () => {
      dropResolverRef.current = null;
    };
  });

  function handleTokenPointerDown(entry: LineupEntryDraft) {
    return (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!editable) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      // 잡은 지점과 토큰 중심의 차이를 기록해 드래그 내내 같은 지점을 쥔 느낌을 유지한다.
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

  function controlsFor(closeSheetAfterSelect: boolean) {
    return (
      <FormationControls
        formation={formation}
        formationOptions={formationOptions}
        outfieldGuidance={outfieldGuidance}
        outfieldCount={Math.max(0, starters.length - 1)}
        waiting={slotMode ? slotWaiting : waiting}
        slotMode={slotMode}
        editable={editable}
        selectedWaitingKey={selectedWaitingKey}
        onSelectFormation={requestFormation}
        onSelectWaiting={(key) => selectWaiting(key, { closeSheetAfter: closeSheetAfterSelect })}
      />
    );
  }

  const pitch = (
    <div
      ref={pitchRef}
      role="application"
      aria-label="피치 배치 보드"
      onClick={handlePitchClick}
      // tm-pitch-board: 데스크톱(≥1024px)에서 max-height를 걸어 뷰포트 세로 안에
      // 피치 전체(골 지역까지)가 스크롤 없이 들어오게 한다(desktop/tournaments.css) —
      // 2026-08 QA 지적: maxWidth 420 하나만으로는 뷰포트가 900px 안팎일 때 피치
      // 하단(골 박스)이 화면 밖 또는 하단 고정 CTA 바 밑으로 잘려 안 보였다.
      className="tm-pitch-board"
      style={{
        position: 'relative',
        // 실제 축구장 비율(105:68)을 그대로 쓰면 넓은 데스크톱 컨테이너에서 세로로
        // 지나치게 길어진다(라이브 확인: 1152px 컨테이너 → 세로 1780px+). 모바일 폭
        // 기준으로 최대 너비를 잡아 어떤 컨테이너 폭에서도 합리적인 높이로 고정한다.
        width: '100%',
        // 데스크톱에서는 max-height 가 걸리므로 그 높이에 맞춘 폭을 CSS 가 변수로 넘겨준다
        // (desktop/tournaments.css의 .tm-pitch-board) — 높이만 자르면 비율이 깨진다.
        // 변수가 없는 모바일에서는 fallback 420px 그대로.
        maxWidth: 'var(--tm-pitch-max-width, 420px)',
        aspectRatio: `1 / ${1 / PITCH_ASPECT}`,
        borderRadius: 12,
        overflow: 'hidden',
        background: `${TURF_STRIPES}, #1f8a4c`,
        cursor: !slotMode && editable && selectedWaitingKey !== null ? 'crosshair' : 'default',
        // 피치 전체를 'none'으로 막으면 모바일에서 세로 스와이프(페이지 스크롤)가
        // 죽는다 — 드래그가 필요한 건 선수 토큰뿐이지 피치 빈 공간이 아니다.
        // 'pan-y'로 세로 스와이프는 브라우저 기본 스크롤에 맡기고, 토큰 자체
        // (PlayerToken 버튼)에만 별도로 touchAction: 'none'을 적용해 드래그를
        // 보장한다. 탭 배치(handlePitchClick)는 클릭 이벤트라 이 설정과 무관하게
        // 계속 동작한다.
        touchAction: 'pan-y',
        flexShrink: 0,
        // 탭 배치 대기 상태(선수를 골라 다음 탭을 기다리는 중)를 테두리로도 드러낸다 —
        // 커서 모양(crosshair)만으로는 모바일 터치 환경에서 아무 신호도 안 보인다.
        boxShadow: !slotMode && editable && selectedWaitingKey !== null ? '0 0 0 3px var(--blue500)' : 'none',
        transition: 'box-shadow 120ms ease',
      }}
    >
      <PitchLines />
      {slotMode
        ? matched.map(({ slot, entry }, index) =>
            entry ? (
              <PlayerToken
                key={entry.key} entry={entry} editable={editable} teamName={teamName}
                dragging={draggingKey === entry.key}
                onPointerDown={handleTokenPointerDown(entry)}
                onPointerMove={handleTokenPointerMove}
                onPointerUp={handleTokenPointerUp}
                onUnplace={() => onUnplaceFromSlot(entry.key)}
              />
            ) : (
              <EmptySlotMarker
                key={`${slot.positionCode}-${slot.x}-${slot.y}-${index}`}
                slot={slot} editable={editable}
                onSelect={() => setActiveSlotTarget(slot)}
              />
            ),
          )
        : placed.map((entry) => (
            <PlayerToken
              key={entry.key} entry={entry} editable={editable} teamName={teamName}
              dragging={draggingKey === entry.key}
              onPointerDown={handleTokenPointerDown(entry)}
              onPointerMove={handleTokenPointerMove}
              onPointerUp={handleTokenPointerUp}
              onUnplace={() => onUnplacePlayer(entry.key)}
            />
          ))}
    </div>
  );

  // 상황별 안내 문구 하나로 "지금 뭘 해야 하는지"를 항상 눈에 보이는 자리(피치 바로 위)에
  // 둔다 — 예전엔 이 설명이 사이드 패널/드로어 안(대기 목록 위)에만 있어서, 모바일에서는
  // 드로어를 열어야만 보였고 데스크톱에서도 피치와 시선이 멀었다("이해하기 어렵다" QA
  // 지적). 선수를 고른 직후(탭 배치 대기 상태)에는 이름까지 짚어 다음 행동을 명시한다.
  const guidance = !editable
    ? null
    : slotMode
      ? slotWaiting.length > 0
        ? { text: '빈 자리를 탭해 선수를 채우세요', active: false }
        : { text: '모든 자리가 채워졌어요. 토큰을 끌어 위치를 미세조정할 수 있어요', active: false }
      : selectedWaitingEntry !== null
        ? { text: `${selectedWaitingEntry.displayName} 선수를 배치할 위치를 피치에서 탭하세요`, active: true }
        : waiting.length > 0
          ? { text: '선수를 드래그하거나, 아래 목록에서 선수를 고른 뒤 피치를 탭해 배치하세요', active: false }
          : placed.length > 0
            ? { text: '토큰을 끌어 위치를 옮기거나, 토큰 위 × 버튼으로 배치를 취소할 수 있어요', active: false }
            : null;

  // 모바일 진입점에 지금 무엇이 골라져 있는지 그대로 보여준다 — 코드(`3-1`)만으로는
  // 무엇을 뜻하는지 알기 어려워, 시트 안 목록과 **같은 문구**(코드 · 이름 · 필드 인원)를 쓴다.
  const mobileSelectedPreset =
    formation !== null ? (formationOptions.find((preset) => preset.code === formation) ?? null) : null;
  const mobileFormationLabel =
    mobileSelectedPreset !== null
      ? `${mobileSelectedPreset.code} · ${mobileSelectedPreset.label} (필드 ${mobileSelectedPreset.outfield}명)`
      : '자유 배치';
  const mobileWaitingCount = slotMode ? slotWaiting.length : waiting.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 모바일: 포메이션 진입점 → 하단 드로어. 데스크톱에서는 숨긴다(사이드 패널이 항상 보임).
          예전에는 "배치 설정 · 3-1" 회색 버튼 하나였는데, 화면의 대부분을 피치가 차지하는
          가운데 그 피치를 바꾸는 유일한 손잡이가 작은 회색 칩처럼 보여 **포메이션을 고르는
          곳이라는 게 읽히지 않았다**(사용자 지적: "포메이션 선택 드롭다운이 없는 거 아니야?").
          기능은 처음부터 있었으므로 시트 내용은 그대로 두고 진입점만 드러낸다 — 무엇을 고르는
          자리인지(라벨), 지금 무엇인지(대형 이름·필드 인원), 누를 수 있다는 것(캐럿)을
          셋 다 보이게 한다. */}
      <div className="tm-hide-desktop">
        <button
          type="button"
          className="tm-pressable"
          onClick={() => setSheetOpen(true)}
          disabled={!editable}
          aria-haspopup="dialog"
          aria-label={`포메이션 ${mobileFormationLabel}, 변경하기`}
          style={{
            width: '100%',
            minHeight: 56,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderRadius: 12,
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
              {mobileWaitingCount > 0 ? (
                <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}> · 대기 {mobileWaitingCount}명</span>
              ) : null}
            </span>
          </span>
          {/* 캐럿은 장식이 아니라 "눌러서 고른다"는 유일한 시각 신호라, 라벨 대비를 따르는
              토큰 색을 쓰고 스크린리더에는 위 aria-label 이 같은 뜻을 전한다. */}
          <span aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-muted)', fontSize: 18, lineHeight: 1 }}>
            ⌄
          </span>
        </button>
      </div>

      {guidance ? (
        <div
          role={guidance.active ? 'status' : undefined}
          className="tm-text-caption"
          style={{
            color: guidance.active ? 'var(--blue700)' : 'var(--text-muted)',
            fontWeight: guidance.active ? 700 : 400,
          }}
        >
          {guidance.text}
          {guidance.active ? (
            <button
              type="button"
              onClick={() => setSelectedWaitingKey(null)}
              className="tm-btn tm-btn-ghost"
              style={{ marginLeft: 8, padding: '2px 8px', minHeight: 'auto', fontSize: 'inherit' }}
            >
              선택 취소
            </button>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', justifyContent: 'center', flexWrap: 'wrap' }}>
        {pitch}
        {/* 데스크톱 전용 사이드 패널 — 모바일에서는 숨기고 하단 드로어로 대체한다.
            카드(.tm-card) 배경·테두리를 둬야 옆에 뭔가 있다는 게 눈에 보인다 —
            배경 없는 텍스트만 있으면 실제 화면에서는 "아무것도 없는 것"처럼 보인다. */}
        <Card pad={16} className="tm-show-desktop" style={{ width: 260, flexShrink: 0 }}>
          {controlsFor(false)}
        </Card>
      </div>

      <FormationSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        {controlsFor(true)}
      </FormationSheet>

      {activeSlotTarget ? (
        <SlotPlayerPickerSheet
          slot={activeSlotTarget}
          waiting={slotWaiting}
          onSelect={(key) => {
            onPlaceInSlot(key, activeSlotTarget);
            setActiveSlotTarget(null);
          }}
          onClose={() => setActiveSlotTarget(null)}
        />
      ) : null}

      {/* 포메이션 전환 확인 — 이미 배치한 선수가 움직이거나 대기로 내려가는 경우에만 뜬다.
          문구는 실제 적용에 쓰는 것과 같은 계획(describeFormationChange)에서 뽑으므로
          "옮겨져요"라고 예고한 내용과 결과가 어긋날 수 없다. */}
      <ConfirmModal
        open={pendingFormation !== null && pendingSummary !== null}
        title={`포메이션을 ${pendingFormation ?? ''}로 바꿀까요?`}
        message={buildFormationChangeMessage(pendingSummary)}
        confirmLabel="포메이션 바꾸기"
        onConfirm={() => {
          const next = pendingFormation;
          setPendingFormation(null);
          if (next !== null) onSelectFormation(next);
        }}
        onCancel={() => setPendingFormation(null)}
      />
    </div>
  );
}

/** 확인 모달 본문. 이름을 일일이 나열하되 너무 길어지면 앞 3명만 적고 나머지는 수로 줄인다
 * — 대기로 내려가는 사람이 누구인지가 사용자가 취소를 누를지 결정하는 유일한 근거다. */
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

/** 포메이션 프리셋 버튼 + 대기 목록. 데스크톱 사이드 패널과 모바일 하단 드로어 양쪽에서
 * 그대로 재사용한다 — 내용은 하나, 배치만 호출부가 다르게 감싼다. */
function FormationControls({
  formation,
  formationOptions,
  outfieldGuidance,
  outfieldCount,
  waiting,
  slotMode,
  editable,
  selectedWaitingKey,
  onSelectFormation,
  onSelectWaiting,
}: {
  formation: string | null;
  formationOptions: FormationPreset[];
  outfieldGuidance: string | null;
  /** 지금 선발에서 골키퍼 한 자리를 뺀 필드 인원수 — 고른 대형이 요구하는 인원과 비교해
   * 안내 문구를 만드는 데만 쓴다. 인원이 안 맞아도 선택 자체를 막지는 않는다. */
  outfieldCount: number;
  waiting: LineupEntryDraft[];
  slotMode: boolean;
  editable: boolean;
  selectedWaitingKey: string | null;
  onSelectFormation: (formation: string | null) => void;
  onSelectWaiting: (key: string) => void;
}) {
  // 이 컴포넌트는 데스크톱 사이드 패널과 모바일 드로어에 각각 한 번씩, 즉 같은 화면에 두 번
  // 렌더된다 — 칩 그룹의 aria-labelledby가 가리키는 id가 겹치면 안 되므로 인스턴스마다
  // 새로 만든다.
  const selectId = `${useId()}-formation`;
  // 인원수로 선택지를 막지 않는 대신, 고른 대형이 지금 선발과 어떻게 어긋나는지 말로 알려준다.
  // 빈 자리는 빈 자리대로 남고 남는 선수는 대기 목록에 남는다 — 어느 쪽도 저장을 막지 않는다.
  const selectedPreset = formation !== null ? formationOptions.find((preset) => preset.code === formation) ?? null : null;
  const fitGuidance =
    selectedPreset === null
      ? null
      : selectedPreset.outfield > outfieldCount
        ? `이 대형은 골키퍼 외 필드 ${selectedPreset.outfield}명이 필요해요. 지금 선발은 ${outfieldCount}명이라 ${selectedPreset.outfield - outfieldCount}자리가 비어요.`
        : selectedPreset.outfield < outfieldCount
          ? `이 대형에는 필드 ${selectedPreset.outfield}명이 들어가요. 남는 ${outfieldCount - selectedPreset.outfield}명은 대기 목록에 남아요.`
          : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <span
          id={selectId}
          className="tm-text-caption"
          style={{ display: 'block', color: 'var(--text-muted)', marginBottom: 8 }}
        >
          포메이션
        </span>
        <div
          role="group"
          aria-labelledby={selectId}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 8 }}
        >
          <FormationChip
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
              selected={formation === preset.code}
              title={preset.code}
              caption={`${preset.label} · 필드 ${preset.outfield}명`}
              slots={slotsWithGoalkeeper(preset)}
              disabled={!editable}
              onSelect={() => onSelectFormation(preset.code)}
            />
          ))}
        </div>
        {outfieldGuidance ? (
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
            {outfieldGuidance}
          </p>
        ) : null}
        {fitGuidance ? (
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
            {fitGuidance}
          </p>
        ) : null}
      </div>

      {slotMode ? (
        <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
          {waiting.length > 0
            ? `대기 ${waiting.length}명 — 피치에서 빈 자리를 탭해 채우세요.`
            : '모든 선발이 배치됐어요.'}
        </p>
      ) : waiting.length > 0 ? (
        <div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
            대기 중 — 선수를 고른 뒤 피치를 탭해 배치하세요
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {waiting.map((entry) => (
              <button
                key={entry.key}
                type="button"
                disabled={!editable}
                aria-pressed={selectedWaitingKey === entry.key}
                onClick={() => onSelectWaiting(entry.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: selectedWaitingKey === entry.key ? '2px solid var(--blue500)' : '1px solid var(--border)',
                  background: selectedWaitingKey === entry.key ? 'var(--tint-blue)' : 'var(--card-surface)',
                  cursor: editable ? 'pointer' : 'default',
                  minHeight: 44,
                }}
              >
                <span
                  className="tab-num"
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    // orange500(#fe9800)은 밝은 배경 위 텍스트로는 대비 ~2.16:1로 WCAG AA
                    // 미달(2026-08 QA 실측) — orange700(~4.92:1)으로 교체.
                    color: entry.goalkeeper ? 'var(--orange700)' : 'var(--text-strong)',
                  }}
                >
                  {entry.jerseyNumber ?? '-'}
                </span>
                <span className="tm-text-caption" style={{ fontWeight: 600 }}>
                  {/* GK 여부를 색(orange)에만 기대지 않고 텍스트로도 병기 — 색맹 사용자도
                      대기 목록에서 골키퍼를 식별할 수 있어야 한다. */}
                  {entry.goalkeeper ? 'GK · ' : ''}
                  {entry.displayName}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>모든 선발이 배치됐어요.</p>
      )}
    </div>
  );
}

/** 포메이션 하나를 고르는 칩 — 배치 모양을 미니 피치로 함께 보여준다.
 *
 * 예전에는 native `<select>` 하나였는데 두 가지가 불편했다. (1) 옵션 문자열이 길어
 * ("1-2-1 · 다이아몬드 (필드 4명)") 좁은 패널에서 닫는 괄호까지 잘렸고, (2) 이름만으로는
 * 어떤 배치인지 알 수 없어 하나씩 골라 피치를 봐야 했다. 칩은 드롭다운을 여는 단계 없이
 * 선택지 전체를 한 번에 보여주고, 각 칩이 곧 44px 이상의 터치 타겟이 된다.
 *
 * 단일 선택이지만 radio 대신 `aria-pressed` 토글 버튼 그룹으로 둔다 — 이 저장소가 이미
 * 쓰는 패턴이고(team-schedules-page.tsx), radio 로 가면 화살표 키 로빙 포커스를 직접
 * 관리해야 하는데 그만한 이득이 없다. */
function FormationChip({
  selected,
  title,
  caption,
  slots,
  disabled,
  onSelect,
}: {
  selected: boolean;
  title: string;
  caption: string;
  /** null이면 "자유 배치" — 점 없는 빈 피치를 보여준다. */
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
      <MiniFormationPreview slots={slots} />
      <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{title}</span>
      <span
        className="tm-text-caption"
        style={{ color: 'var(--text-muted)', lineHeight: 1.3, textAlign: 'center' }}
      >
        {caption}
      </span>
    </button>
  );
}

/** 칩 안의 미니 피치. 실제 배치 보드와 **같은 좌표계**(y=0 우리 골라인 · y=100 상대
 * 골라인)를 써서 칩에서 본 모양이 그대로 피치에 놓인다 — viewBox를 실제 구장 비율
 * (68×105)로 두면 preserveAspectRatio 기본값이 비율을 지켜 주므로 점은 원 그대로다.
 * 라인은 하프라인 하나만 그린다. 이 크기에서 페널티박스까지 넣으면 선과 점이 뒤엉켜
 * 정작 봐야 할 배치 모양이 안 보인다. */
function MiniFormationPreview({ slots }: { slots: FormationSlot[] | null }) {
  return (
    <svg viewBox="0 0 68 105" aria-hidden="true" style={{ width: 44, height: 68, display: 'block' }}>
      <rect x={0} y={0} width={68} height={105} rx={3} fill="#1f8a4c" />
      <line x1={0} y1={52.5} x2={68} y2={52.5} stroke="rgba(255,255,255,0.55)" strokeWidth={1.2} />
      {slots?.map((slot, index) => (
        <circle
          key={`${slot.positionCode}-${slot.x}-${slot.y}-${index}`}
          cx={slot.x * 0.68}
          cy={(100 - slot.y) * 1.05}
          r={5}
          fill={slot.positionCode === GOALKEEPER_SLOT_CODE ? 'var(--player-marker-orange)' : 'var(--player-marker-blue)'}
        />
      ))}
    </svg>
  );
}

/** 모바일 전용 하단 드로어. 데스크톱에서는 사이드 패널을 쓰므로 이 컴포넌트 자체가
 * `.tm-hide-desktop`으로 숨는다 — open이어도 데스크톱 폭에서는 렌더되지 않는다.
 * ConfirmModal(components/v1-ui/confirm-modal.tsx)과 같은 a11y 패턴(role=dialog,
 * ESC로 닫기, backdrop 클릭으로 닫기, body 스크롤 잠금, 닫힐 때 포커스 복원)을 따르되
 * 하단에서 슬라이드 업하는 시트 모양만 다르다. */
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
  // focus 저장/복원·ESC 닫기·Tab focus trap·body 스크롤 잠금·backdrop 클릭 닫기를
  // 공용 훅에 위임한다(기존엔 focus trap이 빠져 있었다). 렌더 게이트(if (!open))는
  // 그대로 유지 — 이 시트엔 퇴장 애니메이션이 없다.
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
          borderRadius: '16px 16px 0 0',
          padding: '16px 20px calc(32px + env(safe-area-inset-bottom))',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.18)',
        }}
      >
        <div
          aria-hidden="true"
          style={{ width: 36, height: 4, borderRadius: 999, background: 'var(--grey100)', margin: '0 auto 16px' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 id={titleId} className="tm-text-body-lg" style={{ fontWeight: 700 }}>
            배치 설정
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="tm-btn tm-btn-icon tm-btn-ghost"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** 잔디 결(터프 스트라이프) — 실제 구장처럼 밝기가 다른 가로 띠를 교대로 깐다.
 * 순수 CSS 그라디언트라 SVG 라인 렌더링과 분리해 배경으로만 쓴다. */
const TURF_STRIPES =
  'repeating-linear-gradient(180deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 8%, rgba(0,0,0,0.04) 8%, rgba(0,0,0,0.04) 16%)';

function PitchLines() {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      {/* 축구장 **전체**를 그린다 — 아래쪽 절반이 우리 진영(우리 골대가 화면 맨 아래),
          위쪽 절반이 상대 진영(상대 골대가 맨 위)이고 하프라인은 정중앙(SVG y=50)이다.
          예전엔 우리 진영 절반만 그렸는데, 컨테이너 비율은 PITCH_ASPECT(105:68 = 풀
          구장)를 쓰고 서버 프리셋 좌표는 최전방을 y=85까지 밀어 두고 있어 — 그림만 반쪽
          이라 위쪽 절반이 라인 없는 빈 잔디가 되고 페널티박스는 세로로 두 배 늘어나
          있었다. 풀 구장으로 그리면 셋이 한 좌표계로 맞아떨어진다.

          좌표계: 앱 좌표 y=0(우리 골라인)이 CSS top:100%(피치 하단), y=100(상대 골라인)이
          top:0%다(PlayerToken의 topPct = 100 - positionY). 그림도 같은 방향이라 SVG y는
          `2 + (100 - 앱y) * 0.96` — 골키퍼(y=6)는 우리 페널티박스 안, 풋살 PIVO(y=85)는
          상대 페널티박스 안에 정확히 떨어진다.

          치수는 FIFA 규격(105m×68m, 페널티박스 40.32m×16.5m, 골에어리어 18.32m×5.5m,
          센터/페널티 아크 반지름 9.15m, 페널티 스폿 11m, 코너 아크 1m, 골대 폭 7.32m)을
          그대로 환산했다. viewBox 100×100을 preserveAspectRatio="none"으로 늘리므로 축별
          환산 계수가 다르다 — 폭 68m가 96 단위(x축 1m = 1.4118), 길이 105m가 96 단위
          (y축 1m = 0.9143). 두 값 모두 화면에서는 같은 픽셀 크기가 되므로(등방) 원은
          rx/ry를 나눠 준 <ellipse>로 그려야 실제로 정원으로 보인다. */}
      <rect x={2} y={2} width={96} height={96} rx={1.5} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={0.7} />
      {/* 하프라인 + 센터 서클(9.15m) + 센터 스폿 */}
      <line x1={2} y1={50} x2={98} y2={50} stroke="rgba(255,255,255,0.9)" strokeWidth={0.9} />
      <ellipse cx={50} cy={50} rx={12.92} ry={8.37} fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth={0.55} />
      <ellipse cx={50} cy={50} rx={0.85} ry={0.55} fill="rgba(255,255,255,0.85)" />
      {/* 우리 진영(아래) — 페널티 박스 · 골에어리어 · 페널티 스폿 · 페널티 아크 */}
      <rect x={21.53} y={82.91} width={56.93} height={15.09} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={0.7} />
      <rect x={37.07} y={92.97} width={25.87} height={5.03} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={0.7} />
      <ellipse cx={50} cy={87.94} rx={0.85} ry={0.55} fill="rgba(255,255,255,0.85)" />
      <path d="M 39.68 82.91 A 12.92 8.37 0 0 1 60.32 82.91" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth={0.55} />
      {/* 상대 진영(위) — 같은 규격을 하프라인 기준으로 대칭 배치 */}
      <rect x={21.53} y={2} width={56.93} height={15.09} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={0.7} />
      <rect x={37.07} y={2} width={25.87} height={5.03} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={0.7} />
      <ellipse cx={50} cy={12.06} rx={0.85} ry={0.55} fill="rgba(255,255,255,0.85)" />
      <path d="M 39.68 17.09 A 12.92 8.37 0 0 0 60.32 17.09" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth={0.55} />
      {/* 코너 아크 4곳(1m) — 중심이 각 코너에 오도록 sweep-flag=1로 통일한다. */}
      <path d="M 2 97.09 A 1.41 0.91 0 0 1 3.41 98" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={0.5} />
      <path d="M 96.59 98 A 1.41 0.91 0 0 1 98 97.09" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={0.5} />
      <path d="M 3.41 2 A 1.41 0.91 0 0 1 2 2.91" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={0.5} />
      <path d="M 98 2.91 A 1.41 0.91 0 0 1 96.59 2" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={0.5} />
      {/* 골대 — 골라인 바깥(우리 y>98 / 상대 y<2)에 살짝 걸치는 프레임으로 표현 */}
      <rect x={44.83} y={98} width={10.33} height={1.83} fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth={0.8} />
      <rect x={44.83} y={0.17} width={10.33} height={1.83} fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth={0.8} />
    </svg>
  );
}

/** 포지션 라벨이 붙은 빈 슬롯 — 탭하면 채울 선수를 고르는 시트가 열린다. 44px 터치
 * 타겟을 확보하고, aria-label에 포지션 이름과 "비어 있음" 상태를 함께 담는다. */
function EmptySlotMarker({ slot, editable, onSelect }: { slot: FormationSlot; editable: boolean; onSelect: () => void }) {
  const topPct = 100 - slot.y;
  return (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); if (editable) onSelect(); }}
      disabled={!editable}
      aria-label={`${slot.label} 자리, 비어 있음${editable ? ' — 탭해서 선수 채우기' : ''}`}
      style={{
        position: 'absolute', left: `${slot.x}%`, top: `${topPct}%`, transform: 'translate(-50%, -50%)',
        width: TOUCH_TARGET_PX, height: TOUCH_TARGET_PX, borderRadius: '50%',
        border: '2px dashed rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.14)', color: '#fff',
        // [R-T2] 44px 원(TOUCH_TARGET_PX)에 포지션 약칭 2~3자라 12px 여유.
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
        cursor: editable ? 'pointer' : 'default',
      }}
    >
      {slot.label}
    </button>
  );
}

/** 빈 슬롯을 탭했을 때 뜨는 "이 자리에 채울 선수 고르기" 시트 — FormationSheet와 같은
 * a11y 패턴(role=dialog, ESC, backdrop, 포커스 복원)을 쓰되 목적이 달라 컴포넌트를 분리한다. */
function SlotPlayerPickerSheet({
  slot, waiting, onSelect, onClose,
}: {
  slot: FormationSlot;
  waiting: LineupEntryDraft[];
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const idPrefix = useId();
  const titleId = `${idPrefix}-slot-picker-title`;
  // 이 시트는 부모가 `{activeSlotTarget ? <SlotPlayerPickerSheet .../> : null}`로
  // 조건부 마운트한다(렌더 게이트는 부모 쪽 — 여기선 그대로 둔다) — 그래서 open은
  // true로 고정한다. focus 저장/복원·ESC·Tab focus trap(기존엔 빠져 있었다)·body
  // 스크롤 잠금·backdrop 클릭 닫기는 공용 훅에 위임.
  const { dialogRef, onBackdropClick } = useModalA11y<HTMLElement, HTMLDivElement>({ open: true, onClose });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
      <div aria-hidden="true" onClick={onBackdropClick} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
      <div
        ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '70vh', overflowY: 'auto',
          background: 'var(--card-surface)', borderRadius: '16px 16px 0 0',
          padding: '16px 20px calc(20px + env(safe-area-inset-bottom))', boxShadow: '0 -8px 24px rgba(0,0,0,0.18)',
        }}
      >
        <div aria-hidden="true" style={{ width: 36, height: 4, borderRadius: 999, background: 'var(--grey100)', margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 id={titleId} className="tm-text-body-lg" style={{ fontWeight: 700 }}>{slot.label} 자리에 채울 선수</h3>
          <button type="button" onClick={onClose} aria-label="닫기" className="tm-btn tm-btn-icon tm-btn-ghost">×</button>
        </div>
        {waiting.length === 0 ? (
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
            배치할 수 있는 대기 선수가 없어요. 명단 탭에서 선발을 먼저 등록해 주세요.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {waiting.map((entry) => (
              <button
                key={entry.key} type="button" onClick={() => onSelect(entry.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', minHeight: TOUCH_TARGET_PX,
                  borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-surface)', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-strong)', minWidth: 24 }}>
                  {entry.jerseyNumber ?? '-'}
                </span>
                <span className="tm-text-label" style={{ fontWeight: 600 }}>{entry.displayName}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerToken({
  entry,
  editable,
  dragging,
  teamName,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onUnplace,
}: {
  teamName?: string | null;
  entry: LineupEntryDraft;
  editable: boolean;
  dragging: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onUnplace: () => void;
}) {
  const x = entry.positionX ?? 50;
  // y=100(상대 골라인)이 위, y=0(우리 골라인)이 아래 — 화면 top%는 반대로 계산한다.
  const topPct = 100 - (entry.positionY ?? 50);
  /** 피치 아래쪽 끝에 놓인 토큰은 이름표를 토큰 위로 올린다. 골키퍼가 대표적인데
   * (슬롯 좌표가 항상 y=6이라 화면 94% 지점), 이름표를 토큰 아래에 두면 보드 밖으로
   * 나가 overflow:hidden 에 잘려 이름을 아예 못 읽는다 — alpha 실측에서 모바일(피치
   * 높이 553px)·데스크톱(521px) 양쪽에서 재현됐다. 임계값 88%는 토큰 반지름(22px)과
   * 이름표 높이(~19px)를 가장 짧은 피치에서도 담을 수 있는 선이다. */
  const labelAbove = topPct > 88;
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
          borderRadius: '50%',
          border: '2px solid #fff',
          // blue500/orange500 + 흰 텍스트는 WCAG AA 4.5:1 미달(실측 blue500 ~3.71:1,
          // orange500 ~2.16:1, 2026-08 QA) — 등번호 텍스트가 여기서 유일하게 흰 배경 위
          // 흰 글씨가 아니라 색 배경 위 흰 글씨라 대비가 그대로 노출된다.
          // --blue700/--orange700은 쓰지 않는다 — 그 토큰은 2026-08-10 전수검수로
          // 다크모드에서 "카드/틴트 배경 위 텍스트"용 밝은 값으로 재정의돼(각각
          // #6ba8ff, --orange500) 원형 배경 + 흰 텍스트 조합엔 다크모드에서 오히려
          // 대비가 무너진다(재계산 ≈2.42:1/≈2.16:1). 테마 무관 고정 chip 색인
          // --player-marker-blue/--player-marker-orange(둘 다 4.5:1 이상, globals.css)를 쓴다.
          background: entry.goalkeeper ? 'var(--player-marker-orange)' : 'var(--player-marker-blue)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 800,
          cursor: editable ? 'grab' : 'default',
          boxShadow: dragging ? '0 4px 14px rgba(0,0,0,0.35)' : '0 2px 6px rgba(0,0,0,0.25)',
          touchAction: 'none',
        }}
      >
        {entry.jerseyNumber ?? '-'}
      </button>
      {/* GK 여부를 배경색(player-marker-orange)에만 기대지 않고 별도 텍스트 배지로도
          병기한다 — 색맹 사용자도 등번호를 가리지 않고 피치 위에서 바로 골키퍼를
          식별할 수 있어야 한다("컬러만으로 정보 전달 금지" 프로젝트 규칙). 배경은
          위 PlayerToken 원형과 같은 이유로 --orange700이 아니라 테마 무관 고정
          --player-marker-orange를 쓴다(다크모드 --orange700은 텍스트용으로 재정의돼
          흰 텍스트 배경으로 쓰면 대비가 무너짐). */}
      {entry.goalkeeper ? (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: -4,
            left: -4,
            // [R-T2] 8px는 하한(12px) 4px 미달로 가장 심각한 축에 속한다. 토큰이
            // minWidth 44px라 배지 자체가 12px로 커져도 안쪽에서 잘리진 않지만,
            // 포메이션이 촘촘하면 인접 토큰과 겹칠 수 있어 라이브 화면(피치
            // 라인업 편집)에서 실측 확인 필요.
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1,
            color: '#fff',
            background: 'var(--player-marker-orange)',
            border: '1px solid #fff',
            borderRadius: 4,
            padding: '2px 3px',
          }}
        >
          GK
        </span>
      ) : null}
      {/* 라벨은 토큰 폭(36~46px)에 종속되지 않도록 독립적으로 위치·폭을 잡는다 —
          이름이 길면(예: "중흥의푸른오른발") 부모 폭(TOKEN_SIZE_PCT)에 맞춰
          block으로 렌더하면 글자가 토큰 밖으로 넘쳐 다른 토큰과 겹친다.
          absolute + 고정 maxWidth + ellipsis로 항상 토큰 중심 아래에 조용히 잘려 보인다. */}
      <span
        title={entry.displayName}
        aria-hidden="true"
        style={{
          position: 'absolute',
          // 위로 올릴 때 8px을 띄우는 건 GK 배지가 토큰 위로 4px 삐져나오기 때문이다 —
          // 3px만 두면 긴 이름에서 배지와 겹친다. (격자 정리 전에는 6px 이었다)
          ...(labelAbove ? { bottom: '100%', marginBottom: 8 } : { top: '100%', marginTop: 3 }),
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: 84,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'center',
          // [R-T2] maxWidth:84 + ellipsis라 12px로 올려도 글자 수만 줄어들 뿐
          // 레이아웃은 안 깨진다.
          fontSize: 12,
          fontWeight: 600,
          color: '#fff',
          background: 'rgba(0,0,0,0.6)',
          padding: '1px 8px',
          borderRadius: 6,
        }}
      >
        {shortPitchLabel(entry.displayName, teamName)}
      </span>
      {editable ? (
        // 배치취소(×) 버튼 — 피치의 handlePitchClick(대기 선수 선택 상태에서 피치를
        // 클릭하면 그 자리에 배치)으로 클릭이 버블링되면, 기존 토큰을 배치취소한
        // 같은 탭이 방금 고른 대기 선수를 그 자리에 자동 배치해버려 사용자가 의도하지
        // 않은 "교체"가 일어난다 — stopPropagation으로 차단한다.
        // 시각 크기는 기존 18px을 유지하되, 실제 히트 영역은 36px(터치 타겟 최소 기준
        // 안쪽)로 넓힌다 — 바깥쪽 버튼은 투명하고 안쪽 span만 보이는 원으로 그려,
        // 인접한 등번호 원·GK 배지와 겹치지 않으면서도 누르기 쉬운 영역을 확보한다.
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
            borderRadius: '50%',
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
              borderRadius: '50%',
              border: '1px solid var(--border)',
              background: 'var(--card-surface)',
              color: 'var(--text-strong)',
              // [R-T2] 18×18 원 안 글자 하나("×")라 12px 여유.
              fontSize: 12,
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
