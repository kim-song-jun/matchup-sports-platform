# 스크린샷·앱 미리보기 규격

> 이미지·영상을 만드는 쪽과 업로드 전 검수하는 쪽이 함께 보는 기준표.
> 수치는 Apple 문서를 2026-09-25 에 직접 읽어 옮겼다:
> [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) ·
> [App preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications).

## 1. 이 앱에 필요한 기기 세트

| 기기 | 필요 여부 | 근거 |
|---|---|---|
| **iPhone 6.9"** | **필수 (이것만 있으면 된다)** | Apple: 6.9" 가 없을 때만 6.5" 가 필수. 6.9" 를 올리면 더 작은 iPhone 크기는 자동 축소본이 쓰인다 |
| iPhone 6.5" | 불필요 | 6.9" 를 올리는 경우 |
| iPhone 6.3" 이하 | 불필요 | 6.9" 축소본으로 대체 |
| **iPad** | **불필요** | `apps/v1_ios/Config/Shared.xcconfig` `TARGETED_DEVICE_FAMILY = 1` (iPhone 전용). iPad 에서는 호환 모드로만 실행되며 iPad 스크린샷을 요구하지 않는다 |
| 가로 방향 | 불필요 | `project.yml` `UISupportedInterfaceOrientations` = 세로만 |

## 2. 스크린샷

