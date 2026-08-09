---
"v1_api": minor
"v1_web": minor
---

팀매치 경기조건(경기방식/경기 스타일/유니폼 색상)을 자유 입력 텍스트 이어붙이기에서 선택식 구조화 필드로 바꾼다. 생성·수정 위저드에서 이제 프리셋 칩으로 고르고(필요하면 "직접입력"으로 자유 텍스트도 함께 받는다), 실력등급은 이미 구조화돼 있던 4단계 폐쇄형 보기(입문/초보/중수/고수)로만 선택한다. 서버는 `V1TeamMatch`에 `matchFormat`/`matchStyle`/`uniformColor` 3개 컬럼을 새로 두고, 목록·상세의 표시용 `rulesText`는 이 구조화 필드에서 파생 계산한다(프론트가 문자열을 다시 파싱하던 지점 제거). 기존 `formatNote` 자유텍스트는 앱 CLI(`team-match-conditions-backfill.cli.ts`)로 이관하며, 구조화 필드가 비어 있는 미마이그레이션 row만 한시적으로 `formatNote`를 표시 폴백으로 읽는다.
