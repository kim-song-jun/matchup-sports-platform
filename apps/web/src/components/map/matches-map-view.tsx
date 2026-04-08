'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { MapPin, Clock, Users, X } from 'lucide-react';
import { sportLabel, sportCardAccent } from '@/lib/constants';
import { formatCurrency, formatMatchDate, getTimeBadge } from '@/lib/utils';
import type { Match } from '@/types/api';

interface MatchesMapViewProps {
  matches: Match[];
}

interface MapMatch extends Match {
  venue: NonNullable<Match['venue']> & { lat: number; lng: number };
}

function hasCoords(match: Match): match is MapMatch {
  return (
    match.venue != null &&
    typeof match.venue.lat === 'number' &&
    typeof match.venue.lng === 'number'
  );
}

export function MatchesMapView({ matches }: MatchesMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MapMatch | null>(null);
  const mapKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

  const mappableMatches = matches.filter(hasCoords);

  useEffect(() => {
    if (!sdkReady || !containerRef.current || !mapKey || mappableMatches.length === 0) return;

    const container = containerRef.current;

    function initMap() {
      if (!window.kakao?.maps || !container) return;

      try {
        const kakaoMaps = window.kakao.maps;
        const firstMatch = mappableMatches[0];
        const center = new kakaoMaps.LatLng(firstMatch.venue.lat, firstMatch.venue.lng);
        const map = new kakaoMaps.Map(container, { center, level: 5 });

        mappableMatches.forEach((match) => {
          const position = new kakaoMaps.LatLng(match.venue.lat, match.venue.lng);
          const marker = new kakaoMaps.Marker({ position, map });

          kakaoMaps.event.addListener(marker, 'click', () => {
            setSelectedMatch(match);
          });
        });
      } catch {
        setMapError(true);
      }
    }

    window.kakao?.maps.load(initMap);
  }, [sdkReady, mappableMatches, mapKey]);

  if (!mapKey) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 h-[400px] dark:border-gray-700 dark:bg-gray-800">
        <MapPin size={24} className="text-gray-400" aria-hidden="true" />
        <p className="text-sm text-gray-500 dark:text-gray-400">지도를 표시하려면 카카오맵 키가 필요합니다</p>
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 h-[400px] dark:border-gray-700 dark:bg-gray-800">
        <MapPin size={24} className="text-gray-400" aria-hidden="true" />
        <p className="text-sm text-gray-500 dark:text-gray-400">지도를 불러오지 못했어요</p>
      </div>
    );
  }

  if (mappableMatches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 h-[400px] dark:border-gray-700 dark:bg-gray-800">
        <MapPin size={24} className="text-gray-400" aria-hidden="true" />
        <p className="text-sm text-gray-500 dark:text-gray-400">지도에 표시할 매치가 없어요</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">구장 위치 정보가 있는 매치만 지도에 나타납니다</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <Script
        src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${mapKey}&autoload=false`}
        strategy="lazyOnload"
        onLoad={() => setSdkReady(true)}
        onError={() => setMapError(true)}
      />
      <div
        ref={containerRef}
        className="w-full h-[400px] overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700"
        role="img"
        aria-label="매치 위치 지도"
      />
      {/* Match popup on marker click */}
      {selectedMatch && (
        <div className="absolute bottom-4 left-4 right-4 z-10">
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-lg p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                {(() => {
                  const accent = sportCardAccent[selectedMatch.sportType];
                  const dotColor = accent?.dot || 'bg-gray-400';
                  return <span className={`h-2 w-2 rounded-full ${dotColor} shrink-0`} aria-hidden="true" />;
                })()}
                <span className="text-xs font-medium text-gray-500">{sportLabel[selectedMatch.sportType]}</span>
              </div>
              <button
                type="button"
                aria-label="매치 팝업 닫기"
                onClick={() => setSelectedMatch(null)}
                className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center -mr-1 -mt-1"
              >
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            <Link href={`/matches/${selectedMatch.id}`} className="block">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1.5 line-clamp-1">
                {selectedMatch.title}
              </h3>
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-1">
                <Clock size={11} className="shrink-0 opacity-40" aria-hidden="true" />
                <span>{formatMatchDate(selectedMatch.matchDate)} {selectedMatch.startTime}</span>
                {selectedMatch.venue?.name && (
                  <>
                    <span className="opacity-30">·</span>
                    <span className="truncate">{selectedMatch.venue.name}</span>
                  </>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <Users size={11} className="shrink-0 opacity-40" aria-hidden="true" />
                  <span>{selectedMatch.currentPlayers}/{selectedMatch.maxPlayers}명</span>
                </div>
                <span className="text-xs font-semibold text-blue-500">{formatCurrency(selectedMatch.fee)}</span>
              </div>
            </Link>
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 text-center">
        좌표 정보가 있는 매치 {mappableMatches.length}개 표시됨
      </p>
    </div>
  );
}
