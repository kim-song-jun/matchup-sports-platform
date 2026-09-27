# Task 129 — 팀 모바일 간격 및 캠페인 편집 사용성

## Scope

- `apps/v1_web`의 모바일 팀 목록 검색/필터 간격을 디자인 기준에 맞춘다.
- 관리자 대회 캠페인의 공개 URL을 대회 ID 기반으로 자동 생성한다.
- 캠페인의 메인 상단 이미지와 참가 이유 이미지를 주소 입력이 아닌 실제 업로드로 제공한다.
- 캠페인 편집 용어를 작성자 중심 문구로 정리한다.

## Acceptance Criteria

- 모바일 `/teams`에서 검색 입력과 필터 버튼 사이는 `1px`이며 다른 목록 화면에는 영향을 주지 않는다.
- 캠페인 생성 화면에서 공개 URL은 자동 생성되고 직접 수정할 수 없다.
- 메인 상단 이미지와 각 참가 이유 이미지는 JPG/PNG/WebP 파일을 업로드하고 미리보기·변경·제거할 수 있다.
- 이미지 업로드 중에는 캠페인 저장과 취소가 비활성화되며 실패 원인이 표시된다.
- 편집 화면은 `대제목`, `서브 내용`, `메인 상단 이미지`, `참가할 이유` 용어를 일관되게 사용한다.
- 캠페인 focused test와 diff 무결성 검사가 통과한다.

## Progress Snapshot

- 2026-08-01: 구현 완료. 캠페인 focused test 12개 통과. PR base는 `dev`이며 `main`은 대상에서 제외한다.

## Validation

- `pnpm --filter v1_web exec vitest run 'src/app/admin/tournaments/[id]/tournament-campaign-tab.test.tsx' --pool=forks --maxWorkers=1`
- `git diff --check`

## Residual Environment Note

- 전체 v1 Web typecheck는 기존 설치 상태에서 Tiptap 확장 모듈과 `socket.io-client`를 찾지 못해 별도 환경 의존성 복구가 필요하다.
