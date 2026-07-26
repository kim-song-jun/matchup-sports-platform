'use client';

import { Trophy } from 'lucide-react';
import { Card } from '@/components/v1-ui/primitives';
import { TrophyIcon } from '@/components/v1-ui/icons';
import { cssUrl } from '@/lib/assets';

/**
 * 대회 홍보 카드(홈 오늘의 추천 / 대회 목록 상단) 어드민 폼 라이브 미리보기.
 *
 * 실제 노출 위치 — `components/home/tournament-hero-card.tsx`(홈),
 * `app/tournaments/page.tsx`의 상단 배너(목록) — 와 **동일한 마크업·클래스·인라인
 * 스타일**을 그대로 재사용한다. 폼 값이 바뀌면(이미지 업로드 포함) 이 컴포넌트가
 * 그 즉시 다시 렌더되므로, 관리자가 저장 전에 실제로 어떻게 보일지 확인할 수 있다.
 * 값이 비어 있을 때의 폴백 문구(대회명/장소/종목명 등)도 프로덕션 로직과 동일하게 계산한다.
 */
export type PromoPreviewFields = {
  title: string;
  subtitle: string;
  badgeText: string;
  imageUrl: string;
  dateText: string;
  teamsText: string;
  locationText: string;
  prizeText: string;
};

export type PromoPreviewFallback = {
  /** 카드 제목이 비어 있을 때 대신 보여줄 대회명 */
  title: string;
  /** 홈 히어로 카드 내용이 비어 있을 때 폴백 2순위 */
  venue: string | null;
  /** 홈 히어로 카드 내용 폴백 3순위 — `${sportName} 대회` */
  sportName: string | null;
};

function trimmedOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** 홈 "오늘의 추천" 히어로 카드 미리보기 — tournament-hero-card.tsx와 동일 마크업 */
export function PromoHomePreview({ fields, fallback }: { fields: PromoPreviewFields; fallback: PromoPreviewFallback }) {
  const cardTitle = trimmedOrNull(fields.title) ?? fallback.title;
  const cardBody =
    trimmedOrNull(fields.subtitle) ??
    (fallback.venue?.trim() || null) ??
    (fallback.sportName ? `${fallback.sportName} 대회` : '대회 소개 문구를 입력해 주세요');
  const badgeText = trimmedOrNull(fields.badgeText) ?? '추천 대회';
  const imageUrl = trimmedOrNull(fields.imageUrl);
  const facts = [fields.dateText, fields.teamsText, fields.locationText, fields.prizeText]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' · ');

  return (
    <Card pad={0} className="tm-featured-card" style={{ overflow: 'hidden' }}>
      <div
        className="tm-featured-media"
        style={{ background: imageUrl ? `${cssUrl(imageUrl)} center/cover` : 'linear-gradient(135deg, var(--blue500), var(--blue600))' }}
      >
        {!imageUrl ? (
          <div
            aria-hidden="true"
            style={{ position: 'absolute', right: -16, top: '50%', transform: 'translateY(-50%)', opacity: 0.18, color: 'var(--static-white)' }}
          >
            <TrophyIcon size={120} strokeWidth={1.4} />
          </div>
        ) : null}
        <div className="tm-featured-overlay" />
        <div className="tm-featured-text">
          <div
            className="tm-text-micro"
            style={{ color: 'var(--static-white)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <TrophyIcon size={13} strokeWidth={2} aria-hidden="true" /> {badgeText}
          </div>
          <div className="tm-text-subhead" style={{ color: 'var(--static-white)', marginTop: 4 }}>
            {cardTitle}
          </div>
        </div>
      </div>
      <div className="tm-featured-content">
        <div className="tm-text-body-lg">{cardBody}</div>
        {facts ? (
          <div className="tm-text-caption" style={{ marginTop: 4 }}>
            {facts}
          </div>
        ) : null}
        <span className="tm-btn tm-btn-primary tm-btn-sm tm-featured-cta" aria-hidden="true">
          참가 신청하기
        </span>
      </div>
    </Card>
  );
}

/** /tournaments 목록 상단 추천 배너 미리보기 — app/tournaments/page.tsx 배너와 동일 마크업 */
export function PromoListPreview({ fields, fallback }: { fields: PromoPreviewFields; fallback: PromoPreviewFallback }) {
  const featuredTitle = trimmedOrNull(fields.title) ?? fallback.title;
  const featuredSubtitle = trimmedOrNull(fields.subtitle) ?? '';
  const featuredBadge = trimmedOrNull(fields.badgeText) ?? '추천 대회';
  const imageUrl = trimmedOrNull(fields.imageUrl);
  const featuredFacts = [fields.dateText, fields.teamsText, fields.locationText]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' · ');
  const featuredPrizeText = trimmedOrNull(fields.prizeText) ?? '';

  return (
    // 프로덕션 클래스(.tm-tournament-featured-banner)는 ≥1024px에서 4:1 aspect-ratio를
    // 강제한다 — 그 자체가 폭에 비례해 사진이 커지는 실제 목록 페이지(풀폭)에서는
    // 문제 없지만, 여기서는 모달이 480px로 폭이 고정돼 있어 같은 4:1 비율이 세로 100px대로
    // 짜부라져 뱃지 아래 문구가 overflow:hidden에 잘려나간다(실측 확인). 미리보기는 폭 고정
    // 컨테이너 특성상 콘텐츠 기준 높이(모바일 렌더링과 동일)가 오히려 정확하므로 그 클래스는
    // 붙이지 않는다 — 인라인 스타일은 프로덕션과 100% 동일하게 유지.
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '18px 20px',
        borderRadius: 16,
        background: imageUrl ? `${cssUrl(imageUrl)} center 62%/cover` : 'linear-gradient(135deg, var(--blue500) 0%, var(--blue600) 100%)',
        color: 'var(--static-white)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {imageUrl ? <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'var(--scrim-dark-32)' }} /> : null}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: 'var(--overlay-white-18)', fontSize: 'var(--font-size-caption)', fontWeight: 700 }}>
            <Trophy size={12} strokeWidth={2} aria-hidden="true" />
            {featuredBadge}
          </span>
          <div className="tm-text-heading" style={{ color: 'var(--static-white)', marginTop: 12 }}>{featuredTitle}</div>
          {featuredSubtitle ? (
            <div className="tm-text-caption" style={{ color: 'var(--overlay-white-85)', marginTop: 6 }}>
              {featuredSubtitle}
            </div>
          ) : null}
          {featuredFacts ? (
            <div className="tm-text-caption" style={{ color: 'var(--overlay-white-85)', marginTop: 4 }}>
              {featuredFacts}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: featuredPrizeText ? 'space-between' : 'flex-end', gap: 12, marginTop: 16 }}>
          {featuredPrizeText ? (
            <span className="tm-text-caption" style={{ color: 'var(--overlay-white-85)', fontWeight: 700, minWidth: 0, whiteSpace: 'pre-wrap' }}>{featuredPrizeText}</span>
          ) : null}
          <span style={{ background: 'var(--static-white)', color: 'var(--blue700)', fontWeight: 700, fontSize: 'var(--font-size-label)', borderRadius: 999, padding: '6px 14px', lineHeight: 1, display: 'inline-block', flexShrink: 0 }}>자세히 보기 →</span>
        </div>
      </div>
    </div>
  );
}
