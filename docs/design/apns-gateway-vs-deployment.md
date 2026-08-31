# APNs 게이트웨이를 배포 환경에서 떼어내기 (제안)

> 상태: **제안 — 구현 전.** 결정을 받으면 별도 PR 로 진행한다.
> 배경 Task: 157 (iOS 셸 · APNs) · 관련 실측: `docs/ops/ios-apns-setup.md`

## 기(起) — 증상

alpha 서버는 TestFlight 로 설치한 iPhone 에 **푸시를 보낼 수 없다.** 보내면 Apple 이
`BadDeviceToken` 을 돌려주고, 이 코드는 `PERMANENT_REASONS` 에 들어 있어서 서버가 그 기기
등록을 **영구 폐기**한다. 일시적 실패가 아니라 조용한 영구 이탈이다.

아직 실제로 겪은 것은 아니다 — TestFlight 빌드가 아직 안 올라갔다. 다만 같은 조합을 이미
음성 대조로 측정해 뒀다: sandbox 토큰을 production 게이트웨이로 보내면 정확히
`BadDeviceToken` 이 돌아온다(`docs/ops/ios-apns-setup.md` 의 측정 3건).

## 승(承) — 원인

Apple 의 APNs 는 게이트웨이가 두 개고, 토큰은 **자기가 발급된 게이트웨이에서만** 유효하다.

| 빌드가 서명될 때의 `aps-environment` | 토큰이 통하는 게이트웨이 |
|---|---|
| `development` (Xcode 로 기기에 설치, 시뮬레이터) | `api.sandbox.push.apple.com` |
| `production` (**TestFlight 포함**, App Store) | `api.push.apple.com` |

TestFlight 가 `production` 이라는 점이 핵심이다. "테스트용이니 sandbox" 가 아니다.

한편 서버는 게이트웨이를 이렇게 고른다 (`apns-push.service.ts` `onModuleInit`):

```
V1_PUSH_ENVIRONMENT === 'alpha'  →  SANDBOX_HOST
                        아니면    →  PRODUCTION_HOST
```

즉 **환경 변수 하나가 서로 다른 두 가지를 동시에 뜻한다:**

1. 이 배포가 어느 앱·어느 웹 origin 을 상대하는가 (`kr.co.teameet.alpha` vs `kr.co.teameet`)
2. 어느 APNs 게이트웨이로 보내는가

지금까지는 두 뜻이 우연히 일치했다. alpha 앱은 Xcode 로만 설치했고 그건 늘 `development`
였기 때문이다. **TestFlight 가 등장하면서 갈라졌다** — alpha 앱을 보면서 production
게이트웨이를 쓰는 조합이 정상적으로 존재하게 됐다.

`V1PushDevice.environment` 컬럼이 이미 있지만 이 문제를 풀지 못한다. 그 값은 `alpha |
production`, 즉 **배포 축**이고 게이트웨이 축이 아니다. 게다가 서버는 어차피 자기 환경의
기기만 상대하므로 발송 시점에 아무 정보도 더해주지 않는다.

## 전(轉) — 선택지와 트레이드오프

### A안 — 토큰이 자기 게이트웨이를 들고 온다 (권고)

기기 등록 시 앱이 자기 APNs 환경을 함께 보내고, 서버는 **기기별로** 게이트웨이를 고른다.

- 스키마: `V1PushDevice` 에 nullable 컬럼 하나(예: `apnsEnvironment: sandbox | production`).
  nullable 인 이유는 Android 행에는 이 축이 존재하지 않기 때문 — FCM 은 게이트웨이가 하나다.
  마이그레이션 기본값은 `NULL` 이고, 기존 iOS 행은 서버 환경 기준으로 읽으면 지금 동작과
  정확히 같다(backfill 을 굳이 하지 않아도 된다 — 아래 테스트 2번).
- 앱: 아래 "환경을 무엇에서 읽을 것인가" 참고.
- 서버: `ApnsPushService` 가 host 를 필드가 아니라 **기기별 인자**로 받는다. HTTP/2 세션도
  host 별로 나뉜다(현재 세션 1개 → 최대 2개).

| | |
|---|---|
| 장점 | 시뮬레이터·TestFlight·프로덕션이 **동시에** 동작한다. Apple 의 실제 모델과 일치한다. 잘못 보내 기기를 영구 폐기하는 일이 사라진다. |
| 단점 | 넷 중 가장 크다 — 마이그레이션 + DTO + 앱 + 발송 경로 4곳. 세션이 둘로 늘어 연결 관리가 조금 복잡해진다. 앱이 보내는 값을 서버가 믿어야 하므로, 값이 틀리면 여전히 잘못된 게이트웨이로 간다(다만 그 실패는 그 기기 하나로 한정된다). |

