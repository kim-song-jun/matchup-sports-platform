# 공개 대회 상세 제목의 한글 줄바꿈

Status: In Progress
**Owner**: QA loop root / frontend worker
**Created**: 2026-10-28

## Context

Alpha 공개 대회 상세를 390×844에서 확인할 때 `(테스트) 현재 경기 중 챔피언십`의 마지막 단어가 `챔피언 / 십`으로 분리됐다. 같은 대회의 768·1440 화면에서는 제목이 한 줄이었다. 실제 서빙 SHA는 `6727b8abc256289c0d9958f13073e156f3e203aa`이고, [세 폭 증거](https://github.com/kim-song-jun/matchup-sports-platform/pull/2045#issuecomment-6450361143)는 관리자 로그인 세션에서 본 공개 화면이다. 이 문제는 관리자 이미지 안내 문구 수정 PR #2073과 별도의 공개 제목이다.

## Goal

공개 대회 제목에서 일반 한글 어절을 유지하면서도 매우 긴 무공백 제목은 화면 밖으로 밀리지 않게 한다.

## Original Conditions (must all be satisfied)

- [ ] 제보된 390px 한글 제목의 어절 중간 줄바꿈을 해소한다.
- [ ] 긴 무공백 제목도 화면 밖으로 넘치지 않는다.
- [ ] 기존 제목의 접근성 이름과 단일 `h1`, 이미지·배지 동작을 유지한다.

## User Scenarios

### 공개 대회 상세 제목

모바일 방문자가 공개 대회 상세를 읽을 때 제목이 자연스럽게 줄바뀌고 대표 이미지와 배지에 겹치지 않는다.

## Test Scenarios

### Happy path

- [ ] 실제 상세 뷰 소비자의 제목이 어절 보존 줄바꿈 정책을 갖는다.
- [ ] 기존 단일 `h1`과 대회 제목 접근성 이름을 유지한다.

### Edge cases

- [ ] API 제한 120자 이내의 무공백 제목에도 비상 줄바꿈 정책이 있다.
- [ ] Alpha 390·768·1440px에서 제목, 이미지, 배지 및 document 가로 넘침을 직접 검증한다.

### Error paths

- 별도 데이터 저장이나 API 호출 변경이 없으며 오류 경로 변경은 없다.

### Mock data updates needed

- 없음. 상세 뷰 테스트의 기존 대회 fixture에 제목만 전달한다.

## Parallel Work Breakdown

### Frontend

- [x] RED: 실제 `TournamentDetailView`의 `h1` 소비자 스타일 계약을 좁게 검증한다.
- [x] 제목에만 기존 프로젝트 줄바꿈 패턴을 적용한다. 다른 화면과 전역 스타일은 건드리지 않는다.
- 적용 범위는 기존 문구의 한 줄 기계적 스타일 보정으로, 새 화면이나 정보 구조 설계가 아니다.

### Sequential

- [ ] root가 커밋 트리 검증 및 최신 dev PR을 진행한다.
- [ ] 머지·배포 후 실제 Alpha 화면과 스크린샷을 확인한다.

## Acceptance Criteria

- [ ] Original Conditions 및 User Scenarios를 충족한다.
- [ ] 범위 내 테스트와 독립 코드·보안 리뷰가 통과한다.
- [ ] 관련 Changeset, 정확한 PR 상태 및 Alpha 실제 증거를 기록한다.
- [ ] 기존 토큰과 구성 요소를 유지하고 새로운 기술 부채를 만들지 않는다.

## Tech Debt Resolved

- 기존 제목의 한글 어절 보존과 긴 무공백 제목 방어 정책 부재를 해결한다.

## Security Notes

- 제목은 기존 React 텍스트 렌더링을 유지하며 HTML 삽입이나 입력·권한 계약은 변경하지 않는다.

## Risks & Dependencies

- JSDOM은 실제 레이아웃을 계산하지 않으므로 스타일 계약 테스트만으로 실제 줄바꿈이나 overflow를 주장하지 않는다.
- 배포 후 실제 Alpha 화면과 해당 배포 SHA가 일치해야 시각 검증을 완료할 수 있다.

## Ambiguity Log

| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-28 | QA | 제목 줄바꿈이 관리자 이미지 안내 작업과 중복되는가? | 공개 상세 `h1`의 별도 증상으로 확인; 관리자 안내는 범위 밖. |

## Progress Snapshot

- Alpha 390px 실제 캡처에서 한글 단어 분리를 관찰했으며, 768·1440px 캡처와 독립 시각 검토를 기록했다.
- root가 실제 상세 뷰의 한국어 제목 및 120자 무공백 제목 테스트 2건이 `word-break`·`overflow-wrap` 미설정으로 실패함을 확인했다.
- 공개 상세 `h1`에 `keep-all`과 `anywhere`를 적용하고 Changeset을 추가했다.
- root가 수정 후 해당 `tournament-detail-client.test.ts` 전체 83/83 통과와 `v1_web lint` 통과(Git의 `find`를 PATH 우선 사용)를 확인했다. 별도 구현자가 아닌 독립 리뷰 결과는 FindingsNone이다.
- 위 결과는 현재 작업 트리 기준이다. 커밋 트리 확인, PR 및 실제 Alpha 수정 후 화면 검증은 아직 수행하지 않았다.
