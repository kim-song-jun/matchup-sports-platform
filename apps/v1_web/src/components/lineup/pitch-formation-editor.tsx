'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Card } from '@/components/v1-ui/primitives';
import type { LineupEntryDraft } from '@/app/team-matches/[id]/lineup/lineup.view-model';

/**
 * 피치 위에 선발 선수를 아이콘으로 배치하는 에디터(FIFA 온라인 스타일). 순수 SVG로 그린
 * 축구/풋살 코트 위에 선수 원형 토큰을 올린다 — 이미지 에셋 없이 코트 라인만으로 충분히
 * 알아볼 수 있다(SVG 우선 원칙).
 *
 * 배치 좌표는 항상 0~100 퍼센트(자기 진영 기준: y=0 골라인, y=100 하프라인)로 다루고,
 * 실제 픽셀 변환은 이 컴포넌트 내부에서만 한다 — 호출부(view-model)는 좌표계를 몰라도 된다.
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

const PITCH_ASPECT = 68 / 105; // FIFA 규격 축구장 비율(가로 105m : 세로 68m)을 세로로 세운 형태
const TOKEN_SIZE_PCT = 11; // 피치 너비 대비 토큰 지름 비율

export type PitchFormationEditorProps = {
  starters: LineupEntryDraft[];
  formation: string | null;
  suggestedFormations: string[];
  editable: boolean;
  onSelectFormation: (formation: string) => void;
  onPlacePlayer: (key: string, positionX: number, positionY: number) => void;
  onUnplacePlayer: (key: string) => void;
};

export function PitchFormationEditor({
  starters,
  formation,
  suggestedFormations,
  editable,
  onSelectFormation,
  onPlacePlayer,
  onUnplacePlayer,
}: PitchFormationEditorProps) {
  const pitchRef = useRef<HTMLDivElement>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [selectedWaitingKey, setSelectedWaitingKey] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

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

  function pointToPitchPct(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = pitchRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const x = clampPct(((clientX - rect.left) / rect.width) * 100);
    // 화면 y축은 아래로 증가하지만 좌표계는 "하프라인이 위(y 큼)"이므로 뒤집는다.
    const y = clampPct(100 - ((clientY - rect.top) / rect.height) * 100);
    return { x, y };
  }

  function handlePitchClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!editable || selectedWaitingKey === null) return;
    const point = pointToPitchPct(event.clientX, event.clientY);
    if (point === null) return;
    onPlacePlayer(selectedWaitingKey, point.x, point.y);
    setSelectedWaitingKey(null);
  }

  function handleTokenPointerDown(key: string) {
    return (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!editable) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDraggingKey(key);
    };
  }

  function handleTokenPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!editable || draggingKey === null) return;
    const point = pointToPitchPct(event.clientX, event.clientY);
    if (point === null) return;
    onPlacePlayer(draggingKey, point.x, point.y);
  }

  function handleTokenPointerUp() {
    setDraggingKey(null);
  }

  function controlsFor(closeSheetAfterSelect: boolean) {
    return (
      <FormationControls
        formation={formation}
        suggestedFormations={suggestedFormations}
        waiting={waiting}
        editable={editable}
        selectedWaitingKey={selectedWaitingKey}
        onSelectFormation={onSelectFormation}
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
      style={{
        position: 'relative',
        // 실제 축구장 비율(105:68)을 그대로 쓰면 넓은 데스크톱 컨테이너에서 세로로
        // 지나치게 길어진다(라이브 확인: 1152px 컨테이너 → 세로 1780px+). 모바일 폭
        // 기준으로 최대 너비를 잡아 어떤 컨테이너 폭에서도 합리적인 높이로 고정한다.
        width: '100%',
        maxWidth: 420,
        aspectRatio: `1 / ${1 / PITCH_ASPECT}`,
        borderRadius: 12,
        overflow: 'hidden',
        background: `${TURF_STRIPES}, #1f8a4c`,
        cursor: editable && selectedWaitingKey !== null ? 'crosshair' : 'default',
        touchAction: 'none',
        flexShrink: 0,
        // 탭 배치 대기 상태(선수를 골라 다음 탭을 기다리는 중)를 테두리로도 드러낸다 —
        // 커서 모양(crosshair)만으로는 모바일 터치 환경에서 아무 신호도 안 보인다.
        boxShadow: editable && selectedWaitingKey !== null ? '0 0 0 3px var(--blue500)' : 'none',
        transition: 'box-shadow 120ms ease',
      }}
    >
      <PitchLines />
      {placed.map((entry) => (
        <PlayerToken
          key={entry.key}
          entry={entry}
          editable={editable}
          dragging={draggingKey === entry.key}
          onPointerDown={handleTokenPointerDown(entry.key)}
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
    : selectedWaitingEntry !== null
      ? { text: `${selectedWaitingEntry.displayName} 선수를 배치할 위치를 피치에서 탭하세요`, active: true }
      : waiting.length > 0
        ? { text: '선수를 드래그하거나, 아래 목록에서 선수를 고른 뒤 피치를 탭해 배치하세요', active: false }
        : placed.length > 0
          ? { text: '토큰을 끌어 위치를 옮기거나, 토큰 위 × 버튼으로 배치를 취소할 수 있어요', active: false }
          : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 모바일: "배치 설정" 버튼 → 하단 드로어. 데스크톱에서는 숨긴다(사이드 패널이 항상 보임). */}
      <div className="tm-hide-desktop">
        <button
          type="button"
          className="tm-btn tm-btn-md tm-btn-neutral"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
        >
          배치 설정{formation ? ` · ${formation}` : ''}
          {waiting.length > 0 ? ` · 대기 ${waiting.length}명` : ''}
        </button>
      </div>

      {guidance ? (
        <div
          role={guidance.active ? 'status' : undefined}
          className="tm-text-caption"
          style={{
            color: guidance.active ? 'var(--blue500)' : 'var(--text-muted)',
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
    </div>
  );
}

/** 포메이션 프리셋 버튼 + 대기 목록. 데스크톱 사이드 패널과 모바일 하단 드로어 양쪽에서
 * 그대로 재사용한다 — 내용은 하나, 배치만 호출부가 다르게 감싼다. */
function FormationControls({
  formation,
  suggestedFormations,
  waiting,
  editable,
  selectedWaitingKey,
  onSelectFormation,
  onSelectWaiting,
}: {
  formation: string | null;
  suggestedFormations: string[];
  waiting: LineupEntryDraft[];
  editable: boolean;
  selectedWaitingKey: string | null;
  onSelectFormation: (formation: string) => void;
  onSelectWaiting: (key: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {suggestedFormations.length > 0 ? (
        <div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 6 }}>
            포메이션
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="포메이션 프리셋">
            {suggestedFormations.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={!editable}
                aria-pressed={formation === preset}
                className={`tm-badge ${formation === preset ? 'tm-badge-blue' : 'tm-badge-grey'}`}
                style={{ border: 'none', cursor: editable ? 'pointer' : 'default' }}
                onClick={() => onSelectFormation(preset)}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {waiting.length > 0 ? (
        <div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 6 }}>
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
                  gap: 6,
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: selectedWaitingKey === entry.key ? '2px solid var(--blue500)' : '1px solid var(--border)',
                  background: selectedWaitingKey === entry.key ? 'var(--blue50)' : 'var(--card-surface)',
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
      ) : null}

      {suggestedFormations.length === 0 && waiting.length === 0 ? (
        <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
          모든 선발이 배치됐어요.
        </p>
      ) : null}
    </div>
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
  const previousFocusRef = useRef<Element | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement;
    document.body.style.overflow = 'hidden';
    sheetRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
      const el = previousFocusRef.current;
      if (el && typeof (el as HTMLElement).focus === 'function') (el as HTMLElement).focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="tm-hide-desktop" style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }}
      />
      <div
        ref={sheetRef}
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
          padding: '16px 20px calc(20px + env(safe-area-inset-bottom))',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.18)',
        }}
      >
        <div
          aria-hidden="true"
          style={{ width: 36, height: 4, borderRadius: 999, background: 'var(--grey100)', margin: '0 auto 14px' }}
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
      {/* 우리 팀 진영 절반만 그린다(전체 축구장이 아님). 골대는 화면 아래쪽(own goal),
          하프라인은 위쪽 — 좌표계가 y=0(골라인)을 CSS top:100%(피치 하단)로, y=100(하프
          라인)을 top:0%로 매핑하므로(PlayerToken의 topPct = 100 - positionY) 그림도
          같은 방향으로 맞춰야 골키퍼 좌표(y≈6)가 실제 골대 옆에 표시된다.
          박스 비율은 실제 축구장 규격(페널티박스 40.3m×16.5m, 골에어리어 18.3m×5.5m를
          코트 폭 68m·하프라인까지 거리 기준으로 환산)에 맞춰 그린다 — 이전 버전은
          임의 수치라 폭이 좁고 깊이가 얕아 "대충 그린" 느낌이 났다. */}
      <rect x={2} y={2} width={96} height={96} rx={1.5} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={0.7} />
      {/* 하프라인 + 센터 서클의 절반(우리 진영 쪽으로 내려오는 호) + 센터 스폿 */}
      <line x1={2} y1={2} x2={98} y2={2} stroke="rgba(255,255,255,0.9)" strokeWidth={0.9} />
      <path d="M 34.5 2 A 15.5 15.5 0 0 0 65.5 2" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth={0.55} />
      <circle cx={50} cy={2} r={0.6} fill="rgba(255,255,255,0.85)" />
      {/* 페널티 박스 · 골에어리어 · 페널티 스폿 · 페널티 아크 */}
      <rect x={20.5} y={70} width={59} height={28} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={0.7} />
      <rect x={36.5} y={88} width={27} height={10} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={0.7} />
      <circle cx={50} cy={80} r={0.7} fill="rgba(255,255,255,0.85)" />
      <path d="M 38 70 A 12.5 12.5 0 0 1 62 70" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth={0.55} />
      {/* 코너 아크(양쪽) */}
      <path d="M 2 94.5 A 3.5 3.5 0 0 0 5.5 98" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={0.5} />
      <path d="M 98 94.5 A 3.5 3.5 0 0 1 94.5 98" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={0.5} />
      {/* 골대 — 골라인 바로 바깥(y>98)에 살짝 걸치는 프레임으로 표현 */}
      <rect x={42.5} y={98} width={15} height={2.6} fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth={0.8} />
    </svg>
  );
}

