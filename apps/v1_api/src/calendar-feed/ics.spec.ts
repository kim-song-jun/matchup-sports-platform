import { buildIcs, escapeIcsText, foldIcsLine, formatIcsUtc } from './ics';

const NOW = new Date('2026-11-23T00:00:00.000Z');
const base = {
  uid: 'schedule-1@teameet.co.kr',
  summary: '토요 훈련',
  startAt: new Date('2026-11-28T01:00:00.000Z'),
  endAt: new Date('2026-11-28T03:00:00.000Z'),
};

describe('ics', () => {
  it('날짜를 UTC 로 쓴다', () => {
    expect(formatIcsUtc(new Date('2026-12-01T01:02:03.456Z'))).toBe('20261201T010203Z');
  });

  it('쉼표·세미콜론·역슬래시·줄바꿈을 이스케이프한다', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\;c\\\\d\\ne');
  });

  it('긴 줄은 75옥텟 안에서 접고, 한글을 가운데서 자르지 않는다', () => {
    const folded = foldIcsLine(`SUMMARY:${'가'.repeat(60)}`);
    const rows = folded.split('\r\n');
    expect(rows.length).toBeGreaterThan(1);
    rows.forEach((row) => expect(Buffer.byteLength(row, 'utf8')).toBeLessThanOrEqual(75));
    // 접힌 줄을 이어 붙이면 원본과 같다(이어지는 줄은 앞 공백 1개).
    expect(rows.map((row, i) => (i === 0 ? row : row.slice(1))).join('')).toBe(`SUMMARY:${'가'.repeat(60)}`);
  });

  it('일정 하나를 CRLF 로 끝나는 VCALENDAR 로 만든다', () => {
    const ics = buildIcs([{ ...base, location: '마포 풋살장', url: 'https://teameet.co.kr/x', sequence: 3 }], { name: 'Teameet', now: NOW });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('UID:schedule-1@teameet.co.kr\r\n');
    expect(ics).toContain('DTSTART:20261128T010000Z\r\n');
    expect(ics).toContain('DTEND:20261128T030000Z\r\n');
    expect(ics).toContain('LOCATION:마포 풋살장\r\n');
    expect(ics).toContain('SEQUENCE:3\r\n');
    expect(ics).toContain('STATUS:CONFIRMED\r\n');
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it('취소된 일정은 STATUS:CANCELLED 로 남긴다', () => {
    expect(buildIcs([{ ...base, cancelled: true }], { name: 'Teameet', now: NOW })).toContain('STATUS:CANCELLED\r\n');
  });

  it('일정이 없어도 올바른 빈 캘린더를 만든다', () => {
    const ics = buildIcs([], { name: 'Teameet', now: NOW });
    expect(ics).not.toContain('BEGIN:VEVENT');
    expect(ics).toContain('X-WR-CALNAME:Teameet\r\n');
  });
});
