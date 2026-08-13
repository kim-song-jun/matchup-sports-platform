# 대회 홍보 이미지 — alpha 실측 (PR #400)

`scripts/verify_alpha_promo_image_upload.js` 로 alpha 에서 측정했다. 4000×3000 노이즈 캔버스를
JPEG(q=1)로 인코딩해 **33.4MB** 원본을 만들고, ① 압축을 거치지 않는 직접 업로드 ② 관리자 생성
위저드의 커버 업로더(실제 UI 경로) 두 갈래로 올렸다.

노이즈 이미지는 압축이 가장 안 되는 최악의 입력이다 — 실제 포스터는 이보다 훨씬 작아진다.

## 업로드

| 경로 | before (머지 전) | after (머지 후) |
|---|---|---|
| 원본 직접 업로드 | `413 INTERNAL_ERROR` / `File too large` | `413 UPLOAD_FILE_TOO_LARGE` / `파일 용량이 업로드 한도를 초과했어요…` |
| **관리자 UI 커버 업로드** | **`413`**, 미리보기 반영 없음 | **`201`** → `/uploads/…webp`, 미리보기 반영됨 |

업로드 결과 파일은 `image/webp` 약 **1.7MB** — 원본 33.4MB 대비 **약 5%**, 서버 정밀 한도(5MB) 안.

정확한 URL·바이트 수는 스크립트를 돌릴 때마다 달라지므로 이 문서에 박아두지 않는다. 그 실행의
실제 값은 같은 폴더의 `{before,after}-report.json`(`uiUpload`, `previewSrc`, `originalBytes`)에
그대로 남는다 — 판정 근거는 항상 그쪽을 본다.

압축을 우회한 직접 업로드가 여전히 413 인 것은 의도된 동작이다. 서버 한도는 그대로 두고
클라이언트가 한도 안으로 줄여 보내는 설계이며, 그 413 이 이제 도메인 코드 + 한국어 메시지로
정규화됐다는 것이 여기서 확인된다.

## 커버 → 홍보 카드 기본 이미지 폴백

스크린샷 육안 대조로는 "그라디언트냐 사진이냐"를 놓치기 쉬우므로 `getComputedStyle` 의
`backgroundImage` URL 문자열로 대조했다.

대상: `Test123` — `promoHomeEnabled=true`, `coverImageUrl` 있음, `promoHomeImageUrl` **null**.

| | 홈 히어로 배경 (computed) | 자리채움 트로피 |
|---|---|---|
| before | `linear-gradient(135deg, rgb(49,130,246), rgb(34,114,235))` | 있음 |
| after | `url(…/uploads/…9d380c61….png)` = **coverImageUrl 과 동일** | 없음 |

대조군 `tt` (커버·홍보 이미지 모두 없음)는 after 에서도 그라디언트 + 자리채움 트로피를 유지해,
폴백이 무분별하게 적용되지 않는다는 것도 함께 확인했다.

## 캡처

`{before,after}-{home,tournaments}-{mobile,tablet,desktop}.png` (390 / 768 / 1440),
`{before,after}-admin-cover-upload.png` (관리자 위저드 커버 업로드 직후),
`{before,after}-report.json` (원본 크기·상태코드·미리보기 URL·폴백 측정 원본 기록 —
`promoFallback.coverOnlyTournaments[]` 의 `cardFound`/`cardBackground`/`renderedWithCover`).
