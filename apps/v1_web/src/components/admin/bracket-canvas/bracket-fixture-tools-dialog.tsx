'use client';

import { X } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useV1AddBracketFixture, useV1SetBracketSources } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { bracketExistingSource, bracketSourceCandidates, isFixtureLinkable, knockoutRoundLabel } from '@/lib/bracket-fixture-tools';
import { bracketTrackLabel } from '@/lib/bracket-track';
import type { V1AdminBracketFixture, V1AdminTournamentBracket, V1TournamentFormat } from '@/types/api';
import { BracketLeagueAddFixtureForm, type LeagueAddSubmit } from './bracket-league-add-fixture-form';

export type BracketFixtureToolsDialogProps = {
  open: boolean;
  mode: 'add' | 'link';
  format: V1TournamentFormat;
  tournamentId: string;
  bracket: V1AdminTournamentBracket;
  onClose: () => void;
  showToast: (message: string, variant?: 'success' | 'error') => void;
};

const SELECT_CLASS = 'tm-input';

export function BracketFixtureToolsDialog({ open, mode, format, tournamentId, bracket, onClose, showToast }: BracketFixtureToolsDialogProps) {
  const idPrefix = useId();
  const createFixture = useV1AddBracketFixture(tournamentId);
  const setSources = useV1SetBracketSources(tournamentId);
  const pending = createFixture.isPending || setSources.isPending;
  const { dialogRef, onBackdropClick, mounted, closing } = useModalA11y({ open, onClose, pending });

  const addableGroups = useMemo(
    () => [...bracket.groups].filter((group) => knockoutRoundLabel(group.phase) !== null).sort((a, b) => a.sortOrder - b.sortOrder),
    [bracket.groups],
  );
  const linkable = useMemo(
    () => bracket.fixtures
      .filter((fixture) => {
        const input = { target: fixture, groups: bracket.groups, fixtures: bracket.fixtures };
        const canChooseNewSources = isFixtureLinkable(fixture) && bracketSourceCandidates(input).length > 0;
        const hasExistingSource = fixture.bracketSources?.some((source) =>
          bracketExistingSource({ ...input, sourceFixtureId: source.fixtureId }) !== null,
        ) ?? false;
        return canChooseNewSources || hasExistingSource;
      })
      .sort((a, b) => a.fixtureNumber - b.fixtureNumber),
    [bracket.fixtures, bracket.groups],
  );
  const groupName = (fixture: V1AdminBracketFixture) => {
    const group = bracket.groups.find((candidate) => candidate.id === fixture.groupId);
    const trackLabel = bracketTrackLabel(group?.bracketTrack);
    return `${trackLabel ? `${trackLabel} · ` : ''}${group?.name ?? fixture.round}`;
  };
  const fixtureTitle = (fixture: V1AdminBracketFixture) => `${groupName(fixture)} ${fixture.fixtureNumber}번 경기`;

  const [groupId, setGroupId] = useState(addableGroups[0]?.id ?? '');
  const [targetId, setTargetId] = useState(linkable[0]?.id ?? '');
  const sourceOf = (fixture: V1AdminBracketFixture | undefined, side: 'HOME' | 'AWAY') => {
    const sourceId = fixture?.bracketSources?.find((source) => source.side === side)?.fixtureId ?? '';
    if (fixture === undefined || sourceId === '') return '';
    const input = { target: fixture, groups: bracket.groups, fixtures: bracket.fixtures };
    return bracketSourceCandidates(input).some((candidate) => candidate.id === sourceId)
      ? sourceId
      : bracketExistingSource({ ...input, sourceFixtureId: sourceId })?.id ?? '';
  };
  const [homeSource, setHomeSource] = useState(() => sourceOf(linkable[0], 'HOME'));
  const [awaySource, setAwaySource] = useState(() => sourceOf(linkable[0], 'AWAY'));

  const target = linkable.find((fixture) => fixture.id === targetId) ?? null;
  const candidates = target === null ? [] : bracketSourceCandidates({ target, groups: bracket.groups, fixtures: bracket.fixtures });
  const lockedSources = target?.bracketSources?.map((source) => source.fixtureId) ?? [];
  const requestedSources = [homeSource, awaySource].filter((sourceId) => sourceId !== '');
  const hasLockedMatch = target !== null && [target.id, ...lockedSources, ...requestedSources]
    .some((fixtureId) => {
      const fixture = bracket.fixtures.find((candidate) => candidate.id === fixtureId);
      return fixture === undefined || !isFixtureLinkable(fixture);
    });
  const optionsForSide = (side: 'HOME' | 'AWAY') => {
    const value = side === 'HOME' ? homeSource : awaySource;
    const existing = target === null || value === ''
      ? null
      : bracketExistingSource({ target, sourceFixtureId: value, groups: bracket.groups, fixtures: bracket.fixtures });
    return existing !== null && !candidates.some((candidate) => candidate.id === existing.id)
      ? [existing, ...candidates]
      : candidates;
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
  const linkDisabled = target === null || pending || hasLockedMatch;

  const submitting = useRef(false);

  const createFixtureAt = (target: { groupId: string; round: string; toastLabel: string }) => {
    if (submitting.current) return;
    submitting.current = true;
    createFixture.mutate(
      { groupId: target.groupId, round: target.round },
      {
        onSuccess: () => {
          showToast(`${target.toastLabel} 경기를 추가했어요. 칸을 눌러 팀을 넣어 주세요.`, 'success');
          onClose();
        },
        onError: (error) => showToast(describeBracketCanvasError(error, '경기를 추가하지 못했어요.'), 'error'),
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  };

  const handleAdd = () => {
    if (group === null) return;
    const round = knockoutRoundLabel(group.phase);
    if (round === null) return;
    createFixtureAt({ groupId: group.id, round, toastLabel: round });
  };

  const handleAddLeague = (input: LeagueAddSubmit) =>
    createFixtureAt({
      groupId: input.groupId,
      round: input.round,
      toastLabel: `${input.roundName} ${input.groupName}`,
    });

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
          format === 'league' ? (
            <BracketLeagueAddFixtureForm bracket={bracket} pending={createFixture.isPending} onSubmit={handleAddLeague} />
          ) : (
            <div className="flex flex-col gap-4 px-5 py-5">
              {addableGroups.length === 0 ? (
                <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                  경기를 추가할 수 있는 단계가 없어요. 템플릿으로 대진을 먼저 만들어 주세요.
                </p>
              ) : (
                <>
                  <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                    고른 단계에 대진 미정 경기를 하나 만들어요. 팀은 만든 뒤 칸에서 넣어요.
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
          )
        ) : (
          <div className="flex flex-col gap-4 px-5 py-5">
            {linkable.length === 0 ? (
              <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>이전 단계 경기를 이어 줄 수 있는 경기가 없어요.</p>
            ) : (
              <>
                {hasLockedMatch && (
                  <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                    시작된 경기가 있어 연결을 저장할 수 없어요. 기존 연결은 확인용으로 표시돼요.
                  </p>
                )}
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
                      {optionsForSide(side).map((fixture) => {
                        const isPreserved = !candidates.some((candidate) => candidate.id === fixture.id);
                        return (
                          <option key={fixture.id} value={fixture.id} disabled={isPreserved}>
                            {`${fixtureTitle(fixture)} ${outcomeLabel}${isPreserved ? ' · 현재 연결' : ''}`}
                          </option>
                        );
                      })}
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
