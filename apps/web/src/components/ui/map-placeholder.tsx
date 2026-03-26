'use client';

import { MapPin, ExternalLink } from 'lucide-react';

interface MapPlaceholderProps {
  lat: number;
  lng: number;
  address: string;
  name: string;
  height?: number;
}

export function MapPlaceholder({ lat, lng, address, name, height = 200 }: MapPlaceholderProps) {
  const naverMapUrl = `https://map.naver.com/v5/search/${encodeURIComponent(address)}?c=${lng},${lat},15,0,0,0,dh`;

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-gray-200"
      style={{ height }}
    >
      {/* Grid background */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100">
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#map-grid)" />
        </svg>
        {/* Decorative road lines */}
        <div className="absolute top-1/3 left-0 right-0 h-[2px] bg-gray-200/60" />
        <div className="absolute top-2/3 left-0 right-0 h-[1px] bg-gray-200/40" />
        <div className="absolute top-0 bottom-0 left-1/4 w-[2px] bg-gray-200/60" />
        <div className="absolute top-0 bottom-0 right-1/3 w-[1px] bg-gray-200/40" />
      </div>

      {/* Center pin */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full z-10">
        <div className="flex flex-col items-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 shadow-lg shadow-blue-500/30">
            <MapPin size={20} className="text-white" />
          </div>
          <div className="mt-[-2px] h-3 w-3 rotate-45 bg-blue-500" />
        </div>
      </div>

      {/* Venue name tooltip above pin */}
      <div className="absolute top-[calc(50%-68px)] left-1/2 -translate-x-1/2 z-10">
        <div className="rounded-lg bg-gray-900/80 px-3 py-1.5 text-[12px] font-medium text-white whitespace-nowrap backdrop-blur-sm">
          {name}
        </div>
      </div>

      {/* Bottom address bar */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-white/90 backdrop-blur-sm border-t border-gray-100 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin size={14} className="text-gray-500 shrink-0" />
          <span className="text-[13px] text-gray-600 truncate">{address}</span>
        </div>
        <a
          href={naverMapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors"
        >
          <ExternalLink size={12} />
          지도 보기
        </a>
      </div>
    </div>
  );
}
