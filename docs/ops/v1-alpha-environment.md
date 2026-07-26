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
  -> commit SHA별 source archive를 versioning이 켜진 private S3에 업로드
  -> SSM Run Command가 alpha EC2에서 직렬 빌드·migration·재기동
  -> health contract 성공 후 prerelease version + SHA 확정
  -> alpha 실제 사용자 QA
  -> 승인된 경우에만 main release PR 준비
```

GitHub repository variables:

| 변수 | 책임 |
|---|---|
| `ALPHA_AWS_ROLE_ARN` | GitHub OIDC가 assume할 alpha 전용 role |
| `ALPHA_AWS_REGION` | `ap-northeast-2` |
| `ALPHA_DEPLOY_BUCKET` | private release artifact bucket |
| `ALPHA_EC2_INSTANCE_ID` | alpha instance ID |

IAM 신뢰 정책은 `kim-song-jun/matchup-sports-platform` 저장소의 `refs/heads/dev`로 제한한다. GitHub role은 alpha artifact prefix 쓰기와 해당 인스턴스의 SSM 명령 실행만 허용한다. EC2 instance role은 SSM core 권한과 alpha artifact prefix 읽기만 가진다.

배포는 `COMPOSE_PARALLEL_LIMIT=1`로 API 이미지 다음 Web 이미지를 순차 빌드한다. migration 뒤에는 alpha 전용 결제 안내 비식별화와 대회 lifecycle QA seed를 직렬 적용하며, health check까지 성공해야 `/home/ec2-user/.teameet-alpha-release`가 갱신된다.

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

현재 검증 실행은 CI 3분 38초, alpha 배포 10분 19초다. 전체 테스트를 alpha workflow에 중복 추가하지 않는다. SSM command 대기, source artifact 전송, API build, Web build, migration·sanitize·seed, container restart, health polling을 별도 timing으로 기록해 alpha의 약 10분 병목을 먼저 줄인다.

GitHub는 일부 `actions/*@v4` JavaScript action의 Node 20 runtime 폐기와 Node 24 강제 전환 경고를 표시했다. workflow가 현재 성공했다는 이유로 경고를 닫지 말고, 사용하는 action major가 Node 24를 공식 지원하는지 확인해 지원 버전으로 올린 뒤 동일 CI/alpha 계약을 재검증한다. mutable major tag만 신뢰하지 않고 보안 검토된 commit SHA pinning도 함께 검토한다.

### alpha Docker BuildKit 캐시

alpha API와 Web Dockerfile은 BuildKit cache mount를 사용한다. 두 이미지는 `teameet-pnpm-store`를 공유하고 `sharing=locked`로 동시 쓰기를 막는다. Web의 `.next/cache`는 `teameet-v1-web-next-cache`로 분리한다. 호스트 preflight와 API → Web 순차 build는 그대로 유지되므로 캐시는 배포 순서나 migration·health gate를 대체하지 않는다.

`RUN --mount=type=cache`를 해석하지 못하거나 build frontend 오류가 나면 배포를 중지하고 현재 실행 중인 release를 유지한다. 먼저 `docker version`, `docker buildx version`, `docker info`, `docker system df`로 Docker/Buildx 지원과 디스크 상태를 확인한다. BuildKit이 설치되어 있지만 비활성화된 경우 다음처럼 명시적으로 켜고 preflight 뒤 이미지를 순서대로 다시 빌드한다.

```bash
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
docker compose --project-name deploy -f docker-compose.prod.yml -f docker-compose.alpha.yml build v1_api
docker compose --project-name deploy -f docker-compose.prod.yml -f docker-compose.alpha.yml build v1_web
```

Buildx가 없거나 Docker 버전이 cache mount를 지원하지 않으면 Docker/Buildx를 업그레이드한 뒤 재시도한다. legacy builder에 맞추려고 cache mount를 조용히 제거하거나 migration·재기동으로 진행하지 않는다. 캐시 이상이 의심되면 `docker buildx du`로 사용량을 확인하고, 다른 세션·배포의 캐시까지 지우는 broad prune 전에 영향 범위와 복구 비용을 검토한다.

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

API와 Web의 최근 성공 alpha 태그 3개만 유지한다. 단순 `dev.1`, `dev.2` 카운터는 사용하지 않는다.

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
