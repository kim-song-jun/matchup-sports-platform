/**
 * iCalendar(.ics) 문자열을 만드는 순수 함수. DB·Nest 를 모른다.
 * 폰 기본 캘린더(아이폰·구글)가 구독 주소와 단건 파일을 읽을 수 있는 최소한만 쓴다(RFC 5545).
 */

export interface IcsEvent {
  /** 같은 일정은 항상 같은 UID — 캘린더가 이 값으로 "바뀐 일정"을 알아본다. */
  uid: string;
  summary: string;
  startAt: Date;
  endAt: Date;
  updatedAt?: Date;
  /** 일정이 바뀔 때마다 늘어나는 값(없으면 0). */
  sequence?: number;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  cancelled?: boolean;
}

export interface IcsCalendarOptions {
  name: string;
  /** DTSTAMP 기준 시각. 테스트에서 고정할 수 있게 받는다. */
  now?: Date;
}

const CRLF = '\r\n';

/** TEXT 값의 `\` `;` `,` 와 줄바꿈을 이스케이프한다. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** 한 줄이 75옥텟을 넘으면 접는다. 한글 같은 여러 바이트 글자를 가운데서 자르지 않는다. */
export function foldIcsLine(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  // 첫 줄은 75옥텟, 이어지는 줄은 앞 공백 1옥텟을 빼고 74옥텟까지.
  let limit = 75;
  for (const char of line) {
    const size = Buffer.byteLength(char, 'utf8');
    if (bytes + size > limit) {
      parts.push(current);
      current = char;
      bytes = size;
      limit = 74;
    } else {
      current += char;
      bytes += size;
    }
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

/** `20261201T010000Z` 형식(UTC). */
export function formatIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function eventLines(event: IcsEvent, stamp: Date): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${formatIcsUtc(stamp)}`,
    `DTSTART:${formatIcsUtc(event.startAt)}`,
    `DTEND:${formatIcsUtc(event.endAt)}`,
    `SUMMARY:${escapeIcsText(event.summary)}`,
    `SEQUENCE:${event.sequence ?? 0}`,
    `STATUS:${event.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
  ];
  if (event.updatedAt) lines.push(`LAST-MODIFIED:${formatIcsUtc(event.updatedAt)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  lines.push('END:VEVENT');
  return lines;
}

export function buildIcs(events: readonly IcsEvent[], options: IcsCalendarOptions): string {
  const stamp = options.now ?? new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Teameet//Calendar//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(options.name)}`,
    // 구독 캘린더가 얼마나 자주 다시 읽을지 알려 주는 힌트(캘린더 앱이 따를 수도, 무시할 수도 있다).
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...events.flatMap((event) => eventLines(event, stamp)),
    'END:VCALENDAR',
  ];
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}
