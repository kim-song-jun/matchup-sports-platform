import type { ReactNode } from 'react';
import {
  BellIcon,
  ChatIcon,
  InfoCircleIcon,
  MatchIcon,
  TeamMatchIcon,
  TeamsIcon,
  TrophyIcon,
} from '@/components/v1-ui/icons';

/**
 * 알림 종류를 아이콘 "모양"으로 구분한다. 색을 늘려 구분하지 않는 이유는 두 가지다.
 * ① 이 앱은 블루 단일 액센트 규약을 쓴다 — 종류마다 색을 부여하면 액센트가 흩어진다.
 * ② 색만으로 정보를 전달하면 색각 이상 사용자가 구분할 수 없다. 색은 읽음/미읽음
 *    상태에만 쓰고(미읽음=blue tint), 종류는 모양과 제목 텍스트가 전달한다.
 *
 * key는 서버의 V1NotificationTargetType 값이다.
 */
const ICON_BY_TYPE: Record<string, (size: number) => ReactNode> = {
  match: (size) => <MatchIcon size={size} />,
  team: (size) => <TeamsIcon size={size} />,
  team_match: (size) => <TeamMatchIcon size={size} />,
  chat: (size) => <ChatIcon size={size} />,
  tournament: (size) => <TrophyIcon size={size} />,
  notice: (size) => <InfoCircleIcon size={size} />,
  system: (size) => <InfoCircleIcon size={size} />,
  inquiry: (size) => <InfoCircleIcon size={size} />,
};

/** 알림 종류별 아이콘. 모르는 타입은 종 아이콘으로 떨어진다. */
export function NotificationTypeIcon({ type, size = 18 }: { type?: string | null; size?: number }) {
  const render = type ? ICON_BY_TYPE[type] : undefined;
  return <>{render ? render(size) : <BellIcon size={size} />}</>;
}

/**
 * 스크린리더용 종류 이름. 아이콘은 aria-hidden이라, 종류 정보가 시각 정보로만
 * 남지 않도록 카드에서 sr-only 텍스트로 함께 읽어준다.
 */
const LABEL_BY_TYPE: Record<string, string> = {
  match: '매치 알림',
  team: '팀 알림',
  team_match: '팀매치 알림',
  chat: '채팅 알림',
  tournament: '대회 알림',
  notice: '공지 알림',
  system: '시스템 알림',
  inquiry: '문의 답변 알림',
};

export function notificationTypeLabel(type?: string | null): string {
  return (type && LABEL_BY_TYPE[type]) || '알림';
}
