'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Clapperboard, ExternalLink, Film, Trash2 } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin';
import { AdminEmpty } from '@/components/admin/admin-empty';
import { AdminListSkeleton } from '@/components/admin/admin-skeleton';
import { AdminToasts, useAdminToast } from '@/components/admin/admin-toast';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { FixtureVideoAddForm } from '@/components/fixture-videos/fixture-video-add-form';
import { useV1AdminLeagueMatch } from '@/hooks/use-v1-api';
import { formatAdminDateTime } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import {
  useCreateLeagueFixtureVideoLink,
  useDeleteLeagueFixtureVideo,
  useLeagueFixtureVideos,
  useUploadLeagueFixtureVideo,
  VIDEO_UPLOAD_EXTENSION_LABEL,
  VIDEO_UPLOAD_MAX_LABEL,
  type TournamentFixtureVideo,
  type TournamentVideoFixture,
} from '@/hooks/use-v1-fixture-videos';

/**
 * 리그 대진 경기 영상 관리 — 대회 운영 콘솔의 영상 화면(videos-page-client.tsx)의 리그
 * 어드민 판. 그 화면을 그대로 재사용하지 않는 이유: 대회 쪽은 tournament-ops 셸(역할
 * 컨텍스트·OpsPageHeader·_gate)에 결합돼 있는데 리그 운영은 어드민 셸에서 이루어진다.
 * 등록 폼(FixtureVideoAddForm)과 데이터 모양(TournamentVideoFixture)은 공유한다.
 * 권한은 서버(AdminContextService.getMutationAdmin)가 판정한다 — 이 라우트에 들어온
 * 어드민은 전부 등록·삭제할 수 있어 대회 화면의 canManage 분기가 없다.
 */

function fixtureLabel(fixture: TournamentVideoFixture): string {
  const home = fixture.homeTeamName ?? '미정';
  const away = fixture.awayTeamName ?? '미정';
  // round 는 서버가 만든 'N주차' 라벨 그대로다(리그는 조·차수 개념이 없다).
  return `${fixture.round} · ${home} vs ${away}`;
}

function videoTitle(video: TournamentFixtureVideo, index: number): string {
  return video.title?.trim() || `경기 영상 ${index + 1}`;
}

function LeagueFixtureVideoCard({
  leagueId,
  fixture,
  onToast,
  onDelete,
}: {
  leagueId: string;
  fixture: TournamentVideoFixture;
  onToast: (message: string, variant?: 'success' | 'error') => void;
  onDelete: (fixture: TournamentVideoFixture, video: TournamentFixtureVideo) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const createLink = useCreateLeagueFixtureVideoLink(leagueId);
  const upload = useUploadLeagueFixtureVideo(leagueId);

  return (
    <li className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] px-4 py-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)] break-keep">
            {fixtureLabel(fixture)}
          </p>
          <p className="text-[length:var(--font-size-label)] text-[var(--text-muted)] mt-0.5">
            {fixture.scheduledAt ? formatAdminDateTime(fixture.scheduledAt) : '일정 미정'} · 영상{' '}
            {fixture.videos.length}개
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((open) => !open)}
          aria-expanded={formOpen}
          className="shrink-0 inline-flex items-center gap-1.5 h-[44px] px-3 rounded-xl text-sm font-semibold bg-[var(--surface-soft)] text-[var(--text-body)] hover:bg-[var(--border)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          <Film size={16} aria-hidden="true" />
          {formOpen ? '닫기' : '영상 추가'}
        </button>
      </div>

      {fixture.videos.length === 0 ? (
        <p className="text-[length:var(--font-size-label)] text-[var(--text-muted)]">아직 등록된 영상이 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-1.5" role="list">
          {fixture.videos.map((video, index) => (
            <li key={video.id} className="flex items-center gap-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2">
              <span className="text-[var(--text-muted)] shrink-0" aria-hidden="true">
                {video.source === 'upload' ? <Clapperboard size={16} /> : <ExternalLink size={16} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] truncate">
                  {videoTitle(video, index)}
                </span>
                {/* 출처는 아이콘만으로 구분하지 않는다 — 텍스트를 함께 둔다. */}
                <span className="block text-[length:var(--font-size-caption)] text-[var(--text-muted)] truncate">
                  {video.source === 'upload' ? '업로드한 파일' : '외부 링크'} · {video.url}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onDelete(fixture, video)}
                aria-label={`${videoTitle(video, index)} 삭제`}
                className="shrink-0 inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl text-[var(--text-muted)] hover:text-[var(--red700)] hover:bg-[var(--red50)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {formOpen && (
        <FixtureVideoAddForm
          idPrefix={fixture.fixtureId}
          isPending={createLink.isPending || upload.isPending}
          submitLink={(payload) => createLink.mutateAsync({ fixtureId: fixture.fixtureId, ...payload })}
          submitFile={(payload) => upload.mutateAsync({ fixtureId: fixture.fixtureId, ...payload })}
          onDone={(message) => {
            setFormOpen(false);
            onToast(message);
          }}
          onError={(message) => onToast(message, 'error')}
        />
      )}
    </li>
  );
}

