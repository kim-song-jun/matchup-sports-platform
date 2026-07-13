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

/** Deterministic small hash so the same team always lands on the same palette color. */
function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export interface TeamAvatarProps {
  /** Stable identity for consistent color pick across renders/screens — pass team.id. */
  seed: string;
  name: string;
  logoUrl?: string | null;
  size?: TeamAvatarSize;
  className?: string;
}

/**
 * 팀 기본 아이콘 — 로고 없는 팀에 팀 id 기반 팔레트 색 + 이름 첫 글자를 보여주고,
 * logoUrl이 있으면 이미지로 덮는다. teams/tournaments/my 전 도메인 공용 컴포넌트.
 */
export function TeamAvatar({ seed, name, logoUrl, size = 'md', className }: TeamAvatarProps) {
  const { px, radius, fontSize } = SIZE_MAP[size];
  const initial = Array.from(name.trim())[0] ?? '팀';
  const palette = PALETTE[hashSeed(seed || name) % PALETTE.length];

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
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <span style={{ fontSize, fontWeight: 800, color: palette.fg, lineHeight: 1 }}>{initial}</span>
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
