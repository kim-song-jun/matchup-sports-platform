# Session A — Scenario Executor

> **실행 환경**: Claude Desktop App (내장 브라우저 Launch Preview)
> **시작 순서**: 2번째 (Session B 다음)
> **역할**: 시나리오 문서대로 브라우저를 조작하고, 매 Step마다 스크린샷을 찍어 파일로 저장
> **절대 하지 않는 것**: 스크린샷 분석, UI/UX 판정, 코드 수정

---

## 1. 사전 준비 (사용자가 직접)

### 1-1. 개발 서버 실행 확인
```bash
cd ~/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform
pnpm dev   # 프론트 3003 + 백엔드 8100
```

### 1-2. Chrome 다운로드 설정
Chrome → 설정 → 다운로드 → **"다운로드 전에 각 파일의 저장 위치 확인"** 끄기
(html2canvas가 자동 다운로드를 트리거하므로 확인 창이 뜨면 안 됨)

### 1-3. Session B가 먼저 실행 중인지 확인
Session B(파일 감시자)가 이미 `/loop`으로 `~/Downloads/SC-*.png`를 감시하고 있어야 함.
없으면 Session B를 먼저 시작.

---

## 2. Claude Desktop에 붙여넣을 프롬프트

아래 전체를 Claude Desktop App의 **새 대화**에 붙여넣으세요.

---

```
나는 TeamMeet(Teameet) 프로젝트의 UI/UX 시나리오 테스트를 실행할 거야.
너는 내장 브라우저(Launch Preview)를 사용해서 시나리오 문서대로 브라우저를 조작하고,
매 Step마다 스크린샷을 찍어.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 프로젝트 정보

- 프로젝트 경로: ~/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform
- Claude Desktop worktree: .claude/worktrees/priceless-banzai
  (이 worktree 안에서 코드를 읽어야 해)
- 프론트엔드: http://localhost:3003
- 백엔드 API: http://localhost:8100/api/v1
- 브랜드명: TeamMeet (Teameet 아님!)
- 디자인: DESIGN.md 참조 (블루 #3182F6, Pretendard, 토스 스타일)

## 인증 방법

dev-login API 사용:
```
POST http://localhost:8100/api/v1/auth/dev-login
Content-Type: application/json
{ "username": "sinaro", "password": "test1234" }
```
또는 브라우저에서 /login 페이지 → dev-login 패널 사용

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 너의 역할 (매우 중요!)

1. **시나리오 문서를 읽는다**
   - tests/ui-scenarios/scenarios/ 폴더의 .md 파일
   - SC-{NN}-{NNN} 번호 순서대로 진행

2. **내장 브라우저(Launch Preview)로 조작한다**
   - http://localhost:3003 을 Launch Preview로 연다
   - 시나리오의 Steps 테이블에 적힌 액션을 순서대로 실행
   - navigate, click, hover, type, press, select, toggle, scroll, wait 등

3. **매 Step 실행 후 스크린샷을 찍는다**
   - 내장 브라우저의 스크린샷 기능 사용
   - 동시에 html2canvas로 Downloads 폴더에 PNG 파일 저장 (아래 참조)

4. **진행 로그를 남긴다**
   - 터미널에서 progress.log에 기록

5. **절대 하지 않는 것**
   - ❌ 스크린샷 분석
   - ❌ UI/UX 품질 판정 (✅/❌ 마킹)
   - ❌ 코드 수정
   - ❌ 이슈 보고
   → 이것들은 Session C가 담당

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Phase 0: 초기 설정 (최초 1회만)

### Step 0-1: 디렉토리 + 로그 파일 생성
```bash
cd ~/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform
mkdir -p tests/ui-scenarios/screenshots/{01-landing,02-auth,03-home,04-matches,05-teams,06-team-matches,07-mercenary,08-marketplace,09-lessons,10-chat,11-payments,12-profile-settings,13-venues-misc,14-admin,15-global-ui}
touch tests/ui-scenarios/progress.log
touch tests/ui-scenarios/errors.log
echo "Session A started $(date '+%Y-%m-%d %H:%M:%S')" >> tests/ui-scenarios/progress.log
```

### Step 0-2: Launch Preview로 프론트엔드 열기
내장 브라우저(Launch Preview)에서 http://localhost:3003 을 연다.

### Step 0-3: html2canvas 헬퍼 주입
브라우저 콘솔(또는 javascript 실행 도구)에서 아래를 실행:

```javascript
(async()=>{
  if(!window.html2canvas){
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    document.head.appendChild(s);
    await new Promise(r=>{s.onload=r});
  }
  window.__ss=async(filename)=>{
    const c=await html2canvas(document.documentElement,{
      width:innerWidth,height:innerHeight,
      windowWidth:innerWidth,windowHeight:innerHeight,
      useCORS:true,logging:false
    });
    const a=document.createElement('a');
    a.download=filename;
    a.href=c.toDataURL('image/png');
    a.click();
    return 'saved: '+filename;
  };
  return 'html2canvas ready, window.__ss available';
})()
```

⚠️ **중요**: 페이지를 navigate할 때마다(URL이 바뀔 때마다) 이 스크립트를 다시 실행해야 해.
JS 컨텍스트가 초기화되기 때문.

### Step 0-4: 로그인
1. /login 페이지로 이동
2. dev-login 패널에서 로그인 또는 API 직접 호출
3. /home 으로 리다이렉트 확인

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Phase 1: 시나리오 실행 루프

### 실행 순서 (이 순서대로 파일을 하나씩 진행)

| 순서 | 파일 | 이유 |
|------|------|------|
| 1 | 15-global-ui.md | 사이드바/헤더/네비 기반 확인 |
| 2 | 02-auth.md | 로그인 (이후 사전조건) |
| 3 | 03-home.md | 메인 페이지 |
| 4 | 04-matches.md | 개인 매칭 |
| 5 | 05-teams.md | 팀 관리 |
| 6 | 06-team-matches.md | 팀 매칭 lifecycle |
| 7 | 07-mercenary.md | 용병 |
| 8 | 08-marketplace.md | 장터 |
| 9 | 09-lessons.md | 강좌 |
| 10 | 10-chat.md | 채팅 |
| 11 | 11-payments.md | 결제 |
| 12 | 12-profile-settings.md | 프로필/설정/마이 |
| 13 | 13-venues-misc.md | 구장/알림/뱃지 |
| 14 | 14-admin.md | 관리자 |
| 15 | 01-landing.md | 랜딩 (비로그인) |

### 각 시나리오 실행 방법

시나리오 문서에서 SC-{NN}-{NNN} 블록을 읽는다. 예시:

```
### SC-03-005: 종목 필터 칩 선택

