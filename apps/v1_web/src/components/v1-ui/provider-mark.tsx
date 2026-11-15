import { Link2, Mail } from 'lucide-react';
import { KAKAO_SYMBOL_PATH } from './kakao-symbol-path';

export type ProviderMarkKind = 'email' | 'kakao' | 'apple' | 'other';

const SIZES = { md: { box: 36, icon: 18 }, sm: { box: 24, icon: 14 } } as const;

/** 로그인 수단을 나타내는 원형 마크. `md` 는 목록 줄, `sm` 은 칩 안에 쓴다. 장식이라 이름은 옆 글자가 맡는다. */
export function ProviderMark({ provider, size = 'md' }: { provider: ProviderMarkKind; size?: keyof typeof SIZES }) {
  const { box, icon } = SIZES[size];
  const circle = {
    width: box,
    height: box,
    borderRadius: 'var(--radius-circle)',
    display: 'grid',
    placeItems: 'center',
    flex: 'none',
  } as const;

  if (provider === 'apple') {
    // 마크는 Apple 이 내려준 아트워크 그대로다(public/apple/README.md) — 자르거나 다시 그리지 않는다.
    return (
      <span
        aria-hidden="true"
        style={{ ...circle, backgroundImage: 'url(/apple/sign-in-mark-on-black.png)', backgroundSize: 'cover' }}
      />
    );
  }
  if (provider === 'kakao') {
    // 심볼 좌표가 카카오가 준 48 칸 원형 그림 그대로라, 원과 같은 크기로 그리면 비율(46%)과 위치가 계산 없이 맞는다.
    return (
      <span aria-hidden="true" style={{ ...circle, background: 'var(--kakao-yellow)' }}>
        <svg width={box} height={box} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <path d={KAKAO_SYMBOL_PATH} fill="var(--static-black)" />
        </svg>
      </span>
    );
  }
  return (
    <span aria-hidden="true" style={{ ...circle, background: 'var(--grey150)', color: 'var(--text-strong)' }}>
      {provider === 'email' ? <Mail size={icon} /> : <Link2 size={icon} />}
    </span>
  );
}