export default function LeagueVideosClient({ leagueId }: { leagueId: string }) {
  const series = useV1AdminLeagueMatch(leagueId);
  const videos = useLeagueFixtureVideos(leagueId);
  const remove = useDeleteLeagueFixtureVideo(leagueId);
  const { toasts, showToast } = useAdminToast();
  const { confirm, ConfirmModal } = useConfirm();

  const fixtures = useMemo(() => videos.data?.items ?? [], [videos.data]);
  const totalVideos = useMemo(() => fixtures.reduce((sum, fixture) => sum + fixture.videos.length, 0), [fixtures]);

  async function handleDelete(fixture: TournamentVideoFixture, video: TournamentFixtureVideo) {
    const isUpload = video.source === 'upload';
    const ok = await confirm({
      title: '이 영상을 삭제할까요?',
      message: isUpload
        ? '업로드한 영상 파일도 서버에서 함께 지워져요. 되돌릴 수 없어요.'
        : '등록된 링크가 경기에서 사라져요. 되돌릴 수 없어요.',
      confirmLabel: '영상 삭제',
      tone: 'danger',
    });
    if (!ok) return;
    remove.mutate(
      { fixtureId: fixture.fixtureId, videoId: video.id },
      {
        onSuccess: () => showToast('영상을 삭제했어요.'),
        onError: (error) => showToast(extractErrorMessage(error, '영상을 삭제하지 못했어요.'), 'error'),
      },
    );
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="플랫폼 · 리그"
        title={series.data ? `${series.data.title} 경기 영상` : '경기 영상'}
        description={`경기마다 하이라이트·중계 영상을 등록해요. 외부 링크를 붙이거나 ${VIDEO_UPLOAD_EXTENSION_LABEL} 파일을 ${VIDEO_UPLOAD_MAX_LABEL}까지 직접 올릴 수 있어요. 등록한 영상은 리그 경기 상세에서 바로 재생돼요.`}
        action={
          <Link
            href={`/admin/league-matches/${leagueId}`}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text-strong)]"
          >
            리그 상세로
          </Link>
        }
      />

      {videos.isPending ? (
        <AdminListSkeleton />
      ) : videos.isError ? (
        <AdminEmpty
          title="영상 정보를 불러오지 못했어요"
          description={extractErrorMessage(videos.error, '잠시 후 다시 시도해 주세요.')}
          action={
            <button
              type="button"
              onClick={() => void videos.refetch()}
              className="h-[44px] px-4 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              다시 시도
            </button>
          }
        />
      ) : fixtures.length === 0 ? (
        <AdminEmpty
          icon={<Film size={40} />}
          title="아직 대진이 없어요"
          description="리그 상세에서 대진을 생성하면 여기에서 영상을 등록할 수 있어요."
        />
      ) : (
        <>
          <p className="mb-2 text-[length:var(--font-size-label)] text-[var(--text-muted)]" role="status">
            경기 {fixtures.length}개 · 등록된 영상 {totalVideos}개
          </p>
          <ul className="flex flex-col gap-2" role="list">
            {fixtures.map((fixture) => (
              <LeagueFixtureVideoCard
                key={fixture.fixtureId}
                leagueId={leagueId}
                fixture={fixture}
                onToast={showToast}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        </>
      )}

      {ConfirmModal}
      <AdminToasts toasts={toasts} />
    </div>
  );
}
