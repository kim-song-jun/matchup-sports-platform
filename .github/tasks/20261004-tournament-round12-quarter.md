# 12강·8강 대진 관리 확장

- Target: v1 backend + frontend + migration; dev → alpha only.
- Base: origin/dev 56581dc7b, isolated worktree `/tmp/teameet-round12`.
- Authorization: 기존 수동 대진 생성/팀 배정 흐름의 12강·8강 지원과 사용자 대진표, alpha 개발 배포.
- Design: 기존 TournamentBracket/TeamAvatar 카드와 가로 스크롤 유지. 12강의 부전승은 운영자가 명시하며 경기/점수와 구분한다.
- Out of scope: 예선 종료 자동 대진 생성, main 승격, 실제 대회 데이터 재편성.

## Acceptance / phases
- [x] DB/DTO에서 round12·quarter 단계 및 명시적 부전승 배정 저장
- [x] 관리자 단계 추가·수동 배정·대진 생성, 부전승팀 경기 생성 제외
- [x] 사용자 12강→8강→4강→결승 정렬과 부전승 표시, 모바일 단계 이동
- [x] 결과/일정/진행 표면의 단계 분류 일치
- [x] 좁은 회귀·타입 검사 및 migration/source-binding 검사
- [ ] dev PR CI·리뷰·alpha 배포
- [ ] alpha 390/768/1440 전후·console/network QA

## Progress Snapshot
- 최신 dev 조회 및 격리 완료. 공유 작업트리 변경을 포함하지 않는다.
- 네트워크 sandbox 밖 GitHub 인증 정상.
- 테스트 전 host: 24 CPU, load 0.94, free 14GB, swap 0, Linux Node/browser 0. Docker CLI WSL interop 오류로 실제 DB 미확인.

## Ambiguity Log
- UI 방향은 이전 메시지의 기존 대진표 확장안을 사용자 개발 요청으로 수락한 것으로 본다.
- 부전승팀은 12강에 명시하고 8강 슬롯은 기존 방식대로 관리자가 직접 배정한다. 불명확한 상대 미배정은 부전승으로 추정하지 않는다.

- Local evidence: API 128/128, Web 64/64; 양쪽 tsc 0. Web pattern + API surface + DB guardrails PASS. Expand-contract self-test PASS. 실제 DB 통합은 신규 integration suite를 CI에서 실행한다.
- Alpha schema binding: `1eea17ce17f1150aa031cb3ef9cb492e4242375c98a4ad85ff2657a1c6e5d31d`; Dockerfile/alpha validator/manifest/steady-input producer 동기화. 기존 스키마 검증값은 validator에 유지. Alpha manifest self-test PASS.
- 디자인 정합: 새 단계가 있는 대회는 특정 승자 연결을 지어내지 않고 단계 사이에 진행 화살표를 쓴다. 명시적인 다음 경기 연결이 없는 현재 수동 계약에서 `12강 N경기 승자`라는 슬롯 출처를 추정하지 않는다.


## 검증 및 배포 보류 (2026-10-04)

- PostgreSQL 16.15를 `/tmp`에서 포트 15432로 실행, **192 migration 전체 재생 PASS**, `prisma migrate diff --exit-code` **No difference detected**.
- `tournament-round12-quarter.integration-spec.ts`: 실제 DB 저장/관리자 재조회, 부전승=true/기본false, 부전승팀 경기 생성 거절, 허구 TeamMatch 생성 없음 **1/1 PASS**. 격리 clone은 테스트 환경에서 삭제, 소유 PostgreSQL PID 7772 종료.
- Unit: API 128/128, Web 64/64. 양쪽 tsc PASS. Pattern/surface/db-guardrails/expand-contract(커밋본) PASS. Alpha manifest self-test PASS.
- 변경 전 alpha 공개 화면 390/768/1440 캡처. 비로그인 `my-fixtures` 401은 현재 배포본에서 관찰된 기존 상태이며 성공으로 숨기지 않는다. 변경 후 alpha 화면은 아직 **0/3**이다.
- **배포 blocker:** `git push -u origin feat/tournament-round12-quarter`를 자동 승인 검토가 거절했다. 사유: private 저장소 코드의 외부 GitHub 전송이며 원격 신뢰/소유 및 명시적인 push 승인이 확인되지 않았다는 판단. 우회/간접 업로드/재시도하지 않았다.
- 사용자 승인 대상: `https://github.com/kim-song-jun/matchup-sports-platform`에 이번 feature 브랜치 push → base `dev` PR → CI/Copilot review 통과 후 dev merge → alpha 자동 배포/390·768·1440 실제 QA. main은 이번 대상이 아니다.
- 공유 원본 트리(`/mnt/c/...`)는 수정·stage·commit하지 않았다. 모든 작업은 `/tmp/teameet-round12`에 보존한다.
