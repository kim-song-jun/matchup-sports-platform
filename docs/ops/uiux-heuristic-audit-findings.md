# UI/UX 기본기 휴리스틱 audit findings (Workflow wf_90c0081f-c1c)

> 8 그룹 병렬 분석 + opus 종합. 96 raw → 25 prioritized. verdict: "false-positive 거의 없음".
> **근본원인: 공유 primitives + 도메인 로컬 InfoRow의 강조표시 평탄화** → primitive 수정이 high leverage.
> 사용자 피드백("ui 레이아웃·강조표시·ux 기본기 안 지켜짐") 입증.

## systemic 패턴 (opus)
1. **라벨-값 위계 평탄화(최광범위)**: 핵심 값(희소성·마감·가격·상태·수치)이 tm-text-caption/label(12-13px 회색)로 라벨과 같은 무게 → focal point 부재. 근원: primitives InfoRow/ListItem/KPIStat/AlertBanner.
2. **컴포넌트 중복·토큰 이탈**: InfoRow 3종(primitives/matches 로컬/teams grid) + 타입 스케일 토큰 외 14/15/16/12.5px 하드코딩.
3. **disabled/상태 분열**: 버튼 disabled 2갈래(opacity vs no-opacity) + 목록 로딩 일부만 skeleton.
4. **destructive/위험 신호 부재**: 팀매치 거절 버튼 neutral 회색, admin 위험 행/KPI 텍스트컬러만.

## prioritized 25
HIGH: #1 InfoRow/KPIStat/ListItem 값 위계 평탄(primitives.tsx) · #2 매치상세 희소성/마감 11px(matches-page:225,620) · #3 disabled 분열(globals:1106,1126) · #4 팀매치 거절 회색(team-matches-page:297) · #5 로딩=Empty(community/team-matches) · #6 AlertBanner 12px(primitives:37) · #7 대회 참가비 muted(tournaments/page:506) · #8 매치카드 희소성 평탄(home/matches) · #9 admin 위험행 강조없음(admin-data-table:152) · #10 admin 위험 KPI 약함(admin-kpi-card:19,37) · #11 채팅 미읽음 분산(globals:2672) · #12 알림 미읽음 제목 컬러(globals:2885).
MEDIUM: #13 InfoRow 3종 통합 · #14 타입스케일 토큰화 · #15 SectionTitle action 약함 · #16 KPIStat unit · #17 affordance · #18 disabled 이유 · #19 온보딩 요약값 · #20 NumberDisplay unit/팀매치 비용 · #21 요약바 모집중 · #22 인라인 px · #23 채팅 나가기 시트 modal화 · #24 입금대기 카드 · #25 textarea 높이.

## 검증 방침
공유 primitive 변경은 **broad 영향** → eval 측정 + 다화면 스크린샷(settled 상태)으로 회귀 확인. 강조는 refined minimalism(weight/시맨틱컬러/orange 배지), 장식 추가 금지.
