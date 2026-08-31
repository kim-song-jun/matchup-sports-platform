'use client';

import Link from 'next/link';
import Image from 'next/image';
import { getSportAccent } from '@/lib/v1-sport-accent';
import { publicAssetPath } from '@/lib/assets';
import { SportGlyph } from '@/components/v1-ui/sport-glyph';

/**
 * 정규 대회·정규 리그가 **같은 카드 골격**을 쓰기 위한 조각들.
 *
 * ## 왜 이 파일이 생겼나
 * 백엔드 축은 `v1Tournament` 하나로 합쳐졌는데(R4-a) **목록 카드는 둘로 남아 있었다.**
 * 실측하면 리그 카드는 대회 카드보다 얕았다:
 * ```
 * 대회  56px 썸네일(커버 or 종목 그라디언트+글리프) · 종목 칩 · 상태 · 일정 · 장소 · 상금 · 정원바
 * 리그  제목 · 티어 배지 · 상태 · 시리즈·시즌 · 지역 · 기간 · 팀수      ← 썸네일·종목 칩 없음
 * ```
 * 리그 타입(`V1PublicLeagueListItem`) 주석은 *"대회 카드와 같은 시각 언어를 쓸 수 있게
 * `sport.code` 를 포함한다"* 고 이미 적고 있었다 — **의도는 있었고 구현이 없었다.**
 *
 * ## 왜 "통합 카드" 하나가 아니라 조각들인가
 * 두 종류는 **같은 뼈대에 다른 정보**를 얹는다. 한 컴포넌트가 둘 다 그리려면 종류 분기가
 * 안으로 들어가고, 그러면 결국 카드 두 개를 한 파일에 넣은 것이 된다. 그래서
 * **뼈대(껍데기·썸네일·종목 칩)만 공유**하고 종류별 내용은 각자 조립한다.
 *
 * ## 시각 변화 0 이 설계 제약이다
 * 이 조각들은 `tournaments/tournament-card.tsx` 에서 **그대로 옮겨온 것**이다(새로 그리지
 * 않았다). 대회 카드는 사용자 피드백으로 다듬어진 표면이라(그 파일 주석의 *"아이콘도
 * 촌스러워"·"align도 안맞네"* 참조) 픽셀이 바뀌면 그 자체로 회귀다.
 */

/** 카드 껍데기 — `interactive=false` 면 링크가 아니라 미리보기용 `div` 로 렌더한다. */
export function CompetitionCardShell({
  interactive,
  href,
  ariaLabel,
  children,
}: {
  interactive: boolean;
  href: string;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const shellStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '16px 16px 16px',
    textDecoration: 'none',
  };
  if (interactive) {
    return (
      <Link className="tm-card tm-pressable" href={href} style={shellStyle} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  return (
    <div className="tm-card tm-pressable" style={shellStyle} aria-label={ariaLabel}>
      {children}
    </div>
  );
}

/**
 * 56px 썸네일. 이미지가 있으면 그것을, 없으면 **종목색 그라디언트 + 글리프**를 그린다.
 *
 * 리그는 커버 이미지가 없으므로 항상 그라디언트 쪽으로 떨어진다 — 그래서 리그 카드도
 * 대회와 같은 자리에 같은 크기의 종목 아이덴티티를 얻는다(이 파일이 생긴 이유의 절반).
 */
export function CompetitionThumbnail({
  sportCode,
  imageUrl = null,
}: {
  sportCode: string;
  imageUrl?: string | null;
}) {
  const sportAccent = getSportAccent(sportCode);
  if (imageUrl) {
    return (
      <div
        aria-hidden="true"
        style={{
          width: 56,
          height: 56,
          borderRadius: 'var(--radius-control)',
          overflow: 'hidden',
          flexShrink: 0,
          background: 'var(--grey100)',
        }}
      >
        <Image
          src={publicAssetPath(imageUrl)}
          alt=""
          width={56}
          height={56}
          sizes="56px"
          unoptimized
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{
        width: 56,
        height: 56,
        borderRadius: 'var(--radius-control)',
        overflow: 'hidden',
        flexShrink: 0,
        background: `linear-gradient(135deg, ${sportAccent.dot} 0%, ${sportAccent.gradientTo} 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SportGlyph code={sportCode} size={28} style={{ color: 'var(--static-white)' }} />
    </div>
  );
}

/**
 * 종목 칩 — 색 점 + 한글 라벨.
 *
 * **색만으로 종목을 알리지 않는다**(프로젝트 접근성 규칙): 점은 `aria-hidden` 이고
 * 라벨 텍스트와 `aria-label` 이 같은 정보를 글자로도 준다.
 */
export function CompetitionSportChip({ sportCode }: { sportCode: string }) {
  const sportAccent = getSportAccent(sportCode);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        background: sportAccent.badgeBg,
        flexShrink: 0,
      }}
      aria-label={`종목: ${sportAccent.label}`}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: 'var(--radius-circle)',
          background: sportAccent.dot,
          flexShrink: 0,
        }}
      />
      <span className="tm-text-caption" style={{ color: sportAccent.badgeText, fontWeight: 600, lineHeight: 1 }}>
        {sportAccent.label}
      </span>
    </span>
  );
}

/**
 * 카드 상단 — 썸네일 + [제목·상태 배지 / 메타 행].
 *
 * 메타 행이 썸네일이 아니라 **제목과 같은 x축**에 정렬되도록 제목과 한 컬럼에 묶는다
 * (형제 `div` 로 두면 아이콘 밑에 깔려 어긋나 보인다 — 대회 카드가 이미 겪은 회귀다).
 */
export function CompetitionCardHeader({
  sportCode,
  imageUrl = null,
  title,
  statusBadge,
  meta,
}: {
  sportCode: string;
  imageUrl?: string | null;
  title: React.ReactNode;
  statusBadge: { label: string; badgeClass: string };
  /** 종목 칩 뒤에 이어붙일 메타 요소들(일정·장소·부가 배지). */
  meta?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <CompetitionThumbnail sportCode={sportCode} imageUrl={imageUrl} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, justifyContent: 'space-between' }}>
          <div
            className="tm-text-body-lg"
            style={{
              color: 'var(--text-strong)',
              flex: 1,
              minWidth: 0,
              lineHeight: 1.35,
              overflowWrap: 'break-word',
              wordBreak: 'keep-all',
            }}
          >
            {title}
          </div>
          <span className={`tm-badge ${statusBadge.badgeClass}`} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
            {statusBadge.label}
          </span>
        </div>
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px' }}>
          <CompetitionSportChip sportCode={sportCode} />
          {meta}
        </div>
      </div>
    </div>
  );
}
