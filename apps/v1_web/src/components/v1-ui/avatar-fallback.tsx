import { UserRound, UsersRound } from 'lucide-react';

/** 이미지 없는 팀과 사람은 같은 중립 아이콘을 사용한다. 이름/ID로 무늬를 생성하지 않는다. */
export function AvatarFallback({ kind, size = 20 }: { kind: 'team' | 'user'; size?: number }) {
  const Icon = kind === 'team' ? UsersRound : UserRound;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}
