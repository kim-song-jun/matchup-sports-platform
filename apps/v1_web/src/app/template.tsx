import type { ReactNode } from 'react';

/**
 * 전역 루트 template.tsx — 이 저장소엔 (auth)/(main) 라우트 그룹 분리가 없어
 * 단일 루트로 182개 라우트 전부를 커버한다. Next 사양상 template.tsx는 layout.tsx와 달리
 * 매 네비게이션마다 새 인스턴스로 리마운트된다 — CSS 폴백 애니메이션이 매번 재생되고
 * (app-motion-system.md §2.6), VT 경로에서는 이 리마운트 자체가 pending 전환을 resolve하는
 * 신호가 된다(§2.5, page-transition-controller.tsx).
 *
 * `.tm-app-frame`(메인)과 `.tm-auth-frame`(인증) 둘 다 100dvh 전체화면 컨테이너라 같은
 * wrapper를 씌워도 지오메트리 충돌이 없다.
 *
 * Wave 1(셸 승격)이 끝난 뒤에만 배선한다 — 그 전에 배선하면 아직 자체 AppChrome을 직접
 * 렌더하는 페이지의 셸까지 이 wrapper의 리마운트+애니메이션 대상이 되어 버린다
 * (app-motion-wave-plan.md §2.40).
 */
export default function RootTemplate({ children }: { children: ReactNode }) {
  return (
    <div className="tm-page-transition-enter" style={{ viewTransitionName: 'page-content' }}>
      {children}
    </div>
  );
}
