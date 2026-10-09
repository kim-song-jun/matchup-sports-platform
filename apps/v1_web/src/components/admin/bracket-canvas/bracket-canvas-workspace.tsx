'use client';

import { Globe, LayoutTemplate, Link2, Plus, Shuffle } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { AdminListSkeleton } from '@/components/admin/admin-skeleton';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { AlertBanner, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import {
  useV1AdminBracket,
  useV1PublishTournamentBracket,
  useV1UnpublishTournamentBracket,
} from '@/hooks/use-v1-api';
import { useV1AssignTournamentSlot, useV1RandomFillSlots } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { buildSideLabelContext, fixtureSideLabel } from '@/lib/bracket-canvas-layout';
import { isBracketPublished } from '@/lib/bracket-visibility';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminTournamentRegistration, V1TournamentFormat } from '@/types/api';
import { BracketCanvas } from './bracket-canvas';
import { BracketNodePanel } from './bracket-node-panel';
import { BracketTeamTray } from './bracket-team-tray';
import { BracketFixtureToolsDialog } from './bracket-fixture-tools-dialog';
import { BracketTemplateDialog } from './bracket-template-dialog';

export type BracketCanvasWorkspaceProps = {
  tournamentId: string;
  format: V1TournamentFormat | undefined;
  registrations: V1AdminTournamentRegistration[];
  bracketPublishedAt: string | null | undefined;
  bracketPublishScheduledAt: string | null | undefined;
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
  onShowList: () => void;
};

