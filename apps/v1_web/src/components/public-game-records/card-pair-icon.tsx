import type { ReactNode } from 'react';

/**
 * 경고 누적 퇴장 아이콘 — 옐로 위에 레드를 겹쳐 한 번에 보인다. 이모지 🟨🟥 를 쓰는 기존 카드 아이콘과 같은 결이라
 * 폰트·플랫폼이 달라도 같은 모양으로 어긋나지 않는다. 장식이라 `aria-hidden` 이고, 뜻은 옆의 `sr-only` 라벨
 * (`secondYellowRedPresentation().label`)이 전한다 — 색·모양만으로 전하지 않는다.
 */
export function CardPairIcon({ size = 14 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'relative',
        display: 'inline-block',
        width: Math.round(size * 1.55),
        height: Math.round(size * 1.2),
        verticalAlign: 'middle',
      }}
    >
      <span style={{ position: 'absolute', left: Math.round(size * 0.6), top: 0, fontSize: size, lineHeight: 1 }}>🟥</span>
      <span style={{ position: 'absolute', left: 0, top: Math.round(size * 0.14), fontSize: size, lineHeight: 1 }}>🟨</span>
    </span>
  );
}

/** `eventPresentation`/`secondYellowRedPresentation` 결과의 아이콘 — 겹침 표시면 겹친 카드, 아니면 기호 그대로. */
export function PresentationIcon({
  presentation,
  size = 14,
}: {
  presentation: { readonly icon: string; readonly overlap?: true };
  size?: number;
}): ReactNode {
  return presentation.overlap ? <CardPairIcon size={size} /> : presentation.icon;
}