| 항목 | 값 |
|------|-----|
| **URL** | `/home` |
| **사전 조건** | 로그인 상태 |

#### Steps
| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | `click(종목 칩 "풋살")` | 풋살 칩이 활성(파란) 상태로 변경 | SC-03-005-S01 |
| 2 | `wait(300)` | 디바운스 후 매칭 목록 필터링 | SC-03-005-S02 |
```

이것을 아래처럼 실행:

```
1. 내장 브라우저에서 /home 이동 (이미 있으면 스킵)
2. "풋살" 종목 칩 클릭
3. 스크린샷 촬영:
   a. 내장 브라우저 스크린샷 (세션에 이미지 포함)
   b. 콘솔: window.__ss('SC-03-005-S01-D2.png')  ← Downloads에 저장
4. 300ms 대기
5. 스크린샷 촬영:
   a. 내장 브라우저 스크린샷
   b. 콘솔: window.__ss('SC-03-005-S02-D2.png')
6. 진행 로그:
   echo "SC-03-005-S01-D2 $(date '+%Y-%m-%d %H:%M:%S') OK" >> tests/ui-scenarios/progress.log
   echo "SC-03-005-S02-D2 $(date '+%Y-%m-%d %H:%M:%S') OK" >> tests/ui-scenarios/progress.log