| 항목 | 규격 |
|---|---|
| 크기 (6.9", 세로) | **1320 × 2868** (권장 — iPhone 16 Pro Max 시뮬레이터 원본 크기) · 1290 × 2796 · 1260 × 2736 중 하나 |
| 개수 | 1~10장 (현지화별). 스토어 첫 화면에 보통 앞 3장이 보인다 |
| 형식 | `.png` / `.jpg` / `.jpeg` |
| 알파 채널 | **금지** — 투명도가 있으면 업로드가 거부된다 |
| 방향 | 세로 |
| 현지화 | 한국어 세트 필수. 영어 현지화를 넣으면 영어 세트를 따로 올리거나 한국어 세트를 재사용 |

### 기존 파이프라인 (저장소에 있음)

1. `scripts/ios/capture-store-screenshots.sh` — iPhone 16 Pro Max 시뮬레이터로 `store-01-home`, `store-02-matches`,
   `store-03-tournaments`, `store-04-teams`, `store-05-my` 다섯 장을 1320 × 2868 로 찍고 알파 채널을 검사한다.
2. `scripts/ios/compose-store-captions.mjs <원본 폴더>` — 앞 몇 장에 제품 폰트·색으로 헤드라인을 얹어 `captioned/` 에 같은 크기로 출력하고 다시 알파를 검사한다.

### 제출 전 검수 체크리스트

- [ ] 크기가 허용 세 가지 중 하나와 **정확히** 일치 (`sips -g pixelWidth -g pixelHeight *.png`)
- [ ] 알파 없음 (`sips -g hasAlpha *.png` → `no`)
- [ ] **캡처 대상 서버** — 캡처 스크립트의 기본 스킴은 `TeameetAlphaUITests`(알파 서버)다. 알파 데이터에는 `(테스트)` 로
  시작하는 대회명 등 시험용 이름이 보인다. 스토어용은 ① 프로덕션 데이터로 찍거나 ② 알파에서 찍되 화면에
  `테스트`·가짜 이름이 보이지 않는 장면만 고른다. 실존 인물의 실명·연락처·얼굴이 동의 없이 보이면 안 된다(5.1).
- [ ] 상태 표시줄: 시계 `9:41`, 배터리 가득, 통신 표시 정상 — 캡처 전 `xcrun simctl status_bar <기기> override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3`
  (현재 스크립트는 이 단계를 하지 않는다)
- [ ] 캡션 문구는 그 화면에 실제로 보이는 기능만 말한다(2.3 정확한 메타데이터). 기능 근거표: [`metadata-ko.md`](./metadata-ko.md#기능-서술의-근거-라우트)
- [ ] 다크 모드 장면을 섞는다면 앞 3장은 한 가지 모드로 통일
- [ ] 기기 프레임·손 사진을 넣는다면 실제 iPhone 모양이어야 한다(다른 제조사 기기 금지)

### 권장 장면 순서 (10장 이내)

| # | 장면 | 화면 경로 | 캡션 방향 |
|---|---|---|---|
| 1 | 홈 — 가까운 매치 | `/home` | 같이 뛸 사람을 바로 찾기 |
| 2 | 매치 목록·필터 | `/matches` | 종목·지역·날짜로 찾기 |
| 3 | 대회 LIVE 스코어 | `/tournaments/[id]/matches/[fixtureId]` | 경기 결과를 실시간으로 |
| 4 | 팀 상세·멤버 | `/teams/[id]` | 팀 운영을 한곳에서 |
| 5 | 팀 매치·명단 | `/team-matches/[id]` | 상대 팀 찾고 명단 정하기 |
| 6 | 선수 카드 | `/users/[id]/card` | 내 기록이 쌓이는 카드 |
| 7 | 대진표·순위 | `/tournaments/[id]/bracket` | 대진과 순위를 한눈에 |
| 8 | 채팅 | `/chat/[id]` | 약속은 채팅으로 (신고·차단 아이콘이 보이면 1.2 에도 유리) |
| 9 | 알림 | `/notifications` | 신청 결과를 푸시로 |
| 10 | 마이 | `/my` | 내 경기·후기 모아보기 |

현재 파이프라인은 1·2·(대회 목록)·4·10 에 해당하는 5장을 찍는다. 3·6·8 은 테스트 케이스
(`apps/v1_ios/TeameetUITests/StoreScreenshotUITests.swift`)에 장면을 추가해야 한다. 3번은 LIVE 상태 경기가
있어야 하므로 운영 API 로 상태를 만드는 절차(`scripts/verify-alpha-period-break.mjs`)가 필요하다.

## 3. 앱 미리보기 영상 (선택)

| 항목 | 규격 |
|---|---|
| 해상도 (6.9" 세로) | **886 × 1920** (6.9"·6.5"·6.3" 모두 같은 값을 받는다. 6.9" 용 1개면 나머지는 축소본 사용) |
| 길이 | **15초 이상 30초 이하** |
| 개수 | 현지화·기기 크기별 최대 3개 |
| 파일 | `.mov` / `.m4v` / `.mp4` (H.264) 또는 `.mov` (ProRes 422 HQ) · 최대 **500MB** |
| 비디오 | H.264: 목표 10~12 Mbps, 프로그레시브, High Profile Level 4.0 이하 · ProRes: VBR 약 220 Mbps |
| 프레임 레이트 | **최대 30fps** |
| 오디오 | **스테레오 필수**, AAC 256kbps (ProRes 는 PCM 도 가능), 44.1kHz 또는 48kHz, 모든 트랙 활성. 무음이어도 스테레오 트랙이 있어야 안전하다 |
| 포스터 프레임 | 기본 5초 지점 (ASC 에서 변경 가능) |
| 방향 | 세로 |

### 내용 규칙 (App Store 미리보기 가이드 요지)

- 앱 안에서 실제로 촬영한 화면이어야 한다. 앱 밖의 연출 영상·실사 촬영·손가락 모형은 쓰지 않는다.
- 자막·전환 효과는 허용되지만, 앱에 없는 기능을 보여주거나 암시하면 안 된다(2.3).
- 가격·순위·"최고" 같은 표현, 다른 플랫폼(안드로이드 기기) 이미지는 넣지 않는다.
- 첫 몇 초에 핵심(매치 찾기 → 신청 → LIVE 스코어)을 보인다 — 자동 재생은 소리 없이 시작된다.

### 검수 명령

```bash
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,channels,sample_rate,bit_rate \
  -show_entries format=duration,size -of compact preview.mp4
```

기대값: 비디오 `h264` `886x1920` `30/1` 이하, 오디오 `aac` `channels=2` `48000`(또는 44100), `duration` 15~30, `size` < 500MB.
