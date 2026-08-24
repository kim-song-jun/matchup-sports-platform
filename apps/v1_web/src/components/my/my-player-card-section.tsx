'use client';

import type { ReactNode } from 'react';
import { useV1PublicProfile } from '@/hooks/use-v1-api';
import { PlayerCard } from '@/components/users/player-card';

/**
 * 마이페이지 상단의 내 선수 카드 (Task 155).
 *
 * ## 왜 마이페이지에 있나
 * 카드를 만들어 놓고 **본인이 자기 카드로 갈 입구가 앱에 없었다.** `/users/:id` 로
 * 가는 링크는 팀 멤버 목록(= 남의 프로필)과 공유 화면뿐이었고, 마이페이지에는
 * 활동 기록(`/users/:id/records`)만 있었다. 사용자가 "프로필을 어디서 봐야 하는지
 * 모르겠다"고 한 것이 정확히 이 상태다.
 *
 * 목록 속 한 줄이 아니라 **카드 자체**를 띄우는 이유: 자랑하라고 만든 물건이라
 * 눈에 보여야 공유할 마음이 생기고, 잠긴 능력치가 보여야 기록 공개를 켤 이유가
 * 생긴다(연결 1,384건 대 동의 0건이라는 원래 문제).
 *
 * ## 조용히 사라지는 경우들
 * - 카드 숨김을 켠 사용자: 서버가 `playerCard: null` 을 준다 → 섹션 자체를 렌더하지
 *   않는다. 숨겼는데 마이페이지에 남아 있으면 숨김이 아니다.
 * - 로딩 중·조회 실패: 마이페이지는 카드가 없어도 온전한 화면이다. 스켈레톤이나
 *   에러 박스를 띄우면 **상단이 깜빡이거나 실패가 눈에 띄어** 본래 정보를 가린다.
 */
export function MyPlayerCardSection({
  userId,
  displayName,
  profileImageUrl,
  stageIdentity,
  fallback,
}: {
  readonly userId: string;
  readonly displayName: string;
  readonly profileImageUrl: string | null;
  /**
   * 신원 통합 스테이지(사용자 선택 A안)에서 카드 바로 아래 들어가는 신원 블록
   * (이름·뱃지·내 프로필/프로필 수정). 카드가 있을 때 흰 신원 박스 대신 이것만 그린다 --
   * 카드와 신원 박스가 같은 말을 두 번 하는 중복이 이 통합의 제거 대상이다.
   */
  readonly stageIdentity?: ReactNode;
  /** 카드가 없을 때(숨김·로딩·실패) 대신 그릴 것 -- 기존 흰 신원 박스. */
  readonly fallback?: ReactNode;
}) {
  const profile = useV1PublicProfile(userId, { enabled: Boolean(userId) });
  const card = profile.data?.playerCard;

  // 카드 숨김·로딩·실패에서는 신원 박스가 원래 모습으로 남는다 -- 마이페이지는
  // 카드가 없어도 온전해야 하고, 어두운 스테이지가 빈 채로 뜨면 실패가 눈에 띈다.
  if (!card) return <>{fallback ?? null}</>;

  return (
    <section className="tm-my-profile-stage" aria-label="내 선수 카드와 프로필">
      <PlayerCard
        card={card}
        displayName={displayName}
        profileImageUrl={profileImageUrl}
        // 소속팀은 방금 가져온 공개 프로필에 이미 있다 -- 밖에서 또 넘기지 않는다.
        teamName={profile.data?.teams?.[0]?.name ?? null}
        // 내 카드이므로 기록 공개 유도를 띄운다 -- 남의 카드에서는 권하지 않는다.
        isOwner
        shareHref={`/users/${userId}/card`}
        belowCardSlot={stageIdentity}
      />
    </section>
  );
}