```

### 뷰포트 순회

**기본 전략**: D2(1440×900)로 모든 기능 테스트 → 나머지 뷰포트는 레이아웃만 확인

| ID | 해상도 | 우선순위 | 확인 포인트 |
|----|--------|---------|-----------|
| D2 | 1440×900 | ★★★ 필수 | 기본 레이아웃, 모든 기능 |
| M2 | 375×812 | ★★★ 필수 | 모바일 스택, 하단 네비, 터치 |
| T2 | 768×1024 | ★★ 권장 | Sheet 전환, 2→1컬럼 |
| D1 | 1920×1080 | ★ 선택 | max-w 제한, 여백 |
| D3 | 1280×800 | ★ 선택 | 축소 시작점 |
| T1 | 1024×768 | ★ 선택 | 가로 태블릿 |
| T3 | 600×960 | ★ 선택 | 소형 태블릿 |
| M1 | 430×932 | ★ 선택 | 큰 폰 |
| M3 | 320×568 | ★ 선택 | 최소 (깨지면 Info) |

뷰포트 변경 방법:
- 내장 브라우저 창 크기 조절
- 또는 DevTools → 반응형 모드 → 해상도 입력

### 스크린샷 파일명 규칙

```
SC-{파일번호}-{시나리오번호}-S{스텝번호}-{뷰포트}.png

예시:
SC-03-005-S01-D2.png  → 03-home, 시나리오 5, 스텝 1, Desktop 표준
SC-03-005-S01-M2.png  → 03-home, 시나리오 5, 스텝 1, Mobile 표준
SC-14-022-S03-T2.png  → 14-admin, 시나리오 22, 스텝 3, Tablet 세로
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 액션 → 브라우저 조작 매핑

| 시나리오 문서 액션 | 내장 브라우저에서 하는 것 |
|-------------------|------------------------|
| `navigate(/path)` | URL 바에 localhost:3003/path 입력 → Enter → **html2canvas 재주입** |
| `click("텍스트" 버튼)` | 해당 텍스트가 있는 버튼을 클릭 |
| `click(셀렉터)` | CSS 셀렉터에 해당하는 요소 클릭 |
| `hover(요소)` | 마우스를 요소 위에 올려놓고 **유지한 채로** 스크린샷 |
| `type(필드, "값")` | 입력 필드를 클릭한 후 텍스트 입력 |
| `press(Enter)` | Enter 키 누르기 |
| `press(Tab)` | Tab 키 누르기 |
| `press(Escape)` | ESC 키 누르기 |
| `press(Cmd+K)` | Cmd+K 키 조합 |
| `select(드롭다운, "값")` | 드롭다운 클릭 → 옵션 "값" 클릭 |
| `toggle(스위치)` | 스위치/체크박스 클릭하여 토글 |
| `drag(요소A, 요소B)` | 요소A를 요소B 위치로 드래그 |
| `scroll(down 200px)` | 아래로 200px 스크롤 |
| `scroll(up)` | 위로 스크롤 |
| `wait(300)` | 300밀리초 대기 (디바운스, 애니메이션 완료) |
| `clear(입력필드)` | 입력 필드 전체 선택(Cmd+A) → 삭제(Backspace) |
| `upload(드롭존, "file.csv")` | 파일 업로드 (드래그 또는 파일 선택) |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 에러 처리

- **요소를 못 찾을 때**: 에러 로그에 기록하고 다음 Step으로
  ```bash
  echo "SC-{ID}-S{N}-{VP} $(date '+%Y-%m-%d %H:%M:%S') FAIL: element not found - {설명}" >> tests/ui-scenarios/errors.log
  ```

- **페이지 로드 실패**: 에러 로그 + 다음 시나리오로
  ```bash
  echo "SC-{ID} $(date '+%Y-%m-%d %H:%M:%S') FAIL: page load timeout" >> tests/ui-scenarios/errors.log
  ```

- **html2canvas 실패**: 내장 브라우저 스크린샷만이라도 찍고 진행
  (Session C가 세션 내 base64 이미지로도 분석 가능)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 진행 보고 (시나리오 파일 완료 시)

한 파일(예: 03-home.md) 완료 후:
```bash
echo "=== COMPLETED 03-home $(date '+%Y-%m-%d %H:%M:%S') ===" >> tests/ui-scenarios/progress.log
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 핵심 규칙 (다시 한번!)

1. **분석하지 마** — 오직 실행 + 촬영
2. **빠르게** — 스크린샷을 최대한 많이 찍는 것이 목표
3. **호버 = 호버 유지 중 촬영** (호버 해제 후 찍으면 안 됨)
4. **다이얼로그 = 열린 상태에서 촬영**
5. **토스트 = 표시된 상태에서 촬영** (2500ms 이내)
6. **애니메이션 = 완료 후 촬영** (wait 300~500ms)
7. **navigate 후 html2canvas 재주입 잊지 않기**
8. **Downloads에 SC-*.png가 쌓임 → Session B가 이동해줌**
```
