/**
 * 경기조건(경기방식/경기 스타일/유니폼 색상) 구조화 필드의 프리셋 상수.
 *
 * grade(실력등급)는 여기 없다 — 이미 V1SportLevel FK(min/maxSportLevelId)로 완전히
 * 구조화돼 있고 자유입력을 허용하지 않는다(apps/v1_web/src/lib/v1-levels.ts의
 * V1_LEVELS 4단계가 유일한 진실). 이 세 필드는 자유입력을 허용하므로(allowsFreeText),
 * 아래 프리셋은 프론트 보기 생성과 백필 CLI 참고용일 뿐 서버 검증에서 값 자체를
 * 화이트리스트로 강제하지 않는다 — DTO는 길이/개수만 제한한다.
 */

export const MATCH_FORMAT_OPTIONS_BY_SPORT_SLUG: Record<string, readonly string[]> = {
  soccer: ['11:11', '9:9', '8:8', '7:7'],
  futsal: ['6:6', '5:5', '4:4'],
};

export const MATCH_STYLE_OPTIONS = ['친선', '매너 중시', '교환매치', '실력 중심', '초보 환영', '기타'] as const;

export const UNIFORM_COLOR_OPTIONS = ['흰색', '검정', '빨강', '파랑', '노랑', '초록', '주황', '남색'] as const;

export const MATCH_FORMAT_MAX_LENGTH = 20;
// 3개로 제한한다(사용자 확정 결정) — 무제한이면 '매너 중시'+'실력 중심'처럼 서로 상충하는
// 조합이 그대로 저장되고, 목록/상세 배지도 무한정 늘어나 지저분해진다. 프론트
// MultiPresetChipSelector(create-form-fields.tsx)가 4번째 선택 시 조용히 무시하지 않고
// 이유를 안내하며 같은 상수를 쓴다(apps/v1_web은 별도 앱이라 값만 동일하게 맞춰 중복 선언).
export const MATCH_STYLE_MAX_ITEMS = 3;
export const MATCH_STYLE_ITEM_MAX_LENGTH = 20;
export const UNIFORM_COLOR_MAX_LENGTH = 20;
