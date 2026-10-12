# S1 그래픽 템플릿 — alpha 실측

Status: 검증 진행 중. 변경 후 생성 화면·12팀 초안 저장은 확인했고, 4형식 대진 생성·편집/저장은 재인증 대기다.

사용자 선택: 대회 생성에서 진행 방식을 고르고, 대진 관리에서는 현재 방식의 템플릿을 선택한다. 기존 대회의 format 전환은 하지 않는다. 생성의 네 번째 카드는 별도 정규 리그 생성 화면으로 이동한다.

## 구현·리뷰

- dev PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/1863
- 구현: GPT-6 Luna. 독립 정적 리뷰: GPT-6 Sol PASS.
- root tsc PASS; 폰트 토큰·baseline 보완 후 v1 패턴 검사 PASS; diff check PASS.
- 로컬에서 관측한 Tab7/240경기 테스트의 5초 timeout과 마지막 20팀 단언은 최종 exact-head CI 전체 실행으로 확인했다. 최종 Web 740파일/8,723테스트 PASS, lint/typecheck·production build PASS다.
- head56ef CI의 실제 실패4건은 카드로 전환한 UI의 중복/옛 선택자였다. 원래 계약 단언을 유지해 고쳤고 관련6개 계약은 최종 PASS다. 두 로컬 timeout은 해당 CI에서 재현되지 않았다.
- 자동 리뷰의 20→11 특수 모드 잔류 및 visible label/접근성 이름 불일치를 보완했다. radioLabel prop을 제거했고 titleId가 라디오 이름이다. Sol 최종 정적 PASS, root 최종 lint PASS. origin/dev의 별도 스크롤 복구 변경을 병합한 최종 head `9f82f2efc60f302efc7e6fdf4b7dd4a71df3213e`의 CI `38233610168`은 API/Web/Gates 모두 PASS다.
- PR #1863은 base dev를 확인하고 expected head를 고정해 머지했다. merge `eb38409219dc23d2ec347c211f64d5d9251e0b96`와 최종 head의 Git tree는 동일한 `3d2775e43499a1035826fe018744796699f2a720`이다. dev CI `38235211195` API/Web/Gates PASS, alpha Deploy `38235211193` SUCCESS.
- 19:34 KST alpha의 Web/API commit `eb38409219dc23d2ec347c211f64d5d9251e0b96`, Web release `1.8.0-alpha.20261012.geb38409219dc`를 확인했다. 변경 후 실제 UI 검증은 재인증 뒤 진행한다.
- 이전 자동 리뷰4개 thread는 수정/근거 답변 후 resolved. Copilot 재요청 API는422(리뷰어 collaborator 제한), GitHub 브라우저는 Sign in 상태여서 최신 Copilot 재검토 완료로 주장하지 않는다. 계정/리뷰 설정은 바꾸지 않았다. 별도 Advanced Security는 미지원 `claude-opus-5` session.create 실패다.

## 변경 전 실제 화면

alpha `89e7dcba577afdeaaf190393e4fe43f0d586a3aa`, release `1.8.0-alpha.20261012.g89e7dcba577a`에서 운영자 인증 200을 확인한 뒤 캡처했다. 1440×1000 / 768×960 / 390×844 폭을 사용했다.

- `desktop/before-create.png`, `tablet/before-create.png`, `mobile/before-create.png`, `mobile/before-create-options.png`
- `desktop/before-group-template.png`, `desktop/before-tournament-league-template.png`, `desktop/before-regular-league-template.png`

## 테스트 데이터 범위

비공개·결과 없는 이번 작업의 QA 데이터만 변경한다. 공개/진행/공식 결과는 변경하지 않는다.

| 종류 | ID | 검증할 계약 |
|---|---|---|
| 단독 12팀 | `1c7cb376-70cf-4532-a95d-3bf088bae1bb` | 4팀 부전승, 생성→편집, 수기 추가→편집, 삭제 영향 |
| 조별+결선 12팀 | `3b62901f-c137-4a76-a97d-7628f81f6fac` | 지원 구성, 조별→결선 단계, 생성→편집 |
| 대회 리그 4팀 | `49d8e6f5-a3c3-41e9-bf1c-0f70a44fde3e` | 단일6/홈·어웨이12, 생성→편집 |
| 정규 리그 4팀 | `48603613-3382-4993-9106-34661ae74fa6` | 단일6/홈·어웨이12, 날짜 필수, 생성/수기→팀 편집 |

## 인증·실행 제한

