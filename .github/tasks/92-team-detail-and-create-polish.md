# 92 Team Detail And Create Polish

## Scope

- Frontend: `apps/v1_web/src/components/teams/*`
- Docs: `docs/scenarios/04-team-and-membership.md`

## Checklist

- [x] 팀 상세의 필수 별표, 복수 선택 보조 문구, 신뢰 신호 표시 제거
- [x] 팀 상세의 이미지/업로드/추가 사진 섹션 제거
- [x] 주요 멤버를 공개/비공개 상태로 구분해서 표시
- [x] 팀 생성 폼의 이미지 업로드 UI 제거
- [x] 팀 생성 payload에서 로고/커버/사진 fallback 저장 제거
- [x] 팀 생성 화면에 생성 전용 단계 표시 추가

## Acceptance Criteria

- `/teams/:id`에서 `*`, `복수 선택 가능`, `신뢰 신호`, 이미지 업로드/추가 사진 UI가 노출되지 않는다.
- `/teams/:id`의 주요 멤버 행은 공개/비공개 상태를 trailing 값으로 보여준다.
- `/teams/new`에는 이미지 업로드 UI가 없고, 제출 payload는 `logoUrl: null`, `coverImageUrl: null`, `photos: []`를 보낸다.
- `/teams/new`에만 1단계 생성 진행 표시가 보이고, 팀 수정 화면에는 표시하지 않는다.

## Progress Snapshot

- 2026-06-04: UI/type/view-model/payload 정리 완료. `pnpm --filter v1_web exec tsc --noEmit` 통과.
