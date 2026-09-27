# docs/ 문서 지도

폴더별 목적 한 줄 + 정본(canonical) 문서 목록. 상세 규칙은 각 폴더 안 문서를 직접 읽는다 —
이 파일은 어디로 갈지 찾는 용도(navigation only)다.

## 폴더

- `api/` — 현재 API 계약 색인(`README.md` 진입). 도메인별 계약은 `api/domains/*.md`.
- `design/` — 디자인·경쟁 흐름 설계 문서(대회·리그 정본 포함).
- `guides/` — 운영자·개발자용 사용법 가이드(관리자 화면, 팀 컨택 메시지, v1 코딩 패턴, Playwright 런북).
- `manual/` — 사용자 매뉴얼류.
- `ops/` — 배포·운영 런북, 가독성 감사 로그.
- `product/` — 현재 기획·전략 문서(Teameet 브랜드).
- `reference/` — 디자인 핸드오프 진행 중 트랙(`handoff-sm-new-direction/`), DB/권한/상태머신 참조.
- `release/` — 릴리즈 관련 문서.
- `scenarios/` — E2E/QA 시나리오 인덱스와 화면 흐름 기록.
- `security/` — 보안 정책·감사 문서.
- `superpowers/` — 세션 작업 계획·스펙(진행 중 트랙).
- `screenshots/`, `qa-screenshots/`, `visual-qa/` — 스크린샷 산출물(정리는 PR #1312 영역, 이 PR에서 손대지 않음).
- `archive/` — 완료·폐기된 과거 문서(v0-reports, v0-plans, original-docx, 초기 reference 자산). 삭제
  대신 보관 — 기록 파기가 아니라 정리가 목적.

## 정본(canonical) 문서

| 주제 | 문서 |
|---|---|
| 대회·리그·매치 전체 흐름 | `design/competition-canonical-flow.md` |
| 접근성 의도적 예외 | `design/a11y-decisions.md` |
| 디자인 시각 규칙 전체 | 레포 루트 `DESIGN.md` (`.impeccable.md`는 요약) |
| 디자인 문서 읽는 순서 | `DESIGN_DOCUMENT_MAP.md`(이 폴더 최상위, navigation only — 규칙 정의 아님) |
| API 계약 색인 | `api/README.md` → `api/global-contract.md` → `api/domains/*.md` |
| PR·배포·시각검증 런북 | `ops/pr-review-visual-workflow.md` |
| E2E 시나리오 인덱스 | `scenarios/index.md` |
| 완료 태스크 아카이브 규칙 | 레포 루트 `.github/tasks/README.md` |

## 이 지도가 다루지 않는 것

- 코드 자체의 진실은 항상 소스(컨트롤러·서비스·스키마)가 우선한다. 문서는 근거일 뿐 발췌본이 아니다.
- `docs/api/v1/`는 아직 정리되지 않았다(별도 후속 작업 필요 — `api/README.md`의 "superseded" 주석 참조).
