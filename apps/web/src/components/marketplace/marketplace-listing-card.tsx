import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { SafeImage } from '@/components/ui/safe-image';
import { sportLabel, sportCardAccent } from '@/lib/constants';
import { getListingImage } from '@/lib/sport-image';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { MarketplaceListing } from '@/types/api';

type ConditionKey = 'conditionNew' | 'conditionLikeNew' | 'conditionGood' | 'conditionFair' | 'conditionPoor';
const conditionKeyMap: Record<string, ConditionKey> = {
  new: 'conditionNew',
  like_new: 'conditionLikeNew',
  good: 'conditionGood',
  fair: 'conditionFair',
  poor: 'conditionPoor',
};

export interface MarketplaceListingCardProps {
  item: MarketplaceListing;
  className?: string;
}

export function MarketplaceListingCard({ item, className }: MarketplaceListingCardProps) {
  const t = useTranslations('marketplace');

  return (
    <Link href={`/marketplace/${item.id}`} className="block active:scale-[0.98]" data-testid="marketplace-card">
      <Card
        variant="default"
        padding="sm"
        interactive
        className={cn('flex gap-3.5', className)}
      >
        {/* Thumbnail */}
        <div className="relative h-[100px] w-[100px] shrink-0 rounded-xl bg-gray-50 dark:bg-gray-700 overflow-hidden">
          <SafeImage
            src={getListingImage(item.imageUrls, item.id)}
            fallbackSrc={getListingImage(undefined, item.id)}
            alt={item.title}
            fill
            className="object-cover"
            sizes="100px"
          />
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col min-w-0 py-0.5">
          <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 truncate">{item.title}</h3>

          {/* meta: 지역 · 종목 · 상태 */}
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`${sportCardAccent[item.sportType]?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-2 py-0.5 text-xs font-normal`}>
              {sportLabel[item.sportType] || t('other')}
            </span>
            <span className="text-sm text-gray-500 truncate">
              {item.locationDistrict || item.locationCity || t('locationUndecided')} · {conditionKeyMap[item.condition] ? t(conditionKeyMap[item.condition]) : item.condition}
            </span>
          </div>

          {/* 가격 */}
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1.5">{formatCurrency(item.price)}</p>

          {/* 하단: 타입 + 통계 */}
          <div className="flex items-center justify-between mt-auto pt-1">
            <span className="rounded-full px-2 py-0.5 text-xs font-normal bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              {item.listingType === 'rent' ? t('typeRent') : t('typeSell')}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {t('likes', { count: item.likeCount })} · {t('views', { count: item.viewCount })}
            </span>
          </div>

          {(item.team || item.venue) && (
            <div className="mt-1.5 flex items-center gap-1.5 text-2xs text-gray-500 dark:text-gray-400">
              {item.team && (
                <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5">
                  팀: {item.team.name}
                </span>
              )}
              {item.venue && (
                <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5">
                  장소: {item.venue.name}
                </span>
              )}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