### B안 — 게이트웨이 전용 환경변수를 추가한다

`V1_PUSH_ENVIRONMENT` 는 그대로 두고 `APNS_GATEWAY=sandbox|production` 을 새로 둔다.
alpha 배포를 TestFlight 테스트 기간에 production 게이트웨이로 돌린다.

| | |
|---|---|
| 장점 | 가장 작다. 스키마·앱 변경 없음. 한 시간이면 끝난다. |
| 단점 | **전역 스위치다.** 켠 순간 시뮬레이터 빌드(sandbox 토큰)가 전부 죽고, 그 실패가 `BadDeviceToken` 이라 등록이 영구 폐기된다. 우리 개발 루프가 지금 시뮬레이터에 전적으로 의존한다(사용자에게 아이폰이 없다). 두 종류를 동시에 쓸 수 없다는 것이 곧 이 안의 본질이다. |

### C안 — 실패하면 반대편으로 재시도

production 으로 보내고 `BadDeviceToken` 이면 sandbox 로 한 번 더 보낸다.

| | |
|---|---|
| 장점 | 스키마·앱 변경 없음. 두 종류가 동시에 동작한다. |
| 단점 | `BadDeviceToken` 은 "이 토큰은 죽었다" 는 뜻으로도 온다 — **진짜 죽은 토큰과 게이트웨이가 틀린 토큰을 구분할 수 없다.** 그래서 폐기 로직을 무력화해야 하고, 그러면 죽은 토큰이 영원히 쌓인다. 잘못된 절반은 매번 요청이 2배가 된다. 조용히 틀린 상태가 정상처럼 보이는 종류의 설계라 **권하지 않는다.** |

### 환경을 무엇에서 읽을 것인가 (A안 채택 시)

두 후보가 있고, **덜 명백한 쪽이 옳다.**

- **빌드 상수** (`TEAMEET_APS_ENVIRONMENT` → Info.plist → `AppConfig`). 이 저장소에 이미
  있는 관례라 자연스럽다. **그런데 이 값은 거짓말을 할 수 있다.** 이번 TestFlight 준비에서
  실제로 그랬다 — Alpha 설정은 `development` 라고 적혀 있는데 App Store 프로파일이 부여한
  것은 `production` 이었다. 이 값을 믿었으면 서버는 정확히 틀린 게이트웨이를 골랐을 것이다.
- **실제 서명된 엔타이틀먼트** — 번들의 `embedded.mobileprovision` 을 읽어 `aps-environment`
  를 꺼낸다. 시뮬레이터에는 이 파일이 없고, 없으면 sandbox 다(시뮬레이터는 실제로 sandbox).
  파싱 비용이 있고 CMS 를 다뤄야 하지만, **빌드가 실제로 무엇으로 서명됐는지**를 말해주는
  유일한 출처다.

후자를 권한다. 이번에 잡은 함정이 정확히 "설정은 맞다고 말했는데 산출물은 달랐다" 였고,
같은 함정을 런타임에 다시 밟을 이유가 없다.

## 결(結) — 권고와 검증

**A안 + 엔타이틀먼트에서 읽기.** B안은 우리 개발 루프(시뮬레이터)를 끊고, C안은 진짜 죽은
토큰을 구분하지 못한다.

다만 **TestFlight 첫 빌드를 이것 때문에 막지는 않는다.** 첫 빌드의 목적은 설치·화면·딥링크
확인이고, 그 빌드에서 푸시가 안 오는 것은 **알려진 상태**로 두면 된다. 위 작업은 그 다음이다.

테스트로 고정할 것:

1. `apnsEnvironment === 'production'` 인 기기는 production host 로, `sandbox` 인 기기는
   sandbox host 로 간다 — 한 번의 발송에 두 종류가 섞여 있어도 각자 맞는 곳으로.
2. `apnsEnvironment` 가 `NULL` 인 기존 iOS 행은 서버 환경 기준으로 동작한다(현행 유지).
3. Android 행은 이 컬럼과 무관하게 지금 경로 그대로다.
4. **기존 음성 대조가 여전히 성립하는가** — alpha 서버가 production 게이트웨이도 쓰게 되므로
   "alpha 토큰이 production 으로 새지 않는다" 를 다시 증명해야 한다. sandbox 로 등록된 기기가
   production host 요청에 절대 포함되지 않는 것을 단위 테스트로 고정한다.
5. 등록 DTO 가 알 수 없는 값을 거부한다(플랫폼 필드와 같은 규율 — 기본값을 두지 않는다).
