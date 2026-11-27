# 개인정보 보호 구현 현황과 진행 게이트

2026-11-19 · Task 20261137 · 브랜치 `feat/personal-data-protection` · 전체 구현 미완료

계획 정본은 [보호 수준과 적용 계획](./personal-data-protection-plan.md)이다. 이 문서는 실제 구현/검증 현황만 기록한다. 사용자는 전체 구현과 PR, 본인만 브랜치 수정·머지를 요청했다. 현재는 아래 차단 조건 때문에 리뷰용 Draft 단계다.

## 실제 반영한 코드

- 비밀번호: 비용을 명시한 버전 해시(`scrypt`, N=32768/r=8/p=3), 기존 해시 검증 호환, 미존재/잘못된/기존/새 계정에 동일한 두 비용 검증. 일반 비밀번호 로그인 성공 때 기존 해시를 CAS로 업그레이드하고 비밀번호 재설정 경합 시 세션 발급을 거부한다. OTP 단계 인증 경로의 기존 해시 업그레이드는 후속 범위다.
- 별도 암호화 모듈: AES-256-GCM 랜덤 IV, 환경·모델·필드·행 ID 인증 데이터, 위변조/다른 행·필드·환경 복사 거부, 암호문 버전과 구 키 읽기. 키 없는 평문 fallback은 없다.
- 별도 KMS 로더: 환경/목적/버전을 KMS encryption context에 결합한다. 키는 KMS-wrapped 값만 입력받고 encryption/search 목적을 분리한다. SDK 평문 버퍼는 복사 후 지우며 호출 시간 제한을 둔다. 실제 KMS 역할/키는 발급하지 않았다.
- 저장 변환 후보: 중첩 쓰기와 복합/관계 정확 일치 필터를 처리하며 보호 필드는 안정적인 행 ID를 요구한다. 부분 검색·정렬·범위/JSON 필터는 명시 거부한다. **실제 PrismaService/어떤 운영 서비스에도 연결하지 않았다.** 실제 DB 실행 증거가 없으며 전체 ORM 계약을 충족한 것으로 표시하지 않는다.
- 실행되지 않는 [expand SQL 검토안](./personal-data-expand-proposal.sql): `apps/v1_api/prisma/migrations` 외부에 둔다. 현재 schema와 migration chain은 원래 그대로다. 새 lookup 컬럼 제안은 13모델/23필드 초기 범위 중 text22필드다. JSON1필드는 별도 보관한다.

## 범위 처리 현황

| 단계 | 현재 상태 | 남은 작업 |
|---|---|---|
| P0 | 초기 후보13모델/23필드 식별 | 전체 읽기/쓰기/원문 복사본, 채팅·첨부·오류/감사/내보내기·캐시·백업 전수 인벤토리 미완료 |
| P1 | 기존 redaction 코드 확인 | 관리자 서버 마스킹/개별 원문 열람 권한·감사/화면 연결 미구현 |
| P2 | 암호화/KMS/변환 후보 및 비밀번호 개선 | 실제 KMS·회전·장애/부하 실측, OTP 로그인 업그레이드·전체 저장 경계 연결 미완료 |
| P3 | SQL 제안만 작성, 실제 schema 변경 없음 | 활성 migration·중복 검사/검색 계약·계정 연결·백필/전환/복구 도구 미구현 |
| P4 | 명단·문의·감사 후보 일부 식별 | 모든 복사본 실제 암호화/정리 미구현 |
| P5 | 로컬 단위/타입 검증, Draft PR 준비 | 최신 SHA 원격 CI, 실제 DB/Alpha 검증·운영 전환 미실행 |

서비스의 이메일·전화번호·실명·생년월일이 이번 코드로 암호화되어 저장된다고 설명하면 안 된다. 신규 모듈이 존재하는 것과 실제 저장 경로에 적용된 것은 별개다. 계좌 정보(`V1Tournament.bankAccount/bankHolder`)와 입금자명(`V1TournamentRegistration.depositorName`)도 실제 schema에 있어 후속 대상에 포함한다.

