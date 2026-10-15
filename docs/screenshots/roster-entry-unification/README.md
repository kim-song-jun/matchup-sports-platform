# 명단 진입점 통일 — 컴포넌트 시각 QA

> 이 폴더는 최초 커밋 56daa2f29의 간편/전체 화면 변경을 기록한 과거 증거다.
> 후속 변경은 세 진입점을 공통 `명단 관리 → 참가 선수 / 경기 출전` 화면으로 합쳤다.
> 아래 after 이미지와 간편 시트 설명은 현재 PR 최종 화면을 나타내지 않는다.
> 새 화면의 Alpha 배포 후 390/768/1440 시각·네트워크 검증은 미실행이다.

2026-10-15, codex/league-roster-unification. 변경 전은 origin/dev 105afaf31의 실제 컴포넌트,
변경 후는 이 PR의 실제 컴포넌트를 사용했다. 리그 경기 상세 카드·간편 시트, 전체 경기 명단,
참가 명단을 Vite 격리 하네스에서 실제 React Query 훅과 상태형 MSW로 실행했다.
홈/상세의 진입 링크와 출처는 회귀 테스트로 검증했다. Alpha 배포·실제 로그인·DB 통합 검증은 이 증거에 포함하지 않는다.

7명(1명 제외), 긴 이름, 번호 미등록, 등록 실명과 경기 표시 이름이 다른 선수로 확인했다.
하네스·서비스워커·임시 별칭은 tmp/roster-entry-qa에만 있고 PR에 포함하지 않는다.

| 화면 | 390px | 768px | 1440px |
| --- | --- | --- | --- |
| 간편 출전 시트 | [이전](before-quick-390.png) / [이후](after-quick-390.png) | [이전](before-quick-768.png) / [이후](after-quick-768.png) | [이전](before-quick-1440.png) / [이후](after-quick-1440.png) |
| 전체 경기 명단 | [이전](before-full-390.png) / [이후](after-full-390.png) | [이전](before-full-768.png) / [이후](after-full-768.png) | [이전](before-full-1440.png) / [이후](after-full-1440.png) |
| 참가 명단 | [이전](before-registration-390.png) / [이후](after-registration-390.png) | [이전](before-registration-768.png) / [이후](after-registration-768.png) | [이전](before-registration-1440.png) / [이후](after-registration-1440.png) |

- 18/18 화면: 수평 넘침 0. 최종 전후 런타임 오류·HTTP 4xx/5xx 0.
- 모바일 시트에서 기존 제외 선수 체크 → 1건 저장 → 시트 재진입 → 복귀 유지 확인.
- 추가 390×844 터치 환경: [라이트](after-quick-mobile844.png), [다크](after-quick-mobile844-dark.png).
  저장 버튼이 스크롤 전부터 화면 안에 있고, 마지막 선수까지 스크롤하여 접근 가능하다.
  touch-action은 pan-y다. 기존 시트의 공통 sticky actions를 재사용한다.
- GK·번호 기존 저장 동작은 회귀 테스트로 확인했다. 참가 명단의 GK 편집 새 API는 추가하지 않았다.
  GK는 기존 전체 경기 명단의 버튼에서 편집하고 리그 공통 반영 범위를 명시한다.
- 정량 측정: before-metrics.json, after-metrics.json. 테스트 데이터만 사용했고 Alpha 데이터 변경은 없다.
- 임시 서버와 직접 띄운 headed Chromium은 QA 후 종료한다. 다른 세션의 브라우저·프로세스는 건드리지 않는다.

검증: Web 292개, API 108개, Web/API tsc, pattern/surface 검사. DB/schema 변경 없음.
