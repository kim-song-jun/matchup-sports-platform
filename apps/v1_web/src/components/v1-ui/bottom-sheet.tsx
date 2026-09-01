'use client';

import { lazy, Suspense, type ReactNode } from 'react';

interface BottomSheetBaseProps {
  /**
   * true 인 동안만 시트를 마운트한다. false 로 바뀌면 이 컴포넌트는 즉시 언마운트한다 —
   * 퇴장 애니메이션은 이 게이트가 아니라 `BottomSheetMotionBody` 내부가 담당한다.
   * 드래그로 닫힐 때는 그 모션 바디가 스스로 y:100% 로 애니메이션을 재생한 *뒤에*
   * `onClose` 를 호출하므로, 호출자가 그 시점에 `open` 을 false 로 내려도 이미 화면
   * 밖으로 빠져나간 뒤라 잘리지 않는다(app-motion-system.md §4.1).
   */
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * `title` 또는 `ariaLabel` 중 하나는 반드시 있어야 한다 — dialog 는 접근 가능한 이름이
 * 필수다(WCAG 4.1.2). 타입 레벨에서 강제해 소비처가 둘 다 빠뜨리는 걸 컴파일 타임에 막는다.
 */
export type BottomSheetProps = BottomSheetBaseProps &
  (
    | { title: string; ariaLabel?: string }
    | { title?: undefined; ariaLabel: string }
  );

/**
 * BottomSheet — 드래그로 닫을 수 있는 하단 시트 (motion 청크 지연 로드 진입점).
 *
 * `motion` 패키지는 이 파일이 아니라 `bottom-sheet-motion-body.tsx` 안에서만 import 된다.
 * `open=false` 인 동안은 이 컴포넌트가 `null` 을 반환해 마운트 자체를 하지 않으므로,
 * 시트를 한 번도 열지 않는 세션은 그 청크가 네트워크에 아예 나가지 않는다
 * (app-motion-system.md §4.1 "국소 인터랙션만 dynamic import").
 *
 * 접근성(role="dialog" + aria-modal + ESC + focus trap)은 `use-modal-a11y.ts` 의
 * 기존 훅을 그대로 재사용한다 — 모달 접근성 인프라는 motion 도입과 무관하게 검증된
 * 자산이므로 새로 만들지 않는다.
 *
 * **소비처 배선은 이 컴포넌트의 범위 밖이다.** 기존 `.tm-filter-sheet` 필터 UI
 * (matches-page.tsx 등 5곳)를 이걸로 교체할지는 별도 UI 착수 결정(A·B·C 3안) 대상이다.
 */
const MotionSheetBody = lazy(() => import('./bottom-sheet-motion-body'));

export function BottomSheet({ open, onClose, children, title, ariaLabel }: BottomSheetProps) {
  if (!open) return null;
  return (
    <Suspense fallback={null /* motion 청크 로딩은 순간적이다 — 스크림 없이 대기, §2.6과 동일 처리 */}>
      <MotionSheetBody onClose={onClose} title={title} ariaLabel={ariaLabel}>
        {children}
      </MotionSheetBody>
    </Suspense>
  );
}
