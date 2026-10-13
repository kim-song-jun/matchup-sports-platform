import Link from 'next/link';
import { ChevronRight, Goal } from 'lucide-react';

/**
 * 순위·대진표·일정 통합 허브(`/tournaments/:id/bracket`)로 가는 진입 버튼 하나.
 *
 * 대회 상세(`/tournaments/:id`)의 모바일 상단 스티키·데스크톱 레일과 리그 순위·일정 화면
 * (`/league-matches/:id`)이 같은 모양을 쓴다 — 화면마다 따로 그리면 LIVE 강조 규칙이 한쪽에만
 * 들어간다. 문구와 LIVE 여부는 호출부가 정한다(대회는 진행 중이면, 리그는 첫 경기가 시작된 뒤
 * 경기가 있는 날에만 LIVE).
 *
 * 색만으로 전달하지 않는다 — LIVE 일 때는 "LIVE" 글자가, 아닐 때는 아이콘과 문구가 함께 간다.
 * `aria-label` 은 문구 그대로다(테스트·스크린리더가 같은 이름으로 찾는다).
 */
export function BracketEntryLink({ href, label, live }: { href: string; label: string; live: boolean }) {
  return (
    <Link
      href={href}
      className="tm-pressable"
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '16px 16px',
        borderRadius: 'var(--radius-field)',
        textDecoration: 'none',
        background: live ? 'var(--blue500)' : 'var(--surface)',
        border: live ? 'none' : '1px solid var(--border)',
        boxShadow: live ? '0 2px 14px rgba(49,130,246,0.3)' : 'none',
      }}
    >
      {live ? (
        <span
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'rgba(255,255,255,0.18)', borderRadius: 'var(--radius-pill)',
            padding: '3px 8px', flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 6, height: 6, borderRadius: 'var(--radius-circle)',
              background: '#4ADE80', flexShrink: 0,
              boxShadow: '0 0 0 2px rgba(74,222,128,0.35)',
            }}
            aria-hidden="true"
          />
          <span style={{ fontSize: 'var(--font-size-caption)', fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>LIVE</span>
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="tm-on-tint"
          // 2026-08-11: 순수 내비게이션 CTA라 경고색 의미가 없는데 파란 틴트가 튀어
          // 보인다는 지적 — 무채색으로 통일 (마이허브 메뉴 아이콘과 동일 근거)
          style={{ width: 32, height: 32, borderRadius: 'var(--radius-control)', flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--grey100)' }}
        >
          <Goal size={16} color="var(--text-strong)" strokeWidth={2.2} />
        </span>
      )}
      <span style={{ flex: 1, fontSize: 'var(--font-size-body-lg)', fontWeight: 800, letterSpacing: '-0.01em', color: live ? '#fff' : 'var(--text-strong)' }}>
        {label}
      </span>
      <ChevronRight
        size={18}
        strokeWidth={2.5}
        style={{ color: live ? 'rgba(255,255,255,0.65)' : 'var(--text-caption)', flexShrink: 0 }}
        aria-hidden="true"
      />
    </Link>
  );
}
