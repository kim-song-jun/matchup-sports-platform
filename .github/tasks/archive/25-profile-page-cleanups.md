# Task 25 — Profile Page: Labels, Routing Bugs, CTA

## Context

`/profile` 페이지에 다음 UX 이슈가 있다:
1. "다가오는 일정 → 전체보기" 라벨이 상황에 맞지 않음 — 사용자는 매칭을 **찾는** 행동을 원함
2. "내가 만든 매치" 클릭 시 매치 히스토리 탭으로 라우팅 (라벨/내용 불일치)
3. "내 용병 모집" 섹션에 새 용병 모집 추가 CTA 부재
4. 과거/진행중 매치 구분 UI 부재 (향후 개선)

## Goal

`/profile` 페이지의 네비게이션 라벨/링크를 실제 동작과 일치시키고, 작성 액션 CTA를 추가한다.

## Original Conditions (체크박스)

- [ ] "다가오는 일정 → 전체보기" 라벨을 "매칭 찾기"로 변경하고 `/matches`로 링크
- [ ] "내가 만든 매치" 링크가 `/my/matches?tab=created` 또는 `/my/matches/created`로 올바르게 라우팅되어 해당 탭이 active 상태로 열림
- [ ] `my/matches/page.tsx`에서 `?tab=created` 쿼리 파라미터를 올바르게 해석하여 초기 탭 설정
- [ ] "내 용병 모집" 섹션 헤더에 "+ 추가" 버튼 → `/mercenary/new`로 이동
- [ ] (선택) "내 용병 모집" 섹션에 active/past 서브탭 (향후, 이번 태스크 스코프 밖)

## User Scenarios

**S1 — 매칭 찾기**: 사용자가 `/profile`에서 "매칭 찾기" 클릭 → `/matches` 이동.

**S2 — 내가 만든 매치**: 사용자가 "내가 만든 매치" 클릭 → `/my/matches` 이동, "내가 만든" 탭이 선택된 상태 → 본인이 생성한 매치만 표시.

**S3 — 용병 모집 추가**: 사용자가 "내 용병 모집" 섹션에서 "+ 추가" 클릭 → `/mercenary/new` 진입.

## Test Scenarios

**Happy**
- "매칭 찾기" 링크 → `/matches` (RTL 테스트)
- "내가 만든 매치" → `/my/matches?tab=created` + 탭 active

**Edge**
- `/my/matches`에 `?tab` 없을 때 기본 탭 (upcoming)
- 용병 모집이 0건일 때 "+" 버튼은 여전히 노출, EmptyState와 공존

**Error**
- 비로그인 `/profile` 접근 → `useRequireAuth()`로 `/login` 리다이렉트 (Task 21과 연계)

**Mock Updates**
- 없음 (라우팅/라벨만 변경)

## Parallel Work Breakdown

**frontend-ui-dev**
- `apps/web/src/app/(main)/profile/page.tsx` — 라벨, 링크, CTA 버튼 수정
- `apps/web/src/app/(main)/my/matches/page.tsx` — `useSearchParams()` 로 `tab` 파라미터 해석 및 초기 탭 설정

## Acceptance Criteria

1. "매칭 찾기" 라벨이 DOM에 존재하고 href=`/matches`
2. "내가 만든 매치" 링크가 `?tab=created`를 포함하고, 페이지 진입 시 해당 탭이 선택됨
3. "내 용병 모집" 헤더에 `aria-label="용병 모집 추가"` 버튼 존재
4. `pnpm test` (web) 통과, `tsc --noEmit` 통과

## Tech Debt Resolved

- 라벨-라우팅 불일치 제거

## Security Notes

- 프로필 페이지는 본인 데이터만 노출 (기존 `useMe` 유지)

## Risks & Dependencies

- 매우 작은 스코프, 다른 태스크와 독립적으로 병렬 진행 가능

## Ambiguity Log

- 내가 만든 매치 탭 구조가 `?tab=created`인지 `/my/matches/created`인지 → 기존 코드 따라감 (쿼리 파라미터 우선)
