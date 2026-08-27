/**
 * 공유 날짜/금액 포맷터 — v1_web 전역 단일 소스.
 *
 * 로컬 포맷터 금지 규칙에 따라, 날짜 문자열·금액을 다루는 모든 컴포넌트는
 * 이 파일의 함수를 import하여 사용해야 해요. 로컬에 동일 포맷터 정의 금지.
 *
 * 대회(Tournament) 날짜 표기 기준:
 *   - compact 슬롯 (홈 티저 · 목록 카드): formatTournamentDateShort  → 'M/D (요일)'
 *   - compact 범위 슬롯:                 formatTournamentDateRangeShort → 'M/D (요일)~M/D (요일)'
 *   - compact 단일 시각 슬롯 (경기 일정 목록 · 결선 대진표 카드): formatTournamentDateTimeShort
 *     → 'M/D (요일) HH:MM'
 *   - 상세 슬롯 (대회 상세 페이지):        formatTournamentDateLong   → 'YYYY년 M월 D일 (요일)'
 *   - 상세 일시 슬롯 (마감 안내):          formatTournamentDateTimeLong → 'YYYY년 M월 D일 (요일) 오후 H:mm'
 *   - 상세 범위 슬롯:                    formatTournamentDateRangeLong
 *   - 대회 상세 페이지 "일정" 슬롯(시각 포함): formatTournamentDateRangeWithTime
 *     → 'M/D (요일) HH:MM ~ M/D (요일) HH:MM' (같은 날이면 'M/D (요일) HH:MM~HH:MM'로 압축).
 *     대회 상세 페이지의 일정 표시 전용 — 참가비/장소처럼 시각이 불필요한 다른 슬롯은
 *     그대로 formatTournamentDateRangeShort/Long 사용.
 *
 * 목록 카드 날짜 슬롯:
 *   - formatMonthDay(dateStr) → 'M월 D일' (초대·가입 신청 등 "언제였는지"만 필요한 슬롯)
 *
 * 금액 포맷터:
 *   - formatEntryFee(fee)   → 0이면 '무료', 그 외 'N원' (ko-KR 천 단위 구분)
 */


type TournamentKstParts = {
  year: string;
  month: string;
  day: string;
  weekday: string;
  hour: string;
  minute: string;
};

/**
 * 대회(Tournament) 날짜 포맷터 공용 — dateStr 을 KST(Asia/Seoul) 벽시계 부분으로 분해한다.
 * 경기 시각은 서버가 KST 기준으로 배치하는 계약이다(formatKstTime/formatKstDateShort 주석,
 * round-robin-schedule.ts 참고) — 뷰어 기기 타임존과 무관하게 항상 Asia/Seoul로 고정해야
 * 관전자·선수가 어드민·서버와 같은 킥오프 시각을 본다. `d.getHours()` 류 로컬 getter를 쓰면
 * 기기 타임존이 Asia/Seoul이 아닐 때(해외 접속·UTC 데스크톱 등) 시각이 그대로 밀린다 —
 * 실사례: KST 22:00 킥오프가 UTC 기기에서 13:00으로 표시됨.
 * dateStr 이 invalid 이면 null.
 */
/**
 * 타임존 표기가 없는 값은 KST 벽시계로 읽는다.
 *
 * 어드민 폼의 `datetime-local` 입력은 '2026-08-29T09:00' 처럼 오프셋이 없는 문자열을
 * 준다. `new Date()` 는 이런 값을 **브라우저 로컬**로 해석하므로, 같은 입력이 KST
 * 브라우저에서는 09:00 KST 로, UTC 브라우저에서는 09:00 UTC(= KST 18:00)로 갈린다.
 * 쓰기 쪽은 이미 KST 로 고정돼 있는데(`datetimeLocalValueToIso` 가 `+09:00` 을 붙인다)
 * 표시 쪽만 로컬로 읽으면 저장 전 미리보기와 저장 후 화면이 어긋난다 — 실제로
 * "하루짜리 대회"가 UTC 러너에서 이틀 범위로 표시됐다.
 */
function withKstOffsetIfNaive(dateStr: string): string {
  if (!dateStr.includes('T')) return dateStr;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(dateStr)) return dateStr;
  // 'YYYY-MM-DDTHH:mm' 처럼 초가 없으면 채워 준다.
  const withSeconds = /T\d{2}:\d{2}$/.test(dateStr) ? `${dateStr}:00` : dateStr;
  return `${withSeconds}+09:00`;
}

