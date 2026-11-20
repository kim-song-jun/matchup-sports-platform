# Node.js 보안 권고 SMR261116 대응

기준: [2026-11-11 보안 릴리스](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases), [22.23.5 LTS](https://nodejs.org/en/blog/release/v22.23.5).

## 적용 범위

v1 API·worker·cutover tool·Web은 `22.23.5-alpine`, 개발·검증은 `22.23.5-bookworm-slim`의 공식 multiarch digest로 고정한다. `.nvmrc`와 CI는 22.23.5를 선택한다. 세 package의 engine은 `>=22.23.5 <23`이다. 서버 초기 설정은 NodeSource 22를 설치한 뒤 실행 버전의 최소 패치와 메이저를 확인한다.

저장소 루트에서 `node scripts/qa/check-node-security.mjs`로 실제 Node 버전과 shipping 설정을 함께 검사한다. `node --test --test-concurrency=1 scripts/qa/check-node-security.test.mjs`는 취약 런타임과 설정 회귀를 차단하는지 확인한다. engine 선언 자체만으로 모든 패키지 관리자가 설치를 거부한다고 가정하지 않는다.

## 배포 검증

이미지 태그만으로 기존 서버가 패치되었다고 판단하지 않는다. dev CI와 Alpha 배포 성공 후 배포 SHA가 머지 커밋을 포함하는지 확인하고, Alpha의 API·Web·worker 컨테이너에서 `node --version`을 확인한다. 신규 이미지의 digest와 Node 버전, API health 및 Web HTTP 상태를 증거로 남긴다. 기존 ECR 보안 스캔을 우회하지 않는다.

production은 이 PR로 자동 갱신되지 않는다. main 승격과 운영 배포는 사용자가 수행한다. 개발 PC의 현재 22.17.0도 별도 업데이트가 필요하며, 이 변경에서 시스템 전체 Node 설치를 임의 교체하지 않는다.

서버 초기 설정은 NodeSource 공식 배포 저장소의 검토한 커밋 `9b431d8ae0f10df272598585855c6eca6c0e1bd2` 설치 파일을 내려받아 SHA256 `b0ed2b9b66002e7ee802e8777cf3a92b25f1ecc0129812dc6f59a43a536810cc`를 확인한 뒤 실행한다. 내려받기나 무결성 검사가 실패하면 sudo 실행 전에 중단한다. CI는 변조된 설치 파일이 실제로 실행되지 않는지 검사한다.

2026-11-17 사전 실측: Alpha API·Web·worker는 모두 v22.23.5였다. 이 PR은 기존 보안 버전의 재현성과 회귀 방지를 보강한다. 운영 배포 완료를 의미하지 않는다.

## 이후 보안 패치

새로운 22 보안 릴리스가 나오면 .nvmrc·CI·engine·Docker 버전/digest·검사 기준을 같은 변경에서 갱신한다. digest는 registry에서 실재 여부와 플랫폼을 확인하고, 실제 컨테이너 버전 검사 후 반영한다. 24/26 전환은 별도 호환성 검토가 필요하다.
