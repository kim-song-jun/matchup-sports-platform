# Teameet v1 alpha 환경 운영

`https://alpha.teameet.co.kr`은 `dev` 브랜치의 v1 Web/API를 실제 HTTPS 환경에서 검증하는 비운영 환경이다. 프로덕션과 인프라·데이터베이스·업로드 볼륨을 공유하지 않는다.

프로덕션 배포의 공통 v1 경로·컨테이너 계약은 [`deploy/DEPLOY_GUIDE.md`](../../deploy/DEPLOY_GUIDE.md)를 함께 참고한다.

## 현재 검증된 release

2026-07-18 기준 마지막으로 CI와 alpha 배포, 공개 health를 함께 검증한 release는 아래와 같다.

| 항목 | 값 |
|---|---|
| source SHA | `9bf8e5d3812766d0f52a186900f1846ea1302a1a` |
| prerelease | `0.1.0-alpha.20260718.g9bf8e5d38127` |
| CI run | `29641356982`, success, 3분 38초 |
| alpha run | `29641356985`, success, 10분 19초 |
| public contract | `X-Teameet-Commit` 전체 SHA 일치, `X-Teameet-Release` prerelease 일치 |
| health | HTTP 200, `service=v1_api`, `checks.db=true` |

이 release에서 회원가입, 프로필 이미지 업로드, 팀, 대회 신청, 이벤트 lifecycle, 진행·완료 경기, 영상, 개인 어워드, 관리자 대진표, 대회 팝업 owner/support 권한을 실제 alpha 브라우저에서 확인했다. 최신 DPR1 화면 증거는 `output/playwright/visual-audit/2026-07-18-alpha-f2f1d720/`의 16~25번이며 09~15번은 DPR2/crop 문제로 사용하지 않는다.

## 보안 주의 — 현재 production 승격 차단

alpha가 별도 인프라를 사용한다는 사실만으로 production 복제 데이터가 안전해지는 것은 아니다. 다음 항목은 현재 미해결로 추적하며, 해결 또는 명시적 위험 수용 전에는 production 승격을 승인하지 않는다.

| 심각도 | 위험 | 필요한 운영 계약 |
|---|---|---|
| CRITICAL | migration·sanitize 전에 잘못된 DB/host target을 만날 수 있음 | instance tag, account, DB name, origin을 독립적으로 검증하고 하나라도 다르면 첫 mutation 전에 fail-closed |
| CRITICAL | production DB/uploads clone이 대부분 비식별화되지 않아 이메일·전화번호·password hash·OAuth·PII·admin grant가 남을 수 있고 운영 credential이 alpha에서 유효할 수 있음 | allowlist 기반 데이터 최소화 또는 전면 비식별화, 인증 credential 폐기/회전, admin grant 재구성, 업로드 개인정보 검사 |
| CRITICAL | production SSH 배포가 `StrictHostKeyChecking no` 사용 | known_hosts pinning 또는 host CA로 서버 신원 검증 |
| HIGH | upload quota가 per-user 중심이라 account fanout으로 디스크 고갈 가능 | 서비스/호스트 총량 quota, rate limit, disk alarm, fail-safe |
| HIGH | historical bracket backfill이 관리자 승인 없이 공개 가능 | backfill은 draft로 만들고 명시적 publish audit 후 공개 |
| MEDIUM | 임의 원격 이미지 tracking/origin, CSP `unsafe-inline`, mutable action/image tag | 이미지 proxy/allowlist, nonce/hash CSP, SHA/digest pinning |
| LOW | Nginx 약 55MB와 API 약 200MB upload limit 불일치 | 단일 사용자 계약으로 한도를 맞추고 동일 오류 형식 제공 |

CloudTrail, IAM least privilege의 실제 부여 상태, S3 encryption/public access block, EBS encryption, security group drift, SSM session logging은 코드 문서만으로 검증 완료 처리하지 않는다. 정기 AWS 증거 수집과 별도 보안 승인이 필요하다.

## 환경 계약

