# 프롬프트 템플릿

프롬프트는 영어로 쓴다(이미지 모델 정확도). `SUBJECT` 블록만 바꾸고 나머지는 그대로 보낸다.

## 조립 형태

```
SUBJECT:
<메인 오브젝트 1개를 형태·재질·자세까지 한 문장> as the single main object, largest and nearest to camera.
<서브 오브젝트 0~2개> placed smaller (about 40-60% of the main object), set back in depth and offset to form a triangular arrangement with the main object; the eye lands on the main object first.

STYLE LOCK (do not edit):
Soft matte clay 3D render in the style of Korean fintech app illustrations (Toss, KakaoPay). Rounded, chunky forms with thicker-than-real proportions; coins are thick cylinders with beveled rims, panels are plump, edges are softened. Single soft area light from the upper-left; clearly separated lit and shaded faces; gentle contact shadow only under each object, no cast shadow on a floor, no ground plane, no backdrop, no gradient background. Subtle ambient occlusion in crevices. No rim light, no glow, no bloom, no glossy chrome.
Palette: primary Teameet blue #3182F6 with light tint #D6E7FF and deep shade #1B64DA for the main object; accent gold #FFC342 (with #E0A52E shade) for at most one small sub object; neutrals #F2F4F6 and #8B95A1. No other hues.
Composition: three-quarter elevated camera, the object cluster fills about 70% of a square 1024x1024 canvas with even margins, main object slightly left of center, sub objects behind and to the right.
Strictly no: faces, eyes, mouths, characters, mascots, people, hands, text, letters, numbers, logos, UI screens, phones, sparkles, confetti, stars in the air, floor, table, scenery.
Output: PNG with a fully transparent background (alpha channel), 1024x1024.
```

## 메시지 → 상징 오브젝트 표 (Teameet)

메시지를 먼저 쓰고, 표에서 고른다. 표에 없으면 "이 감정을 사물 하나로 말하면?"으로 새로 정하고 표에 추가한다.

| 메시지(감정) | 메인 | 서브 후보 | 쓰는 화면 |
|---|---|---|---|
| 곧 경기가 열린다, 대기 중 | 호루라기(코치 휘슬) | 콘 1개, 코인 | 매치 목록 빈 상태 |
| 보호·안심·안전 | 우산(두툼한 패널) | 코인, 방패 대신 쓰지 말 것 | 보증·환불 안내 |
| 성장·상승·기록 향상 | 로켓 또는 위로 향한 화살표 | 작은 구름, 코인 | 기록·ELO 카드 |
| 우승·성과 | 트로피(컵) | 메달, 코인 | 대회 결과, 시상 |
| 함께·팀·소속 | 저지(유니폼) 한 벌 | 두 번째 저지(작게, 뒤) | 팀 만들기, 팀 빈 상태 |
| 정산·무료·절약 | 두툼한 코인 스택 | 지갑 | 결제·정산 안내 |
| 시간·일정 | 아날로그 시계 또는 스톱워치 | 콘 | 일정 없음, 마감 |
| 장소·구장 | 골대 또는 필드 콘 세트 | 공 | 구장 검색 빈 상태 |
| 알림·소식 | 종(벨) | 점(배지) 하나 | 알림 빈 상태 |
| 초대·연결 | 봉투 또는 링크 고리 | 코인 | 초대 대기 |
| 검색·탐색(결과 없음) | 나침반 | 콘 | 검색 결과 없음 — 돋보기는 "찾는 중"을 문자 그대로 그리므로 피한다 |
| 대화·소통 | 말풍선 두 개(앞 파랑, 뒤 틴트) | 공 | 채팅 빈 상태 |
| 대화·소통 | 말풍선 두 개 | 공 | 채팅 빈 상태 |

## 하나의 화면군은 같은 세션에서 만든다

빈 상태 6장을 만들면 한 세션에서 연속 생성하고, 첫 장을 `agy` 대화에 이어(`-c`) "same material, lighting and palette as the previous image" 를 붙인다. 톤이 갈리면 전부 다시 만든다. 절반만 바꾸지 않는다.

## 예시 (매치 목록 빈 상태)

메시지: "지금은 조용하지만, 휘슬만 불면 경기가 시작된다."

```
SUBJECT:
A chunky rounded coach's whistle in Teameet blue, seen from a three-quarter angle with its mouthpiece pointing lower-left, as the single main object, largest and nearest to camera.
One small training cone in light tint #D6E7FF with a #3182F6 band and one thick gold coin, each about 45% of the whistle's size, set back in depth behind and to the right of the whistle so the three objects form a triangle; the eye lands on the whistle first.

STYLE LOCK (do not edit):
...(위 블록 그대로)...
```
