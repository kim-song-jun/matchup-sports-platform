'use client';

import { useState } from 'react';
import { Eye, FilePenLine, Globe2 } from 'lucide-react';
import { AdminEmpty } from '@/components/admin';
import { TournamentCampaignTemplate } from '@/components/tournaments/tournament-campaign-template';
import {
  useV1AdminTournamentCampaign,
  useV1AdminTournamentCampaignPreview,
  useV1ChangeTournamentCampaignStatus,
  useV1CreateTournamentCampaign,
  useV1UpdateTournamentCampaign,
} from '@/hooks/use-v1-tournament-campaign';
import { V1ApiError } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1TournamentCampaignStatus } from '@/types/tournament-campaign';
import {
  createTournamentCampaignPayload,
  emptyTournamentCampaignForm,
  tournamentCampaignFormFromCampaign,
  updateTournamentCampaignPayload,
} from './tournament-campaign-admin-model';
import { TournamentCampaignEditor } from './tournament-campaign-editor';
import { TournamentCampaignStatusDialog } from './tournament-campaign-status-dialog';
import {
  allowedTournamentCampaignTransitions,
  TOURNAMENT_CAMPAIGN_STATUS_LABEL,
  tournamentCampaignStatusActionLabel,
  tournamentCampaignStatusBadgeClass,
} from './tournament-campaign-status';

type TournamentCampaignTabProps = {
  readonly tournamentId: string;
  readonly canWrite: boolean;
  readonly showToast: (message: string, variant?: 'success' | 'error') => void;
};