| 항목 | 값 |
|---|---|
| AWS 리전 | `ap-northeast-2` |
| EC2 태그 | `Name=teameet-alpha-dev`, `Environment=alpha`, `Branch=dev` |
| 런타임 | Amazon Linux 2023, `t3a.small`, encrypted gp3 30 GiB, Docker Compose |
| DNS | Route 53 A record `alpha.teameet.co.kr` |
| 공개 포트 | `80`, `443` |
| 관리 포트 | `22`, 현재 운영자 공인 IP `/32`만 허용 |
| 애플리케이션 | `apps/v1_api`, `apps/v1_web` |
| 브라우저 경로 | `/`; `/v1/*` alias는 없으며 `/v1/home`은 `404` |
| API 경로 | `/api/v1/*` |

Nginx Basic Auth는 사용하지 않는다. 애플리케이션의 비공개 기능은 v1 세션 인증과 권한 가드로 보호한다. 검색 엔진 유입을 막기 위해 alpha 응답에는 `X-Robots-Tag: noindex, nofollow, noarchive`를 유지하고, sitemap이나 외부 링크에서 alpha origin을 공개하지 않는다.

## 리소스 찾기

일시적인 IP나 계정 번호를 문서에 고정하지 않는다. 운영자는 AWS CLI 로그인 후 태그로 현재 리소스를 조회한다.

```bash
REGION=ap-northeast-2

aws ec2 describe-instances \
  --region "$REGION" \
  --filters \
    'Name=tag:Name,Values=teameet-alpha-dev' \
    'Name=instance-state-name,Values=pending,running,stopping,stopped' \
  --query 'Reservations[].Instances[].{id:InstanceId,state:State.Name,ip:PublicIpAddress,profile:IamInstanceProfile.Arn}'

aws ec2 describe-security-groups \
  --region "$REGION" \
  --filters 'Name=group-name,Values=teameet-alpha-*' \
  --query 'SecurityGroups[].{id:GroupId,name:GroupName,ingress:IpPermissions}'
```

Route 53 레코드의 대상은 EC2에 연결된 Elastic IP다. 인스턴스를 중지해도 Elastic IP는 자동 해제하지 않는다.

## 데이터 복제 계약

초기 alpha 데이터는 프로덕션 PostgreSQL을 읽기 전용 `pg_dump`로 내보내 새 alpha 전용 데이터베이스에 복원했다. 업로드 볼륨도 프로덕션에서 alpha로 한 방향 복사했다.

- 프로덕션 컨테이너·볼륨에는 쓰기 작업을 하지 않는다.
- alpha PostgreSQL과 uploads volume은 별도 Docker named volume이다.
- 복원 후에는 `prisma migrate deploy`로 `dev`의 추가 migration만 적용한다.
- 새 프로덕션 snapshot을 자동 동기화하지 않는다. 재복제는 개인정보 영향과 alpha 변경 폐기 여부를 검토한 뒤 수동 승인한다.
- alpha에서 만든 계정·대회·이벤트·업로드는 프로덕션으로 역동기화하지 않는다.
- 외부 결제, 메시지 발송, push 발송 같은 실사용자 side effect를 만드는 운영 credential은 alpha에 복사하지 않는다.
- 유료 대회의 은행명·계좌번호·예금주는 `deploy/alpha-sanitize.sql`로 테스트 안내값에 덮어쓴다. 실제 운영 입금 계좌를 alpha 신청 완료 화면에 노출하지 않는다.

### 대회 lifecycle QA 데이터

alpha 배포는 migration과 결제 안내 비식별화 뒤 `prisma/seed-alpha-tournament-qa.ts`를 실행한다. 이 seed는 `V1_ALPHA_QA_SEED=true`, 정확한 alpha origin, `v1_postgres/teameet_alpha` 조합이 모두 맞을 때만 실행되며, 고정 `aa1...` 대회 ID와 `[ALPHA QA]` 제목으로 식별되는 관리 대상만 교체한다. 프로덕션에서 복제한 기존 대회·사용자·업로드는 수정하거나 삭제하지 않는다.

seed는 lifecycle 기준 상태를 매 배포에서 다시 만들기 때문에 QA 중 만든 일시적인 대회 참가 신청은 다음 배포에서 초기화될 수 있다. 참가 신청 자체의 API/UI 검증과 배포 후 seed의 deterministic 상태 검증을 구분하고, alpha에 만든 registration을 장기 보존 데이터로 취급하지 않는다.

