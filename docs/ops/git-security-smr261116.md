# Git 보안 권고 SMR261116 대응

2026-11-16 ICTIS 권고: CVE-2026-111760, CVE-2026-105437.
정본: [Git 2.56.1 릴리스 노트](https://github.com/git/git/blob/v2.56.1/Documentation/RelNotes/2.56.1.adoc).
GHSA-vp2w-7xxj-jvxr 페이지의 `Patched versions: none` 표기는 릴리스 노트와 다르므로, 릴리스 노트의 수정 버전과 실제 설치 패키지를 근거로 판단한다.

## 실행 및 조치

저장소 루트에서 `bash scripts/qa/check-git-security.sh`를 실행한다. 실제 PATH의 Git을 검사하며, 정상 종료와 `Git security PASS`가 함께 있어야 통과다.

통과 기준은 2.50.2 / 2.51.3 / 2.52.1 / 2.53.1 / 2.54.1 / 2.55.1 / 2.56.1 이상인 해당 유지보수 계열 또는 이후 계열이다. 구계열, prerelease, 해석할 수 없는 출력, 실행 실패는 차단한다. Windows의 `.windows.N` 빌드를 지원한다.

실패하면 OS 공급자의 보안 업데이트로 Git을 갱신하고 같은 명령을 다시 실행한다. 공급자 저장소가 수정 버전을 제공하지 않으면 초기 설정을 중단한다. 임의 저장소 추가나 소스 빌드로 우회하지 않는다. 배포판 backport는 공급자 advisory, 패키지 전체 버전, 해당 CVE 수정 근거를 확인한다. 낮은 버전이라는 이유만으로 실제 취약성을 확정하지 않으며, 근거 없는 backport 허용 옵션도 만들지 않는다.

## Amazon Linux 2023

[ALAS2023-2026-3445](https://alas.aws.amazon.com/AL2023/ALAS2023-2026-3445.html)는 두 CVE를 `2.50.1-1.amzn2023.0.2`에 backport했다. 따라서 `git --version`은 패치 후에도 2.50.1이다. 검사기는 실제 실행 바이너리의 RPM 소유자가 git-core인지, upstream 2.50.1 및 release `1.amzn2023.0.2` 이상인지, 공급자가 Amazon Linux인지, `rpm -V git-core`가 설치 파일의 무결성을 확인하는지 모두 검증한 경우에만 이 backport를 허용한다.

공식 조치는 `sudo dnf update -y --advisory ALAS2023-2026-3445 --releasever 2023.12.20261112`다. AL2023는 release snapshot이 고정되어 일반 yum update에서 최신 보안 패키지가 보이지 않을 수 있다. 적용 전 현재 Git RPM을 기록하고 적용 후 `rpm -q git git-core`와 보안 검사기를 다시 실행한다. 이 advisory의 Git 패키지 갱신은 서비스 재시작이나 DB 변경을 요구하지 않는다. production 실행은 별도 사용자 운영 절차를 따른다.

## 적용 범위와 검증

- CI Gates에서 실행 버전과 경계 테스트를 확인하고 API·Web·이미지 빌드·배포·Alpha·승격 job도 checkout 직후 실행 버전을 검사한다. checkout은 submodule 재귀 처리를 사용하지 않는다. 이 검사는 검사 이전에 실행된 GitHub 자체 checkout 내부 도구의 안전성을 증명하지 않는다.
- 서버 초기 설정 두 경로에서 Git 설치 직후 검사한다. 기존 서버의 설치 패키지는 이 PR만으로 갱신되지 않는다.
- 기존 Alpha/production 서버 및 다른 개발 PC는 각 호스트에서 검사하고 OS·패키지 버전·판정·시간을 기록해야 한다. production 접근·변경 및 main 승격은 별도 운영 권한 절차를 따른다.
- 신뢰하지 않는 저장소의 `git clone --recurse-submodules`는 피한다. 현재 저장소의 workflow에 submodule 재귀 checkout 설정은 없다.
- `bash scripts/qa/test-git-security.sh`는 각 유지보수 버전의 미달/충족 경계와 실행 실패를 검증한다.

## 이번 세션 증거

개발 PC `git version 2.56.1.windows.1` 확인. Alpha는 Git 2.50.1 / git-core 및 git RPM `2.50.1-1.amzn2023.0.1`로 확인되어 공식 수정 release보다 낮다. production은 미확인이다. Alpha 업데이트 후 패키지 release 및 검사 결과를 별도로 기록한다.

2026-11-17 Alpha 적용 결과: git/git-core/git-core-doc/perl-Git을 공식 `.0.2`로, 패키지 관리자가 요구한 expat을 2.8.3으로 갱신했다. 보안 검사기의 검증된 backport 판정 PASS. API health의 DB true 및 landing HTTP 200 확인. 서비스 재시작이나 DB 변경은 없었다. production 조치 완료를 의미하지 않는다.
