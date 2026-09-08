---
'v1_web': patch
---

어드민에 남아 있던 solid-fill 계열 대비 미달 3종을 고칩니다(alpha 실측 2026-09-08).

| 자리 | Before | After |
|---|---|---|
| 페이지 헤더 eyebrow ("플랫폼"·"운영") | `text-blue-500` **3.71:1** | `--blue700` **5.41:1** |
| 사이드바 개수 배지 | `bg-blue-500` + 흰 글씨 **3.71:1** | `--static-blue` **5.41:1** |
| "목업 대회 만들기"(alpha 전용) | `bg-amber-600` + 흰 글씨 **3.20:1** | `bg-amber-700` **5.03:1** |
| 설정 화면 Kakao Developers 링크 | `text-blue-500` **3.71:1** | `--blue700` **5.41:1** |
| KPI 값 `positive` tone | `text-green-500` **2.22:1** | `--green700` **5.40:1** |
| KPI 값 `neutral` / `danger` tone | 3.71 / 3.81:1 | `--blue700` 5.41 / `--red700` 6.51:1 |

배지에 `--blue700` 을 쓰지 않은 이유: 그 토큰은 다크에서 `#6ba8ff`(밝은 파랑)로 뒤집혀
흰 글씨가 **2.42:1** 이 됩니다. 테마와 무관하게 고정인 `--static-blue` 를 씁니다 — 토큰 자신의
주석이 이미 같은 함정을 적어 둔 자리입니다.

세 자리 모두 **버튼이 아니거나 alpha 전용**이라 `docs/design/a11y-decisions.md` 1번(solid-fill
버튼 흰 글씨 현행 유지, 2026-08-27)의 적용 대상이 아닙니다.
