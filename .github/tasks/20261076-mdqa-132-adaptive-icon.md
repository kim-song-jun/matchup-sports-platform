# Task 20261076: MD-QA #132 Android adaptive launcher 심볼 여백

Status: In Progress
**Owner**: root / 5-pr-qa
**Created**: 2026-10-13

## Context
- 원 제보: https://teameet.jmandu.kr/issues/132/
- root가 실제 UI의 내가 처리하기를 실행하고 김성준 / 확인 중과 저장 성공을 확인했다.
- 현재 432px foreground는 파란 둥근 사각 배경을 포함하고 adaptive 및 monochrome이 같은 자산을 쓴다. 직접 설치 기기 재현과 사용자 설치 빌드 일치는 미확인이다.
- 기준 origin/dev: 552f5b6fb98d8546daf5e26f7de7a8ac413251f2. 기존 아이콘 수정 열린 PR/동일 작업은 확인되지 않았다.

## Goal
정본 심볼을 유지하면서 Android adaptive foreground와 background를 분리하고 안전 영역과 테마 아이콘 계약을 맞춘다.

## Original Conditions (must all be satisfied)
- [x] 원문·재현 조건·최근 댓글과 중복 소스 이력을 읽고 선점 성공을 확인한다.
- [x] foreground는 투명한 심볼 레이어, background는 단색 레이어로 분리한다.
- [x] 일반 및 monochrome 심볼이 원형·둥근 사각 마스크의 안전 영역에 들어간다(소스 자산 좌표, 설치 기기 렌더링 별도).
- [ ] 실제 설치 빌드/기기/런처 전후 증거를 별도로 남긴다.
- [x] iOS는 독립 조사하고 확인되지 않은 동일 결함을 임의 수정하지 않는다(자산만 read-only 대조, 기기 확인 미완료).

## User Scenarios
Android 일반/테마 아이콘이 런처 마스크 안에서 같은 Teameet 심볼과 충분한 여백을 보여 준다. iOS 크기는 별도 설치 기기에서 확인한다.

## Test Scenarios
### Happy path
- [x] 실제 adaptive XML → 참조 자산 → alpha 채널/심볼 bounds를 검사하는 좁은 RED→GREEN 회귀.
### Edge cases
- [x] round 및 default 아이콘, Android 26+와 테마 아이콘 리소스 계약을 모두 확인한다(실제 mask/theme 렌더링 별도).
### Error paths
- [x] 불투명 컬러 배경을 monochrome으로 재사용하거나 심볼이 안전 영역을 넘으면 검증이 실패한다.
### Mock data updates needed
- API/DTO/fixture/MSW 변경 없음. 자산·생성 도구가 존재하면 같은 범위에서 동기화한다.

## Parallel Work Breakdown
- Owned: apps/v1_android/app/src/main/res 의 launcher 전용 자산/XML, 관련 좁은 resource 회귀 검증, 이 task 문서, 직접 Changeset.
- Forbidden: iOS 자산 변경, 앱 Java/Kotlin 동작, auth/푸시, shared web/API/DTO/schema, 다른 task/정책/상태 파일, .env/비밀, legacy, main/prod.
- worker는 혼자가 아니며 타인 변경을 되돌리지 않는다. self-commit/push 금지. root가 검증과 Git/PR을 맡는다.

## Acceptance Criteria
- [ ] 가장 작은 자산/리소스 수정과 실제 실패→성공 회귀 검증, 독립 리뷰를 완료한다.
- [ ] committed diff/import/debt marker 확인 후 base dev PR을 게시한다.
- [ ] 최신 head 리뷰·CI를 구분하고 원 리포트 댓글의 저장과 실제 표시를 확인한다.
- [ ] 실제 Android 설치 검증과 iOS 독립 확인 전 full PASS/완료를 주장하지 않는다.

## Tech Debt Resolved
컬러 타일을 adaptive foreground와 monochrome으로 같이 쓰는 리소스 계약을 제거했다. 새 launcher 전용 리소스는 정본 transparent alpha와 흰색 tint만 제공하고 배경은 기존 단색 레이어로 분리한다. splash에 쓰는 옛 타일은 유지한다.

## Security Notes
자산 변경만 수행하며 인증·키·앱 권한을 변경하지 않는다. 사적 홈 화면 원본은 공개하지 않는다.

## Risks & Dependencies
Windows Android SDK36/build-tools36.0.0/JDK17은 설치돼 있다. 프로젝트 AGP9.0.1/CI Gradle9.1.0에 맞는 로컬 Gradle 배포와 캐시는 없으며 기존 Gradle8.0/AGP8.x만으로 offline native build를 통과했다고 주장하지 않는다. 실제 기기는 일시적으로 발견됐지만 후속 조회에서는 사라졌다. 웹 alpha는 네이티브 런처 검증을 대신하지 않는다. 비가역 완료/첨부 삭제는 action-time 인간 확인 전 금지한다.

