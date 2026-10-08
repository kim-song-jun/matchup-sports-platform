function shuffle<T>(items: readonly T[], randomInt: (maxExclusive: number) => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1); // [0, index]
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

/** 빈 자리와 미배치 팀을 각각 섞어 앞에서부터 짝짓는다 — 남는 쪽은 비워 두거나 배치하지 않는다. 난수는 서버가 주입한다. */
export function pickRandomAssignments(
  emptySlotIds: readonly string[],
  registrationIds: readonly string[],
  randomInt: (maxExclusive: number) => number,
): Array<{ slotId: string; registrationId: string }> {
  const slots = shuffle(emptySlotIds, randomInt);
  const registrations = shuffle(registrationIds, randomInt);
  return slots
    .slice(0, registrations.length)
    .map((slotId, index) => ({ slotId, registrationId: registrations[index] }));
}
