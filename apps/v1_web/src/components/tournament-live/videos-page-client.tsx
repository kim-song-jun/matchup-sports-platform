'use client';

import { useMemo, useState } from 'react';
import { Clapperboard, ExternalLink, Film, Trash2 } from 'lucide-react';
import { AdminEmpty } from '@/components/admin/admin-empty';
import { AdminListSkeleton } from '@/components/admin/admin-skeleton';
import { AdminToasts, useAdminToast } from '@/components/admin/admin-toast';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useTournamentOpsRole } from '@/components/tournament-ops/role-context';
import { OpsPageHeader } from '@/components/tournament-ops/ops-page-header';
// 등록 폼은 리그 어드민 영상 화면과 공유한다 — components/fixture-videos/ 참고.
import { FixtureVideoAddForm } from '@/components/fixture-videos/fixture-video-add-form';
import { useV1Tournament } from '@/hooks/use-v1-api';
import { formatAdminDateTime } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import {
  useCreateFixtureVideoLink,
  useDeleteFixtureVideo,
  useTournamentFixtureVideos,
  useUploadFixtureVideo,
  VIDEO_UPLOAD_EXTENSION_LABEL,
  VIDEO_UPLOAD_MAX_LABEL,
  type TournamentFixtureVideo,
  type TournamentVideoFixture,
} from '@/hooks/use-v1-fixture-videos';

interface Props {
  tournamentId: string;
}

// 대진표(tournament-bracket.tsx)와 같은 표기. 그 맵은 export 되지 않아 여기서 필요한 값만 둔다.
const ROUND_LABEL: Record<string, string> = {
  group: '조별리그',
  semi: '4강',
  final: '결승',
  third_place: '3·4위전',
};

function fixtureLabel(fixture: TournamentVideoFixture): string {
  const round = ROUND_LABEL[fixture.round] ?? fixture.round;
  const home = fixture.homeTeamName ?? '미정';
  const away = fixture.awayTeamName ?? '미정';
  return `${round} ${fixture.fixtureNumber}경기 · ${home} vs ${away}`;
}

function videoTitle(video: TournamentFixtureVideo, index: number): string {
  return video.title?.trim() || `경기 영상 ${index + 1}`;
}

// 등록 폼(AddVideoForm)은 components/fixture-videos/fixture-video-add-form.tsx 로
// 이동했다 — 리그 어드민 영상 화면과 공유하기 위해서다. 데이터 레이어(mutation 훅)는
// 이 파일의 FixtureVideoCard 가 만들어 주입한다.