## Resource Investigation / Debug Journal
- H1: Android adaptive foreground에 컬러 타일 배경이 구워져 있다. 실제 PNG 픽셀 관찰은 432×432, alpha>8 bounds `[0,0,431,431]`, opaque 178,046개, 전체 non-transparent 179,848개다. 원형 안전 반경 33dp에 맞추기 전 자산 반경은 67.02dp다. 소스 리소스 결함 근거이며 사용자 설치 빌드 일치는 별도다.
- H2: monochrome이 로고 silhouette 대신 컬러 타일 alpha를 사용한다. 실제 default/round XML 모두 `@drawable/ic_launcher_foreground`를 참조한다. 시스템 tint가 RGB를 바꾸어도 타일의 alpha 윤곽은 그대로 남는다.
- H3: 사용자가 다른 APK/런처 캐시를 보고 있을 수 있다. 설치 빌드·version·기기 런처 전후는 아직 대조되지 않았다. 소스 수정으로 이 가설을 검증했다고 표현하지 않는다.
- 정확한 transparent 정본은 `apps/v1_web/public/brand/teameet-mark.png`다. 512×512 RGBA, alpha>8 bounds `[56,89,455,421]`, radius 236.9863px, SHA256 `3a1a6f889d0b9cb830c2978bbb81d915908f52b3264e7be0159f6efaade65ec6a`. PNG 원본을 편집하지 않고 Android에 그대로 복사해 silhouette을 보존한다. notification vector는 다른 T 형상이므로 사용하지 않는다.
- 구현: adaptive 전용 inset/bitmap drawable에서 18% 사방 inset과 흰색 `src_in` tint를 사용한다. 관측한 정본 pixels와 실제 inset에서 계산한 108dp 반경은 약 31.9946dp, 심볼 width는 53.865dp다. 별도 단색 background를 유지한다. default/round/monochrome이 같은 alpha geometry를 사용한다. 이 좌표 검증은 실제 Android Drawable의 픽셀 반올림/필터링이나 기기 mask 렌더링을 대체하지 않는다.
- 기존 foreground PNG는 Android 12 splash에서도 사용한다. 그 파일·테마를 수정하지 않고 새 adaptive 전용 drawable을 추가한다.
- [Android 공식 가이드](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)의 108dp 레이어/66dp 안전 영역/분리된 monochrome 계약과 [InsetDrawable](https://developer.android.com/reference/android/graphics/drawable/InsetDrawable)의 fractional inset(API26)을 따른다. 현재 minSdk 26이다.
- read-only host 조회: `adb`/`emulator`는 `C:/dev/android`에 있고 Java도 설치돼 있다. `adb devices -l`이 emulator-5554를 반환했지만 다음 read-only package 목록은 `device not found`였다. worker는 기기를 재시작·설치·조작하지 않았다. 다른 실행의 기기 소유권과 installed QA는 root가 조율한다.
- iOS 독립 자산 관찰: `AppIcon-1024.png`는 1024×1024 RGB의 완전 불투명 타일이다. iOS의 OS mask용 full-canvas 자산이며 Android foreground/monochrome의 레이어 혼용과 같은 결함 근거가 아니다. iOS 설치 화면·심볼 크기는 별도 미확인, 변경 없음.
- Debug artifacts: 임시 프로세스·이미지 생성·이미지 편집 없음. 회귀 검증은 Node가 OS 임시 폴더에 Java source probe를 만들고 `finally`에서 그 폴더만 제거한다. PNG/XML/manifest의 실제 데이터만 읽으며 장치 렌더링을 흉내 내 PASS라고 하지 않는다.
- Root RED: host preflight 후 `node --test scripts/qa/android-adaptive-icon.test.mjs`, 6 tests 중 PASS1/FAIL5. 네 실제 레이어는 colored tile pixels 152,458, radius 67.0217dp를 반환했다. Root가 `mdqa132-red.log`로 근거를 보관했다.
- Root GREEN: 같은 좁은 회귀 6/6 PASS. 마지막 브랜드 assertion은 manifest→XML이 실제 참조하는 leaf PNG의 바이트를 정본과 대조한다. 이후 assertion 변경 없이 레이어 metrics를 TAP diagnostic으로 노출해 다음 committed-tree 실행에서 실제 probe 수치를 보관할 수 있게 했다. worker는 테스트/빌드를 실행하지 않았다.
- Changeset policy correction: Android resource-only는 affectsRelease에 없지만 root가 추가한 `.github/workflows/android-alpha.yml`는 릴리스 대상이다. CI Gates가 own Changeset 누락으로 실패했다. 게이트 예외를 만들지 않고 기존 fixed v1 package 계약에 맞는 patch Changeset을 추가한다.
- Native validation handoff: CI는 Gradle9.1.0/JDK17, 프로젝트는 AGP9.0.1이다. 적합한 Gradle 준비 뒤 최소 명령은 `gradle.bat -p apps/v1_android :app:processAlphaDebugResources --max-workers=1 --no-daemon --offline`. 현재의 SDK 도구로는 `C:/dev/android/build-tools/36.0.0/aapt2.exe compile --dir apps/v1_android/app/src/main/res -o <root-owned-qa-dir>/mdqa132-native-res.zip`가 가능한 별도 syntax 검증이다. Root 실행 전까지 native compile PASS로 적지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-13 | root | 설치 빌드와 소스가 같은가? | 미확인. 소스 계약과 실제 기기 결과를 분리한다. |

## Progress Snapshot
- Report #132: 김성준 / 확인 중, 실제 선점 증거 tmp/qa/mdqa-assigned-monitor/2026-10-13-heartbeat-0244/claim-132.png.
- Worktree: C:/Users/kinso/.codex/worktrees/mdqa-132-adaptive-icon/matchup-sports-platform
- Branch: fix/mdqa-132-adaptive-icon; initial HEAD 552f5b6fb98d8546daf5e26f7de7a8ac413251f2.
- Phase: implementation handed off, root RED5 failures → GREEN6/6. Native build/device QA/independent review/Git/PR are pending root execution.
- Owned paths: `apps/v1_android/app/src/main/res/drawable/ic_launcher_adaptive_foreground.xml`, `apps/v1_android/app/src/main/res/drawable-nodpi/ic_launcher_symbol.png`, `apps/v1_android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`, `apps/v1_android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`, `scripts/qa/android-adaptive-icon.test.mjs`, this task.
- Canonical copy SHA256 `3a1a6f889d0b9cb830c2978bbb81d915908f52b3264e7be0159f6efaade65ec6a`; unchanged splash foreground SHA256 `8ce7c91b1e4ce58664df1a165fe766809f8511bb8535e0444e7b25471dbf849c`.
- Worker `git diff --check` PASS and touched TODO/FIXME/HACK/XXX grep empty. No commit/push/staging/build/device mutation/foreign WIP reversal. PR/merge/installed AFTER not yet available.

### Root verification — 2026-10-13
- Root executed the real resource RED (5 failed / 1 passed) then GREEN (6/6 passed) serially after CPU/memory/process/Docker preflight. Evidence: `tmp/qa/mdqa-assigned-monitor/2026-10-13-heartbeat-0244/mdqa132-{red,green}.log` in original checkout.
- Native AAPT2 36.0.0 `compile --dir apps/v1_android/app/src/main/res` succeeded (exit 0), creating `mdqa132-native-res.zip` in that evidence directory. This proves native resource syntax only; Gradle APK build and installed OEM rendering remain separate.
- Independent code reviewer found the new regression was absent from CI. Root added only its PR/dev-push path filters and Node test step after JDK17 setup in `.github/workflows/android-alpha.yml`. This seventh path is root-owned. Re-review verdict CLEAR / APPROVE, no source/CI blockers.
- Latest prepublication fetch: `origin/dev` remains `552f5b6fb98d8546daf5e26f7de7a8ac413251f2`, no dev drift. Explicit pathspec commit and committed-tree verification follow; no main/prod action or tracker completion is authorized by these source checks.

### Published PR / CI receipt — 2026-10-13
- PR https://github.com/kim-song-jun/matchup-sports-platform/pull/1884, OPEN, base dev. Initial source head966da55dab5eec5df93995ee5e5bf65c2dc63eec independent exact-head OK/FindingsNone. Committed resource regression6/6, Android Alpha test-and-build SUCCESS run38341219465. Device BEFORE/AFTER remains NOTRUN.
- Common CI Gates run38341219442 FAILURE: workflow addition is release-affecting and requires own Changeset; resource-only exemption did not cover the final7-path diff. Root adds truthful patch Changeset, no policy weakening. Other CI checks/reviews revalidated at new head after push.
- Existing #132 tracker comment314 saved and reload-verified, screenshot report-132-comment.png, explicitly OPEN/merge waiting/native NOTRUN. No tracker completion, release or main action.
- Latest fetch origin/dev d1086112d6809f36030c1b592b6bcc42ed723b9d; source changes across drift must be checked before push.
