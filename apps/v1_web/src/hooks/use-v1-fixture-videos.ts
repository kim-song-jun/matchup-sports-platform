'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v1Delete, v1Get, v1MultipartPost, v1Post } from '@/lib/api-client';

/**
 * 대회 경기 영상 등록·삭제 데이터 레이어.
 *
 * 서버 계약(`apps/v1_api/src/tournaments/videos/`):
 *  - `GET    /tournament-ops/tournaments/:tournamentId/videos`
 *  - `POST   /tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/videos`        (링크)
 *  - `POST   /tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/videos/upload` (파일)
 *  - `DELETE /tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/videos/:videoId`
 *
 * 공유 훅 파일(`use-v1-api.ts`)이 아니라 별도 파일로 두는 이유는 그 파일을 동시에 고치는
 * 레인이 여럿이기 때문이다 — `use-tournament-result-review.ts` 가 같은 이유로 쓰는 선례를
 * 따른다. 쿼리 키도 여기서만 쓰는 것이라 지역 정의한다.
 */

export const fixtureVideoKeys = {
  tournament: (tournamentId: string) => ['v1', 'tournament-videos', tournamentId] as const,
};

export type FixtureVideoSource = 'upload' | 'external';

export interface TournamentFixtureVideo {
  id: string;
  title: string | null;
  url: string;
  sortOrder: number;
  source: FixtureVideoSource;
  createdAt: string;
}

export interface TournamentVideoFixture {
  fixtureId: string;
  round: string;
  fixtureNumber: number;
  legNumber: number;
  scheduledAt: string | null;
  status: string;
  homeTeamName: string | null;
  awayTeamName: string | null;
  videos: TournamentFixtureVideo[];
}

/** 업로드 제한 — 서버(`UploadsService.KIND_RULES.video`)와 같은 값. 화면에 미리 안내한다. */
export const VIDEO_UPLOAD_MAX_BYTES = 200 * 1024 * 1024;
export const VIDEO_UPLOAD_MAX_LABEL = '200MB';
export const VIDEO_UPLOAD_ACCEPT = 'video/mp4,video/webm,video/quicktime';
export const VIDEO_UPLOAD_EXTENSION_LABEL = 'mp4, webm, mov';

function fixtureVideosPath(tournamentId: string, fixtureId: string) {
  return `/tournament-ops/tournaments/${encodeURIComponent(tournamentId)}/fixtures/${encodeURIComponent(fixtureId)}/videos`;
}

export function useTournamentFixtureVideos(tournamentId: string) {
  return useQuery({
    queryKey: fixtureVideoKeys.tournament(tournamentId),
    queryFn: () =>
      v1Get<{ items: TournamentVideoFixture[] }>(
        `/tournament-ops/tournaments/${encodeURIComponent(tournamentId)}/videos`,
      ),
    enabled: Boolean(tournamentId),
  });
}

export function useCreateFixtureVideoLink(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { fixtureId: string; url: string; title?: string }) =>
      v1Post<TournamentFixtureVideo>(fixtureVideosPath(tournamentId, payload.fixtureId), {
        url: payload.url,
        ...(payload.title ? { title: payload.title } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: fixtureVideoKeys.tournament(tournamentId) });
    },
  });
}

export function useUploadFixtureVideo(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { fixtureId: string; file: File; title?: string }) => {
      const formData = new FormData();
      formData.append('files', payload.file);
      if (payload.title) formData.append('title', payload.title);
      return v1MultipartPost<TournamentFixtureVideo>(
        `${fixtureVideosPath(tournamentId, payload.fixtureId)}/upload`,
        formData,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: fixtureVideoKeys.tournament(tournamentId) });
    },
  });
}

export function useDeleteFixtureVideo(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { fixtureId: string; videoId: string }) =>
      v1Delete<{ deleted: boolean }>(
        `${fixtureVideosPath(tournamentId, payload.fixtureId)}/${encodeURIComponent(payload.videoId)}`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: fixtureVideoKeys.tournament(tournamentId) });
    },
  });
}
