import { decodeReferenceTimeCursor, encodeReferenceTimeCursor } from './reference-time-cursor';

describe('reference-time-cursor', () => {
  const now = new Date('2026-10-03T12:00:00.000Z');
  const earlier = new Date('2026-10-03T11:00:00.000Z');

  it('encode 한 커서를 decode 하면 구간 커서와 기준 시각이 그대로 복원된다', () => {
    const encoded = encodeReferenceTimeCursor('upcoming:match-1', earlier);

    expect(encoded).toBe(`upcoming:match-1@${earlier.getTime()}`);
    expect(decodeReferenceTimeCursor(encoded!, now)).toEqual({ cursor: 'upcoming:match-1', referenceTime: earlier });
  });

  it('다음 페이지가 없으면(null) 인코딩도 null 이다', () => {
    expect(encodeReferenceTimeCursor(null, earlier)).toBeNull();
  });

  it('커서가 없으면 첫 페이지이고 기준 시각은 now 다', () => {
    expect(decodeReferenceTimeCursor(undefined, now)).toEqual({ cursor: undefined, referenceTime: now });
    expect(decodeReferenceTimeCursor('', now)).toEqual({ cursor: undefined, referenceTime: now });
  });

  it('now 보다 미래인 시각은 now 로 내린다 (조작된 커서가 경계를 앞당기지 못한다)', () => {
    const future = now.getTime() + 60 * 60 * 1000;

    expect(decodeReferenceTimeCursor(`upcoming:a@${future}`, now)).toEqual({ cursor: 'upcoming:a', referenceTime: now });
  });

  it('now 와 같은 시각은 그대로 둔다', () => {
    expect(decodeReferenceTimeCursor(`past:a@${now.getTime()}`, now).referenceTime).toEqual(now);
  });

  it.each(['upcoming:a@', 'upcoming:a@abc', 'upcoming:a@-5', 'upcoming:a@12.5', 'upcoming:a@1e12', 'upcoming:a@99999999999999999', 'upcoming:a@9999999999999999'])(
    '시각이 깨진 커서(%s)는 커서 전체를 없는 것으로 보고 첫 페이지부터 읽는다',
    (raw) => {
      expect(decodeReferenceTimeCursor(raw, now)).toEqual({ cursor: undefined, referenceTime: now });
    },
  );

  it('@ 앞이 비어 있으면 커서 전체를 없는 것으로 본다', () => {
    expect(decodeReferenceTimeCursor(`@${earlier.getTime()}`, now)).toEqual({ cursor: undefined, referenceTime: now });
  });

  it('시각 없는 구형 "<구간>:<id>" 커서는 실제 now 로 이어 읽는다', () => {
    expect(decodeReferenceTimeCursor('past:match-9', now)).toEqual({ cursor: 'past:match-9', referenceTime: now });
  });

  it('구간 접두사 없는 레거시 커서는 그대로 넘겨 paginateByStatePriority 가 첫 페이지부터 읽게 한다', () => {
    expect(decodeReferenceTimeCursor('match-9', now)).toEqual({ cursor: 'match-9', referenceTime: now });
    expect(decodeReferenceTimeCursor(`match-9@${earlier.getTime()}`, now)).toEqual({ cursor: 'match-9', referenceTime: earlier });
  });
});
