'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';
import { ErrorState } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { useV1DissolveTeam, useV1TeamDissolutionPreview } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import { sanitizeRedirectPath, withFromPath } from '@/lib/session-storage';
import { TeamDissolutionBlockedView, TeamDissolutionReadyView } from './team-dissolution-view';

function errorCode(error: unknown) {
  return error instanceof V1ApiError ? error.code : null;
}

/** 팀 해체(Task 180 H3 A-2·A-3). 점검 결과에 따라 해체 화면이나 막힘 화면을 보여 준다. */
export function TeamDissolutionPageClient({ teamId }: { teamId: string }) {
  const router = useRouter();
  const teamHref = `/teams/${teamId}`;
  const cancelHref = sanitizeRedirectPath(useSearchParams().get('from')) ?? teamHref;
  const preview = useV1TeamDissolutionPreview(teamId);
  const dissolve = useV1DissolveTeam(teamId);
  const nameFieldId = useId();
  const [confirmName, setConfirmName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (preview.isPending) return <PageSkeleton variant="form" />;
  if (preview.isError) {
    const code = errorCode(preview.error);
    if (code === 'PERMISSION_DENIED') {
      return (
        <ErrorState
          title="팀장만 팀을 해체할 수 있어요"
          message="팀 해체는 팀장이 해요. 팀을 떠나려면 멤버 관리에서 팀 나가기를 눌러 주세요."
          back={{ href: teamHref, label: '팀으로 돌아가기' }}
        />
      );
    }
    if (code === 'TEAM_ALREADY_DISSOLVED') {
      return (
        <ErrorState
          title="이미 해체된 팀이에요"
          message="해체된 팀 페이지에서 지난 기록을 볼 수 있어요."
          back={{ href: teamHref, label: '해체된 팀 보기' }}
        />
      );
    }
    if (code === 'TEAM_NOT_ACTIVE' || code === 'NOT_FOUND') {
      return (
        <ErrorState
          title="지금은 해체할 수 없는 팀이에요"
          message={extractErrorMessage(preview.error, '팀 상태를 확인하지 못했어요. 운영팀에 문의해 주세요.')}
          back={{ href: '/teams', label: '팀 목록으로' }}
        />
      );
    }
    return (
      <ErrorState
        title="해체 전 점검을 불러오지 못했어요"
        message="잠시 후 다시 시도해 주세요."
        onRetry={() => void preview.refetch()}
        retryLabel="다시 불러오기"
      />
    );
  }

  if (!preview.data.canDissolve) {
    return <TeamDissolutionBlockedView preview={preview.data} cancelHref={cancelHref} error={error} />;
  }

  const submit = () => {
    setError(null);
    setNameError(null);
    dissolve.mutate(
      { confirmTeamName: confirmName.trim() },
      {
        // 해체된 팀 페이지로 간다. 뒤로가기는 복구 입구가 있는 내 팀으로.
        onSuccess: (result) => router.replace(withFromPath(sanitizeRedirectPath(result.detailRoute) ?? teamHref, '/my/teams')),
        onError: (err) => {
          const code = errorCode(err);
          if (code === 'TEAM_NAME_MISMATCH') {
            setNameError(extractErrorMessage(err, '팀 이름이 달라요. 팀 이름을 그대로 입력해 주세요.'));
          } else if (code === 'TEAM_DISSOLVE_BLOCKED') {
            // 점검 뒤에 막는 조건이 생겼다 — 다시 점검해 막힘 화면으로 바꾼다.
            setError('그사이 먼저 정리할 것이 생겼어요. 아래 항목을 정리한 뒤 다시 해체해 주세요.');
            void preview.refetch();
          } else {
            setError(extractErrorMessage(err, '팀을 해체하지 못했어요. 잠시 후 다시 시도해 주세요.'));
          }
        },
      },
    );
  };

  return (
    <TeamDissolutionReadyView
      preview={preview.data}
      confirmName={confirmName}
      onConfirmNameChange={(value) => {
        setConfirmName(value);
        setNameError(null);
      }}
      nameFieldId={nameFieldId}
      nameError={nameError}
      error={error}
      submitting={dissolve.isPending}
      onSubmit={submit}
      cancelHref={cancelHref}
    />
  );
}