| 상태 | 대표 데이터 | 확인할 화면 |
|---|---|---|
| `draft` | 기획 중 대회 | 관리자 목록·편집 |
| `open` | 신청 2팀, 캠페인, 유료 참가 안내 | 이벤트 허브·신청 플로우 |
| `closed` | 확정 4팀, 잠긴 명단, 예정 대진 | 명단·대진 준비 |
| `in_progress` | 완료/진행 중/예정 경기가 함께 있는 조별리그 | 라이브 대진·스코어 |
| `completed` | 결과·순위·WebM 영상 2개·후기 2개·개인 어워드 3개·스폰서 | 결과·영상·후기·시상 |
| `cancelled` | 취소된 대회 | 관리자 상태 표시 |

일정은 배포 시점을 기준으로 상대 날짜를 다시 계산하므로 모집 중 대회가 시간이 지나 자동으로 과거 데이터가 되지 않는다. 영상은 외부 서비스에 의존하지 않는 3초 VP9 WebM 목자산을 사용한다. alpha QA 데이터는 실제 결제·송금·메시지 발송을 수행하지 않는다.

덤프 파일은 복원 확인 후 운영자 로컬 임시 디렉터리와 EC2 staging 영역에서 삭제한다. 보관이 필요하면 암호화된 제한 버킷에 만료 정책과 접근 감사를 함께 둔다.

## `dev` 자동 배포

`.github/workflows/deploy-alpha.yml`은 `dev` push와 함께 시작하지만, 같은 commit의 `CI / Deploy` 실행이 성공할 때까지 기다린 뒤에만 AWS 권한을 취득한다. GitHub 장기 AWS access key나 EC2 private key는 사용하지 않는다.

```text
dev push/merge
  -> PR Changeset 계약 확인
  -> CI / Deploy 성공
  -> Changesets에서 다음 정식 SemVer와 alpha prerelease 계산
  -> GitHub OIDC로 alpha 전용 IAM role 취득
  -> GitHub runner가 API/Web 이미지를 SHA 불변 태그로 ECR에 push
  -> source VersionId/checksum + 두 image digest를 release manifest에 고정
  -> SSM Run Command가 manifest를 검증하고 exact digest pull·migration·재기동
  -> health/digest/header 성공 후 candidate를 active로 원자적 승격
  -> alpha 실제 사용자 QA
  -> 승인된 경우에만 main release PR 준비
```

GitHub repository variables:

| 변수 | 책임 |
|---|---|
| `ALPHA_AWS_ROLE_ARN` | GitHub OIDC가 assume할 alpha 전용 role |
| `ALPHA_AWS_REGION` | `ap-northeast-2` |
| `ALPHA_EXPECTED_ACCOUNT_ID` | role drift를 막기 위해 런타임에서 정확히 비교할 alpha AWS account ID |
| `ALPHA_DEPLOY_BUCKET` | private release artifact bucket |
| `ALPHA_EC2_INSTANCE_ID` | alpha instance ID |

IAM 신뢰 정책은 `kim-song-jun/matchup-sports-platform` 저장소의 정확한 `refs/heads/dev` subject와 수동 rollback용 정확한 `environment:alpha` subject, `sts.amazonaws.com` audience만 허용한다. GitHub의 `alpha` environment 배포 branch policy도 반드시 `dev`만 허용해야 하며, required reviewer 승인 없이 rollback job을 시작하지 않는다. GitHub role은 alpha artifact/manifest prefix와 두 alpha ECR repository push, 해당 인스턴스의 SSM 명령만 허용한다. EC2 instance role은 SSM core, alpha artifact version 읽기, 두 alpha ECR repository pull만 가진다. provisioning은 account ID, 정확한 bucket 이름/owner, EC2 `Name`·`Environment=alpha`·`Branch=dev`, SSM online 상태를 mutation 전에 확인한다. 전용 role의 과거 inline policy는 canonical policy로 교체하며 예상 밖 attached policy가 있으면 자동 삭제하지 않고 중지한다. 초기 또는 drift 복구 시 AWS CLI 로그인 후 아래 멱등 스크립트를 실행한다.

