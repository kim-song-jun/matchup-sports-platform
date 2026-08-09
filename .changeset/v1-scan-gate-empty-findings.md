---
"v1_api": patch
---

ECR 스캔 게이트가 **취약점 0건인 정상 스캔을 차단하던 것**을 고친다. 직전 변경(#289)이
fail-open 을 닫으면서 같이 막아 버린 케이스로, alpha 배포가 실제로 멈췄다.

## 무엇이 잘못됐나

#289 는 `critical` 이 빈 문자열이면 게이트를 막도록 했다. 그런데 AWS CLI 는 `--query` 결과가
없을 때 **빈 출력**을 준다 — 즉 취약점이 하나도 없는 깨끗한 스캔의 정상적인 모양이다.
배포 로그에서 그대로 관측됐다:

```
[alpha-scan] teameet-alpha-v1-api: unparsable severity counts (critical='' high='')
  — refusing to pass the gate
```

이 메시지가 찍혔다는 것은 **상태 검사를 이미 통과했다**는 뜻이다(아니면 status 메시지가
찍혔을 것). 즉 스캔은 성공적으로 읽혔고 결과가 0건이었다.

## 게이트를 지키는 것은 emptiness 가 아니다

원래의 fail-open 은 "빈 값" 때문이 아니라 **호출이 실패했는데 exit code 를 보지 않은 것**
때문이었다. CLI 가 크래시해도(exit 1) 빈 문자열이 bash 산술에서 0 으로 취급돼 통과했다.
그 구멍은 `scan_aws_retry` 가 non-zero 를 반환하며 이미 막는다. 따라서 판정 기준은:

- describe 호출이 **실패** → 차단 (exit-status 검사)
- 스캔 상태가 **COMPLETE 아님** → 차단 (status 검사)
- 위 둘을 통과했는데 findings 가 비어 있음 → **취약점 0건** → 통과

## 계약 테스트

`scripts/qa/test-image-scan-gate.sh` 에 케이스를 나눠 넣었다. 수정 전 코드로 돌리면
`COMPLETE + 빈 findings` 만 정확히 실패하고(= 라이브 차단 재현), fail-open 방어
(`findings 조회가 계속 실패하면 막는다`)는 양쪽 모두 통과한다 — 보호를 되돌리지 않았음을
같은 스위트가 증명한다.
