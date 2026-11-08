import type { MultiFinalPolicy, MultiFinalTiePick, MultiFinalView } from '@/hooks/use-multi-finals';
import { josa } from '@/lib/korean';

type Final = MultiFinalView['finals'][number];
type Destination = { finalName: string };

/** A seed this final fills from a group rank whose tie the standings broke only by the seeded draw. */
export type TiedSeat = { seat: number; rank: number; groupId: string; tiedRegistrationIds: string[] };
export type TieNotice = {
  key: string;
  banner: string;
  detail: string;
  seats: Array<{ seat: number; groupId: string; rank: number; label: string; hint: string | null; candidates: string[] }>;
};
/** The operator's tie choices, keyed by `pickKey`; a choice follows the team, not the seed it happens to sit in. */
export type TiePickMap = Record<string, string>;

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/** Seats (0-based seed index = rule index) the operator has to pick, in seed order. */
export function tiedSeats(final: Final): TiedSeat[] {
  return final.unresolved.flatMap((rule) => {
    const seat = final.rules.findIndex((row) => row.groupId === rule.groupId && row.rank === rule.rank);
    return rule.state === 'tied' && seat >= 0
      ? [{ seat, rank: rule.rank, groupId: rule.groupId, tiedRegistrationIds: rule.tiedRegistrationIds }]
      : [];
  }).sort((left, right) => left.seat - right.seat);
}

/** Saved roster, else the settled recommendation with null left at every tied seat. */
export function initialSeats(final: Final): Array<string | null> {
  if (final.registrationIds != null) return final.registrationIds;
  const tied = tiedSeats(final);
  // A rule that is still waiting on results leaves its seat out of the suggestion, so seats can't be mapped back.
  if (tied.length === 0 || tied.length !== final.unresolved.length) return final.suggestedRegistrationIds;
  const open = new Set(tied.map((entry) => entry.seat));
  let next = 0;
  return final.rules.map((_, index) => (open.has(index) ? null : final.suggestedRegistrationIds[next++]));
}

export const pickKey = (seat: { groupId: string; rank: number }) => `${seat.groupId}:${seat.rank}`;

/** Saved picks for the current tie seats; a roster saved before picks existed gets them back from the team sitting in its rule-order seat. */
export function initialPicks(final: Final, ids: ReadonlyArray<string | null>): TiePickMap {
  const legacy = final.registrationIds != null && (final.assignmentPolicy ?? 'rank_order') === 'rank_order';
  return Object.fromEntries(tiedSeats(final).flatMap((seat) => {
    const stored = final.tiePicks.find((pick) => pick.groupId === seat.groupId && pick.rank === seat.rank)?.registrationId;
    const id = [stored, legacy ? ids[seat.seat] : null].find((candidate) => candidate != null && seat.tiedRegistrationIds.includes(candidate));
    return id ? [[pickKey(seat), id]] : [];
  }));
}

/** Picks that still name a team on the roster. */
export function keepPicked(picks: TiePickMap, ids: ReadonlyArray<string | null>): TiePickMap {
  return Object.fromEntries(Object.entries(picks).filter(([, id]) => ids.includes(id)));
}

/** One pick per tie seat that has one, in the order the server expects them; undefined when there is nothing to send. */
export function tiePicksPayload(seats: readonly TiedSeat[], picks: TiePickMap): MultiFinalTiePick[] | undefined {
  const sent = seats.flatMap((seat) => (picks[pickKey(seat)] ? [{ groupId: seat.groupId, rank: seat.rank, registrationId: picks[pickKey(seat)] }] : []));
  return sent.length > 0 ? sent : undefined;
}

/** A rank-order roster: swap the previous pick wherever it moved to, else take the tie seat, else the first empty seed, else the end. */
export function choosePick(ids: ReadonlyArray<string | null>, seat: number, previous: string | undefined, id: string): Array<string | null> {
  const at = previous ? ids.indexOf(previous) : -1;
  if (at >= 0) return ids.map((row, index) => (index === at ? id || null : row));
  if (!id) return [...ids];
  if ((ids[seat] ?? null) === null) return Array.from({ length: Math.max(ids.length, seat + 1) }, (_, index) => (index === seat ? id : ids[index] ?? null));
  const empty = ids.indexOf(null);
  return empty >= 0 ? ids.map((row, index) => (index === empty ? id : row)) : [...ids, id];
}

/** A rank-order recommendation leaves tied seats null; the operator's picks go back into them. */
export function fillTieSeats(ids: ReadonlyArray<string | null>, seats: readonly TiedSeat[], picks: TiePickMap): Array<string | null> {
  return ids.map((row, index) => {
    const seat = seats.find((entry) => entry.seat === index);
    return row === null && seat ? picks[pickKey(seat)] ?? null : row;
  });
}

