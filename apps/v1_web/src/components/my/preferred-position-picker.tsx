'use client';

import { useMemo } from 'react';
import { PitchLines } from '@/components/lineup/pitch-lines';
import { buildPositionZones, shouldUseZoneLayout, type PositionOption } from '@/components/lineup/position-zones';

/**
 * [D14] 선호 포지션 고르기 — **코트 위에서 자리를 누른다.**
 *
 * 목록 대신 코트를 쓰는 이유: 풋살의 `FIXO`·`ALA`·`PIVO` 는 생활체육에서 흔히 쓰는 말이
 * 아니다. 이름만 보여주면 자기 자리를 못 고르거나 아무거나 고르고, 그 값이 그대로
 * 선수 카드 가중치가 된다. **자기가 서는 곳을 누르게** 하면 이름을 몰라도 고를 수 있다.
 *
 * ## 주/부는 누르는 순서로 정해진다
 * 첫 번째로 누른 곳이 주, 두 번째가 부다. 드롭다운 두 개보다 탭이 적고, "어느 게 주냐"를
 * 따로 설명할 필요가 없다. 이미 고른 곳을 다시 누르면 해제된다.
 *
 * ## 종목마다 그리는 방식이 다르다 (**종목 이름으로 분기하지 않는다**)
 * - **대형 좌표가 있으면**(풋살) 그 좌표 위에 놓는다
 * - **없으면**(현재 축구) 가로 **띠**로 깐다. 좌표를 지어내지 않는다 —
 *   `FOOTBALL_FORMATIONS` 의 빈 배열은 "없는 데이터를 창작하지 않는다"는 의도적 선택이고,
 *   여기서 만드는 띠는 경기 대형이 아니라 **자리를 고르기 위한 UI 영역**이다
 * - **자리 목록 자체가 없으면**(러닝·수영) 이 컴포넌트를 **렌더하지 않는다** — 빈 코트를
 *   보여주는 것이 아니라 호출부가 섹션을 숨긴다
 */
export interface PreferredPositionPickerProps {
  readonly sportName: string;
  /** 이 종목에서 고를 수 있는 자리. **서버 프리셋이 유일한 출처**다(화면에 적지 않는다). */
  readonly options: readonly PositionOption[];
  /** 대형 좌표. 비어 있으면 띠로 그린다. */
  readonly formations?: readonly unknown[];
  readonly primary: string | null;
  readonly secondary: string | null;
  readonly onChange: (next: { primary: string | null; secondary: string | null }) => void;
}

export function PreferredPositionPicker({
  sportName,
  options,
  formations = [],
  primary,
  secondary,
  onChange,
}: PreferredPositionPickerProps) {
  const zones = useMemo(() => buildPositionZones(options), [options]);
  const useZones = shouldUseZoneLayout(formations);

  // 자리가 없는 종목은 아무것도 그리지 않는다. 호출부가 이미 숨기지만, 여기서도
  // 방어한다 -- 빈 코트는 "고를 게 없다"가 아니라 "고장났다"로 보인다.
  if (zones.length === 0) return null;

  /**
   * 누르는 순서가 곧 주/부다.
   * - 아무것도 없으면 → 주
   * - 주만 있으면 → 부
   * - 이미 고른 곳을 다시 누르면 → 해제. **주를 해제하면 부가 주로 올라온다** --
   *   "주 없이 부만"은 서버가 거부하는 상태라 화면에서 만들지 않는다.
   */
  const select = (code: string) => {
    if (code === primary) {
      onChange({ primary: secondary, secondary: null });
      return;
    }
    if (code === secondary) {
      onChange({ primary, secondary: null });
      return;
    }
    if (primary === null) {
      onChange({ primary: code, secondary });
      return;
    }
    onChange({ primary, secondary: code });
  };

  const roleOf = (code: string): '주' | '부' | null =>
    code === primary ? '주' : code === secondary ? '부' : null;

  return (
    <div>
      <p className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
        {sportName}에서 주로 서는 자리를 눌러 주세요. 먼저 누른 곳이 주, 다음이 부가 돼요.
      </p>

      <div
        style={{
          position: 'relative',
          background: 'var(--pitch-bg, #dcefe1)',
          border: '1px solid var(--pitch-line, #b6d6bf)',
          borderRadius: 'var(--radius-control)',
          aspectRatio: '68 / 105',
          maxWidth: 320,
          margin: '0 auto',
        }}
      >
        <PitchLines />
        {zones.map((zone) => {
          const role = roleOf(zone.code);
          // 띠: 위(공격)에서 아래(자기 골문)로 균등 분할. **좌표를 만드는 것이 아니라**
          // 순서를 화면 비율로 나눈 것이다 -- 그래서 자리 수가 바뀌어도 따라간다.
          const topPct = ((zone.rowIndex + 0.5) / zones.length) * 100;
          return (
            <button
              key={zone.code}
              type="button"
              onClick={() => select(zone.code)}
              aria-pressed={role !== null}
              aria-label={`${zone.label}${role === null ? '' : ` · ${role} 포지션으로 선택됨`}`}
              style={{
                position: 'absolute',
                left: '50%',
                top: `${topPct}%`,
                transform: 'translate(-50%, -50%)',
                minHeight: 44,
                minWidth: 96,
                padding: '0 12px',
                borderRadius: 'var(--radius-control)',
                border: `1px solid ${role ? 'var(--blue500)' : 'var(--border-subtle)'}`,
                background: role === '주' ? 'var(--blue500)' : role === '부' ? 'var(--blue50)' : 'var(--surface-card)',
                color: role === '주' ? '#fff' : role === '부' ? 'var(--blue700)' : 'var(--text-strong)',
                fontWeight: role ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              {/* 색만으로 주/부를 구분하지 않는다 -- 글자를 함께 둔다(색맹 대응). */}
              {zone.label}
              {role === null ? '' : ` · ${role}`}
            </button>
          );
        })}
      </div>

      <p className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8 }}>
        {primary === null
          ? '아직 고르지 않았어요. 비워 두어도 괜찮아요.'
          : secondary === null
            ? '다시 누르면 해제돼요. 한 곳 더 누르면 부 포지션이 돼요.'
            : '다시 누르면 해제돼요.'}
        {useZones ? ' 이 종목은 자리별 구역으로 표시돼요.' : ''}
      </p>
    </div>
  );
}
