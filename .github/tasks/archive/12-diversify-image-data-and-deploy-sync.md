# 12. Diversify Image Data And Deploy Sync

## Context

- 2026-04-08 프론트 수정으로 broken image는 런타임 fallback으로 막았지만, seed/demo 데이터는 여전히 빈 `imageUrls`와 limited fallback 의존이 커서 카드 이미지가 반복적으로 보인다.
- 현재 운영 배포에 `prisma db seed`를 자동으로 연결하면 기존 데이터를 지우는 destructive 동작이 섞여 위험하다.
- 프론트 타입은 이미 `Match.imageUrl`, `SportTeam.photos`를 기대하지만, DB 스키마는 이를 충분히 뒷받침하지 못한다.

## Goal

다음 세 가지를 같은 변경에서 정리한다.

1. `db-backed-image-diversification`
2. `deploy-safe-image-sync`
3. `match-team-image-schema-alignment`

## Original Conditions

- 카드/상세 이미지 다양성은 DB에서 먼저 확보되어야 하며, 프론트 fallback은 마지막 안전망이어야 한다.
- 운영 자동화는 destructive full seed 대신 idempotent 이미지 보강 스크립트를 사용해야 한다.
- 기존 remote/user-provided 이미지는 덮어쓰지 않고 보존해야 한다.

## User Scenarios

- 사용자는 홈/매치/강좌/장터/팀 화면에서 같은 mock 이미지를 반복적으로 보지 않는다.
- 운영자는 배포 후 별도 수동 seed 없이 이미지 데이터가 자동 보강된 화면을 본다.
- 실사용자가 업로드한 이미지가 있는 레코드는 배포 자동화로 덮어써지지 않는다.

## Test Scenarios

1. full seed 후 match / lesson / listing / venue / team 데이터에 이미지 필드가 채워진다.
2. 이미지 보강 스크립트를 두 번 실행해도 destructive wipe 없이 동일 결과를 유지한다.
3. `make db-seed-images`가 dev 컨테이너에서 실행된다.
4. deploy workflow는 migrate 이후 full seed 대신 image sync를 자동 실행한다.
5. 프론트 match/team surfaces는 DB-backed 이미지가 있으면 이를 우선 사용한다.

## Parallel Work Breakdown

### Backend

- Prisma schema align (`Match.imageUrl`, `SportTeam.photos`)
- idempotent image sync script 추가
- full seed 종료 시 image sync 연결

### Frontend

- match image selection을 DB-backed image + venue gallery 기준으로 보강
- team detail gallery가 DB photos를 자연스럽게 소비하도록 유지

### Infra / Docs

- `make db-seed-images` 추가
- deploy workflow / guide / README 갱신
- destructive seed와 deploy-safe sync 구분 규칙 문서화

## Acceptance Criteria

- Given seed/demo 데이터가 비어 있는 이미지 필드를 가지고 있으면
  When full seed 또는 image sync를 실행하면
  Then 각 레코드에 더 다양한 local photoreal image path가 DB에 저장된다

- Given 운영 배포가 수행되면
  When migrate가 끝나면
  Then destructive full seed 없이 image sync가 자동 실행된다

- Given 레코드에 기존 remote image가 있으면
  When image sync가 실행되면
  Then 그 remote image는 유지되고 필요한 경우에만 local mock이 보강된다

## Tech Debt Resolved

- 프론트 타입과 Prisma schema 사이의 image field drift
- 운영 자동화에서 destructive seed와 non-destructive enrichment가 분리되지 않은 문제
- seed/demo 레코드의 광범위한 empty image field

## Security Notes

- deploy 자동화는 existing remote/user image를 덮어쓰지 않는다.
- image sync는 public mock path만 저장하며 secret/env 값은 다루지 않는다.

## Risks

- Prisma schema 확장으로 generated client refresh가 필요하다.
- 운영 DB에 image sync를 처음 적용할 때 일부 화면의 hero 선택 순서가 바뀔 수 있다.

## Ambiguity Log

- 2026-04-08: 이미지 다양화를 위해 external fetch를 붙일지 검토했으나, 현재 저장소 규칙과 운영 안전성을 고려해 vetted local photoreal catalog를 DB에 주입하는 방향으로 제한한다.
