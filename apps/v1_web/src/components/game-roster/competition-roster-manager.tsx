'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { GameRosterClient } from '@/app/teams/[id]/games/[gameId]/roster/game-roster-client';
import { useV1Registration, useV1TeamDetail, useV1TeamUpcomingGames, useV1Tournament } from '@/hooks/use-v1-api';
import { useV1TeamGameRoster, useV1TeamGameRosters } from '@/hooks/use-v1-game-roster';
import { AlertBanner, EmptyState, ErrorState, SectionTitle } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { Button } from '@/components/v1-ui/button';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { closeOverlayThenNavigate } from '@/lib/overlay-history';
import { ParticipantRosterEditor } from './participant-roster-editor';
import { RosterManagerNavigation, type RosterEditor } from './roster-manager-navigation';
import styles from './competition-roster-manager.module.css';

type Entry = { teamId: string; gameId: string; competitionId?: never; registrationId?: never }
  | { competitionId: string; registrationId: string; teamId?: never; gameId?: never };

/** 세 진입점과 기존 알림 URL이 모두 이 셸을 사용한다. 탭 전환은 원래 출처와 선택 경기를 보존한다. */
export function CompetitionRosterManager(entry: Entry) {
  const search = useSearchParams();
  const initialRoster = useV1TeamGameRoster(entry.teamId ?? null, entry.gameId ?? null);
  const competitionId = entry.competitionId ?? initialRoster.data?.competitionId ?? '';
  const registrationId = entry.registrationId ?? initialRoster.data?.registrationId ?? initialRoster.data?.jerseyRegistrationId ?? null;
  const registration = useV1Registration(competitionId, registrationId ?? '');
  const teamId = entry.teamId ?? registration.data?.teamId ?? '';
  const team = useV1TeamDetail(teamId);
  const competition = useV1Tournament(competitionId);
  const manager = team.data?.viewer.role === 'owner' || team.data?.viewer.role === 'manager';
  const matrix = useV1TeamGameRosters(teamId, { enabled: manager });
  const upcoming = useV1TeamUpcomingGames(teamId, { enabled: !manager && Boolean(team.data) });
  const [tab, setTab] = useState<'players' | 'game'>(entry.gameId ? 'game' : 'players');
  const [selectedGame, setSelectedGame] = useState(entry.gameId ?? search.get('game') ?? '');
  const [pendingMove, setPendingMove] = useState<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);
  const editor = useRef<RosterEditor | null>(null);
  const ids = useId();
  const games = (manager ? matrix.data?.games : upcoming.data?.items.map(game => ({
    gameId: game.gameId, competitionId: game.tournamentId,
    opponentName: game.opponentName, scheduledAt: game.scheduledAt, gameState: 'SCHEDULED',
  })))?.filter(game => game.competitionId === competitionId) ?? [];
  const currentGame = games.some(game => game.gameId === selectedGame) || selectedGame === entry.gameId
    ? selectedGame : games.find(game => game.gameState === 'SCHEDULED')?.gameId ?? games[0]?.gameId ?? '';

  function move(action: () => void) {
    if (editor.current?.busy) return;
    if (editor.current?.dirty) setPendingMove(() => action);
    else action();
  }
  const navigation = useMemo(() => ({ editor, showPlayers: () => move(() => setTab('players')) }), []);
  async function finishMove(save: boolean) {
    const action = pendingMove;
    if (!action) return;
    setSaving(true);
    const success = !save || await editor.current?.save();
    setSaving(false);
    if (!success) { setPendingMove(null); return; }
    if (!save) editor.current?.discard();
    await closeOverlayThenNavigate(() => setPendingMove(null), action);
  }

  const entryQuery = entry.gameId ? initialRoster : registration;
  if (entryQuery.isError) return <ErrorState title="명단 정보를 불러오지 못했어요" message={extractErrorMessage(entryQuery.error, '명단 조회에 실패했어요.')} onRetry={() => void entryQuery.refetch()} />;
  if (!entryQuery.data) return <PageSkeleton variant="detail" />;
  const listQuery = manager ? matrix : upcoming;

  return <RosterManagerNavigation.Provider value={navigation}>
    <div className={styles.manager}>
      <header className={styles.context}>
        <p className="tm-text-caption">{competition.data?.title ?? '참가 명단'}{team.data ? ` · ${team.data.name}` : ''}</p>
        <SectionTitle title="명단 관리" />
      </header>
      <div className={styles.tabs} role="tablist" aria-label="명단 관리 메뉴">
        {(['players', 'game'] as const).map(key => <button key={key} type="button" role="tab"
          id={`${ids}-${key}`} aria-controls={`${ids}-panel`} aria-selected={tab === key}
          onClick={() => { if (key !== tab) move(() => setTab(key)); }}>
          {key === 'players' ? '참가 선수' : '경기 출전'}
        </button>)}
      </div>
      <div role="tabpanel" id={`${ids}-panel`} aria-labelledby={`${ids}-${tab}`}>
        {tab === 'players' ? registrationId ? <ParticipantRosterEditor
          key={registrationId} tournamentId={competitionId} registrationId={registrationId}
        /> : <div className={styles.message}><AlertBanner tone="info" message="등록된 참가 명단이 없거나 참가 명단 관리 권한이 없어요. 신청 내역을 확인하거나 팀장에게 문의해 주세요." /></div> : <>
          <div className={styles.picker}>
            <label className="tm-text-caption" htmlFor={`${ids}-game-select`}>출전을 관리할 경기</label>
            <select className="tm-input" id={`${ids}-game-select`} value={currentGame} disabled={listQuery.isLoading || games.length === 0}
              onChange={event => { const next = event.target.value; move(() => setSelectedGame(next)); }}>
              {!games.some(game => game.gameId === currentGame) && currentGame ? <option value={currentGame}>
                {formatTournamentDateTimeShort(initialRoster.data?.deadline) ?? '일정 미정'} · vs {initialRoster.data?.opponentName ?? '상대팀 미정'}
              </option> : null}
              {!currentGame ? <option value="">등록된 경기 없음</option> : null}
              {games.map(game => <option value={game.gameId} key={game.gameId}>
                {formatTournamentDateTimeShort(game.scheduledAt) ?? '일정 미정'} · vs {game.opponentName ?? '상대팀 미정'}
              </option>)}
            </select>
            {listQuery.isError ? <ErrorState title="경기 목록을 불러오지 못했어요" message={extractErrorMessage(listQuery.error, '경기 목록 조회에 실패했어요.')} onRetry={() => void listQuery.refetch()} /> : null}
          </div>
          {currentGame ? <GameRosterClient key={currentGame} teamId={teamId} gameId={currentGame} /> : listQuery.isLoading ? <PageSkeleton variant="list" /> : !listQuery.isError ? <EmptyState title="등록된 경기가 없어요" sub="경기가 배정되면 여기서 출전 선수를 관리할 수 있어요. 참가 선수는 지금 관리할 수 있어요." /> : null}
        </>}
      </div>
    </div>
    <BottomSheet open={pendingMove !== null} title="변경사항을 저장할까요?" onClose={() => { if (!saving) setPendingMove(null); }}>
      <div className={styles.leave}>
        <p className="tm-text-caption">선택한 탭이나 경기로 이동하기 전에 저장할 수 있어요.</p>
        <Button block loading={saving} onClick={() => void finishMove(true)}>저장하고 이동</Button>
        <Button block variant="outline" disabled={saving} onClick={() => void finishMove(false)}>저장하지 않고 이동</Button>
        <Button block variant="ghost" disabled={saving} onClick={() => setPendingMove(null)}>계속 수정</Button>
      </div>
    </BottomSheet>
  </RosterManagerNavigation.Provider>;
}
