import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { absoluteSiteUrl } from '@/lib/seo';
import { PlayerCardShareClient } from '@/components/users/player-card-share-client';
import { fetchPublicProfileForOg } from './fetch-profile';

/**
 * 선수 카드 공유 전용 화면 (Task 155).
 *
 * 프로필 전체가 아니라 **카드 한 장만** 보여준다. 공유받은 사람이 링크를 눌렀을 때
 * 미리보기에서 본 것과 같은 것이 그대로 나와야 하기 때문이다 -- 프로필로 보내면
 * 카드가 스크롤 아래로 밀려 "다른 걸 보여줬다"가 된다.
 *
 * 메타데이터에 `openGraph.images` 를 **직접 넣지 않는다.** 같은 폴더의
 * `opengraph-image.tsx` 를 Next 가 자동으로 붙여 주는데, 여기서 images 를 지정하면
 * 그 파일 규약이 덮인다(공용 `buildPublicMetadata` 를 쓰지 않는 이유이기도 하다 --
 * 그 헬퍼는 이미지가 없으면 기본 소셜 이미지를 넣는다).
 */

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const profile = await fetchPublicProfileForOg(id);
  const name = profile?.displayName ?? '선수';
  const card = profile?.playerCard;
  const title = card?.overall != null ? `${name} · ${card.overall}` : `${name}의 선수 카드`;
  const description =
    card != null
      ? `${card.appearances}경기 · 능력치 ${card.unlockedCount}/6 열림. Teameet 에서 경기 기록으로 만든 선수 카드예요.`
      : 'Teameet 에서 경기 기록으로 만든 선수 카드예요.';

  return {
    title,
    description,
    alternates: { canonical: absoluteSiteUrl(`/users/${id}/card`) },
    openGraph: {
      type: 'profile',
      locale: 'ko_KR',
      siteName: 'Teameet',
      title: `${title} | Teameet`,
      description,
      url: absoluteSiteUrl(`/users/${id}/card`),
    },
    // 1200×630 카드이므로 작은 정사각 미리보기(summary)가 아니라 큰 이미지로 띄운다.
    twitter: { card: 'summary_large_image', title: `${title} | Teameet`, description },
  };
}

export default async function PlayerCardSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await fetchPublicProfileForOg(id);

  // 카드를 숨긴 사용자의 공유 링크는 존재하지 않는 것으로 다룬다 -- 숨김을 켰는데
  // 링크로는 볼 수 있으면 숨김이 아니다.
  if (profile === null || profile.playerCard === null || profile.playerCard === undefined) {
    notFound();
  }

  return (
    <PlayerCardShareClient
      userId={id}
      card={profile.playerCard}
      displayName={profile.displayName}
      profileImageUrl={profile.profileImageUrl}
      teamName={profile.teams?.[0]?.name ?? null}
    />
  );
}
