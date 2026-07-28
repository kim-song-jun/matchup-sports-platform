'use client';

import { useState } from 'react';
import { publicAssetPath } from '@/lib/assets';

export type TeamAvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<TeamAvatarSize, { px: number; radius: number }> = {
  sm: { px: 28, radius: 8 },
  md: { px: 40, radius: 14 },
  lg: { px: 54, radius: 16 },
  xl: { px: 72, radius: 22 },
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

/**
 * 32비트 정수 믹서(finalizer) — 단순 다항식 해시(hashSeed)를 `${base}:${row}:${col}`
 * 같은 거의 동일한 문자열에 반복 적용하면 셀마다 값이 강하게 상관돼(각 행이 이전 행에서
 * 정확히 한 칸씩 밀린 것처럼 보이는 패턴이 나옴 — 실사용 중 발견된 버그) 전혀 무작위로
 * 보이지 않는다. 정수를 한 번 더 비트 섞기(mix)하면 인접 입력이어도 서로 무관해 보이는
 * 값이 나온다.
 */
function mix32(x: number): number {
  let h = x;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

const IDENTICON_TOTAL_COLS = 5;
const IDENTICON_ROWS = 5;
/** 왼쪽 절반(2열)+중앙(1열)만 계산하고 나머지 2열은 그대로 좌우 대칭 미러링한다(GitHub identicon 방식). */
const IDENTICON_HALF_COLS = 3;
/** 셀 인덱스마다 다른 입력을 주기 위한 간격 — 큰 홀수(2654435761, 황금비 기반 상수)라 충돌이 적다. */
const CELL_STRIDE = 2654435761;
/**
 * 격자와 아바타 바깥 테두리 사이의 여백 비율 — 실제 GitHub identicon 5개 샘플을 픽셀
 * 단위로 측정한 결과(420x420 캔버스에서 격자가 항상 정확히 36~384px, 즉 각 변 8.57%
 * 안쪽에서 시작) 값을 그대로 반영. 여백 없이 셀을 가장자리까지 채우면(기존 코드) 무늬가
 * 캔버스를 꽉 채워 "촘촘한 픽셀 그리드"처럼 보이고, GitHub 특유의 로고 같은 여백감이
 * 사라진다.
 */
const IDENTICON_PADDING_RATIO = 36 / 420;

/**
 * GitHub 프로필의 identicon과 같은 방식 — 팀 id 해시로 5x5 좌우대칭 격자 무늬를 만들어
 * 로고 없는 팀도 "생성된 로고"처럼 팀마다 고유하게 보이게 한다. 순수 함수라 같은 seed는
 * 항상 같은 무늬를 낸다. 팀명은 옆에 항상 텍스트로 같이 표시되므로 무늬 자체는 장식용.
 */
function buildIdenticonCells(seed: string): boolean[][] {
  const base = hashSeed(seed);
  const cells: boolean[][] = [];
  let cellIndex = 0;
  for (let row = 0; row < IDENTICON_ROWS; row += 1) {
    const rowCells: boolean[] = [];
    for (let col = 0; col < IDENTICON_HALF_COLS; col += 1) {
      const cellHash = mix32(base + cellIndex * CELL_STRIDE);
      cellIndex += 1;
      // ~40% 채움 — 실제 GitHub identicon 샘플 5개를 셀 단위로 분석한 채움 비율
      // (32%/40%/52%/60%/60%, 평균 ~49%)에서 하한 쪽에 맞춘 값. 기존 60%는 실측
      // 상단에 붙어 있어 "네모가 너무 많은" 촘촘한 느낌을 냈다.
      rowCells.push(cellHash % 5 >= 3);
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
  // 실제 로고 이미지가 "성공적으로" 로드된 경우에만 identicon을 숨긴다 — logoUrl이 있다는
  // 사실만으로는 숨기지 않는다(로딩 중·로드 실패 시에는 identicon이 계속 폴백으로 보여야 함).
  const [imgLoaded, setImgLoaded] = useState(false);
  const identitySeed = seed || name;
  // 팔레트 색 선택도 mix32를 거친다 — 무늬 계산과 다른 salt(스트라이드 무관, base 그대로)를
  // 써서 같은 팀이라도 "무늬"와 "색"이 서로 다른 값에서 파생되도록 분리한다.
  const palette = PALETTE[mix32(hashSeed(identitySeed)) % PALETTE.length];
  const cells = buildIdenticonCells(identitySeed);
  // 격자 바깥에 IDENTICON_PADDING_RATIO 만큼 여백을 두고, 남은 안쪽 공간만 5등분한다
  // (실제 GitHub identicon 레퍼런스의 여백 비율 그대로 — 위 상수 주석 참조).
  const gridInset = px * IDENTICON_PADDING_RATIO;
  const cellSize = (px - gridInset * 2) / IDENTICON_ROWS;

  return (
    <div
      className={className}
      aria-hidden="true"
      style={{
        position: 'relative',
        width: px,
        height: px,
        borderRadius: radius,
        // 실제 로고 이미지가 있는 팀은 wrapper 배경을 흰색 카드 서페이스로 고정한다 — identicon
        // pastel 팔레트(palette.bg)를 그대로 깔아두면 로고가 완전 불투명 정사각형이 아닐 때
        // (둥근 로고, 투명 배경 PNG, objectFit:cover 미스매치) 가장자리에 비쳐 보인다. 로드
        // 성공/실패와 무관하게 logoUrl prop 존재 여부만으로 결정해야 로딩 중 깜빡임이 없다.
        background: logoUrl ? 'var(--card-surface)' : palette.bg,
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <svg
        width={px}
        height={px}
        viewBox={`0 0 ${px} ${px}`}
        style={{ position: 'absolute', inset: 0, display: imgLoaded ? 'none' : undefined }}
      >
        {cells.flatMap((rowCells, row) =>
          rowCells.flatMap((filled, col) => {
            if (!filled) return [];
            // col 2는 중앙열(미러링 없음), col 0·1은 우측(4·3열)에도 대칭 반사
            const mirroredCols =
              col === IDENTICON_HALF_COLS - 1 ? [col] : [col, IDENTICON_TOTAL_COLS - 1 - col];
            return mirroredCols.map((c) => (
              <rect
                key={`${row}-${c}`}
                x={gridInset + c * cellSize}
                y={gridInset + row * cellSize}
                width={cellSize}
                height={cellSize}
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
            // onError가 남긴 display:none을 되돌려야 한다 — 이전 logoUrl이 깨져 있다가
            // 이후(재업로드 등으로) 유효한 URL로 바뀌었을 때, React가 style.display를
            // 관리하지 않으므로(JSX style 객체에 display가 없음) 직접 되돌리지 않으면
            // 새 이미지가 로드돼도 계속 숨겨진 채로 남는다.
            event.currentTarget.style.display = '';
            event.currentTarget.style.opacity = '1';
            setImgLoaded(true);
          }}
          onError={(event) => {
            event.currentTarget.style.display = 'none';
            setImgLoaded(false);
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
