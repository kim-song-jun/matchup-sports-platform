const MASK = '***-****-****';

const DASH = '[.\\-\\u2010-\\u2015]';
const BLANK = '[ \\u00A0]';
// 구분자 한 칸: 하이픈·점, 그 앞뒤 공백("010 - 1234"), 또는 공백만.
const SEP_OPT = `${BLANK}?${DASH}?${BLANK}?`;
const SEP_REQUIRED = `(?:${BLANK}?${DASH}${BLANK}?|${BLANK})`;

// 한국 휴대전화(국내 꼴·+82 꼴)와 지역번호·070 번호. 지역번호는 구분자가 있는 꼴만 가린다 — 붙여 쓴 9~10자리 숫자는 번호가 아닐 수 있다.
const CONTACT_NUMBER = new RegExp(
  '(?<!\\d)(?:' +
    `\\+82${SEP_OPT}(?:\\(0\\)${SEP_OPT})?0?1[016789]${SEP_OPT}\\d{3,4}${SEP_OPT}\\d{4}` +
    '|' +
    `01[016789]${SEP_OPT}\\d{3,4}${SEP_OPT}\\d{4}` +
    '|' +
    `\\(?(?:02|0(?:3[1-3]|4[1-4]|5[1-5]|6[1-4])|070)(?:\\)${SEP_OPT}|${SEP_REQUIRED})\\d{3,4}${SEP_REQUIRED}\\d{4}` +
    ')(?!\\d)',
  'g',
);

/** 검색 결과·공유 미리보기로 나가는 글에서 전화번호 꼴을 번호 전체 한 가지 표기로 가린다. 화면 본문에는 쓰지 않는다. */
export function maskContactNumbers(value: string | null | undefined): string {
  return value ? value.replace(CONTACT_NUMBER, MASK) : '';
}
