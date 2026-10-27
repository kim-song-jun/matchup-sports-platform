# 대회 시상 계획의 명시적 분류

Status: Deployed — authenticated admin QA pending
Created: 2026-10-27
Related: `20261109-grouped-public-prizes.md`의 이름 추정 분류를 확장하는 사용자 승인 후속 작업.

## Context
개인 시상에 새로운 이름을 입력하면 이름 추정에 따라 기타 시상으로 빠지는 문제가 있다.

## Goal
팀·개인·기타 구역에서 자유 입력한 시상을 저장·재조회·공개 표시까지 같은 분류로 유지한다.

## Original Conditions
- [x] A·B·C 제시 후 사용자가 A안 세 구역과 PR 생성을 승인.
- [x] 개인 시상 임의 텍스트도 개인 시상에 표시.
- [x] 우승·1위·1등, 준우승·2위·2등 별칭 지원.
- [x] 기존 데이터와 상품의 개수·문구 보존.

## User Scenarios
운영자는 개인 시상 추가 → 오늘의 허슬 플레이어 입력 → 저장 → 재조회 후 개인 시상에서 확인한다. 공개 사용자는 같은 분류를 본다.

## Test Scenarios
- 분류/공백/구분자 포함 자유 이름의 저장 round-trip과 공개 표시.
- 순위 별칭 통합, 분류 간 같은 이름 분리, 공동 순위 보존.
- 생성·임시저장 복원·정보 수정·전체 삭제·읽기 전용/저장 중·12행 제한 회귀.
- alpha 390/768/1440 화면·console/network: 머지·배포 후 실행 필요.

## Parallel Work Breakdown
단일 에이전트. Owned: prize parser/editor/shared rendering, 해당 hydrate 경로, DTO 길이, 관련 테스트·문서. 다른 세션 WIP는 금지. 최신 origin/dev의 별도 worktree에서 작업.

## Acceptance Criteria
- [x] 이름과 관계없이 명시적 분류 저장.
- [x] 공통 공개 그룹·미리보기 반영, 기존 텍스트 읽기.
- [x] 관련 frontend 224건(8개 파일의 최종 통과 결과 합계), API DTO 4건, frontend 타입·패턴 검사 통과.
- [x] dev 대상 PR #2066 생성.
- [x] alpha 배포 성공, 실제 SHA·API/DB 정상, 공개 상세·시상 390/768/1440 확인.
- [ ] 관리자 입력·저장의 alpha 실로그인 검증 (세션 없음으로 BLOCKED).

## Tech Debt Resolved
분류를 이름만으로 추정하던 제약, 개인명 공백 손실, 빈 시상 전체 삭제 미반영, 시상만 입력했을 때 공개 결과 누락을 처리한다.

## Security Notes
권한/API 경로는 그대로다. 자유 텍스트는 React 텍스트 노드로 렌더한다. 환경 파일·자격증명은 읽거나 기록하지 않는다.

## Risks & Dependencies
DB 컬럼 추가 없이 기존 string 필드에 버전 prefix+JSON으로 분류를 보존한다. 최대 길이는 DTO 500→4000. 기존 텍스트는 계속 읽고, 재저장한 데이터의 명시적 분류만 새 포맷으로 쓴다. 구버전 클라이언트가 신규 포맷을 직접 렌더하면 호환되지 않으므로 API 문서에 파서 계약을 기록한다. 실제 수상자 지정/지급 관리는 범위 밖이다.

## Ambiguity Log
신규 이름도 분류를 명시해 저장한다는 사용자 확정. 추첨·이벤트는 기타 시상에 포함한다. 기존 기타/추정 분류를 바꾸려면 원하는 구역에 새 행으로 옮긴다.

## Progress Snapshot

구현 테스트 frontend 224건·API DTO 4건, committed-tree 타입·패턴 검증 통과. 사용자 추가 지시로 PR #2066을 리뷰 없이 dev에 merge했고 merge commit CI와 alpha 배포도 성공했다. 실제 서비스·DB 상태 및 공개 화면 3폭 검증을 완료했다. 관리자 실로그인 검증은 세션 부재로 남아 있다. 아래 Deployment Snapshot과 별도 QA 브랜치의 증거를 최신 커서로 쓴다.

## Deployment Snapshot

사용자가 리뷰 대기를 면제하고 즉시 배포를 지시했다. PR #2066을 dev에 merge했고, merge commit CI 및 Deploy Alpha 모두 success다. 실제 서비스 SHA `392906709c15bf3e31d5b4099d8f203b032f39c5`, DB health 정상. 공개 화면 6/6 PASS, 관리자 3폭은 로그인 세션 부재로 BLOCKED다. [배포·화면 증거](../../docs/visual-qa/pr2066-alpha-verification.md)는 별도 QA 브랜치에서 관리한다. 공개 원본 데이터는 수정하지 않았다.
