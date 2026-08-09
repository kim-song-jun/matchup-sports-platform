---
"v1_api": patch
---

ECR 이미지 스캔 게이트의 fail-open 과 일시 오류 취약성을 고친다 — alpha·prod 양쪽.

`check-alpha-image-scans.sh` 와 `check-prod-image-scans.sh` 는 저장소 이름과 로그 라벨 3줄만
다른 완전한 복사본이었고, 그 중복 때문에 아래 두 결함이 **양쪽에 똑같이** 있었다.

**1) 스캔 결과를 못 읽으면 게이트가 조용히 통과했다 (fail-open).**

`findings` 가 비면 `critical=""` 이 되고, bash 산술은 빈 값을 0 으로 취급하므로
`(( critical == 0 ))` 이 참이 된다. 보안 게이트가 "확인 못 했음" 을 "문제 없음" 으로 보고한
것이다. 실제 배포 로그에 흔적이 남아 있다:

```
[alpha-scan] teameet-alpha-v1-api critical= high=
```

**2) 일시적 AWS CLI 내부 오류가 배포를 죽였다.**

```
aws: [ERROR]: 'NoneType' object does not support item assignment
```

스캔 결과가 아니라 CLI 자체의 크래시인데 재시도가 없어 게이트가 그대로 실패했다.
2026-08-08~09 alpha 에서만 3회 발생, 매번 사람이 재실행해야 했다.

## 변경

- `scripts/release/image-scan-common.sh` 신설 — 두 스크립트가 source 한다. 중복이 결함을
  두 곳에 존재하게 한 원인이므로 같은 변경에서 제거했다.
- **스캔 상태가 명시적으로 `COMPLETE` 일 때만** 카운트를 해석한다. 그 외(빈 응답, 조회 실패,
  `IN_PROGRESS`)는 전부 fail-closed. 취약점 0건인 정상 스캔은 `{}`/`null` 이 정상이므로
  0 으로 해석한다 — **"카운트가 비었다" 와 "스캔을 못 읽었다" 를 상태로 구분**하는 것이 핵심이다.
- 카운트가 정수가 아니면 막는다. 빈 값이 산술에서 0 으로 새던 경로를 명시적으로 차단.
- 일시 오류(CLI 내부 크래시·throttling·타임아웃·5xx)만 재시도한다. 권한 오류처럼 재시도로
  해결되지 않는 것은 즉시 올린다.

## 검증

`scripts/qa/test-image-scan-gate.sh` 신설 — 가짜 `aws` 로 6개 시나리오를 재현하고 CI 에 배선했다.

```
수정본  → 6 passed, 0 failed
원본    → 3 passed, 3 failed
          FAIL findings 를 못 읽으면 막는다 (expected fail, exit 0)   ← fail-open 실증
          FAIL 스캔이 COMPLETE 가 아니면 막는다 (expected fail, exit 0)
          FAIL 일시적 CLI 내부 오류는 재시도로 넘어간다 (expected pass, exit 1)
```

fail-open 은 추론이 아니라 **원본 스크립트가 실제로 exit 0 을 반환하는 것으로 확인**했다.
