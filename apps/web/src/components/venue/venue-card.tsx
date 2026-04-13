import React from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { SafeImage } from '@/components/ui/safe-image';
import { sportLabel } from '@/lib/constants';
import { getVenueImageSet } from '@/lib/sport-image';
import { cn } from '@/lib/utils';
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
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{venue.name}</h3>
            {venue.rating > 0 && (
              <span className="shrink-0 flex items-center gap-0.5 text-xs font-semibold text-gray-900 dark:text-gray-100">
                <Star size={10} fill="currentColor" className="text-amber-400" aria-hidden="true" />
                {venue.rating.toFixed(1)}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {venue.sportTypes?.map((s: string) => sportLabel[s] || s).join(' · ')}
          </p>
          <p className="text-xs text-gray-500 mt-1 truncate">{venue.address}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            {venue.pricePerHour && (
              <span>{new Intl.NumberFormat('ko-KR').format(venue.pricePerHour)}원/시간</span>
            )}
            {venue.reviewCount > 0 && (
              <>
                <span className="text-gray-200 dark:text-gray-700" aria-hidden="true">·</span>
                <span>리뷰 {venue.reviewCount}</span>
              </>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