export function BracketCanvasWorkspace({
  tournamentId,
  format,
  registrations,
  bracketPublishedAt,
  bracketPublishScheduledAt,
  canWrite,
  showToast,
  onShowList,
}: BracketCanvasWorkspaceProps) {
  const { data: bracket, isPending, isError, error, refetch } = useV1AdminBracket(tournamentId);
  const assignSlot = useV1AssignTournamentSlot(tournamentId, 'tournament');
  const randomFill = useV1RandomFillSlots(tournamentId, 'tournament');
  const publishBracket = useV1PublishTournamentBracket(tournamentId);
  const unpublishBracket = useV1UnpublishTournamentBracket(tournamentId);
  const { confirm, ConfirmModal } = useConfirm();
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [pendingRegistrationId, setPendingRegistrationId] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [toolsMode, setToolsMode] = useState<'add' | 'link' | null>(null);
  const toolbarHintId = useId();
  const labelContext = useMemo(
    () => (bracket === undefined ? null : buildSideLabelContext(bracket.groups, bracket.fixtures, bracket.slots)),
    [bracket],
  );

  if (isPending) {
    return (
      <div role="status" aria-busy="true" aria-label="대진을 불러오는 중이에요">
        <AdminListSkeleton rows={4} />
      </div>
    );
  }
  if (isError || bracket === undefined || labelContext === null) {
    return (
      <ErrorState
        title="대진을 불러오지 못했어요"
        message={extractErrorMessage(error, '잠시 뒤 다시 시도해 주세요.')}
        onRetry={() => void refetch()}
      />
    );
  }

  const isEmpty = bracket.groups.length === 0 && bracket.fixtures.length === 0;
  const templateFormat = format === 'knockout' || format === 'league' ? format : null;
  const confirmedTeams = registrations.filter((registration) => registration.status === 'confirmed');
  const placedIds = new Set(bracket.slots.filter((slot) => slot.kind !== 'GROUP_RANK' && slot.registrationId !== null).map((slot) => slot.registrationId));
  const emptySlotCount = bracket.slots.filter((slot) => slot.kind !== 'GROUP_RANK' && slot.registrationId === null).length;
  const unplacedTeamCount = confirmedTeams.filter((registration) => !placedIds.has(registration.id)).length;
  const randomFillBlockedReason =
    emptySlotCount === 0 ? '비어 있는 자리가 없어요.' : unplacedTeamCount === 0 ? '배정할 수 있는 팀이 없어요.' : null;
  const published = isBracketPublished(bracketPublishedAt, bracketPublishScheduledAt);
  const hasPendingSchedule = !!bracketPublishScheduledAt && !published;
  // 비활성 이유는 title 대신 화면에 보이게 둔다 — title 은 터치·키보드에서 보이지 않는다.
  const publishBlockedReason = isEmpty && !published ? '대진을 먼저 만들어야 공개할 수 있어요.' : null;
  const toolbarHint = !isEmpty ? randomFillBlockedReason : publishBlockedReason;
  const selectedFixture = bracket.fixtures.find((fixture) => fixture.id === selectedFixtureId) ?? null;

  const handleAssign = (slotId: string, registrationId: string) => {
    assignSlot.mutate(
      { slotId, registrationId },
      {
        onSuccess: () => {
          setPendingRegistrationId(null);
          showToast('팀을 넣었어요.', 'success');
        },
        onError: (err) => showToast(describeBracketCanvasError(err, '팀을 넣지 못했어요.'), 'error'),
      },
    );
  };

  const handleRandomFill = () => {
    randomFill.mutate(undefined, {
      onSuccess: (result) => {
        setPendingRegistrationId(null);
        showToast(result.assignments.length === 0 ? '채울 수 있는 자리가 없어요.' : `${result.assignments.length}개 자리를 채웠어요.`, 'success');
      },
      onError: (err) => showToast(describeBracketCanvasError(err, '자리를 채우지 못했어요.'), 'error'),
    });
  };

  const handlePublish = async () => {
    const ok = await confirm({
      title: '대진표 전체 공개',
      message: '공개하면 참가팀과 방문자가 조, 일정, 대진표를 볼 수 있어요. 공개한 뒤에 대진을 바꾸면 바로 보여요.',
      confirmLabel: '전체 공개',
    });
    if (!ok) return;
    publishBracket.mutate(undefined, {
      onSuccess: (result) => showToast(result.alreadyPublished ? '이미 공개된 대진표예요.' : '대진표를 공개했어요.', 'success'),
      onError: (err) => showToast(extractErrorMessage(err, '대진표 공개에 실패했어요.'), 'error'),
    });
  };

  const handleUnpublish = async () => {
    const ok = await confirm({
      title: published ? '대진표 공개 취소' : '공개 예약 취소',
      message: published
        ? '대진표를 다시 비공개로 되돌려요. 이미 대진표를 본 참가자의 기억까지 되돌릴 수는 없어요.'
        : '예약된 공개를 취소해요. 대진표는 계속 비공개로 남아요.',
      confirmLabel: published ? '비공개로 되돌리기' : '예약 취소',
      tone: 'danger',
    });
    if (!ok) return;
    unpublishBracket.mutate(undefined, {
      onSuccess: (result) => showToast(result.alreadyUnpublished ? '이미 비공개 상태예요.' : '대진표를 비공개로 되돌렸어요.', 'success'),
      onError: (err) => showToast(extractErrorMessage(err, '공개 취소에 실패했어요.'), 'error'),
    });
  };

  const selectedLabels =
    selectedFixture === null
      ? null
      : {
          HOME: fixtureSideLabel(selectedFixture, 'HOME', labelContext),
          AWAY: fixtureSideLabel(selectedFixture, 'AWAY', labelContext),
        };

  return (
    <div className="flex flex-col gap-4">
      {ConfirmModal}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={`tm-badge tm-badge-sm ${published ? 'tm-badge-green' : 'tm-badge-grey'}`} style={{ gap: 4 }}>
          <Globe size={12} strokeWidth={2.2} aria-hidden="true" />
          {published ? '공개 중' : hasPendingSchedule ? '공개 예약됨' : '비공개'}
        </span>
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            {!isEmpty && templateFormat !== null ? (
              <Button variant="outline" size="md" onClick={() => setTemplateOpen(true)}>
                <LayoutTemplate size={16} aria-hidden="true" />
                템플릿으로 다시 만들기
              </Button>
            ) : null}
            {!isEmpty ? (
              <Button
                variant="outline"
                size="md"
                disabled={randomFillBlockedReason !== null}
                aria-describedby={randomFillBlockedReason !== null ? toolbarHintId : undefined}
                loading={randomFill.isPending}
                onClick={handleRandomFill}
              >
                <Shuffle size={16} aria-hidden="true" />
                빈 자리 무작위 채우기
              </Button>
            ) : null}
            {!isEmpty ? (
              <>
                <Button variant="outline" size="md" onClick={() => setToolsMode('add')}>
                  <Plus size={16} aria-hidden="true" />
                  경기 추가
                </Button>
                <Button variant="outline" size="md" onClick={() => setToolsMode('link')}>
                  <Link2 size={16} aria-hidden="true" />
                  경기 연결
                </Button>
              </>
            ) : null}
            {!published ? (
              <Button variant="primary" size="md" disabled={isEmpty} aria-describedby={publishBlockedReason !== null ? toolbarHintId : undefined} onClick={() => void handlePublish()}>
                지금 전체 공개
              </Button>
            ) : null}
            {published || hasPendingSchedule ? (
              <Button variant="outline" size="md" style={{ color: 'var(--red700)' }} onClick={() => void handleUnpublish()}>
                {published ? '공개 취소' : '예약 취소'}
              </Button>
            ) : null}
          </div>
        ) : null}
        {canWrite && toolbarHint !== null ? (
          <p id={toolbarHintId} className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
            {toolbarHint}
          </p>
        ) : null}
      </div>

      {published && canWrite ? <AlertBanner tone="warning" message="이미 공개된 대진표예요. 바꾸는 즉시 참가팀에게 보여요." /> : null}

      {isEmpty ? (
        <EmptyState
          title="아직 대진이 없어요"
          sub={
            templateFormat === null
              ? '조별+결선 방식은 목록 보기에서 조를 만들어 시작해 주세요.'
              : '템플릿으로 시작하면 경기와 팀 자리가 한 번에 만들어져요. 팀은 나중에 넣어도 돼요.'
          }
          cta={!canWrite ? undefined : templateFormat === null ? '목록으로 보기' : '템플릿으로 시작'}
          onCta={templateFormat === null ? onShowList : () => setTemplateOpen(true)}
        />
      ) : (
        <div className={`grid gap-4 ${selectedFixture === null ? 'lg:grid-cols-[240px_minmax(0,1fr)]' : 'lg:grid-cols-[240px_minmax(0,1fr)_320px]'}`}>
          <BracketTeamTray
            registrations={registrations}
            slots={bracket.slots}
            pendingRegistrationId={pendingRegistrationId}
            canWrite={canWrite}
            onPick={setPendingRegistrationId}
          />
          <BracketCanvas
            groups={bracket.groups}
            fixtures={bracket.fixtures}
            slots={bracket.slots}
            mode={format === 'league' ? 'league' : 'bracket'}
            selectedFixtureId={selectedFixture?.id ?? null}
            pendingRegistrationId={canWrite ? pendingRegistrationId : null}
            canWrite={canWrite}
            onSelectFixture={setSelectedFixtureId}
            onAssignSlot={handleAssign}
          />
          {selectedFixture !== null && selectedLabels !== null ? (
            <BracketNodePanel
              key={selectedFixture.id}
              tournamentId={tournamentId}
              fixture={selectedFixture}
              groups={bracket.groups}
              slots={bracket.slots}
              registrations={registrations}
              sideLabels={selectedLabels}
              canWrite={canWrite}
              showToast={showToast}
              onClose={() => setSelectedFixtureId(null)}
            />
          ) : null}
        </div>
      )}

      <BracketFixtureToolsDialog
        key={toolsMode ?? 'closed'}
        open={toolsMode !== null}
        mode={toolsMode ?? 'add'}
        tournamentId={tournamentId}
        bracket={bracket}
        onClose={() => setToolsMode(null)}
        showToast={showToast}
      />

      {templateFormat !== null ? (
        <BracketTemplateDialog
          open={templateOpen}
          tournamentId={tournamentId}
          format={templateFormat}
          hasExistingBracket={!isEmpty}
          onClose={() => setTemplateOpen(false)}
          showToast={showToast}
        />
      ) : null}
    </div>
  );
}
