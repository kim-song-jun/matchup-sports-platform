---
'v1_api': patch
'v1_web': patch
---

승부차기 게이트의 우회로 두 곳을 막고, 정정에서 감사 기록이 사라지던 것을 고친다 (#518 alpha 실측 후속).

**1) 선축 키 하나를 빼면 게이트가 통째로 뚫렸다.** `penaltyShootoutDecided`의 선축 미상 분기가
`takenHome === takenAway` 한 줄이라 5킥 바닥이 없었다. 주석은 "보수적"이라 적혀 있었지만 실제로는
A1보다도 A2보다도 느슨해서, 같은 경기·같은 버전으로 라이브 재현됐다:

```
{home:1, away:0, takenHome:1, takenAway:1, firstKickSideKey:'HOME'} → 422 UNDECIDED
{home:1, away:0, takenHome:1, takenAway:1}                          → 201 통과
```

선축을 모르면 잔여 킥을 계산할 수 없으므로 **조기 종료를 아예 허용하지 않는다**(5킥 바닥 + 같은 횟수).

**2) 정정 레인에 결판 판정이 없었다.** `assertPenaltiesForRevision`이 `assertPenaltiesNotAllowed`만
호출해, `end`가 422로 막는 값을 정정으로는 그대로 저장할 수 있었다. 게이트를 한 레인에만 달면 다른
레인이 우회로가 된다.

**3) 정정 한 번에 감사 기록이 사라졌다.** #518이 서버 승계(`readStoredPenalties`)를 고쳤지만 정정 UI
경로에서는 도달 불가였다 — 웹 폼이 `{home, away, firstKickSideKey}` 세 키만 재조립해 보내면 서버의
승계 분기에 아예 닿지 않는다. 폼과 타입을 고치고, **서버도 base에서 메우는 마지막 방어선**을 둔다
(옛 번들을 띄워 둔 탭 하나가 감사 기록을 지울 수 있다). 점수가 base와 다르면 메우지 않는다.
