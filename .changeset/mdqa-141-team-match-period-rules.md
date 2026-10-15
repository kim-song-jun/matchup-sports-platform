---
"v1_api": patch
"v1_web": patch
---

MD-QA #141 일반 팀매치 생성·수정에서 별도 경기 규칙 화면을 제공하고 단판 또는 전후반의 실제 기간을 immutable Game 설정에 저장합니다.

실제 종목 기본값과 nullable 전후반 이력을 구분하며 기존 config·경기/명단 이력·권한을 보호합니다. 상세 저장값 조회, entity/version 초안 보존과 캐시 오류 후 기본 규칙 선택을 지원하고 API/DTO/MSW의 기간·날짜 계약을 맞춥니다.