// ── 경기 카드 ─────────────────────────────────────────────────────────────
function FixtureVideoCard({
  tournamentId,
  fixture,
  canManage,
  onToast,
  onDelete,
}: {
  tournamentId: string;
  fixture: TournamentVideoFixture;
  canManage: boolean;
  onToast: (message: string, variant?: 'success' | 'error') => void;
  onDelete: (fixture: TournamentVideoFixture, video: TournamentFixtureVideo) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const createLink = useCreateFixtureVideoLink(tournamentId);
  const upload = useUploadFixtureVideo(tournamentId);

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
        {canManage && (
          <button
            type="button"
            onClick={() => setFormOpen((open) => !open)}
            aria-expanded={formOpen}
            className="shrink-0 inline-flex items-center gap-2 h-[44px] px-3 rounded-xl text-sm font-semibold bg-[var(--surface-soft)] text-[var(--text-body)] hover:bg-[var(--border)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <Film size={16} aria-hidden="true" />
            {formOpen ? '닫기' : '영상 추가'}
          </button>
        )}
      </div>

      {fixture.videos.length === 0 ? (
        <p className="text-[length:var(--font-size-label)] text-[var(--text-muted)]">아직 등록된 영상이 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2" role="list">
          {fixture.videos.map((video, index) => (
            <li
              key={video.id}
              className="flex items-center gap-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2"
            >
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
              {canManage && (
                <button
                  type="button"
                  onClick={() => onDelete(fixture, video)}
                  aria-label={`${videoTitle(video, index)} 삭제`}
                  className="shrink-0 inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl text-[var(--text-muted)] hover:text-[var(--red700)] hover:bg-[var(--red50)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && formOpen && (
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

// ── 화면 ──────────────────────────────────────────────────────────────────
/**
 * 대회 경기 영상 관리 — 등록(외부 링크 / 파일 업로드)·목록·삭제.
 *
 * 등록·삭제는 서버에서 `event_append` 스태프 권한을 요구한다
 * (`apps/v1_api/src/tournaments/videos/tournament-fixture-videos.service.ts`). 이 셸에 들어올 수
 * 있는 역할 중 그 권한이 없는 쪽은 지원 담당(SUPPORT_READONLY) 하나뿐이라, 그 역할에게는
 * 버튼을 감추고 이유를 적는다 — 눌러 보고 403 을 받는 버튼은 만들지 않는다.
 * 필드 담당자(FIELD_OPERATOR)는 서버에서는 담당 경기에 등록할 수 있지만 이 셸 자체에 들어올
 * 수 없다(`_gate.tsx`) — 담당 경기 화면이 열릴 때 같은 API 를 재사용하면 된다.
 */
export function VideosPageClient({ tournamentId }: Props) {
  const role = useTournamentOpsRole();
  /* 머리말 eyebrow 에 쓸 대회명 — 이 화면만 eyebrow 가 없어서 셸 안에서 혼자
     "어느 대회인지" 문맥이 끊겼다. 다른 네 화면과 같은 소스를 쓴다. */
  const tournament = useV1Tournament(tournamentId);
  const videos = useTournamentFixtureVideos(tournamentId);
  const remove = useDeleteFixtureVideo(tournamentId);
  const { toasts, showToast } = useAdminToast();
  const { confirm, ConfirmModal } = useConfirm();

  const canManage = role === 'PLATFORM_OPS' || role === 'TOURNAMENT_DIRECTOR';

  const fixtures = useMemo(() => videos.data?.items ?? [], [videos.data]);
  const totalVideos = useMemo(
    () => fixtures.reduce((sum, fixture) => sum + fixture.videos.length, 0),
    [fixtures],
  );

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
    /* 폭·여백은 셸의 <main>(px-4~lg:px-8 + max-w-[1200px])이 이미 책임진다 —
       여기서 max-w-[860px] 를 또 걸면 같은 셸 안의 다른 화면과 본문 폭이 어긋난다. */
    <div className="flex flex-col gap-4 w-full">
      <OpsPageHeader
        tournamentTitle={tournament.data?.title}
        title="경기 영상"
        description={
          <>
            경기마다 하이라이트·중계 영상을 등록해요. 유튜브 같은 외부 링크를 붙이거나,{' '}
            {VIDEO_UPLOAD_EXTENSION_LABEL} 파일을 {VIDEO_UPLOAD_MAX_LABEL}까지 직접 올릴 수 있어요.
            등록한 영상은 공개 경기 기록 화면에서 바로 재생돼요.
          </>
        }
      />
      {!canManage && (
        <p className="text-[length:var(--font-size-label)] text-[var(--text-muted)]" role="status">
          지원 담당은 등록된 영상을 확인만 할 수 있어요. 등록·삭제는 대회 운영자(디렉터)나 플랫폼
          운영자에게 요청해 주세요.
        </p>
      )}

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
          title="아직 경기가 없어요"
          description="대진표에서 경기를 만들면 여기에서 영상을 등록할 수 있어요."
        />
      ) : (
        <>
          <p className="text-[length:var(--font-size-label)] text-[var(--text-muted)]" role="status">
            경기 {fixtures.length}개 · 등록된 영상 {totalVideos}개
          </p>
          <ul className="flex flex-col gap-2" role="list">
            {fixtures.map((fixture) => (
              <FixtureVideoCard
                key={fixture.fixtureId}
                tournamentId={tournamentId}
                fixture={fixture}
                canManage={canManage}
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