/** Where the picked team really sits: the roster once it is settled, else what the next recommendation will do. */
export function tiePositionCaption(input: { policy: MultiFinalPolicy; seat: number; pick: string | undefined; ids: ReadonlyArray<string | null>; stale: boolean }): string | null {
  const { policy, seat, pick, ids, stale } = input;
  if (policy === 'cross_group_top3') {
    if (!pick) return null;
    return ids.includes(pick) && !stale ? `지금 ${ids.indexOf(pick) + 1}번 시드예요.` : '교차 배치 추천을 만들면 시드가 정해져요.';
  }
  if (!pick) return `고르면 ${seat + 1}번 시드에 들어가요.`;
  return ids.includes(pick) && !stale ? `지금 ${ids.indexOf(pick) + 1}번 시드예요.` : `추천 배치를 만들면 ${seat + 1}번 시드에 들어가요.`;
}

export const TIE_SEAT_REQUIRED = '동률 자리를 골라야 대진을 확인할 수 있어요.';

export function requireSeats(seats: ReadonlyArray<string | null>): string[] {
  const filled = seats.filter((id): id is string => id !== null);
  if (filled.length !== seats.length) throw new Error(TIE_SEAT_REQUIRED);
  return filled;
}

/** A tied candidate takes an open seat of its own bundle; anyone else skips every tie seat so a seat only ever holds one of its candidates. */
export function placeTeam(ids: ReadonlyArray<string | null>, seats: readonly TiedSeat[], id: string): Array<string | null> {
  const isTieSeat = (index: number) => seats.some((entry) => entry.seat === index);
  const own = seats.find((entry) => ids[entry.seat] == null && entry.tiedRegistrationIds.includes(id));
  const open = own ? own.seat : ids.findIndex((row, index) => row === null && !isTieSeat(index));
  return open >= 0 ? ids.map((row, index) => (index === open ? id : row)) : [...ids, id];
}

function destinationOf(view: MultiFinalView, groupId: string, rank: number): Destination | null {
  for (const final of view.finals) {
    const index = final.rules.findIndex((rule) => rule.groupId === groupId && rule.rank === rank);
    if (index >= 0) return { finalName: final.name };
  }
  return null;
}

/** One notice per tied bundle this tournament has an open seat in, with the picks that settle it. */
export function describeTies(view: MultiFinalView, final: Final): TieNotice[] {
  const bundles = new Map<string, TiedSeat[]>();
  for (const seat of tiedSeats(final)) {
    const key = `${seat.groupId}:${[...seat.tiedRegistrationIds].sort().join(',')}`;
    bundles.set(key, [...(bundles.get(key) ?? []), seat]);
  }
  return [...bundles].flatMap(([key, seats]) => {
    const group = view.groupStandings?.find((entry) => entry.groupId === seats[0].groupId);
    const members = group?.rows.flatMap((row) => (seats[0].tiedRegistrationIds.includes(row.registrationId) && row.position !== null ? [{ ...row, position: row.position }] : []));
    if (!group || !members || members.length === 0) return [];
    members.sort((left, right) => left.position - right.position);
    const places = members.map((member) => ({ rank: member.position, destination: destinationOf(view, group.groupId, member.position) }));
    const placeName = (destination: Destination | null) => destination?.finalName ?? '진출 없음';
    const splits = new Set(places.map((place) => place.destination?.finalName ?? null)).size > 1;
    const split = places.map((place, index) => {
      const name = placeName(place.destination);
      return `${place.rank}위는 ${index === places.length - 1 ? josa(name, ['으로', '로']) : name}`;
    }).join(', ');
    const banner = `${group.name} ${places.map((place) => `${place.rank}위`).join('·')}가 완전 동률이에요. ${
      splits ? `${split} 갈라지는 자리라 직접 골라야 해요.` : '같은 토너먼트 안에서 시드가 달라지는 자리라 직접 골라야 해요.'}`;
    const first = members[0];
    const detail = `승점 ${first.points} · 골득실 ${signed(first.goalsFor - first.goalsAgainst)} · 득점 ${first.goalsFor} · 맞대결·페어플레이까지 같아서 추첨으로만 갈렸어요.`;
    const ownRanks = new Set(seats.map((seat) => seat.rank));
    const others = places.filter((place) => !(place.destination?.finalName === final.name && ownRanks.has(place.rank)));
    const otherLabels = others.map((place) => (place.destination ? `${place.destination.finalName} ${place.rank}위 자리` : null));
    const hint = others.length === 0 ? null
      : otherLabels.every((label) => label === null) ? '고르지 않은 팀은 진출하지 못해요.'
        : `고르지 않은 팀은 ${josa(otherLabels.map((label) => label ?? '진출 없음').join(', '), ['으로', '로'])} 가요.`;
    return [{
      key, banner, detail,
      seats: seats.map((seat) => ({
        seat: seat.seat, groupId: seat.groupId, rank: seat.rank,
        label: `${final.name} ${seat.rank}위 자리에 보낼 팀`,
        hint, candidates: seat.tiedRegistrationIds,
      })),
    }];
  });
}
