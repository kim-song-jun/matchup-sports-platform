import { Link2, Mail, MessageCircle } from 'lucide-react';

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
    return (
      <span aria-hidden="true" style={{ ...circle, background: 'var(--kakao-yellow)' }}>
        <MessageCircle size={icon} fill="var(--static-black)" stroke="var(--static-black)" />
      </span>
    );
  }
  return (
    <span aria-hidden="true" style={{ ...circle, background: 'var(--grey150)', color: 'var(--text-strong)' }}>
      {provider === 'email' ? <Mail size={icon} /> : <Link2 size={icon} />}
    </span>
  );
}
