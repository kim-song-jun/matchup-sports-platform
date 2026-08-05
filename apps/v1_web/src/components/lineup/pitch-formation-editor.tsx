'use client';

import { useEffect, useId, useRef, useState } from 'react';
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

  const controls = (
    <FormationControls
      formation={formation}
      suggestedFormations={suggestedFormations}
      waiting={waiting}
      editable={editable}
      selectedWaitingKey={selectedWaitingKey}
      onSelectFormation={onSelectFormation}
      onSelectWaiting={(key) => setSelectedWaitingKey((current) => (current === key ? null : key))}
    />
  );

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
        background: '#1f8a4c',
        cursor: editable && selectedWaitingKey !== null ? 'crosshair' : 'default',
        touchAction: 'none',
        flexShrink: 0,
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
        </button>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', justifyContent: 'center' }}>
        {pitch}
        {/* 데스크톱 전용 사이드 패널 — 모바일에서는 숨기고 하단 드로어로 대체한다. */}
        <div className="tm-show-desktop" style={{ width: 260, flexShrink: 0 }}>
          {controls}
        </div>
      </div>

      {placed.length > 0 && editable ? (
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
          토큰을 끌어 위치를 옮기거나, 토큰 위 × 버튼으로 배치를 취소할 수 있어요.
        </div>
      ) : null}

      <FormationSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        {controls}
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
                    color: entry.goalkeeper ? 'var(--orange500)' : 'var(--text-strong)',
                  }}
                >
                  {entry.jerseyNumber ?? '-'}
                </span>
                <span className="tm-text-caption" style={{ fontWeight: 600 }}>
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
          같은 방향으로 맞춰야 골키퍼 좌표(y≈6)가 실제 골대 옆에 표시된다. */}
      <rect x={2} y={2} width={96} height={96} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={0.6} />
      {/* 하프라인 + 센터 서클의 절반(우리 진영 쪽으로 내려오는 호) */}
      <line x1={2} y1={2} x2={98} y2={2} stroke="rgba(255,255,255,0.85)" strokeWidth={0.8} />
      <path d="M 38 2 A 12 12 0 0 0 62 2" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={0.5} />
      {/* 골라인 근처 페널티 박스 · 골에어리어 · 골대 */}
      <rect x={28} y={82} width={44} height={16} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={0.6} />
      <rect x={38} y={91} width={24} height={7} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={0.6} />
      <path d="M 38 82 A 12 12 0 0 1 62 82" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={0.5} />
      <rect x={44} y={97} width={12} height={3} fill="rgba(255,255,255,0.5)" />
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
          background: entry.goalkeeper ? 'var(--orange500)' : 'var(--blue500)',
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
      <span
        aria-hidden="true"
        style={{
          display: 'block',
          textAlign: 'center',
          marginTop: 2,
          fontSize: 10,
          fontWeight: 600,
          color: '#fff',
          background: 'rgba(0,0,0,0.55)',
          padding: '1px 5px',
          borderRadius: 6,
          whiteSpace: 'nowrap',
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
