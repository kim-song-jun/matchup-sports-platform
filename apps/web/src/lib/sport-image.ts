/**
 * 종목별 플레이스홀더 이미지 (Unsplash 무료 이미지)
 * 실 서비스에서는 S3 업로드 이미지로 교체
 */
const sportImages: Record<string, string> = {
  soccer: 'https://images.unsplash.com/photo-1575361204480-aadea25e6e68?w=400&h=300&fit=crop',
  futsal: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&h=300&fit=crop',
  basketball: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400&h=300&fit=crop',
  badminton: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=400&h=300&fit=crop',
  ice_hockey: 'https://images.unsplash.com/photo-1580748142073-f52d2e816e89?w=400&h=300&fit=crop',
  swimming: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=400&h=300&fit=crop',
  tennis: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400&h=300&fit=crop',
  baseball: 'https://images.unsplash.com/photo-1508344928928-7165b67de128?w=400&h=300&fit=crop',
  volleyball: 'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=400&h=300&fit=crop',
  figure_skating: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=400&h=300&fit=crop',
  short_track: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=400&h=300&fit=crop',
};

const marketplaceImage = 'https://images.unsplash.com/photo-1461896836934-bd45ba14ab07?w=400&h=300&fit=crop';

/** 종목 기반 이미지 URL 반환. imageUrl이 있으면 그걸 사용 */
export function getSportImage(sportType: string, imageUrl?: string | null): string {
  if (imageUrl) return imageUrl;
  return sportImages[sportType] || sportImages.soccer;
}

/** 장터 아이템 이미지 */
export function getListingImage(imageUrls?: string[]): string {
  if (imageUrls && imageUrls.length > 0) return imageUrls[0];
  return marketplaceImage;
}

/** 팀 커버 이미지 */
export function getTeamImage(sportType: string, coverImageUrl?: string | null): string {
  if (coverImageUrl) return coverImageUrl;
  return sportImages[sportType] || sportImages.soccer;
}
