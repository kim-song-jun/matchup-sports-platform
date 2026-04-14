import React from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { SafeImage } from '@/components/ui/safe-image';
import { sportLabel, sportCardAccent } from '@/lib/constants';
import { getVenueImageSet } from '@/lib/sport-image';
import { cn, formatCurrency } from '@/lib/utils';
import type { Venue } from '@/types/api';

export interface VenueCardProps {
  venue: Venue;
  className?: string;
}

export function VenueCard({ venue, className }: VenueCardProps) {
  const primarySport = venue.sportTypes?.[0] || 'soccer';
  const venuePreviewImage = getVenueImageSet(primarySport, venue.imageUrls, venue.id, 1)[0];

  return (
    <Link href={`/venues/${venue.id}`} className="block">
      <Card
        variant="default"
        padding="none"
        interactive
        className={cn('overflow-hidden flex active:scale-[0.98] transition-[border-color,transform] duration-150', className)}
      >
        {/* Thumbnail */}
        <div className="relative w-28 shrink-0 bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <SafeImage
            src={venuePreviewImage}
            alt={venue.name}
            fill
            className="object-cover"
            sizes="112px"
          />
        </div>

        {/* Text content */}
        <div className="flex-1 p-3 min-w-0 flex flex-col justify-center">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 truncate">{venue.name}</h3>
            {venue.rating > 0 && (
              <span className="shrink-0 flex items-center gap-0.5 text-xs font-semibold text-gray-900 dark:text-gray-100">
                <Star size={12} fill="currentColor" className="text-amber-500" aria-hidden="true" />
                {venue.rating.toFixed(1)}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {venue.sportTypes?.slice(0, 2).map((s: string) => (
              <span
                key={s}
                className={`${sportCardAccent[s]?.badge || 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'} rounded-full px-2 py-0.5 text-xs font-medium`}
              >
                {sportLabel[s] || s}
              </span>
            ))}
            {(venue.sportTypes?.length ?? 0) > 2 && (
              <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                +{(venue.sportTypes?.length ?? 0) - 2}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{venue.address}</p>
          <div className="mt-3 pt-2.5 border-t border-gray-50 dark:border-gray-700 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            {venue.pricePerHour && (
              <span>{formatCurrency(venue.pricePerHour)}/시간</span>
            )}
            {venue.reviewCount > 0 && (
              <>
                <span className="text-gray-300 dark:text-gray-600 shrink-0" aria-hidden="true">·</span>
                <span>리뷰 {venue.reviewCount}</span>
              </>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
