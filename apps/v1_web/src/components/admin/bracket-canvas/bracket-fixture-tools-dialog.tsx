'use client';

import { X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useV1CreateFixture } from '@/hooks/use-v1-api';
import { useV1SetBracketSources } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { bracketSourceCandidates, isFixtureLinkable, knockoutRoundLabel, nextFixtureNumber } from '@/lib/bracket-fixture-tools';
import type { V1AdminBracketFixture, V1AdminTournamentBracket } from '@/types/api';

export type BracketFixtureToolsDialogProps = {
  open: boolean;
  mode: 'add' | 'link';
  tournamentId: string;
  bracket: V1AdminTournamentBracket;
  onClose: () => void;
  showToast: (message: string, variant?: 'success' | 'error') => void;
};

const SELECT_CLASS = 'tm-input';

export function BracketFixtureToolsDialog({ open, mode, tournamentId, bracket, onClose, showToast }: BracketFixtureToolsDialogProps) {
  const idPrefix = useId();
  const createFixture = useV1CreateFixture(tournamentId);
  const setSources = useV1SetBracketSources(tournamentId);
  const pending = createFixture.isPending || setSources.isPending;
  const { dialogRef, onBackdropClick, mounted, closing } = useModalA11y({ open, onClose, pending });

  const addableGroups = useMemo(
    () => [...bracket.groups].filter((group) => knockoutRoundLabel(group.phase) !== null).sort((a, b) => a.sortOrder - b.sortOrder),
    [bracket.groups],
  );
  const linkable = useMemo(
    () =>
      bracket.fixtures
        .filter((fixture) => isFixtureLinkable(fixture) && bracketSourceCandidates({ target: fixture, groups: bracket.groups, fixtures: bracket.fixtures }).length > 0)
        .sort((a, b) => a.fixtureNumber - b.fixtureNumber),
    [bracket.fixtures, bracket.groups],
  );
  const groupName = (fixture: V1AdminBracketFixture) => bracket.groups.find((group) => group.id === fixture.groupId)?.name ?? fixture.round;
  const fixtureTitle = (fixture: V1AdminBracketFixture) => `${groupName(fixture)} ${fixture.fixtureNumber}번 경기`;

  const [groupId, setGroupId] = useState(addableGroups[0]?.id ?? '');
  const [targetId, setTargetId] = useState(linkable[0]?.id ?? '');
  const sourceOf = (fixture: V1AdminBracketFixture | undefined, side: 'HOME' | 'AWAY') =>
    fixture?.bracketSources?.find((source) => source.side === side)?.fixtureId ?? '';
  const [homeSource, setHomeSource] = useState(() => sourceOf(linkable[0], 'HOME'));
  const [awaySource, setAwaySource] = useState(() => sourceOf(linkable[0], 'AWAY'));

  const target = linkable.find((fixture) => fixture.id === targetId) ?? null;
  const candidates = target === null ? [] : bracketSourceCandidates({ target, groups: bracket.groups, fixtures: bracket.fixtures });
  const sourceOptions = (current: string) => {
    if (current === '' || candidates.some((fixture) => fixture.id === current)) return candidates;
    const linked = bracket.fixtures.find((fixture) => fixture.id === current);
    return linked === undefined ? candidates : [linked, ...candidates];
  };
  const targetPhase = target === null ? '' : (bracket.groups.find((group) => group.id === target.groupId)?.phase ?? '');
  const outcomeLabel = targetPhase === 'third_place' ? '패자' : '승자';

  const selectTarget = (fixtureId: string) => {
    setTargetId(fixtureId);
    const next = linkable.find((fixture) => fixture.id === fixtureId);
    setHomeSource(sourceOf(next, 'HOME'));
    setAwaySource(sourceOf(next, 'AWAY'));
  };

  const group = addableGroups.find((candidate) => candidate.id === groupId) ?? null;
  const addDisabled = group === null || pending;
  const linkDisabled = target === null || pending;

  const handleAdd = () => {
    if (group === null) return;
    const round = knockoutRoundLabel(group.phase);
    if (round === null) return;
    createFixture.mutate(
      { groupId: group.id, round, fixtureNumber: nextFixtureNumber(bracket.fixtures) },
      {
        onSuccess: () => {
          showToast(`${round} 경기를 추가했어요. 팀은 자리에서 정해 주세요.`, 'success');
          onClose();
        },
        onError: (error) => showToast(describeBracketCanvasError(error, '경기를 추가하지 못했어요.'), 'error'),
      },
    );
  };

  const handleLink = () => {
    if (target === null) return;
    setSources.mutate(
      { fixtureId: target.id, homeSourceFixtureId: homeSource === '' ? null : homeSource, awaySourceFixtureId: awaySource === '' ? null : awaySource },
      {
        onSuccess: () => {
          showToast('진출 연결을 저장했어요.', 'success');
          onClose();
        },
        onError: (error) => showToast(describeBracketCanvasError(error, '진출 연결을 저장하지 못했어요.'), 'error'),
      },
    );
  };

  if (!mounted) return null;
  const titleId = `${idPrefix}-title`;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px] tm-modal-scrim${closing ? ' is-closing' : ''}`}
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`tm-modal-panel w-full max-w-[440px] overflow-hidden bg-[var(--card-surface)] shadow-[var(--shadow-dropdown)]${closing ? ' is-closing' : ''}`}
        style={{ borderRadius: 'var(--radius-hero)' }}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 id={titleId} className="tm-text-body-lg font-bold" style={{ color: 'var(--text-strong)' }}>
            {mode === 'add' ? '경기 추가' : '진출 경기 연결'}
          </h2>
          <button
            type="button"
            aria-label="모달 닫기"
            onClick={() => !pending && onClose()}
            disabled={pending}
            className="flex size-11 items-center justify-center transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-40"
            style={{ borderRadius: 'var(--radius-control)', color: 'var(--text-muted)' }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {mode === 'add' ? (
          <div className="flex flex-col gap-4 px-5 py-5">
            {addableGroups.length === 0 ? (
              <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                경기를 추가할 수 있는 단계가 없어요. 템플릿으로 대진을 먼저 만들어 주세요.
              </p>
            ) : (
              <>
                <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                  고른 단계에 대진 미정 경기를 하나 만들어요. 팀은 만든 뒤 자리에서 정해요.
                </p>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${idPrefix}-group`} className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>추가할 단계</label>
                  <select id={`${idPrefix}-group`} className={SELECT_CLASS} style={{ minHeight: 44 }} value={groupId} onChange={(event) => setGroupId(event.target.value)}>
                    {addableGroups.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <Button variant="primary" size="md" disabled={addDisabled} loading={createFixture.isPending} onClick={handleAdd}>
              경기 추가
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-5 py-5">
            {linkable.length === 0 ? (
              <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>이전 단계 경기를 이어 줄 수 있는 경기가 없어요.</p>
            ) : (
              <>
                <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                  미정인 자리에 이전 경기의 {outcomeLabel}를 연결해요. 결과가 확정되면 기존 진출 처리로 팀이 들어가요.
                </p>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${idPrefix}-target`} className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>연결할 경기</label>
                  <select id={`${idPrefix}-target`} className={SELECT_CLASS} style={{ minHeight: 44 }} value={targetId} onChange={(event) => selectTarget(event.target.value)}>
                    {linkable.map((fixture) => (
                      <option key={fixture.id} value={fixture.id}>{fixtureTitle(fixture)}</option>
                    ))}
                  </select>
                </div>
                {(['HOME', 'AWAY'] as const).map((side) => (
                  <div key={side} className="flex flex-col gap-1">
                    <label htmlFor={`${idPrefix}-${side}`} className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>
                      {side === 'HOME' ? '홈 자리' : '어웨이 자리'}
                    </label>
                    <select
                      id={`${idPrefix}-${side}`}
                      className={SELECT_CLASS}
                      style={{ minHeight: 44 }}
                      value={side === 'HOME' ? homeSource : awaySource}
                      onChange={(event) => (side === 'HOME' ? setHomeSource(event.target.value) : setAwaySource(event.target.value))}
                    >
                      <option value="">연결 없음 · 직접 배정</option>
                      {sourceOptions(side === 'HOME' ? homeSource : awaySource).map((fixture) => (
                        <option key={fixture.id} value={fixture.id}>{`${fixtureTitle(fixture)} ${outcomeLabel}`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </>
            )}
            <Button variant="primary" size="md" disabled={linkDisabled} loading={setSources.isPending} onClick={handleLink}>
              연결 저장
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
