'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Clapperboard, ExternalLink, Play, X } from 'lucide-react';
import {
  extractYoutubeVideoId,
  youtubeThumbnailUrl,
  youtubeEmbedUrl,
  youtubeWatchUrl,
  videoKind,
} from '@/lib/video-utils';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';

export interface MatchVideo {
  id: string;
  title: string | null;
  url: string;
}

function displayTitle(video: MatchVideo, index: number): string {
  return video.title?.trim() || `경기 영상 ${index + 1}`;
}

/**
 * 경기 하이라이트 영상 목록 UI — 경기당 여러 개.
 * - variant 'strip': 가로 스크롤 썸네일 스트립 (결승 등 액센트 카드)
 * - variant 'chips': ▶ 제목 컴팩트 칩 (일반 결선·조별리그 행)
 * 유튜브는 iframe, 업로드/직접 파일은 HTML5 video로 페이지 내 모달 재생.
 * 그 외 외부 링크는 새 창 폴백. 영상이 여러 개면 모달 안 플레이리스트로 전환.
 */
export function MatchVideos({
  videos,
  matchLabel,
  variant = 'chips',
}: {
  videos: MatchVideo[];
  matchLabel: string;
  variant?: 'strip' | 'chips';
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  // ESC 닫기·focus trap·focus 복원·body 스크롤 잠금을 공용 훅에 위임 —
  // 퇴장 애니메이션이 없는 조건부 마운트형이라 mounted/closing 은 쓰지 않는다.
  const { dialogRef, onBackdropClick } = useModalA11y<HTMLElement, HTMLDivElement>({
    open: openIndex !== null,
    onClose: () => setOpenIndex(null),
  });

  if (videos.length === 0) return null;

  const active = openIndex !== null ? videos[openIndex] : null;
  const activeYoutubeId = active ? extractYoutubeVideoId(active.url) : null;

  return (
    <>
      {variant === 'strip' ? (
        <div className="tm-video-strip" role="list" aria-label={`${matchLabel} 경기 영상 목록`}>
          {videos.map((v, i) => {
            const kind = videoKind(v.url);
            const title = displayTitle(v, i);
            if (kind === 'external') {
              return (
                <a
                  key={v.id}
                  href={v.url}
                  target="_blank"
                  rel="noreferrer"
                  className="tm-video-strip-item"
                  role="listitem"
                  aria-label={`${title} 보기 (새 창)`}
                >
                  <span className="tm-video-strip-thumb is-file">
                    <ExternalLink size={22} aria-hidden="true" />
                  </span>
                  <span className="tm-video-strip-title">{title}</span>
                </a>
              );
            }
            return (
              <button
                key={v.id}
                type="button"
                className="tm-video-strip-item"
                role="listitem"
                onClick={() => setOpenIndex(i)}
                aria-label={`${title} 재생`}
                aria-haspopup="dialog"
              >
                {kind === 'youtube' ? (
                  <span className="tm-video-strip-thumb">
                    <img src={youtubeThumbnailUrl(extractYoutubeVideoId(v.url)!)} alt="" loading="lazy" />
                    <span className="tm-video-strip-overlay" aria-hidden="true">
                      <span className="tm-video-strip-play">
                        <Play size={16} fill="currentColor" strokeWidth={0} />
                      </span>
                    </span>
                  </span>
                ) : (
                  <span className="tm-video-strip-thumb is-file">
                    <Clapperboard size={22} aria-hidden="true" />
                    {/* 첫 프레임을 썸네일로 — 로드 실패 시 뒤의 그라디언트+아이콘이 그대로 보인다 */}
                    <video src={v.url} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true" />
                    <span className="tm-video-strip-overlay" aria-hidden="true">
                      <span className="tm-video-strip-play">
                        <Play size={16} fill="currentColor" strokeWidth={0} />
                      </span>
                    </span>
                  </span>
                )}
                <span className="tm-video-strip-title">{title}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="tm-video-chips" aria-label={`${matchLabel} 경기 영상 목록`}>
          {videos.map((v, i) => {
            const title = displayTitle(v, i);
            if (videoKind(v.url) === 'external') {
              return (
                <a
                  key={v.id}
                  href={v.url}
                  target="_blank"
                  rel="noreferrer"
                  className="tm-video-chip"
                  aria-label={`${title} 보기 (새 창)`}
                >
                  <Play size={12} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                  {title}
                </a>
              );
            }
            return (
              <button
                key={v.id}
                type="button"
                className="tm-video-chip"
                onClick={() => setOpenIndex(i)}
                aria-label={`${title} 재생`}
                aria-haspopup="dialog"
              >
                <Play size={12} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                {title}
              </button>
            );
          })}
        </div>
      )}

      {active && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${matchLabel} 경기 영상`}
          className="tm-video-modal"
          onClick={onBackdropClick}
        >
          <div className="tm-video-modal-body">
            <div className="tm-video-modal-head">
              <span className="tm-video-modal-title">
                {matchLabel} · {displayTitle(active, openIndex!)}
              </span>
              {videos.length > 1 && (
                <span className="tm-video-modal-nav" aria-label="영상 이동">
                  <button
                    type="button"
                    className="tm-video-modal-close"
                    disabled={openIndex === 0}
                    onClick={() => setOpenIndex((i) => Math.max(0, (i ?? 0) - 1))}
                    aria-label="이전 영상"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="tm-video-modal-count" aria-live="polite">{openIndex! + 1} / {videos.length}</span>
                  <button
                    type="button"
                    className="tm-video-modal-close"
                    disabled={openIndex === videos.length - 1}
                    onClick={() => setOpenIndex((i) => Math.min(videos.length - 1, (i ?? 0) + 1))}
                    aria-label="다음 영상"
                  >
                    <ChevronRight size={18} />
                  </button>
                </span>
              )}
              <button
                type="button"
                onClick={() => setOpenIndex(null)}
                className="tm-video-modal-close"
                aria-label="영상 닫기"
              >
                <X size={20} />
              </button>
            </div>
            <div className="tm-video-modal-frame">
              {activeYoutubeId ? (
                <iframe
                  key={active.id}
                  src={youtubeEmbedUrl(activeYoutubeId)}
                  title={`${matchLabel} 경기 영상`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video key={active.id} src={active.url} controls autoPlay playsInline />
              )}
            </div>
            {/* 임베드는 우리가 제어할 수 없는 이유로 막힐 수 있다 — 사이트 CSP, 업로더가 끈
                "다른 사이트에서 재생 허용", 연령 제한. 그때 iframe 은 빈 화면이나 유튜브
                에러만 보여 주고 모달은 빠져나갈 곳이 없는 막다른 길이 된다. 유튜브 영상에는
                항상 원본으로 가는 링크를 함께 둔다. */}
            {activeYoutubeId !== null && (
              <p className="tm-video-modal-foot">
                <a
                  href={youtubeWatchUrl(activeYoutubeId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="재생이 안 되면 유튜브에서 보기 (새 창)"
                  className="tm-video-modal-external"
                >
                  <ExternalLink size={12} aria-hidden="true" />
                  재생이 안 되면 유튜브에서 보기
                </a>
              </p>
            )}
            {videos.length > 1 && (
              <div className="tm-video-playlist" aria-label="영상 선택">
                {videos.map((v, i) =>
                  videoKind(v.url) === 'external' ? (
                    <a
                      key={v.id}
                      href={v.url}
                      target="_blank"
                      rel="noreferrer"
                      className="tm-video-playlist-chip"
                      aria-label={`${displayTitle(v, i)} 보기 (새 창)`}
                    >
                      <ExternalLink size={10} aria-hidden="true" />
                      {displayTitle(v, i)}
                    </a>
                  ) : (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={i === openIndex}
                      className={`tm-video-playlist-chip${i === openIndex ? ' is-active' : ''}`}
                      onClick={() => setOpenIndex(i)}
                    >
                      <Play size={12} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                      {displayTitle(v, i)}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
