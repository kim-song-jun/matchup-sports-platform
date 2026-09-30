'use client';

import { useEffect, useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import { AlertBanner, ErrorState } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { PitchFormationEditor } from '@/components/lineup/pitch-formation-editor';
import { courtKindForSport } from '@/components/lineup/pitch-lines';
import type { FormationSlot } from '@/components/lineup/formation-slots';
import { useV1SaveTacticsBoard, useV1TacticsBoard, useV1TeamMembers } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import {
  OFF_COURT_PATCH,
  applyFormation,
  buildBoardPeople,
  formationNoteFor,
  formationOptionsFor,
  hydrate,
  initialFormation,
  slotPatch,
  toSaveInput,
  upsertEntry,
  type BoardEntryDraft,
} from './tactics-board.model';

/**
 * 팀 전술보드 — 그 팀의 이 경기 배치(Task 180 H7 A안). 경기 기록과 책임이 달라서 몇 번을 고쳐도
 * 안전하고, "제출" 없이 저장만 있다. 규칙(선수 풀·번호·저장 범위)은 `tactics-board.model.ts`.
 */
export function TacticsBoardClient({ teamId, gameId }: { teamId: string; gameId: string }) {
  const board = useV1TacticsBoard(teamId, gameId);
  const members = useV1TeamMembers(teamId, { limit: 100 });
  const save = useV1SaveTacticsBoard(teamId, gameId);

  const [entries, setEntries] = useState<BoardEntryDraft[] | null>(null);
  const [formation, setFormation] = useState<string | null>(null);
  const [baseVersion, setBaseVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const viewerRole = members.data?.viewerRole;
  const canEdit = viewerRole === 'owner' || viewerRole === 'manager';
  const formationOptions = useMemo(() => (board.data ? formationOptionsFor(board.data) : []), [board.data]);

  /**
   * 서버 판 → 화면 상태. **편집 중이 아닐 때만** 다시 심는다. 매번 덮으면 창 포커스 refetch 가
   * 저장 안 한 편집을 지우고, 한 번만 심으면 최신 판을 받아와도 옛 버전으로 저장해 409 를 맞는다.
   */
  useEffect(() => {
    if (board.data === undefined) return;
    if (entries !== null && dirty) return;
    if (entries !== null && board.data.version === baseVersion) return;
    setEntries(hydrate(board.data));
    setFormation(initialFormation(board.data, formationOptionsFor(board.data)));
    setBaseVersion(board.data.version);
  }, [board.data, entries, dirty, baseVersion]);

  const memberItems = useMemo(() => members.data?.items ?? [], [members.data]);
  const people = useMemo(() => buildBoardPeople(entries ?? [], memberItems), [entries, memberItems]);

  function mutate(next: (current: BoardEntryDraft[]) => BoardEntryDraft[]) {
    setEntries((current) => (current === null ? current : next(current)));
    setDirty(true);
    setNotice(null);
  }

  function personFor(key: string): BoardEntryDraft | undefined {
    return [...people.onCourt, ...people.waiting].find((entry) => entry.key === key);
  }

  const handlers = {
    placeAt: (key: string, positionX: number, positionY: number) => {
      const person = personFor(key);
      if (person) mutate((current) => upsertEntry(current, person, { started: true, positionX, positionY }));
    },
    placeInSlot: (key: string, slot: FormationSlot) => {
      const person = personFor(key);
      if (person) mutate((current) => upsertEntry(current, person, slotPatch(slot)));
    },
    unplace: (key: string) => {
      const person = personFor(key);
      if (person) mutate((current) => upsertEntry(current, person, OFF_COURT_PATCH));
    },
    selectFormation: (code: string | null) => {
      const preset = code === null ? null : (formationOptions.find((option) => option.code === code) ?? null);
      setFormation(code);
      mutate((current) => applyFormation(current, preset));
    },
  };

  async function onSave() {
    if (entries === null) return;
    setError(null);
    try {
      const saved = await save.mutateAsync(toSaveInput(entries, memberItems, formation, baseVersion));
      setBaseVersion(saved.version);
      setDirty(false);
      setNotice('전술을 저장했어요.');
    } catch (caught) {
      // 다른 사람이 먼저 저장한 경우. 자동으로 다시 불러오지 않는다 — 저장 못 한 편집이 사라진다.
      if (caught instanceof V1ApiError && caught.statusCode === 409) {
        setError('다른 팀장·매니저가 먼저 저장했어요. 새로고침해서 최신 배치를 불러온 뒤 다시 저장해 주세요.');
        return;
      }
      setError(extractErrorMessage(caught, '전술을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'));
    }
  }

  if (board.isError) {
    const status = board.error instanceof V1ApiError ? board.error.statusCode : null;
    return (
      <ErrorState
        title={status === 403 ? '이 팀의 전술은 볼 수 없어요' : '전술을 불러오지 못했어요'}
        message={
          status === 403
            ? '전술보드는 그 팀의 팀원만 볼 수 있어요.'
            : status === 404
              ? '이 경기에서 팀을 찾을 수 없어요. 대진이 바뀌었을 수 있어요.'
              : '잠시 후 다시 시도해 주세요.'
        }
        onRetry={status === 403 || status === 404 ? undefined : () => void board.refetch()}
      />
    );
  }

  if (members.isError) {
    return (
      <ErrorState
        title="팀원을 불러오지 못했어요"
        message={extractErrorMessage(members.error, '잠시 후 다시 시도해 주세요.')}
        onRetry={() => void members.refetch()}
      />
    );
  }

  if (board.isLoading || members.isLoading || entries === null || board.data === undefined) {
    return <PageSkeleton />;
  }

  const summary = `코트 ${people.onCourt.length}명 · 대기 ${people.waiting.length}명.${
    dirty ? ' 저장하지 않은 변경이 있어요.' : ''
  }`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        // 하단 고정 저장 바(.tm-fixed-cta)가 본문 끝을 덮지 않게 그 높이만큼 비운다.
        paddingBottom: canEdit ? 112 : 16,
      }}
    >
      <AlertBanner
        tone="info"
        message={`${board.data.teamNameSnapshot} 팀원만 볼 수 있어요. 상대 팀과 관중에게는 등번호와 이름만 공개되고, 선발·후보와 배치는 나가지 않아요.`}
      />

      {!canEdit ? (
        <p
          className="tm-text-label"
          style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, color: 'var(--text-strong)', fontWeight: 600 }}
        >
          <Eye size={16} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
          보기 전용이에요. 배치는 팀장·매니저가 정해요.
        </p>
      ) : null}

      {notice !== null ? <AlertBanner tone="info" message={notice} /> : null}
      {error !== null ? <AlertBanner tone="error" message={error} /> : null}

      <PitchFormationEditor
        court={courtKindForSport(board.data.sportCode)}
        onCourt={people.onCourt}
        waiting={people.waiting}
        formation={formation}
        formationOptions={formationOptions}
        formationNote={formationNoteFor(board.data, formationOptions)}
        summary={summary}
        editable={canEdit}
        onSelectFormation={handlers.selectFormation}
        onPlacePlayer={handlers.placeAt}
        onPlaceInSlot={handlers.placeInSlot}
        onUnplacePlayer={handlers.unplace}
      />

      {canEdit ? (
        <div className="tm-fixed-cta">
          <Button
            variant="primary"
            size="lg"
            block
            loading={save.isPending}
            disabled={!dirty}
            onClick={() => void onSave()}
          >
            {dirty ? '전술 저장' : '저장됨'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