export function TournamentCampaignTab({
  tournamentId,
  canWrite,
  showToast,
}: TournamentCampaignTabProps) {
  const campaignQuery = useV1AdminTournamentCampaign(tournamentId);
  const previewQuery = useV1AdminTournamentCampaignPreview(
    tournamentId,
    Boolean(campaignQuery.data),
  );
  const createCampaign = useV1CreateTournamentCampaign(tournamentId);
  const updateCampaign = useV1UpdateTournamentCampaign(tournamentId);
  const changeStatus = useV1ChangeTournamentCampaignStatus(tournamentId);
  const [editorOpen, setEditorOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<V1TournamentCampaignStatus | null>(null);

  if (campaignQuery.isPending) return <CampaignSkeleton />;

  const isMissing = campaignQuery.error instanceof V1ApiError && campaignQuery.error.statusCode === 404;
  if (campaignQuery.isError && !isMissing) {
    return (
      <CampaignError
        message={extractErrorMessage(campaignQuery.error, '캠페인 정보를 불러오지 못했어요.')}
        onRetry={() => void campaignQuery.refetch()}
      />
    );
  }

  const campaign = campaignQuery.data;
  if (!campaign && !isMissing) {
    return (
      <CampaignError
        message="캠페인 정보를 불러오지 못했어요."
        onRetry={() => void campaignQuery.refetch()}
      />
    );
  }

  if (!campaign) {
    if (editorOpen && canWrite) {
      return (
        <TournamentCampaignEditor
          mode="create"
          initialForm={emptyTournamentCampaignForm()}
          slugLocked={false}
          pending={createCampaign.isPending}
          onCancel={() => setEditorOpen(false)}
          onSubmit={(form) => {
            createCampaign.mutate(createTournamentCampaignPayload(form), {
              onSuccess: () => {
                setEditorOpen(false);
                showToast('캠페인 초안을 만들었어요.', 'success');
              },
              onError: (error) => showToast(
                extractErrorMessage(error, '캠페인을 만들지 못했어요.'),
                'error',
              ),
            });
          }}
        />
      );
    }

    return (
      <div className="rounded-2xl border border-gray-100 bg-white">
        <AdminEmpty
          icon={<Globe2 size={40} />}
          title="캠페인이 아직 없어요"
          description={canWrite ? '대회 소개와 참가 안내를 담은 캠페인 초안을 만들어 보세요.' : '아직 운영자가 캠페인을 만들지 않았어요.'}
          action={canWrite ? (
            <button type="button" onClick={() => setEditorOpen(true)} className="min-h-[44px] rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-600">
              캠페인 만들기
            </button>
          ) : undefined}
        />
      </div>
    );
  }

  const slugLocked = campaign.publishedAt !== null;
  const transitions = allowedTournamentCampaignTransitions(campaign.status);

  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border border-gray-100 bg-white p-5" aria-labelledby="campaign-admin-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="campaign-admin-heading" className="text-base font-bold tracking-tight text-gray-900">캠페인 운영</h2>
              <span className={tournamentCampaignStatusBadgeClass(campaign.status)}>{TOURNAMENT_CAMPAIGN_STATUS_LABEL[campaign.status]}</span>
            </div>
            <p className="mt-2 break-all text-sm font-medium text-gray-700">{campaign.slug}</p>
            <p className="mt-1 text-xs text-gray-500">
              {campaign.status === 'archived'
                ? '보관되어도 캠페인 행과 주소는 유지돼요.'
                : '대회 데이터는 서버 원본을 사용하고 설명 콘텐츠만 여기서 관리해요.'}
            </p>
          </div>

          {canWrite ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setEditorOpen((open) => !open)} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-gray-100 px-3 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200">
                <FilePenLine size={15} aria-hidden="true" />
                캠페인 편집
              </button>
              {transitions.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusTarget(status)}
                  className={status === 'archived'
                    ? 'min-h-[44px] rounded-xl bg-red-50 px-3 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100'
                    : 'min-h-[44px] rounded-xl bg-blue-500 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-600'}
                >
                  {tournamentCampaignStatusActionLabel(status)}
                </button>
              ))}
            </div>
          ) : (
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">읽기 전용</span>
          )}
        </div>
      </section>

      {editorOpen && canWrite ? (
        <TournamentCampaignEditor
          key={campaign.updatedAt}
          mode="update"
          initialForm={tournamentCampaignFormFromCampaign(campaign)}
          slugLocked={slugLocked}
          pending={updateCampaign.isPending}
          onCancel={() => setEditorOpen(false)}
          onSubmit={(form) => {
            updateCampaign.mutate(updateTournamentCampaignPayload(form, slugLocked), {
              onSuccess: () => {
                setEditorOpen(false);
                showToast('캠페인 내용을 저장했어요.', 'success');
              },
              onError: (error) => showToast(
                extractErrorMessage(error, '캠페인 내용을 저장하지 못했어요.'),
                'error',
              ),
            });
          }}
        />
      ) : null}

      <CampaignPreview query={previewQuery} />

      <TournamentCampaignStatusDialog
        target={statusTarget}
        targetLabel={statusTarget ? TOURNAMENT_CAMPAIGN_STATUS_LABEL[statusTarget] : ''}
        pending={changeStatus.isPending}
        onClose={() => setStatusTarget(null)}
        onSubmit={(status, reason) => {
          changeStatus.mutate({ status, reason }, {
            onSuccess: () => {
              setStatusTarget(null);
              showToast(`캠페인을 ${TOURNAMENT_CAMPAIGN_STATUS_LABEL[status]} 상태로 변경했어요.`, 'success');
            },
            onError: (error) => showToast(
              extractErrorMessage(error, '캠페인 상태를 변경하지 못했어요.'),
              'error',
            ),
          });
        }}
      />
    </div>
  );
}

function CampaignPreview({ query }: { readonly query: ReturnType<typeof useV1AdminTournamentCampaignPreview> }) {
  if (query.isPending) return <CampaignSkeleton />;
  if (query.isError || !query.data) {
    return <CampaignError message={extractErrorMessage(query.error, '캠페인 미리보기를 불러오지 못했어요.')} onRetry={() => void query.refetch()} />;
  }
  return (
    <section aria-label="캠페인 미리보기" className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
        <Eye size={16} className="text-blue-500" aria-hidden="true" />
        <h2 className="text-sm font-bold text-gray-900">실제 화면 미리보기</h2>
      </div>
      <TournamentCampaignTemplate campaign={query.data} preview />
    </section>
  );
}

function CampaignError({ message, onRetry }: { readonly message: string; readonly onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-5 py-10 text-center">
      <p className="text-sm font-medium text-red-500">{message}</p>
      <button type="button" onClick={onRetry} className="mt-3 min-h-[44px] rounded-lg px-3 text-sm font-semibold text-blue-500 transition-colors hover:text-blue-600">다시 시도하기</button>
    </div>
  );
}

function CampaignSkeleton() {
  return <div className="h-48 animate-pulse rounded-2xl bg-gray-100" aria-label="캠페인 불러오는 중" />;
}