```bash
ALPHA_AWS_REGION=ap-northeast-2 \
ALPHA_EXPECTED_ACCOUNT_ID=<alpha-account-id> \
ALPHA_DEPLOY_BUCKET=<private-versioned-bucket> \
ALPHA_EC2_INSTANCE_ID=<alpha-instance-id> \
bash scripts/infra/provision-alpha-immutable-deploy.sh
```

이미지는 EC2에서 빌드하지 않는다. GitHub runner가 `sha-<40자리 SHA>` 태그로 한 번만 만들고, ECR tag immutability가 같은 태그 덮어쓰기를 거부한다. source와 manifest의 최초 S3 저장은 `If-None-Match: *` create-only 조건을 사용하며, 같은 SHA 재실행은 기존 객체의 VersionId와 checksum을 비교·재사용한다. 소스도 `/home/ec2-user/.teameet-alpha-sources/<SHA>`에 불변 디렉터리로 보존하고 `/home/ec2-user/teameet` symlink만 원자적으로 바꾼다. `.env`, certbot 상태, release header metadata는 `/home/ec2-user/.teameet-alpha-runtime`에 분리하며, 후보 실패나 rollback 때 이미지와 소스를 같은 manifest SHA로 함께 복구한다. 최초 불변 전환에서도 기존 text receipt의 SHA를 공개 header와 대조하고 그 SHA부터 후보 SHA까지 migration 호환성 검사를 통과해야만 배포를 시작하며, manifest의 `migrationValidatedFrom`에 그 기준 SHA를 남긴다. release state는 active/previous manifest 본문과 각각의 SHA-256을 분리 저장해 rollback 전에 다시 대조한다. migration 뒤에는 alpha 전용 결제 안내 비식별화와 대회 lifecycle QA seed를 직렬 적용하며, health·실행 image digest·release header가 모두 성공해야 `/home/ec2-user/.teameet-alpha-releases/state.json`의 candidate가 active가 된다. 호환용 텍스트 receipt `/home/ec2-user/.teameet-alpha-release`도 함께 갱신한다.

SSM 명령은 첫 줄에서 `set -Eeuo pipefail`을 강제한다. deploy가 실패한 뒤 cleanup 명령이 성공해 전체 실행이 성공처럼 보이는 상태를 허용하지 않는다. Amazon Linux 이미지에 `rsync`가 없으면 배포 스크립트가 한 번 설치한 뒤 source mirror를 진행한다. GitHub의 최종 검증은 단순 HTTP 200이 아니라 예상 SemVer prerelease, 전체 commit SHA, DB health가 모두 일치할 때까지 최대 3분 동안 확인한다.

### v1 전용 CI 계약과 캐시

`CI / Deploy`의 검증 대상은 `apps/v1_api`와 `apps/v1_web`뿐이다. legacy `apps/api`·`apps/web` lint, test, integration, build는 실행하지 않으며, 아래 v1 게이트는 생략하지 않고 직렬로 유지한다.

1. lockfile 기준 의존성 설치와 v1 DB guardrail
2. v1 Prisma client 생성, API type-check, Web lint
3. 빈 PostgreSQL에 전체 migration replay, schema drift 0 확인, v1 API integration test
4. v1 API·Web unit test
5. v1 API build 뒤 v1 Web build

CI의 pnpm 의존성 store 캐시는 `actions/setup-node@v4`의 `cache: pnpm`이 단독으로 관리한다. 별도의 `pnpm store path`와 `actions/cache` 조합을 겹쳐 쓰지 않는다. `apps/v1_web/.next/cache`는 pnpm 의존성 캐시가 아니라 Next.js 증분 빌드 캐시이므로 별도로 유지한다. 캐시 miss나 복원 실패는 시간을 늘릴 수 있지만 검증 결과를 바꾸거나 게이트를 건너뛰어서는 안 된다.

이전 관측에서 legacy integration만 약 6분 46초로 전체 약 11분의 큰 비중을 차지했다. 개선 효과는 한 번의 빠른 실행으로 확정하지 않고, 변경 전후 GitHub Actions의 step timing을 같은 범주의 PR 또는 `dev` 실행에서 비교한다. cold cache와 warm cache를 구분하고 각각 3회 이상 기록해 중앙값과 범위를 남기며, 의존성 설치·migration/integration·unit·build 시간을 따로 본다. alpha 호스트 Docker build 시간은 CI 시간과 섞지 않고 API/Web별로 별도 측정한다.

