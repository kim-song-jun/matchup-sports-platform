---
"v1_web": patch
---

대회 하위 라우트가 없는 대회에서 **404 페이지 타이틀을 제대로 표시**하게 한다.

## 무엇이 잘못됐나

없는 대회의 하위 경로에서 `notFound()`가 발동하면 세그먼트 전용 `not-found.tsx`가 없어
루트 `not-found.tsx`로 떨어지는데, 루트에는 `metadata` export가 없어 `tournaments/layout.tsx`의
`title: '스포츠 대회'`로 폴백됐다. alpha 실측(없는 UUID 기준):

| 경로 | `<title>` |
|---|---|
| `/tournaments/<miss>/bracket` | `스포츠 대회` (목록 제목, 틀림) |
| `/tournaments/<miss>` | `스포츠 대회` (틀림) |

각 페이지의 `generateMetadata`는 `buildNoIndexMetadata('대진표를 찾을 수 없어요')`처럼 올바른
문구를 반환하지만, `notFound()`가 렌더 트리를 not-found 경계로 바꾸면서 그 metadata가 버려진다.

## 고친 방법

세그먼트 전용 `not-found.tsx` 5개(detail·schedule·bracket·results·reviews)를 추가하고,
각각 해당 라우트의 `generateMetadata`와 **같은 문구를 `metadata`로 export**해 404 렌더에서도
타이틀이 유지되게 했다. 선례 `tournaments/campaigns/[slug]/not-found.tsx`는 metadata export가
빠진 동일 결함을 안고 있어 그대로 베끼지 않았다.

## 남은 한계

`/tournaments/<miss>/schedule`이 API 404에도 **HTTP 200**을 반환하는 별개 증상은 이 변경 범위
밖이다(원인 미규명). 세그먼트 not-found.tsx는 타이틀 폴백을 고치지만 상태코드 이상은 배포 후
alpha에서 재측정해야 한다 — 렌더링 동작이라 tsc·유닛 테스트로는 검증되지 않는다.