function PlayerToken({
  entry,
  editable,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onUnplace,
}: {
  entry: LineupEntryDraft;
  editable: boolean;
  dragging: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onUnplace: () => void;
}) {
  const x = entry.positionX ?? 50;
  // y=100(하프라인)이 위, y=0(골라인)이 아래 — 화면 top%는 반대로 계산한다.
  const topPct = 100 - (entry.positionY ?? 50);
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${topPct}%`,
        transform: 'translate(-50%, -50%)',
        width: `${TOKEN_SIZE_PCT}%`,
        minWidth: 36,
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
          minWidth: 36,
          minHeight: 36,
          borderRadius: '50%',
          border: '2px solid #fff',
          // blue500/orange500 + 흰 텍스트는 WCAG AA 4.5:1 미달(실측 blue500 ~3.71:1,
          // orange500 ~2.16:1, 2026-08 QA) — 등번호 텍스트가 여기서 유일하게 흰 배경 위
          // 흰 글씨가 아니라 색 배경 위 흰 글씨라 대비가 그대로 노출된다. blue700/orange700
          // (둘 다 4.5:1 이상)로 교체한다.
          background: entry.goalkeeper ? 'var(--orange700)' : 'var(--blue700)',
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
      {/* GK 여부를 배경색(orange700)에만 기대지 않고 별도 텍스트 배지로도 병기한다 —
          색맹 사용자도 등번호를 가리지 않고 피치 위에서 바로 골키퍼를 식별할 수 있어야
          한다("컬러만으로 정보 전달 금지" 프로젝트 규칙). */}
      {entry.goalkeeper ? (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: -4,
            left: -4,
            fontSize: 8,
            fontWeight: 800,
            lineHeight: 1,
            color: '#fff',
            background: 'var(--orange700)',
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
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: 3,
          maxWidth: 84,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'center',
          fontSize: 10,
          fontWeight: 600,
          color: '#fff',
          background: 'rgba(0,0,0,0.6)',
          padding: '1px 6px',
          borderRadius: 6,
        }}
      >
        {entry.displayName}
      </span>
      {editable ? (
        <button
          type="button"
          onClick={onUnplace}
          aria-label={`${entry.displayName} 배치 취소`}
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            width: 18,
            height: 18,
            borderRadius: '50%',
            border: '1px solid var(--border)',
            background: '#fff',
            color: 'var(--text-strong)',
            fontSize: 11,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
