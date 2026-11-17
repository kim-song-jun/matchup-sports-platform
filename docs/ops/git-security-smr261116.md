# Git 보안 권고 SMR261116 대응

2026-11-16 ICTIS 권고: CVE-2026-111760, CVE-2026-105437.
정본: [Git 2.56.1 릴리스 노트](https://github.com/git/git/blob/v2.56.1/Documentation/RelNotes/2.56.1.adoc).
GHSA-vp2w-7xxj-jvxr 페이지의 `Patched versions: none` 표기는 릴리스 노트와 다르므로, 릴리스 노트의 수정 버전과 실제 설치 패키지를 근거로 판단한다.

## 실행 및 조치

저장소 루트에서 `bash scripts/qa/check-git-security.sh`를 실행한다. 실제 PATH의 Git을 검사하며, 정상 종료와 `Git security PASS`가 함께 있어야 통과다.

통과 기준은 2.50.2 / 2.51.3 / 2.52.1 / 2.53.1 / 2.54.1 / 2.55.1 / 2.56.1 이상인 해당 유지보수 계열 또는 이후 계열이다. 구계열, prerelease, 해석할 수 없는 출력, 실행 실패는 차단한다. Windows의 `.windows.N` 빌드를 지원한다.

실패하면 OS 공급자의 보안 업데이트로 Git을 갱신하고 같은 명령을 다시 실행한다. 공급자 저장소가 수정 버전을 제공하지 않으면 초기 설정을 중단한다. 임의 저장소 추가나 소스 빌드로 우회하지 않는다. 배포판 backport는 공급자 advisory, 패키지 전체 버전, 해당 CVE 수정 근거를 운영자에게 제출하여 별도 검토한다. 낮은 버전이라는 이유만으로 실제 취약성을 확정하지 않으며, 근거 없는 backport 허용 옵션도 만들지 않는다.

## 적용 범위와 검증

- CI Gates에서 실행 버전과 경계 테스트를 확인하고 API·Web·이미지 빌드·배포·Alpha·승격 job도 checkout 직후 실행 버전을 검사한다. checkout은 submodule 재귀 처리를 사용하지 않는다. 이 검사는 검사 이전에 실행된 GitHub 자체 checkout 내부 도구의 안전성을 증명하지 않는다.
- 서버 초기 설정 두 경로에서 Git 설치 직후 검사한다. 기존 서버의 설치 패키지는 이 PR만으로 갱신되지 않는다.
- 기존 Alpha/production 서버 및 다른 개발 PC는 각 호스트에서 검사하고 OS·패키지 버전·판정·시간을 기록해야 한다. production 접근·변경 및 main 승격은 별도 운영 권한 절차를 따른다.
- 신뢰하지 않는 저장소의 `git clone --recurse-submodules`는 피한다. 현재 저장소의 workflow에 submodule 재귀 checkout 설정은 없다.
- `bash scripts/qa/test-git-security.sh`는 각 유지보수 버전의 미달/충족 경계와 실행 실패를 검증한다.

## 이번 세션 증거

개발 PC `git version 2.56.1.windows.1` 확인. 기존 Alpha/production 호스트 버전은 미확인이고, 이를 해결 완료로 표시하지 않는다.