기존 검증 실행은 CI 3분 38초, EC2 build 기반 alpha 배포 10분 19초였다. 전체 테스트를 alpha workflow에 중복 추가하지 않는다. 새 경로는 runner API/Web build, ECR push/cache, manifest, SSM pull, migration·sanitize·seed, restart, health를 별도 timing으로 기록한다. 같은 SHA 재실행은 build를 생략해야 한다.

GitHub는 일부 `actions/*@v4` JavaScript action의 Node 20 runtime 폐기와 Node 24 강제 전환 경고를 표시했다. workflow가 현재 성공했다는 이유로 경고를 닫지 말고, 사용하는 action major가 Node 24를 공식 지원하는지 확인해 지원 버전으로 올린 뒤 동일 CI/alpha 계약을 재검증한다. mutable major tag만 신뢰하지 않고 보안 검토된 commit SHA pinning도 함께 검토한다.

### alpha ECR·manifest 상태

두 repository는 `teameet-alpha-v1-api`, `teameet-alpha-v1-web`이며 tag immutability, push scan, AES256 encryption을 유지한다. build 뒤 ECR scan 완료를 기다리고 `CRITICAL` finding이 하나라도 있으면 manifest/deploy를 중단하며 `HIGH` 개수는 로그로 남긴다. Compose의 API, Web, upload initializer에는 tag가 아니라 manifest의 `repository@sha256:...`만 전달한다. S3 source와 manifest는 bucket versioning이 켜진 상태에서 VersionId와 SHA-256을 함께 검증한다.

상태 파일은 `candidate`, `active`, `previous` 의미를 분리한다. 실패 candidate는 `failed/`로 옮기고 active를 바꾸지 않는다. 성공 뒤에만 candidate가 active가 되고 기존 active가 previous가 된다. DB migration은 `expand-contract`, rollback은 `application-images-only` 계약이다. CI는 직전 immutable manifest SHA부터 새 SHA까지 기존 migration 수정과 drop/rename/type/not-null 같은 contract SQL이 없는지 확인하고, manifest의 `rollbackCompatibleWith`에 그 직전 SHA를 고정한다. rollback은 이 값이 실제 previous SHA와 정확히 같지 않으면 거부한다. 최초 immutable release는 previous manifest가 없으므로 rollback 대상이 아니다.

수동 rollback은 현재 active 전체 SHA를 stale-operation guard로 입력한다. GitHub의 `Rollback Alpha` workflow는 alpha environment 승인을 거쳐 active/previous를 교환하고 digest·health·header를 다시 확인한다. production에는 이 경로를 사용하지 않는다.

## Changesets와 배포 버전

Teameet v1은 `v1_api`와 `v1_web`을 하나의 fixed Changesets 그룹으로 관리한다. 사용자 동작·API·배포 계약을 바꾸는 PR은 `.changeset/*.md`에서 `patch`, `minor`, `major` 중 하나를 선언한다. 여러 PR을 한 번에 릴리스하면 가장 높은 bump가 다음 정식 버전을 결정한다.

alpha는 그 다음 정식 버전에 commit 날짜와 SHA를 붙인 deterministic prerelease를 사용한다.

```text
현재 정식 기준: 0.0.1
minor Changeset 계획: 0.1.0
alpha 배포: 0.1.0-alpha.20260718.gabcdef123456
향후 release PR: 0.1.0
```

같은 SHA를 재배포하면 같은 prerelease를 사용한다. 빌드나 health check가 실패하면 state file을 갱신하지 않는다. API와 Web 이미지, `/home/ec2-user/.teameet-alpha-release`, 공개 응답의 `X-Teameet-Release`·`X-Teameet-Commit`은 모두 같은 version/SHA를 가져야 한다.

```bash
ssh -i ~/.ssh/teameet-alpha-20260717 ec2-user@<alpha-ip> \
  'sed -n "s/^\(release\|sha\|deployed_at\)=/\1=/p" ~/.teameet-alpha-release'

curl -fsSI https://alpha.teameet.co.kr/landing | \
  grep -Ei '^(x-teameet-release|x-teameet-commit):'
```

