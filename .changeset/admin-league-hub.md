---
"v1_api": patch
"v1_web": patch
---

어드민 '정규 리그'와 '리그 체계'를 리그 허브 `/admin/league-matches` 한 입구로 합친다
(어드민 다이어트 3단계 · B안(체계 필터 내장) 사용자 확정).

- **정규 리그 탭**: 목록 위 체계 칩 필터(전체 · 체계별 · 독립 리그)로 소속 리그를 그 자리에서
  모아 봐요. 백엔드 `GET /admin/league-matches` 에 `seriesId` 필터(uuid 또는 'independent')가
  생겼어요. 각 행에 **'소속 · 티어' 열**("서울 풋살 리그 · 1부" / "독립 리그")이 새로 붙어요 —
  목록 응답에 `seriesId·seriesTitle·tierLabel·seasonNo` 필드 추가(1단계 잔여 해소). 단발 리그는
  tier 가 null 이라 "1부" 뱃지가 잘못 붙지 않아요.
- **리그 체계 탭**: 본문은 기존 `/admin/league-series` 목록 그대로 이식 — 기능 불변.
  헤더의 만들기 버튼이 탭에 따라 '리그 만들기'/'리그 체계 만들기'로 바뀌어요.
- **구 URL 보존**: `/admin/league-series` 는 `?tab=series` 리다이렉트로 남고, 체계
  상세(`[seriesId]`)·생성(`new`) 라우트는 그대로 살아요.
- **사이드바 다이어트**: 플랫폼 구획 8→7. '결과 이의'는 선행 확정대로 독립 유지.
