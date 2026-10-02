'use client';

import type { ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { Card } from '@/components/v1-ui/primitives';

/**
 * 정규 대회·정규 리그의 경기 카드가 **같은 골격**을 쓰기 위한 껍데기.
 *
 * ## 왜 껍데기만 공유하나
 * 두 축의 경기는 **모양이 근본적으로 다르다**(2026-09-01 KST alpha 실측):
 * ```
 * 겹치는 필드  3개   status · homeTeamId · awayTeamId
 * 대회만      16개   id groupId round fixtureNumber legNumber scheduledAt venue liveStatus …
 * 리그만       7개   teamMatchId title startAt placeName homeScore awayScore isForfeit
 * ```
 * 게다가 **겹치는 `status` 마저 값 영역이 다르다**:
 * ```
 * 대회  scheduled | completed
 * 리그  matched | completed | cancelled
 * ```
 * 한 컴포넌트가 두 어휘를 들면 `status === 'scheduled'` 같은 코드가 **모든 리그 경기에서
 * 거짓**이 된다 — 타입도 통과하고 값도 문자열이라 정상으로 보인다. 이 저장소가 `format`
 * 때문에 60곳을 뒤진 것이 정확히 그 모양이다.
 *
 * 그래서 **배치·간격·터치 타깃·다크모드 토큰만 공유하고 어휘는 각자 갖는다.**
 * `#887` 카드 통합에서 통한 패턴 그대로다.
 */

/**
 * 헤더 왼쪽 슬롯 — **여기가 두 축이 갈리는 유일한 자리다.**
 *
 * 대회는 `4강 · 14:00`(회차), 리그는 `8월 31일 (일) · 14:00`(날짜)을 넣는다. 리그의 이
 * 선택(회차 자리에 날짜)은 사용자가 고른 것이고, 나중에 바뀔 수 있으므로 **호출부가 이
 * 슬롯만 갈아끼우면 되도록** 카드 밖으로 뺐다 — 선택이 바뀌어도 카드를 다시 짜지 않는다.
 */
export interface CompetitionFixtureHeader {
  /** 굵은 왼쪽 라벨. 대회=회차, 리그=날짜. */
  readonly label: string;
  /** 라벨 옆 캡션. 보통 시각. 없으면 "미정"을 호출부가 정해서 넘긴다 — 빈칸으로 두지 않는다. */
  readonly caption: string;
}

export interface CompetitionFixtureCardProps {
  readonly header: CompetitionFixtureHeader;
  /** 상태 배지. **어휘가 축마다 다르므로 호출부가 만든다.** */
  readonly badge: ReactNode;
  readonly homeLabel: string;
  readonly awayLabel: string;
  /**
   * 가운데 칸. 점수를 그릴지 `vs` 를 그릴지는 축마다 다르다 —
   * 대회 카드는 점수를 싣지 않고, 리그 카드는 확정된 경기에 점수를 싣는다.
   */
  readonly center: ReactNode;
  /** 하단 캡션(장소 등). 없으면 줄 자체를 그리지 않는다. */
  readonly caption?: ReactNode;
}

/**
 * 카드 껍데기 — 헤더(라벨·캡션 / 배지) · 3열 대진 · 하단 캡션.
 *
 * 축 정렬 규칙: **메타·장소는 왼쪽, 대진은 가운데 대칭.** 하단 캡션을 가운데 두면 축이 셋이
 * 되어 어정쩡하게 뜬다(대회 카드가 이미 겪은 회귀).
 */
export function CompetitionFixtureCard({
  header,
  badge,
  homeLabel,
  awayLabel,
  center,
  caption,
}: CompetitionFixtureCardProps) {
  return (
    <Card pad={16}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="tm-text-label" style={{ color: 'var(--text-muted)' }}>
            {header.label}
          </span>
          <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>
            {header.caption}
          </span>
        </div>
        {badge}
      </div>

      <div
        role="group"
        aria-label={`${homeLabel} 대 ${awayLabel}`}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ textAlign: 'right' }}>
          <div className="tm-text-body-lg" style={ELLIPSIS}>
            {homeLabel}
          </div>
        </div>
        <div style={{ textAlign: 'center', minWidth: 52 }}>{center}</div>
        <div style={{ textAlign: 'left' }}>
          <div className="tm-text-body-lg" style={ELLIPSIS}>
            {awayLabel}
          </div>
        </div>
      </div>

      {caption ? (
        <div
          className="tm-text-caption"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 12,
            color: 'var(--text-muted)',
          }}
        >
          {caption}
        </div>
      ) : null}
    </Card>
  );
}

const ELLIPSIS = {
  color: 'var(--text-strong)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

/** 장소 캡션 — 두 축이 같은 모양으로 쓴다(대회 `venue`, 리그 `placeName`). */
export function CompetitionFixtureVenue({ venue }: { venue: string }) {
  return (
    <>
      <MapPin size={12} aria-hidden="true" />
      <span>{venue}</span>
    </>
  );
}