function getTournamentKstParts(dateStr: string): TournamentKstParts | null {
  const d = new Date(withKstOffsetIfNaive(dateStr));
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    weekday: get('weekday'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

/**
 * compact 슬롯용 짧은 형식: 'M/D (요일)'
 * 홈 티저 카드 · 대회 목록 카드에서 사용해요. KST 벽시계 고정 — getTournamentKstParts 참고.
 * dateStr 이 없거나 invalid 이면 null 반환.
 */
export function formatTournamentDateShort(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const parts = getTournamentKstParts(dateStr);
  if (!parts) return null;
  return `${parts.month}/${parts.day} (${parts.weekday})`;
}

export function formatTournamentDateRangeShort(
  startStr: string | null | undefined,
  endStr: string | null | undefined,
): string | null {
  const start = formatTournamentDateShort(startStr);
  if (!start) return null;
  const end = formatTournamentDateShort(endStr);
  if (!end || end === start) return start;
  return `${start}~${end}`;
}

/**
 * 목록/브래킷 슬롯용 짧은 날짜+시각: 'M/D (요일) HH:MM'
 * 경기 일정 목록 · 결선 대진표 카드처럼 한 줄에 날짜와 시각을 함께 보여줘야 하는
 * compact 슬롯에서 사용해요. KST 벽시계 고정 — getTournamentKstParts 참고.
 * dateStr 이 없거나 invalid 이면 null 반환.
 */
export function formatTournamentDateTimeShort(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const parts = getTournamentKstParts(dateStr);
  if (!parts) return null;
  return `${parts.month}/${parts.day} (${parts.weekday}) ${parts.hour}:${parts.minute}`;
}

/**
 * 홍보 슬롯용 중간 형식: 'M월 D일 (요일)'
 * 홈·대회 목록 홍보 카드처럼 한눈에 읽혀야 하는 자리에서 사용해요 — 연도는 빼고
 * 월/일을 한글로 적어 compact 형식('M/D (요일)')보다 잘 읽힌다.
 * dateStr 이 없거나 invalid 이면 null 반환.
 */
export function formatTournamentDateMedium(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  // KST 벽시계 고정 — getTournamentKstParts 참고. 자매 함수들과 같은 기준을 써야
  // 같은 경기가 화면마다 다른 날짜로 보이지 않는다.
  const parts = getTournamentKstParts(dateStr);
  if (!parts) return null;
  return `${parts.month}월 ${parts.day}일 (${parts.weekday})`;
}

/** 여러 날에 걸친 대회를 'M월 D일 (요일)~M월 D일 (요일)'로 적는다. 하루면 시작일만 준다. */
export function formatTournamentDateRangeMedium(
  startStr: string | null | undefined,
  endStr: string | null | undefined,
): string | null {
  const start = formatTournamentDateMedium(startStr);
  if (!start) return null;
  const end = formatTournamentDateMedium(endStr);
  if (!end || end === start) return start;
  return `${start}~${end}`;
}

/**
 * 상세 슬롯용 긴 형식: 'YYYY년 M월 D일 (요일)'
 * 대회 상세 페이지에서 사용해요.
 * dateStr 이 없거나 invalid 이면 '날짜 미정' 반환.
 */
export function formatTournamentDateLong(dateStr: string | null | undefined): string {
  if (!dateStr) return '날짜 미정';
  // KST 벽시계 고정 — getTournamentKstParts 참고.
  const parts = getTournamentKstParts(dateStr);
  if (!parts) return '날짜 미정';
  return `${parts.year}년 ${parts.month}월 ${parts.day}일 (${parts.weekday})`;
}

/**
 * 상세 일시 슬롯용 형식: 'YYYY년 M월 D일 (요일) 오후 H:mm'
 * 신청 마감처럼 날짜와 시각을 함께 확인해야 하는 화면에서 사용해요.
 * dateStr 이 없거나 invalid 이면 '일정 미정' 반환.
 */
export function formatTournamentDateTimeLong(dateStr: string | null | undefined): string {
  if (!dateStr) return '일정 미정';
  // KST 벽시계 고정 — getTournamentKstParts 참고. 신청 마감처럼 시각이 곧 마감선인
  // 화면이라 기기 타임존이 다르면 마감 시각을 잘못 읽는다.
  const parts = getTournamentKstParts(dateStr);
  if (!parts) return '일정 미정';

  const hour = Number(parts.hour);
  const period = hour < 12 ? '오전' : '오후';
  const displayHour = hour % 12 || 12;
  return `${parts.year}년 ${parts.month}월 ${parts.day}일 (${parts.weekday}) ${period} ${displayHour}:${parts.minute}`;
}

export function formatTournamentDateRangeLong(
  startStr: string | null | undefined,
  endStr: string | null | undefined,
): string {
  const start = formatTournamentDateLong(startStr);
  if (start === '날짜 미정') return start;
  const end = formatTournamentDateLong(endStr);
  if (end === '날짜 미정' || end === start) return start;
  return `${start} ~ ${end}`;
}

/**
 * 대회 상세 페이지 "일정" 슬롯 전용: 날짜+시각 범위 'M/D (요일) HH:MM ~ M/D (요일) HH:MM'.
 * 시작·종료가 같은 날이면 날짜 반복을 생략하고 'M/D (요일) HH:MM~HH:MM'로 압축한다.
 * startStr 이 없거나 invalid 이면 null 반환.
 */
export function formatTournamentDateRangeWithTime(
  startStr: string | null | undefined,
  endStr: string | null | undefined,
): string | null {
  if (!startStr) return null;
  // KST 벽시계 고정 — getTournamentKstParts 참고. formatTournamentDateShort가 반환하는
  // 날짜 라벨과 여기서 뽑는 시각이 같은 KST 기준이어야 "8/31 (일) 13:00"처럼 날짜·시각이
  // 서로 다른 타임존을 섞어 뒤틀리지 않는다.
  const start = getTournamentKstParts(startStr);
  if (!start) return null;

  const startDateLabel = `${start.month}/${start.day} (${start.weekday})`;
  const startTime = `${start.hour}:${start.minute}`;
  const startFull = `${startDateLabel} ${startTime}`;

  if (!endStr) return startFull;
  const end = getTournamentKstParts(endStr);
  if (!end) return startFull;

  const endDateLabel = `${end.month}/${end.day} (${end.weekday})`;
  const endTime = `${end.hour}:${end.minute}`;

  if (endDateLabel === startDateLabel) {
    if (endTime === startTime) return startFull;
    return `${startFull}~${endTime}`;
  }
  return `${startFull} ~ ${endDateLabel} ${endTime}`;
}

/**
 * 참가비 포맷터: 0이면 '무료', 그 외 ko-KR 천 단위 구분 + '원'.
 * 예) 0 → '무료', 30000 → '30,000원'
 */
/**
 * 목록 카드용 짧은 날짜: 'M월 D일'
 * 받은 초대 · 보낸 가입 신청처럼 "언제 있었던 일인지"만 알면 되는 슬롯에서 사용해요.
 * dateStr 이 없거나 invalid 이면 null 을 반환해, 호출부가 줄 자체를 감출 수 있게 해요.
 */
export function formatMonthDay(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function formatEntryFee(fee: number): string {
  if (fee === 0) return '무료';
  return `${fee.toLocaleString('ko-KR')}원`;
}

/**
 * 관리자 운영 화면 공용 일시 포맷터: 'YYYY.M.D HH:MM'
 * 대회 도메인 밖의 관리자 로그/운영 테이블·상세 화면에서 사용해요.
 * 빈 값은 '—'(어드민 공통 폴백), invalid 는 원본 문자열을 그대로 반환.
 *
 * 한때 어드민 화면 11곳이 각자 로컬 포맷터를 재구현해 같은 페이지 쌍(목록/상세)
 * 안에서도 포맷·폴백 문자('-' vs '—')가 갈렸다 — 이 3형제(일시/일시 짧은/날짜)로 수렴.
 */
export function formatAdminDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${hour}:${minute}`;
}

/**
 * 연도 없는 목록용 일시: 'M.D HH:MM' — 목록 열은 폭이 좁아 연도를 의도적으로 뺀다
 * (로그·최근 활동처럼 대부분 올해 데이터인 열). 상세 화면은 연도 포함 본판을 쓴다.
 */
export function formatAdminDateTimeShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}.${d.getDate()} ${hour}:${minute}`;
}

/** formatAdminDateTime 의 날짜 전용 자매 — 어드민 목록의 가입일·생성일 열처럼 시각이 불필요한 곳 */
export function formatAdminDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

/**
 * 리그 대진 timing 타임라인 공용: 경기별 시각 'HH:mm'. 경기 시각은 KST 벽시계 계약이라
 * (서버가 KST 기준으로 배치한다) 실행 환경 타임존과 무관하게 Asia/Seoul로 고정한다.
 * dateStr 이 invalid 이면 원본 문자열을 그대로 반환.
 */
export function formatKstTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
}

/** 리그 대진 timing 타임라인 공용: 매치데이 헤더 날짜 'M. D. (요일)' — 위와 같은 이유로 KST 고정. */
export function formatKstDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' });
}