ECR의 `sha-*` tagged 이미지는 자동 만료하지 않는다. lifecycle은 7일이 지난 untagged build 잔여물만 제거하므로 active/previous rollback digest를 삭제하지 않는다. 향후 tagged retention을 도입하려면 EC2 active/previous state와 대조하는 state-aware GC가 먼저 필요하다. 단순 `dev.1`, `dev.2` 카운터는 사용하지 않는다.

## alpha QA와 main 승격

alpha는 프로덕션 전 필수 QA 환경이다. CI green만으로 main 승격이나 정식 배포를 승인하지 않는다.

1. PR에 Changeset과 실제 변경을 함께 리뷰한다.
2. PR을 `dev`에 병합한다.
3. 같은 SHA의 CI 성공 뒤 alpha가 자동 배포될 때까지 기다린다.
4. alpha에서 실제 persona로 이벤트 탐색, 대회 신청/결제 안내, 알림, 프로필, 관리자 플로우와 모바일·태블릿·데스크톱 UI를 확인한다.
5. console/network 오류, 중복 제출, 권한, 반응형, 스크린샷 보고서를 승인한다.
6. 검증된 alpha SHA를 보존하는 방식으로 `dev -> main` 승격 PR을 병합한다.
7. `Prepare Main Release PR` workflow에 검증된 alpha version/SHA를 입력한다. workflow는 public alpha header와 main ancestry를 다시 확인한 뒤 draft Changesets release PR만 만든다.
8. release PR이 승인·병합되기 전에는 정식 SemVer, tag, GitHub Release, 프로덕션 배포를 만들지 않는다.

현재 작업 범위에서는 6~8단계를 실행하지 않는다. main 병합·정식 tag·프로덕션 배포는 별도 사용자 승인 대상이다.

## TLS 자동 갱신

인증서는 Let's Encrypt webroot 방식으로 발급한다. `teameet-alpha-certbot.timer`가 매일 임의 지연을 두고 갱신 여부를 확인하며, 성공한 실행 뒤 Nginx를 reload한다.

```bash
sudo systemctl status teameet-alpha-certbot.timer
sudo systemctl list-timers teameet-alpha-certbot.timer
sudo systemctl start teameet-alpha-certbot.service
sudo journalctl -u teameet-alpha-certbot.service --since today
```

배포 전후에는 다음을 확인한다.

```bash
curl -fsSI https://alpha.teameet.co.kr/landing
curl -fsS https://alpha.teameet.co.kr/api/v1/health | jq -e '.data.checks.db == true'
test "$(curl -sS -o /dev/null -w '%{http_code}' https://alpha.teameet.co.kr/v1/home)" = 404
```

## 운영·장애 대응

```bash
cd ~/teameet/deploy

docker compose --project-name deploy \
  -f docker-compose.prod.yml \
  -f docker-compose.alpha.yml \
  --env-file .env ps

docker logs --tail 100 teameet_v1_api
docker logs --tail 100 teameet_v1_web
docker logs --tail 100 teameet_nginx
```

- `.env`, private key, DB dump, Basic Auth 폐기 전 credential은 출력하거나 Git에 추가하지 않는다.
- 다른 세션이 만든 Node·브라우저·Docker 프로세스를 광범위하게 종료하지 않는다.
- migration 실패 시 새 컨테이너 전환을 중지하고 원인을 수정한다. 코드·DB 롤백은 사용자 승인 뒤 수행한다.
- alpha가 필요 없을 때는 EC2를 중지해 compute 비용을 줄일 수 있지만 Elastic IP, EBS, S3, Route 53 비용은 남는다.

## 폐기 순서

alpha를 완전히 삭제할 때는 먼저 필요한 QA 증거만 보존하고 다음 순서로 진행한다.

1. GitHub alpha 자동 배포를 비활성화한다.
2. alpha DB와 uploads의 보존 필요성을 확인한다.
3. Route 53 `alpha` A record를 제거한다.
4. EC2 종료, Elastic IP 해제, security group과 key pair 삭제를 수행한다.
5. alpha artifact bucket, IAM roles, instance profile, GitHub repository variables를 삭제한다.
6. 로컬 `~/.ssh/teameet-alpha-*` 파일을 안전하게 삭제한다.
7. CloudTrail과 결제 내역에서 잔존 리소스가 없는지 확인한다.
