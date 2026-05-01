# Prototype System Hub

이 폴더는 `Teameet Design.html`을 실제 서비스 수준의 UI kit로 운용하기 위한 문서 허브다.

기존 `ANALYSIS.md`, `SYSTEM_CANDIDATE.md`, `SECTION_UNIFICATION_MATRIX.md`, `SOURCE_PROTOTYPE_PARITY.md`는 handoff 분석과 source/prototype parity를 설명한다. 이 폴더는 그 다음 단계인 **운영 가능한 prototype system**만 모은다.

## Current Prototype

- URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix32`
- File: `sports-platform/project/Teameet Design.html`
- Reference sections: `00~00n`
- Module viewport-grid sections (full 19 모듈): `m01-grid` ~ `m19-grid`
- Functional module sections: `01~19` (각 DCArtboard에 `data-canonical-id="m{NN}-..."` alias 부여, fix32)
- Rendered sections: `52`
- Rendered artboards: `601`
- Functional artboards with canonical_id alias: `306`
- Visible legacy/meta sections: `0`
- Theme mode: light-only prototype. Admin desktop sidebar is the only dark panel exception.
- ID schema: `m{NN}-{viewport}-{kind}[-{state|asset|sub}]` — see `PROTOTYPE_ID_SCHEMA_FIX29.md` + `CANONICAL_ID_MAP_FIX32.md`.

## Documents

1. `MODULE_MAP.md`
   - 현재 rendered prototype의 section/artboard 구조.
   - 상세, 생성, 내역, 데스크탑, 운영 화면이 어느 owning module에 들어가는지 확인한다.

2. `COMMON_FLOWS.md`
   - 온보딩, 탐색, 상세, 생성/수정, 결제/환불, 운영 처리 같은 공통 flow 기준.

3. `INTERACTIONS_AND_STATES.md`
   - tap scale, filter chip, bottom sheet, sticky CTA, toast, skeleton, grouped notification, form progress, success confirmation, 상태 화면 기준.

4. `CASE_COVERAGE_MATRIX.md`
   - 각 모듈별 case matrix board, 상태/엣지/인터랙션 coverage, 개발 핸드오프 준비도.

5. `COLOR_SYSTEM.md`
   - Toss-like white-first palette와 token usage 기준.
   - `fix11`에서 raw color를 token 기반으로 정규화한 결과.

6. `DESIGN_SYSTEM_FOUNDATION_FIX24.md`
   - 타이포, 버튼 크기, hover/pressed/disabled, chip/input/list/card, motion, Tailwind class 계약.
   - `00k · 디자인 시스템 Foundation` 보드와 연결된다.

7. `TAILWIND_TOKEN_SYSTEM_FIX24.md`
   - Tailwind 기준 color, spacing, radius, typography, breakpoint 정량화.
   - light-only prototype, Admin dark sidebar 예외, `tm-*` component class 기준.

8. `PRODUCTION_HANDOFF_FIX26.md`
   - 실제 앱 개발 착수를 위한 token migration, component extraction, page wave, QA gate.
   - route ownership, bottom nav 결정, future scope 분리 기준.

9. `ROUTE_OWNERSHIP_MANIFEST_FIX27.md`
   - 101개 source route를 `01~18/19` 모듈에 1:1 매핑.
   - cross-module 6건, future scope 7건 분리 기준.

10. `BOTTOM_NAV_CONTRACT_FIX27.md`
    - bottom nav canonical 5 tab (`home/matches/teams/marketplace/more`) 결정.
    - prototype `lessons`/`my` variant 보존 + `normalizeNavId` 매핑 규정.

11. `TOKEN_ALIGNMENT_PLAN_FIX27.md`
    - prototype `lib/tokens.jsx` ↔ source `globals.css` 정렬 결정.
    - blue-600 / grey→gray / type / control / motion / shadow drift 처리 결정.

12. `COMPONENT_EXTRACTION_PLAN_FIX27.md`
    - NumberDisplay → FilterChip → MoneyRow → StatBar → MetricStat 추출 순서.
    - 각 컴포넌트 props/caller hotspot/PR scope/acceptance.

13. `PROTOTYPE_ID_SCHEMA_FIX29.md`
    - 모든 보드의 결정적 식별자 schema 정의: `m{NN}-{viewport}-{kind}[-{state|asset}]`.
    - viewport (mb/tb/dt) · kind 10종 · state 9종 · asset 5종 enum.
    - module × viewport obligation grid (의무/조건부 보드).

14. `PROTOTYPE_INVENTORY_FIX29.md`
    - 19 모듈 × 3 viewport × kind/state matrix와 기존 보드 → 새 ID 매핑.
    - POC = M01·M02 풀 grid (17 신규). 후속 wave A~E (~163 신규) 계획.

15. `CANONICAL_ID_MAP_FIX32.md`
    - `fix32` 기준 functional artboard 306개에 `data-canonical-id="m{NN}-{viewport}-{kind}[-{sub}]"` alias 매핑.
    - 자동 매핑 스크립트: `scripts/qa/teameet-build-canonical-id-map.mjs` (sectionId → 모듈, width → viewport, id+label → kind + step/variant/keyword/lastSlug).

16. `M_GRID_REWRITE_SPEC_FIX32.md`
    - `fix32` 기준 m-grid 보드 19개 모듈 재작성 가이드. 19 frontend-ui-dev agent에게 동일 spec, LEAF file principle.
    - canonical 컴포넌트 직접 재사용 우선 (HomeToss, MatchesList 등) + 의무 grid + 토큰 사용 규칙.

17. `DESIGN_QA_FIX32.md`
    - `fix32` 기준 canonical-first restoration 결과. 사용자 피드백 반영 — m-grid simplified를 canonical 디자인 vocabulary로 재작성.
    - audit: color 95.8% → **97.2%** (+1.4pp). spacing 74.3% → 76.5%, typography 53.4% → 54.6%.
    - 19 모듈 병렬 agent 통합 결과 + Toast/duplicate-key 이슈 해결.

18. `DESIGN_QA_FIX31.md`
    - `fix31` 기준 production primitive 5종 추출 (NumberDisplay/FilterChip/MoneyRow/StatBar/MetricStat) + globals.css 16 신규 토큰 + prototype color sweep 233건.
    - audit: color 93.0% → **95.8%** (+2.8pp). 477 frontend tests 전체 통과.

16. `DESIGN_QA_FIX30.md`
    - `fix30` 기준 전체 601개 artboard QA 결과.
    - M03~M19 풀 grid 270개 추가 (17 병렬 에이전트), ID schema violations=0.
    - audit 재측정: typography 41.6%→53.4% (+11.8pp), spacing +4.1pp, color +0.4pp.

16. `DESIGN_QA_FIX29.md`
    - `fix29` 기준 전체 359개 artboard QA 결과.
    - M01·M02 viewport grid POC + ID schema violations=0 검증.

16. `PROTOTYPE_AUDIT_FIX28.md`
    - `fix28` 기준 prototype audit summary 결과.
    - 사용자 4가지 검수 질문에 대한 정량+정성 답. color 92.9% / spacing 69.7% / typography 41.6% class adoption.
    - module compliance heatmap (31 모듈), viewport coverage matrix, developer readiness checklist.
    - P0 0건 / P1 3건 / P2 4건 backlog.

14. `DESIGN_QA_FIX28.md`
    - `fix28` 기준 전체 331개 artboard QA 결과.
    - `00n · Prototype Audit Summary` 보드 (5 boards) 와 fix27→fix28 diff.

15. `DESIGN_QA_FIX27.md`
    - `fix27` 기준 전체 326개 artboard QA 결과.
    - `00m` 개발 핸드오프 II 보드와 fix26→fix27 diff.

16. `DESIGN_QA_FIX26.md`
    - `fix26` 기준 전체 321개 artboard QA 결과.
    - `00l` 개발 핸드오프 보드와 text clipping 검증 결과.

17. `DESIGN_QA_FIX25.md`
    - `fix25` 기준 전체 317개 artboard QA 결과.
    - 직접 버튼 interaction bridge, `tm-pressable`, copy-fit QA 검증 결과.

18. `DESIGN_QA_FIX24.md`
    - `fix24` 기준 전체 317개 artboard QA 결과.
    - `00k` foundation, leaf text clipping, Tailwind class 적용 검증 결과.

19. `DESIGN_QA_FIX23.md`
    - `fix23` 기준 전체 311개 artboard QA 결과.
    - dark 보드 제거, responsive/copy-fit 보정, Admin sidebar 검증 결과.

20. `PAGE_READINESS_AUDIT_FIX21.md`
    - 페이지별 예외, 버튼/입력 상태, 모션, 반응형, copy fit 준비도 기준.
    - `01 · 인증 · 온보딩`부터 `18 · 관리자 · 운영`까지 전체 기능 모듈 readiness 완료 기준.

21. `DESIGN_QA_FIX21.md`
    - `fix21` 기준 전체 325개 artboard QA 결과.
    - `09~18` 병렬 readiness wave와 전체 `01~18` 준비도 검증 결과.

22. `PAGE_READINESS_AUDIT_FIX20.md` / `DESIGN_QA_FIX20.md`
    - `fix20` 기준 readiness audit 및 `08 · 용병 Mercenary` 검증.

23. `PAGE_READINESS_AUDIT_FIX19.md` / `DESIGN_QA_FIX19.md`
    - `fix19` 기준 readiness audit 및 `07 · 시설 Venues` 검증.

24. `PAGE_READINESS_AUDIT_FIX18.md` / `DESIGN_QA_FIX18.md`
    - `fix18` 기준 readiness audit 및 `06 · 장터 Marketplace` 검증.

25. `PAGE_READINESS_AUDIT_FIX17.md` / `DESIGN_QA_FIX17.md`
    - `fix17` 기준 readiness audit 및 `05 · 레슨 Academy` 검증.

26. `PAGE_READINESS_AUDIT_FIX16.md` / `DESIGN_QA_FIX16.md`
    - `fix16` 기준 readiness audit 및 `04 · 팀 · 팀매칭` 검증.

27. `PAGE_READINESS_AUDIT_FIX15.md` / `DESIGN_QA_FIX15.md`
    - `fix15` 기준 readiness audit 및 `03 · 개인 매치` 검증.

28. `PAGE_READINESS_AUDIT_FIX14.md` / `DESIGN_QA_FIX14.md`
    - `fix14` 기준 readiness audit 및 `02 · 홈 · 추천` 검증.

29. `PAGE_READINESS_AUDIT_FIX13.md` / `DESIGN_QA_FIX13.md`
    - `fix13` 기준 첫 readiness audit 및 `01 · 인증 · 온보딩` 검증.

30. `DESIGN_QA_FIX12.md`
    - `fix12` 기준 전체 185개 artboard QA 결과 — case matrix + common state/edge/interaction atlas.

31. `DESIGN_QA_FIX11.md`
    - `fix11` 기준 전체 163개 artboard QA 결과 — token sanity + duplicate/legacy 검증.

## Operating Rule

prototype을 수정할 때는 다음 순서를 따른다.

1. 기능 추가나 이동은 `MODULE_MAP.md`의 owning module 기준으로 한다.
2. 공통 흐름은 `COMMON_FLOWS.md`에 먼저 반영한다.
3. 상태와 마이크로 인터랙션은 `INTERACTIONS_AND_STATES.md`에 맞춘다.
4. 개발 핸드오프에 필요한 누락 상태/엣지/모션은 `CASE_COVERAGE_MATRIX.md`와 각 모듈 case matrix board에 같이 반영한다.
5. 페이지별 실제 UI 준비도는 `PAGE_READINESS_AUDIT_FIX21.md`, `PRODUCTION_HANDOFF_FIX26.md`, `DESIGN_QA_FIX27.md` 기준으로 유지한다.
6. 새 색/간격/반응형 breakpoint는 `TAILWIND_TOKEN_SYSTEM_FIX24.md`, `TOKEN_ALIGNMENT_PLAN_FIX27.md`, `tailwind.teameet.config.js` 기준으로 token에 먼저 올린다.
7. 새 버튼/칩/입력/카드/모션 패턴은 `DESIGN_SYSTEM_FOUNDATION_FIX24.md`의 `tm-*` class contract와 `COMPONENT_EXTRACTION_PLAN_FIX27.md`의 props 계약을 함께 따른다.
8. production route ownership과 bottom nav 결정은 `ROUTE_OWNERSHIP_MANIFEST_FIX27.md`, `BOTTOM_NAV_CONTRACT_FIX27.md` 기준으로 통합한다.
9. production migration은 `PRODUCTION_HANDOFF_FIX26.md`의 wave와 acceptance gate를 따른다.
10. 브라우저 QA를 돌리고 최신 버전 QA 문서(`DESIGN_QA_FIX32.md`)에 결과를 남긴다.
11. prototype 수정 라운드가 완료된 후 `PROTOTYPE_AUDIT_FIX28.md`의 audit gate(color/spacing/typography 임계값)를 기준으로 regression을 확인한다. 임계값 미달 시 audit 재실행 후 해당 QA 문서에 결과를 남긴다.
12. canonical 디자인 (functional sections `01~19`)은 prototype의 source of truth. m-grid 보드는 canonical 디자인의 visual vocabulary를 재사용하거나 직접 임베드한다. simplified illustration 금지 — `M_GRID_REWRITE_SPEC_FIX32.md` 참조.
13. functional artboard의 canonical_id alias는 `CANONICAL_ID_MAP_FIX32.md`에 정의됐다. 새 functional 보드 추가 시 매핑표에 동시 등록하고 `data-canonical-id` 속성을 부여한다 (`scripts/qa/teameet-apply-canonical-id.mjs` idempotent 적용).