## 자동 승인 검토 차단

자동 승인 검토가 중앙 PrismaService와 광범위한 schema/migration을 묶어 모든 API 저장·조회를 변경하는 명령을 거부했다. 사유는 전체 서비스 장애와 데이터 접근 차단 위험이었다. 해당 명령은 실행되지 않았다. 거부된 중앙 서비스 연결을 다른 경로로 우회 적용하지 않았다.

대신 영향이 제한되는 비밀번호 개선과 별도 모듈을 검증했다. 잠정 lookup schema 변경은 작업자가 추가한 부분만 회수하고, 자동 적용되지 않는 SQL 검토안으로 옮겼다. 전역 연결과 실제 데이터 전환을 계속하려면 그 위험을 확인한 명시적 승인이 필요하다. 이 문서나 Draft PR은 승인을 대체하지 않는다.

전역 연결 전에 검증해야 할 계약은 안정적인 행 ID 없는 select/nested create/updateMany, `$transaction` 배열·interactive transaction, raw SQL/JSON 검색, unique/계정 연결 경합, 평문/암호문 전환 중 쓰기·재시작·복구다. 실제 격리 PostgreSQL 결과를 얻기 전 활성화하지 않는다.

## PR 접근 제한

- upstream은 개인 소유 공개 저장소이며 현재 `seeungmin`은 push=true, admin=false, maintain=false다.
- 개인 소유 fork `seeungmin/matchup-sports-platform`은 부모 저장소를 확인했고 쓰기 가능한 collaborator는 seeungmin 한 명이다. PR 소스는 이 fork 브랜치를 사용한다.
- PR 생성 때 `maintainer_can_modify=false`로 upstream 관리자의 fork 수정 허용을 끄고 실제 값을 확인한다. 이는 소스 브랜치 수정 제한이며, 공개 코드의 조회/복사 제한이 아니다.
- upstream의 **PR 머지를 seeungmin만 허용하는 제한은 미적용**이다. Draft도 강한 권한 제한의 대체가 아니다. upstream 쓰기 권한자는 PR을 ready로 바꿀 수 있다.
- 특정 PR head 보호만으로 dev의 merge 권한을 바꿀 수 없다. 조직 소유 저장소의 branch push 사용자 제한을 현재 개인 소유 저장소에 그대로 적용할 수 없으며, 관리자와 별도의 권한 정책을 확정해야 한다. dev 전체 merge 권한을 임의로 바꾸지 않았다.

근거: [GitHub fork PR 수정 허용](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/creating-a-pull-request-from-a-fork), [GitHub 브랜치 보호와 사용자 제한](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

## 검증 기록

- auth.service177/177 + password/cipher/KMS/storage15/15 + 인증/복구214/214, 합계406개 로컬 단위 테스트 PASS. KMS와 Prisma 저장소는 격리 대역이며 실제 운영 KMS/DB 검증을 의미하지 않는다.
- legacy 비밀번호 로그인 후 새 해시 저장·세션 발급, 재설정 경합 시 업그레이드 미반영/401을 검증했다.
- 별도 모듈에서 반복 암호화 결과 차이, 위변조·다른 행/필드/환경·잘못된 키 거부, 구 키 복호화, 목적별 HMAC, 중첩 저장/조회, 필터 변환 및 미지원 계약 실패를 확인했다.
- 최종 API 타입·surface 검사 PASS. 원격 CI는 PR에 실행 결과를 기록한다. 전체 구현 합격과 구분한다.
- 로컬 Node22.23.1은 요구 >=22.23.5보다 낮아 경고가 있다. 실제 .env/운영 PII/키를 조회하지 않았고 DB migration, 키 발급, dev/main merge/배포는 실행하지 않았다.
