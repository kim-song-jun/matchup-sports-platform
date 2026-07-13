'use client';

import { publicAssetPath } from '@/lib/assets';

export type TeamAvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<TeamAvatarSize, { px: number; radius: number; fontSize: number }> = {
  sm: { px: 28, radius: 8, fontSize: 12 },
  md: { px: 40, radius: 14, fontSize: 15 },
  lg: { px: 54, radius: 16, fontSize: 20 },
  xl: { px: 60, radius: 18, fontSize: 22 },
};

/**
 * 로고 없는 팀의 기본 아이콘 배경 팔레트.
 * blue(브랜드 단일 액센트)·red(위험/에러 시맨틱)는 제외 — green/orange/teal 3색만
 * 순환한다(무지개 지양, sportCardAccent와 동일 톤 재사용, 신규 하드코딩 컬러 없음).
 */
const PALETTE: { bg: string; fg: string }[] = [
  { bg: 'var(--green50)', fg: 'var(--green500)' },
  { bg: 'var(--orange50)', fg: 'var(--orange500)' },
  { bg: 'var(--teal50)', fg: 'var(--teal500)' },
];

/** Deterministic small hash so the same team always lands on the same palette color/pattern. */
function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

const IDENTICON_ROWS = 5;
/** 왼쪽 절반(2열)+중앙(1열)만 계산하고 나머지 2열은 그대로 좌우 대칭 미러링한다(GitHub identicon 방식). */
const IDENTICON_HALF_COLS = 3;

/**
 * GitHub 프로필의 identicon과 같은 방식 — 팀 id 해시로 5x5 좌우대칭 격자 무늬를 만들어
 * 로고 없는 팀도 "생성된 로고"처럼 팀마다 고유하게 보이게 한다. 순수 함수라 같은 seed는
 * 항상 같은 무늬를 낸다. 팀명은 옆에 항상 텍스트로 같이 표시되므로 무늬 자체는 장식용.
 */
function buildIdenticonCells(seed: string): boolean[][] {
  const base = hashSeed(seed);
  const cells: boolean[][] = [];
  for (let row = 0; row < IDENTICON_ROWS; row += 1) {
    const rowCells: boolean[] = [];
    for (let col = 0; col < IDENTICON_HALF_COLS; col += 1) {
      const cellHash = hashSeed(`${base}:${row}:${col}`);
      rowCells.push(cellHash % 5 >= 2); // ~60% 채움 — 너무 성기거나 빽빽하지 않게
    }
    cells.push(rowCells);
  }
  return cells;
}

export interface TeamAvatarProps {
  /** Stable identity for consistent color/pattern pick across renders/screens — pass team.id. */
  seed: string;
  name: string;
  logoUrl?: string | null;
  size?: TeamAvatarSize;
  className?: string;
}

/**
 * 팀 기본 아이콘 — 로고 없는 팀에 팀 id 기반 identicon(색+기하학 무늬)을 보여주고,
 * logoUrl이 있으면 이미지로 덮는다. teams/tournaments/my 전 도메인 공용 컴포넌트.
 */
export function TeamAvatar({ seed, name, logoUrl, size = 'md', className }: TeamAvatarProps) {
  const { px, radius } = SIZE_MAP[size];
  const identitySeed = seed || name;
  const palette = PALETTE[hashSeed(identitySeed) % PALETTE.length];
  const cells = buildIdenticonCells(identitySeed);
  const cellSize = px / IDENTICON_ROWS;
  const cellRadius = cellSize * 0.22;

  return (
    <div
      className={className}
      aria-hidden="true"
      style={{
        position: 'relative',
        width: px,
        height: px,
        borderRadius: radius,
        background: palette.bg,
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} style={{ position: 'absolute', inset: 0 }}>
        {cells.flatMap((rowCells, row) =>
          rowCells.flatMap((filled, col) => {
            if (!filled) return [];
            // col 2는 중앙열(미러링 없음), col 0·1은 우측(4·3열)에도 대칭 반사
            const mirroredCols = col === IDENTICON_HALF_COLS - 1 ? [col] : [col, IDENTICON_ROWS - 1 - col];
            return mirroredCols.map((c) => (
              <rect
                key={`${row}-${c}`}
                x={c * cellSize}
                y={row * cellSize}
                width={cellSize}
                height={cellSize}
                rx={cellRadius}
                fill={palette.fg}
              />
            ));
          }),
        )}
      </svg>
      {logoUrl ? (
        <img
          src={publicAssetPath(logoUrl)}
          alt=""
          width={px}
          height={px}
          loading="lazy"
          // opacity:0으로 시작 — onError로 "실패 후 숨김" 방식은 로드 실패 시 브라우저 기본
          // 깨진 이미지 아이콘(테두리 박스)이 onError 처리 전까지 잠깐 보이는 깜빡임이 있었다.
          // 로드 성공 확인 전까지 계속 투명 상태로 두면 그 깜빡임 자체가 발생하지 않는다.
          onLoad={(event) => {
            event.currentTarget.style.opacity = '1';
          }}
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0,
            transition: 'opacity 120ms ease',
          }}
        />
      ) : null}
    </div>
  );
}
