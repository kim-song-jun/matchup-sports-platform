'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/v1-ui/button';
import { AlertBanner, SectionTitle } from '@/components/v1-ui/primitives';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useMultiFinals, type MultiFinalPolicy, type MultiFinalView } from '@/hooks/use-multi-finals';
import { useV1AdminBracket } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { sameGroupPairs } from '@/lib/multi-final-same-group';
import { choosePick, describeTies, fillTieSeats, initialPicks, initialSeats, keepPicked, pickKey, placeTeam, requireSeats, tiedSeats, tiePicksPayload, tiePositionCaption, TIE_SEAT_REQUIRED, type TiePickMap } from '@/lib/multi-final-ties';
import { BracketLeagueStandings } from './bracket-league-standings';

const control = 'h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 tm-text-label';
const controlUnset = 'h-11 w-full rounded-xl border border-[var(--orange700)] bg-[var(--card-surface)] px-3 tm-text-label';
type Props = { tournamentId: string; open: boolean; onClose: () => void; onApplied: () => void };
export function MultiFinalAssignmentDialog({ tournamentId, open, onClose, onApplied }: Props) {
  const api = useMultiFinals(tournamentId, open);
  const bracket = useV1AdminBracket(open ? tournamentId : '');
  const [view, setView] = useState<MultiFinalView | null>(null);
  const [name, setName] = useState('');
  const [ids, setIds] = useState<Array<string | null>>([]);
  const [picks, setPicks] = useState<TiePickMap>({});
  const [policy, setPolicy] = useState<MultiFinalPolicy>('rank_order');
  const [sourceVersion, setSourceVersion] = useState('');
  const [needsRecommendation, setNeedsRecommendation] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const initialized = useRef(false);
  const content = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { confirm, ConfirmModal } = useConfirm();
  const busy = api.assign.isPending || api.assignmentPreview.isPending;
  async function close() {
    if (busy) return;
    if (dirty && !await confirm({ title: '진출팀 배정 닫기', message: '확정하지 않은 배치를 닫을까요?', confirmLabel: '닫기' })) return;
    onClose();
  }
  const { mounted, dialogRef, onBackdropClick } = useModalA11y({ open, onClose: () => void close(), pending: busy });
  function loadFinal(next: MultiFinalView, finalName: string) {
    const final = next.finals.find(row => row.name === finalName);
    const seats = final ? initialSeats(final) : [];
    setView(next); setName(finalName); setIds(seats); setPicks(final ? initialPicks(final, seats) : {});
    setPolicy(final?.assignmentPolicy ?? 'rank_order'); setSourceVersion(''); setNeedsRecommendation(false);
    setDirty(false); setReviewing(false); setError('');
  }
  useEffect(() => {
    if (!open) { initialized.current = false; setView(null); return; }
    if (initialized.current || !api.view.data || api.view.isFetching || api.view.isError) return;
    initialized.current = true; loadFinal(api.view.data, api.view.data.finals[0]?.name ?? '');
  }, [open, api.view.data, api.view.isFetching, api.view.isError]);
  useEffect(() => { if (content.current) content.current.scrollTop = 0; }, [reviewing, error]);
  if (!mounted || typeof document === 'undefined') return null;
  const final = view?.finals.find(row => row.name === name);
  const registrations = view?.registrations ?? [];
  const complete = Boolean(view?.groupStandings?.length) && view!.groupStandings!.every(group => group.complete);
  const groups = bracket.data?.groups.filter(group => group.phase !== 'group' && group.bracketTrack === name) ?? [];
  const groupIds = new Set(groups.map(group => group.id));
  const slots = bracket.data?.slots.filter(slot => slot.kind === 'GROUP_RANK' && slot.groupId !== null && groupIds.has(slot.groupId)).sort((a, b) => a.position - b.position) ?? [];
  const fixtures = bracket.data?.fixtures.filter(fixture => fixture.groupId !== null && groupIds.has(fixture.groupId)).sort((a, b) => a.fixtureNumber - b.fixtureNumber) ?? [];
  const started = fixtures.some(fixture => fixture.status !== 'scheduled' || fixture.game === null || fixture.game.state !== 'SCHEDULED' || fixture.game.hasLiveRecords || fixture.game.hasOfficialResult);
  const rulesConfigured = slots.length > 0 && (final?.rules.length === slots.length || final?.registrationIds?.length === slots.length);
  const ready = rulesConfigured && complete && Boolean(view?.generated) && slots.length > 0 && fixtures.length > 0 && !started && !api.view.isError && !bracket.isError;
  const teamName = (id: string) => registrations.find(row => row.id === id)?.team.name ?? '확정 명단에 없는 팀';
  const otherIds = new Set(view?.finals.filter(row => row.name !== name).flatMap(row => row.registrationIds ?? []) ?? []);
  // A started tournament can't be re-assigned, so its ties are neither shown nor required.
  const seats = final && !started ? tiedSeats(final) : [];
  const ties = view && final && !started ? describeTies(view, final) : [];
  const seated = ids.flatMap(id => (id === null ? [] : [id]));
  const crossPolicy = policy === 'cross_group_top3';
  // In rank order a pick settles its seat once its team is on the roster; cross, or a recommendation still to make, places it next.
  const openSeats = seats.filter(entry => { const picked = picks[pickKey(entry)]; return !picked || !crossPolicy && !needsRecommendation && !ids.includes(picked); });
  const openTieSeat = openSeats.length > 0;
  const takenByOtherSeat = (key: string, id: string) => Object.entries(picks).some(([other, picked]) => other !== key && picked === id);
  // A seed with no team yet stays put; a picked team is tracked by identity, so it can be moved like any other.
  const pinned = (index: number) => ids[index] == null;
  // A cross roster is redrawn from the picks, so its current seeds don't rule a candidate out.
  const candidatesOf = (seat: { groupId: string; rank: number; candidates: string[] }) => {
    const own = picks[pickKey(seat)];
    return seat.candidates.filter(id => id === own || !otherIds.has(id) && !takenByOtherSeat(pickKey(seat), id) && (crossPolicy || !ids.includes(id)));
  };
  const lastRoundGroupIds = new Set(groups.filter(group => group.phase === 'final' || group.phase === 'third_place').map(group => group.id));
  const rematches = reviewing && policy === 'rank_order' ? sameGroupPairs({ fixtures, slots, seeds: seated,
    groupOf: id => view?.groupStandings?.find(group => group.rows.some(row => row.registrationId === id))?.groupId }) : null;
  async function chooseFinal(next: string) {
    if (!view || busy) return;
    if (dirty && !await confirm({ title: '다른 토너먼트 선택', message: '현재 토너먼트의 확정하지 않은 변경을 버릴까요?', confirmLabel: '변경 버리기' })) return;
    loadFinal(view, next);
  }
  async function reload() {
    if (dirty && !await confirm({ title: '최신 설정 불러오기', message: '확정하지 않은 배치를 지우고 최신 설정을 불러올까요?', confirmLabel: '다시 불러오기' })) return;
    const [result] = await Promise.all([api.view.refetch(), bracket.refetch()]);
    if (result.isError || !result.data) { setError('최신 설정을 불러오지 못했어요. 다시 시도해 주세요.'); return; }
    loadFinal(result.data, result.data.finals.some(row => row.name === name) ? name : result.data.finals[0]?.name ?? '');
  }
  async function recommend() {
    if (!view) return;
    try {
      setError('');
      const result = await api.assignmentPreview.mutateAsync({ expectedRevision: view.revision, finalName: name, assignmentPolicy: policy, tiePicks: tiePicksPayload(seats, picks) });
      setIds(crossPolicy ? result.registrationIds : fillTieSeats(result.registrationIds, seats, picks));
      setSourceVersion(result.sourceVersion); setNeedsRecommendation(false); setDirty(true);
    } catch (err) { setError(extractErrorMessage(err, '추천 배치를 만들지 못했어요.')); }
  }
  async function review() {
    if (!view) return;
    try {
      setError('');
      if (!ready) throw new Error('예선 공식 결과와 해당 토너먼트의 시작 전 대진을 먼저 확인해 주세요.');
      if (needsRecommendation) throw new Error('선택한 방식으로 추천 배치를 먼저 만들어 주세요.');
      if (openTieSeat) throw new Error(TIE_SEAT_REQUIRED);
      if (ids.length !== slots.length || seated.length !== ids.length || new Set(ids).size !== ids.length) throw new Error(`진출팀을 중복 없이 ${slots.length}팀 선택해 주세요.`);
      if (seated.some(id => !registrations.some(row => row.id === id) || otherIds.has(id))) throw new Error('미확정 팀이나 다른 토너먼트에 배정된 팀은 제외해 주세요.');
      if (!sourceVersion) {
        const result = await api.assignmentPreview.mutateAsync({ expectedRevision: view.revision, finalName: name, assignmentPolicy: policy, tiePicks: tiePicksPayload(seats, picks) });
        setSourceVersion(result.sourceVersion);
      }
      setReviewing(true);
    } catch (err) { setError(extractErrorMessage(err, '배치를 확인하지 못했어요.')); }
  }
  async function save() {
    if (!view) return;
    try {
      setError('');
      const result = await api.assign.mutateAsync({ expectedRevision: view.revision, finalName: name, assignmentPolicy: policy, registrationIds: requireSeats(ids), sourceVersion, tiePicks: tiePicksPayload(seats, picks) });
      loadFinal(result, name); onApplied();
    } catch (err) { setError(extractErrorMessage(err, '진출팀을 배정하지 못했어요.')); }
  }
  const matesOf = (key: string, candidates: readonly string[]) => candidates.filter(id => !takenByOtherSeat(key, id));
  function edit(next: Array<string | null>, nextPicks: TiePickMap = picks) {
    const kept = keepPicked(nextPicks, ids, next);
    // A manual edit is rank order with nothing left to recommend: seat any pick still waiting for its team, or drop it.
    const placed = seats.reduce((rows, entry) => {
      const id = kept[pickKey(entry)];
      return id && !rows.includes(id) ? choosePick(rows, { seat: entry.seat, mates: matesOf(pickKey(entry), entry.tiedRegistrationIds), previous: undefined, id, capacity: slots.length }) : rows;
    }, next);
    setIds(placed); setPicks(Object.fromEntries(Object.entries(kept).filter(([, id]) => placed.includes(id)))); setPolicy('rank_order'); setNeedsRecommendation(false); setDirty(true);
  }
  // With tied seats open the seat numbers must not shift, so a removed team leaves its seat empty instead of closing the gap.
  const drop = (remove: (id: string) => boolean) => seats.length > 0
    ? ids.map(id => (id !== null && remove(id) ? null : id))
    : ids.filter(id => id === null || !remove(id));
  function check(id: string) {
    const next = placeTeam(ids, seats, id);
    // Picks follow the team, so a tied team re-added anywhere settles its open seat; prefer the seat it actually landed in.
    const own = seats.filter(entry => !picks[pickKey(entry)] && entry.tiedRegistrationIds.includes(id));
    const landed = own.find(entry => next[entry.seat] === id) ?? own[0];
    edit(next, landed ? { ...picks, [pickKey(landed)]: id } : picks);
  }
  function choose(seat: { seat: number; groupId: string; rank: number; candidates: string[] }, id: string) {
    const key = pickKey(seat); const { [key]: previous, ...others } = picks;
    const next = id ? { ...others, [key]: id } : others;
    if (crossPolicy) { setPicks(next); setNeedsRecommendation(true); setSourceVersion(''); setDirty(true); return; }
    const rows = choosePick(ids, { seat: seat.seat, mates: matesOf(key, seat.candidates), previous, id, capacity: slots.length });
    if (id && !rows.includes(id)) { setError('진출팀 자리가 다 차서 고른 팀을 넣을 수 없어요. 먼저 다른 팀을 빼 주세요.'); return; }
    setError(''); edit(rows, next);
  }
  return createPortal(<div className="fixed inset-0 flex items-center justify-center p-4 tm-modal-scrim" style={{ zIndex: 'var(--z-modal)' }} onClick={onBackdropClick}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="tm-modal-panel flex max-h-[90dvh] w-full max-w-3xl flex-col rounded-2xl bg-[var(--card-surface)]">
      <div className="shrink-0 border-b border-[var(--border)] p-4">
        <h2 id={titleId} className="tm-text-heading">토너먼트별 진출팀 배정</h2>
        <p className="mt-2 tm-text-caption">{reviewing ? '2. 대진 확인 후 확정' : '1. 토너먼트와 진출팀 선택'}</p>
      </div>
      <div ref={content} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {error && <AlertBanner tone="error" message={error} />}
        {!view ? api.view.isError ? <div role="alert"><p>설정을 불러오지 못했어요.</p><Button variant="neutral" onClick={() => void api.view.refetch()}>다시 시도</Button></div> : <p role="status">설정을 불러오고 있어요.</p> : <fieldset disabled={busy} className="min-w-0 space-y-4">
          <label className="block tm-text-label">배정할 토너먼트<select className={control} value={name} disabled={reviewing} onChange={event => void chooseFinal(event.target.value)}>
            {view.finals.map(row => <option key={row.name} value={row.name}>{row.name} · {row.registrationIds == null ? '미배정' : `${row.registrationIds.length}팀 배정됨`}</option>)}
          </select></label>
          {final?.standingsChanged && <AlertBanner tone="warning" message="마지막 배정 이후 조별 순위나 결과가 바뀌었어요. 현재 결선 배정과 최신 순위를 비교해 다시 확인해 주세요." />}
          {api.view.isError && <AlertBanner tone="warning" message="설정을 다시 불러오지 못했어요. 최신 설정 다시 불러오기를 눌러 주세요." />}
          {!view.generated && <AlertBanner tone="warning" message="예선·토너먼트 대진 생성에서 빈 결선 대진을 먼저 만들어 주세요." />}
          {view.generated && slots.length > 0 && !rulesConfigured && <AlertBanner tone="warning" message="토너먼트 배정 규칙에서 자리 수에 맞게 순위별 목적지를 먼저 설정해 주세요." />}
          {!complete && <AlertBanner tone="warning" message="예선 경기가 모두 끝나고 공식 순위가 반영된 뒤 배정할 수 있어요." />}
          {bracket.isError ? <div role="alert"><p>대진을 불러오지 못했어요.</p><Button variant="neutral" onClick={() => void bracket.refetch()}>대진 다시 시도</Button></div> : bracket.isLoading ? <p role="status">대진을 불러오고 있어요.</p> : null}
          {started && <AlertBanner tone="warning" message="이 토너먼트는 시작했거나 기록·결과가 있어 진출팀을 다시 배정할 수 없어요." />}
          {!reviewing ? <>
            <SectionTitle title="조별 공식 순위" />
            <p className="tm-text-caption">추천은 아래 공식 순위를 그대로 사용해요. 저장한 진출팀은 이후 순위가 바뀌어도 유지돼요.</p>
            <BracketLeagueStandings groups={(view.groupStandings ?? []).map(group => ({ groupId: group.groupId, name: `${group.name}${group.complete ? ' · 확정' : ' · 진행 중'}`, rows: group.rows.map(row => ({ registrationId: row.registrationId, teamName: row.teamName, rank: row.position ?? 0, played: row.wins + row.draws + row.losses, wins: row.wins, draws: row.draws, losses: row.losses, goalDifference: row.goalsFor - row.goalsAgainst, points: row.points, tied: row.tiedRegistrationIds.length > 0 })) }))} />
            {ties.map(tie => <div key={tie.key} className="space-y-3">
              {tie.seats.some(seat => !picks[pickKey(seat)]) && <AlertBanner tone="warning" message={tie.banner} />}
              <p className="tm-text-caption">{tie.detail}</p>
              {tie.seats.map(seat => {
                const picked = picks[pickKey(seat)];
                const position = tiePositionCaption({ policy, seat: seat.seat, pick: picked, ids, stale: needsRecommendation });
                return <div key={seat.seat} className="space-y-1">
                  <label className="block tm-text-label">{seat.label}<select className={picked ? control : controlUnset} value={picked ?? ''} disabled={!ready} onChange={event => choose(seat, event.target.value)}>
                    <option value="">팀 선택</option>
                    {candidatesOf(seat).map(id => <option key={id} value={id}>{teamName(id)}</option>)}
                  </select></label>
                  {position && <p className="tm-text-caption">{position}</p>}
                  {seat.hint && <p className="tm-text-caption">{seat.hint}</p>}
                </div>;
              })}
            </div>)}
            <label className="block tm-text-label">진출팀 배치 방식<select className={control} value={policy} disabled={!ready} onChange={event => { setPolicy(event.target.value as MultiFinalPolicy); setNeedsRecommendation(true); setDirty(true); setSourceVersion(''); }}>
              <option value="rank_order">기본 순위 순서 · 수동 조정 가능</option>
              {final?.crossGroupTopThreeAvailable && <option value="cross_group_top3">1위 부전승 · 2위 교차 고정 · 3위 같은 조 회피</option>}
            </select></label>
            {crossPolicy && seats.length > 0 && <p className="tm-text-caption">동률 자리에 올릴 팀을 먼저 고르면 고른 순위로 교차 배치해요.</p>}
            {crossPolicy && <p className="tm-text-caption">예선 조 순서대로 1위를 부전승 배치해요. 2위는 다음 조로 교차 고정하고, 3위는 12강과 8강에서 같은 조를 만나지 않도록 무작위 배치해요.</p>}
            <Button variant="neutral" disabled={!ready || crossPolicy && openTieSeat} onClick={() => void recommend()}>{crossPolicy ? '무작위 추천 배치 만들기' : '공식 순위로 추천 배치 만들기'}</Button>
            {openTieSeat && policy === 'rank_order' && <p className="tm-text-caption">동률인 {openSeats.map(entry => entry.seat + 1).join('·')}번 시드는 비워 두고 나머지 {slots.length - openSeats.length}자리만 채워요. 위에서 팀을 고르면 그 자리가 채워져요.</p>}
            <SectionTitle title={`${name || '토너먼트'} 진출팀 · ${seated.length}/${slots.length}팀`} />
            <p className="tm-text-caption">팀 선택이나 시드 순서를 직접 바꾸면 기본 수동 배치로 전환돼요. 다른 토너먼트에서 이미 확정한 팀은 중복 선택할 수 없어요.</p>
            {seated.some(id => !registrations.some(row => row.id === id)) && <Button variant="neutral" onClick={() => edit(drop(id => !registrations.some(row => row.id === id)))}>확정 명단에 없는 팀 제외</Button>}
            <div className="grid gap-2 sm:grid-cols-2">{registrations.map(reg => <label key={reg.id} className="flex min-h-11 items-center gap-2 tm-text-label">
              <input type="checkbox" checked={ids.includes(reg.id)} disabled={!ready || otherIds.has(reg.id) && !ids.includes(reg.id)} onChange={event => event.target.checked ? check(reg.id) : edit(drop(id => id === reg.id))} />
              <span>{reg.team.name}{otherIds.has(reg.id) ? ' · 다른 토너먼트에 배정됨' : ''}</span>
            </label>)}</div>
          </> : <>
            {policy === 'cross_group_top3' && <AlertBanner tone="warning" message="4강에서는 같은 조 팀이 다시 만날 수 있어요" />}
            <SectionTitle title={`${name} 대진 확인`} />
            <p className="tm-text-label">이 토너먼트만 확정해요. 다른 토너먼트와 예선 결과·경기 일정은 유지돼요.</p>
            {slots.filter(slot => slot.byeSortOrder != null).map(slot => <p key={slot.id} className="tm-text-label">부전승 · {teamName(seated[slot.position - 1])} → 다음 라운드 직행</p>)}
            {groups.map(group => <section key={group.id} className="space-y-2"><h3 className="tm-text-body font-semibold">{group.name}</h3>{fixtures.filter(fixture => fixture.groupId === group.id).map(fixture => {
              const label = (side: 'HOME' | 'AWAY') => {
                const slot = slots.find(slot => slot.id === (side === 'HOME' ? fixture.homeSlotId : fixture.awaySlotId));
                if (slot) return teamName(seated[slot.position - 1]);
                const edge = fixture.bracketSources?.find(edge => edge.side === side);
                const source = fixtures.find(row => row.id === edge?.fixtureId);
                return source ? `${source.fixtureNumber}경기 ${edge?.outcome === 'LOSER' ? '패자' : '승자'}` : '진출팀 미정';
              };
              const pairs = lastRoundGroupIds.has(fixture.groupId ?? '') ? [] : rematches?.get(fixture.id) ?? [];
              return <div key={fixture.id} className="flex flex-col gap-1">
                <p className="tm-text-label">{fixture.fixtureNumber}경기 · {label('HOME')} vs {label('AWAY')}</p>
                {pairs.length > 0 && <span className="tm-text-caption font-semibold text-[var(--orange700)]">같은 조 재대결 가능: {pairs.map(([home, away]) => `${teamName(home)} vs ${teamName(away)}`).join(' · ')}</span>}
              </div>;
            })}</section>)}
          </>}
          <SectionTitle title="시드 순서" />
          <ol className="space-y-2">{ids.map((id, index) => <li key={`${id}:${index}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 tm-text-label">
            {id === null ? <span className="text-[var(--orange700)]">{index + 1}번 시드 · 팀 선택 필요</span> : <span>{index + 1}번 시드 · {teamName(id)}</span>}{!reviewing && <div className="flex gap-2">
              <Button variant="neutral" aria-label={`${id === null ? `${index + 1}번 시드` : teamName(id)} 시드 올리기`} disabled={!ready || index === 0 || pinned(index) || pinned(index - 1)} onClick={() => { const next = [...ids]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; edit(next); }}>위로</Button>
              <Button variant="neutral" aria-label={`${id === null ? `${index + 1}번 시드` : teamName(id)} 시드 내리기`} disabled={!ready || index === ids.length - 1 || pinned(index) || pinned(index + 1)} onClick={() => { const next = [...ids]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; edit(next); }}>아래로</Button>
            </div>}
          </li>)}</ol>
          <Button variant="neutral" onClick={() => void reload()}>최신 설정 다시 불러오기</Button>
        </fieldset>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] p-4">
        {!reviewing && openTieSeat && <p className="mr-auto flex-[1_1_240px] tm-text-caption">{TIE_SEAT_REQUIRED}</p>}
        <Button variant="neutral" disabled={busy} onClick={() => void close()}>닫기</Button>
        {reviewing && <Button variant="neutral" disabled={busy} onClick={() => setReviewing(false)}>이전</Button>}
        <Button variant="primary" disabled={!ready || busy || !reviewing && openTieSeat} onClick={() => void (reviewing ? save() : review())}>{busy ? '처리 중…' : reviewing ? `${name} 진출팀 확정` : '선택한 토너먼트 대진 확인'}</Button>
      </div>
    </div>{ConfirmModal}
  </div>, document.body);
}
