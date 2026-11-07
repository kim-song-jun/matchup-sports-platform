import type { MultiFinalView } from '@/hooks/use-multi-finals';
import { josa } from '@/lib/korean';

type Final = MultiFinalView['finals'][number];
type Destination = { finalName: string; seed: number };

/** A rank this tournament draws from that the stored standings only separated by the seeded draw. */
export type TiedSeat = { seat: number; rank: number; groupId: string; tiedRegistrationIds: string[] };
export type TieNotice = {
  key: string;
  banner: string;
  detail: string;
  seats: Array<{ seat: number; label: string; hint: string | null; candidates: string[] }>;
};

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

export function requireSeats(seats: ReadonlyArray<string | null>): string[] {
  const filled = seats.filter((id): id is string => id !== null);
  if (filled.length !== seats.length) throw new Error('동률 자리를 골라야 대진을 확인할 수 있어요.');
  return filled;
}

function destinationOf(view: MultiFinalView, groupId: string, rank: number): Destination | null {
  for (const final of view.finals) {
    const index = final.rules.findIndex((rule) => rule.groupId === groupId && rule.rank === rank);
    if (index >= 0) return { finalName: final.name, seed: index + 1 };
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
    const otherLabels = others.map((place) => (place.destination ? `${place.destination.finalName} ${place.rank}위 자리(${place.destination.seed}번 시드)` : null));
    const hint = others.length === 0 ? null
      : otherLabels.every((label) => label === null) ? '고르지 않은 팀은 진출하지 못해요.'
        : `고르지 않은 팀은 ${josa(otherLabels.map((label) => label ?? '진출 없음').join(', '), ['으로', '로'])} 가요.`;
    return [{
      key, banner, detail,
      seats: seats.map((seat) => ({
        seat: seat.seat,
        label: `${final.name} ${seat.rank}위 자리(${seat.seat + 1}번 시드)에 보낼 팀`,
        hint, candidates: seat.tiedRegistrationIds,
      })),
    }];
  });
}
