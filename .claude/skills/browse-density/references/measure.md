# 밀도 실측하는 법

## 재는 명령

alpha 배포본에서 `ego-browser` 로 잰다. 로컬 next 서버는 띄우지 않는다.

```js
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
await gotoAndWait('https://alpha.teameet.co.kr/matches', { timeout: 40, settle: 2 })
await wait(2)
cliLog(await js(String.raw`(() => {
  const vh = window.innerHeight
  const cards = [...document.querySelectorAll('.tm-match-list-card')]
  const h = cards[0].getBoundingClientRect().height
  const media = cards[0].querySelector('[class*="media"]')
  return JSON.stringify({ cardH: Math.round(h), perScreen: +(vh / h).toFixed(2),
    mediaH: media ? Math.round(media.getBoundingClientRect().height) : 0,
    mediaShare: media ? +(media.getBoundingClientRect().height / h * 100).toFixed(0) : 0 })
})()`))
```

`document.documentElement.scrollHeight` 로 재지 않는다 — 이 앱은 `body` 가 잠겨 있고
`.tm-scroll-area` 가 진짜 스크롤러라 window 기준 값은 뷰포트 높이와 같게 나온다.

## 우리 목록 기준선 (2026-09-06, alpha `570e42b28`, 390×844)

| 목록 | 카드 높이 | 화면당 | 미디어 | 미디어 비중 |
|---|---|---|---|---|
| 대회 `/tournaments` | 176px | 4.8장 | 없음 | 0% |
| 팀 `/teams` | 247px | 3.42장 | 없음 | 0% |
| 매치 `/matches` | 286px | 2.95장 | 146px | 51% |

매치가 우리 목록 중 가장 성기다. 새 목록을 만들 때 **대회 목록(176px / 4.8장)** 을
기준선으로 잡고, 그보다 커지면 무엇이 그 높이를 쓰는지 설명할 수 있어야 한다.