- 재로그인 뒤 alpha `979500ea364cdaf43e98a1871c07b2c4f59f5ee5`에서 admin/me 200.
- 이후 auth/me는 200, account active, 약관 compliant지만 admin/me·bracket 조회·수기 생성이 403 `PERMISSION_DENIED / Active admin access is required`로 바뀌었다. 수기 생성 POST는 실패했으며 경기 추가 성공으로 보고하지 않는다.
- 기존 12팀 경기 `ba4e1354-e04f-524b-9460-27c3dacb63d7`의 시각은 앞선 alpha89e에서 PATCH/GET `2026-11-02T09:00:00.000Z` 저장을 확인했다. datetime-local fill만으로 React 변경 이벤트가 발생하지 않은 자동화 문제는 실제 키보드 이벤트로 해결했다.
- Ego task space326을 재사용하고, 현재 계정 소유자에게 활성 운영자 확인을 위해 제어권을 넘겼다. 인증/권한을 우회하지 않는다.
- 계정 소유자의 운영자 확인 후 동일 공간을 재개하여 admin/me 200·role ops를 확인했다. alpha9795에서 수기 추가 POST201로 경기 `1e08c989-5da2-5c04-b2ff-9b26a8c18602`가 생성되고 **13번 경기 편집 패널이 자동으로 열렸다**. 기존 1번 경기에도 배정된 유니콘FS/제이지fs를 각각 선택하여 PATCH200×2와 GET200의 실제 저장을 확인했다. `desktop/manual-add-edit.png`는 해당 실화면이다.
- 같은 신규 13번 경기의 삭제 확인(`desktop/manual-delete-confirm.png`) → DELETE200 → GET200에서 신규 ID 부재·원래12경기 유지 확인. 기록/연결이 없는 이번 신규 QA 경기만 삭제했다. 생성 호출의 Runtime exception 0을 확인했다. 이 증거는 그래픽 카드 후속 배포 전 alpha9795의 A+C 흐름이며 변경 후 그래픽 UI 인증이 아니다.
- 19:24 KST 재개 확인에서 admin/me가 401로 바뀌었고 현재 API commit은 `5e95ddb8d621af702bf2126de6e5f83ba88e958b`다. 변경 후 배포가 확인된 다음 동일 공간에서 재인증을 요청하고 저장 테스트를 재개한다.
- 변경 후 배포가 확인된 19:34 KST에도 auth/me/admin/me 401·인증 쿠키 0이다. 동일 공간326을 `/login`에서 handOff하고 계정 소유자에게 이메일 운영자 로그인과 관리자 화면 확인을 요청했다. 사용자 제어 중 브라우저 호출은 중단한다.
- 새 배포 `eb3840921`의 비로그인 HTTP에서 admin/me 401 `UNAUTHENTICATED`, 비공개 QA 공개대진 404·data 없음 확인. 404의 기존 generic `INTERNAL_ERROR` 코드는 이번 frontend 범위에서 바꾸지 않았다. 실제 운영자 UI·저장 증거로 취급하지 않는다.

## 남은 검증과 재개 조건

### 변경 후 실제 확인 (alpha eb384)

- 관리자 조회200 후 실제 생성 화면을 열어 desktop1440×1000 / tablet768×960 / mobile390×844에서 캡처했다. Desktop·tablet2×2, mobile1열이며 가로 넘침 없음. 고정 '다음' 버튼 높이44px. 스크롤 끝 캡처에서 마지막 성별 선택과 고정 CTA 사이 여백이 유지된다.
- `desktop/after-create.png`, `tablet/after-create.png`, `tablet/after-create-bottom.png`, `mobile/after-create.png`, `mobile/after-create-bottom.png`. Sol이 실제5장과 대응 코드를 읽어 캡처 범위 PASS(BLOCK0/WARN0), 작은 SVG 보조 라벨은 FYI로 판단했다. 판정은 생성1단계 정지 화면에만 한정된다.
- 새 입력의 정규 리그 링크 경고→계속 작성에서 대회명 보존→이동하기→실제 `/admin/league-matches/new` 도착 확인. 그 뒤 새 생성 화면에서 토너먼트만을 선택해 필수 값 입력→대회 만들기 POST201. 초안 `f24be679-642b-439b-81a3-ee631eb74502`는 format knockout/teamCount12/status draft, GET200의 scheduledAt `2026-11-02T09:00:00.000Z`; 생성 구간 Runtime exception0.
- 신규 초안의 isPublic 기본값은 true다. 일반 update에 isPublic을 보낸 첫 요청은 DTO whitelist400이었다(저장 실패). source로 전용 `/visibility` 경로를 확인했다. 새로고침 후 저장된 초안의 미저장 입력 경고 문구도 실제 표시됐으나, 이어진 조회/visibility 요청 구간에 쿠키가 사라져401이 됐다. private flag 정리와 저장 초안 경고의 취소/이동 후 보존 확인은 재인증 뒤 진행한다. status draft는 유지했으며 접수/공개를 시작하지 않았다.
- Luna의 읽기 전용 auth 진단: session cookie TTL7일, RequireAuth401은 localStorage 힌트만 삭제하고 cookie 삭제는 하지 않으며, 명시적 session 삭제는 logout/withdraw 경로다. 실제 cookie 소실의 직접 원인은 확인되지 않았다. 모니터 구간 auth events가 없었던 것은 전체 이탈 구간의 부재 증거가 아니다. 사용자에게 같은326의 이메일 로그인 화면을 다시 handOff했다.
- 이후 guest HTTP의 alpha commit은 `f9d38b30686a3b4f316eee6423da7dfcd344c951`로 바뀌었다. 다른 PR #1866의 merge이며 첫 parent가 eb384이고 템플릿 파일 변경은 없다. 이 버전에서 신규 초안 detail404 `TOURNAMENT_NOT_FOUND`, 공개bracket404·data 없음으로 비공개 초안 게이트를 확인했다. 쿠키 이탈과 배포 사이의 인과관계는 확인되지 않았다.

동일 공간326의 계정 소유자 로그인 확인 후 takeOver한다. 먼저 새 초안의 visibility false만 저장하고 나머지 값을 보존한다. 저장 초안 이동의 취소/확인, 단독12팀·조별12팀·대회 리그4팀·정규 리그4팀의 선택→생성→첫 경기 편집/저장, 20→11→20 특수 프리셋 복구, 템플릿 dialog390/768/1440 실제 화면·스크롤·고정 CTA를 확인한다. 대진 생성 후 after 이미지와 저장 결과는 아직 없다.

현재 테스트·lint 소유 PID는 모두 종료했고 임시 node_modules 링크 2개를 정확한 target 확인 후 제거했다. Node exact-command 기준 시작198/현재225이며, 동일 signature의54벌 증가는 없고 다른 세션 프로세스는 종료하지 않았다. 테스트/dev server/Docker를 추가로 띄우지 않았다. ego326은 사용자 로그인 제어 중이므로 유지하며 최종 실제 QA 종료 후 `finish({ keep: [] })`한다.
