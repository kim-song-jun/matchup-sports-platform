import { ProviderMark } from '@/components/v1-ui/provider-mark';

export type LoginMethod = { key: 'email' | 'kakao' | 'apple'; label: string };

/** 가입한 로그인 수단을 칩으로 늘어놓는다. 수단 이름은 마크가 아니라 글자가 전한다. */
export function LoginMethodChips({ methods }: { methods: readonly LoginMethod[] }) {
  return (
    <ul className="tm-method-chips" role="list">
      {methods.map((method) => (
        <li key={method.key} className="tm-method-chip">
          <ProviderMark provider={method.key} size="sm" />
          {method.label}
        </li>
      ))}
    </ul>
  );
}
