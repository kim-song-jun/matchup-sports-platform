/* Teameet prototype case coverage boards.
   These boards turn each module into an implementation-ready state,
   edge-case, and interaction contract instead of a happy-path mockup only. */

const MODULE_CASE_SPECS = {
  auth: {
    title: '인증 · 온보딩',
    subtitle: '로그인, OAuth callback, 필수 프로필 선택, 재진입 복구',
    nav: 'home',
    routes: ['/login', '/callback/kakao', '/callback/naver', '/onboarding'],
    shell: 'OnboardingStepShell',
    flows: [
      '소셜 로그인 -> provider callback -> 토큰 저장 -> 온보딩 필요 여부 분기',
      '종목/레벨/지역 필수 선택 -> disabled CTA -> 단계별 복구',
      '이미 가입한 사용자 -> callback success -> home으로 즉시 이동',
    ],
    states: [
      ['Loading', 'provider 인증 대기 중 skeleton + 취소 CTA'],
      ['Error', 'provider denied/network error + 다시 시도'],
      ['Disabled', '필수 선택 누락 시 하단 CTA 비활성 + 누락 항목 표시'],
      ['Permission', '위치 권한 거부 시 수동 지역 선택으로 복구'],
      ['Success', '환영 화면 + 홈/매치 추천으로 다음 행동 제공'],
    ],
    edges: [
      'provider가 email/name을 주지 않는 경우',
      'callback 중 토큰 만료 또는 중복 계정 충돌',
      '온보딩 중 뒤로가기/앱 종료 후 재진입',
      '미성년/약관 미동의 사용자의 가입 차단',
    ],
    interactions: [
      'provider 버튼 tap scale -> loading row로 치환',
      'step progress는 1/3, 2/3, 3/3 고정 위치 유지',
      '지역 검색 bottom sheet 열림/닫힘',
      '완료 후 welcome -> home push transition',
    ],
  },
  home: {
    title: '홈 · 추천',
    subtitle: '개인화 추천, 빠른 액션, 위젯, feed, 초대 실험',
    nav: 'home',
    routes: ['/home', '/feed', '/badges'],
    shell: 'DiscoverListShell',
    flows: [
      '오늘 할 수 있는 액션 -> 추천 이유 확인 -> 상세로 이동',
      '필터/관심 종목 변경 -> 추천 리스트 재정렬',
      '초대/성장 실험 -> 공유 완료 -> 리워드 상태 확인',
    ],
    states: [
      ['Empty', '관심 종목 없음 -> 온보딩 수정 CTA'],
      ['Loading', '추천 카드 shape skeleton'],
      ['Error', '추천 API 실패 -> 최근 활동 fallback과 재시도'],
      ['Pending', '초대 리워드 산정 중 상태'],
      ['Success', '초대 완료/위젯 추가 confirmation'],
    ],
    edges: [
      '위치/종목 정보가 없어 추천 품질이 낮은 경우',
      '추천된 매치가 방금 마감된 경우',
      '초대 링크 공유 후 attribution이 지연되는 경우',
      'feed에 차단/신고한 사용자의 콘텐츠가 섞인 경우',
    ],
    interactions: [
      '추천 카드 -> detail push transition',
      'widget FAB tap -> quick action sheet',
      '필터 chip 선택 시 active blue + count update',
      'pull-to-refresh hint로 추천 갱신',
    ],
  },
  matches: {
    title: '개인 매치',
    subtitle: '목록, 지도, 타임라인, 상세, 참가, 생성, 내 매치',
    nav: 'matches',
    routes: ['/matches', '/matches/[id]', '/matches/new', '/my/matches'],
    shell: 'DetailSummaryShell + FormStepShell',
    flows: [
      '목록/지도/타임라인 탐색 -> 상세 -> 참가 bottom sheet -> 결제/확정',
      '매치 생성 -> 장소/시간/정원/비용 입력 -> 검수/게시',
      '내 매치 -> 참가 상태/취소/영수증 확인',
    ],
    states: [
      ['Deadline', '마감 임박 badge + 남은 시간 + CTA 가능 여부 분리'],
      ['Sold out', '모집 완료 -> 대기 신청 또는 알림받기'],
      ['Permission', '호스트/참가자/비회원 권한별 CTA 분기'],
      ['Pending', '참가 신청/결제 승인 대기'],
      ['Error', '정원 충돌, 결제 실패, 중복 신청 복구'],
    ],
    edges: [
      '상세 진입 직후 정원이 가득 찬 race condition',
      '날씨 악화/시설 변경으로 일정이 변경되는 경우',
      '무료 매치와 유료 매치의 CTA/영수증 분기',
      '호스트가 본인 매치에 참가 신청하는 경우',
    ],
    interactions: [
      '지도 pin 선택 -> 하단 카드 동기화',
      '참가 CTA -> bottom sheet open/close',
      '필터 chip selection + list reorder',
      '신청 완료 toast + 내 매치로 sticky next CTA',
    ],
  },
  teams: {
    title: '팀 · 팀매칭',
    subtitle: '팀 프로필, 가입 신청, 팀 매치, 출석, 스코어, 평가, 팀장 도구',
    nav: 'matches',
    routes: ['/teams', '/teams/[id]', '/team-matches', '/team-matches/[id]'],
    shell: 'TeamCaptainTools + DetailSummaryShell',
    flows: [
      '팀 탐색 -> 팀 프로필 -> 가입 신청 -> 승인/거절',
      '팀 매치 예약 -> 라인업/출석 -> 스코어 입력 -> 경기 평가',
      '팀장 도구 -> 멤버 권한/초대/용병 모집 관리',
    ],
    states: [
      ['Pending', '가입/매치 신청 대기 + 처리 주체 표시'],
      ['Permission', '주장/매니저/멤버/외부 사용자별 액션 분리'],
      ['Disabled', '라인업 미확정/경기 전 스코어 입력 차단'],
      ['Success', '출석/스코어 저장 후 audit log'],
      ['Error', '상대 팀 취소, 중복 예약, 권한 변경 충돌'],
    ],
    edges: [
      '주장이 팀을 탈퇴하거나 권한이 변경된 경우',
      '경기 시작 후 출석 체크를 수정하는 경우',
      '스코어 입력자와 상대 팀 검증 값이 다른 경우',
      '팀 정원 초과 또는 초대 링크 만료',
    ],
    interactions: [
      '팀원 role menu open -> 권한 변경 confirm sheet',
      '출석 check tap scale + 즉시 count update',
      '스코어 stepper +/-는 44px target 유지',
      '경기 평가 submit -> success confirmation',
    ],
  },
  lessons: {
    title: '레슨 Academy',
    subtitle: 'Academy Hub, 코스/코치 탐색, 상세, 수강권, 코치 운영',
    nav: 'lessons',
    routes: ['/lessons', '/lessons/[id]', '/lessons/new', '/my/lesson-tickets'],
    shell: 'AcademyHub + TicketStatePanel',
    flows: [
      'Academy Hub -> 코스/코치/무료체험/내 수강권으로 분기',
      '레슨 상세 -> 일정 선택 -> 수강권 구매/사용',
      '코치 workspace -> 출결/후기/정산 상태 확인',
    ],
    states: [
      ['Empty', '추천 코스 없음 -> 관심 종목/지역 수정 CTA'],
      ['Deadline', '이번 주 시작/마감 임박 course badge'],
      ['Sold out', '정원 마감 -> 대기 신청/다음 기수 알림'],
      ['Pending', '수강권 결제/코치 승인 대기'],
      ['Disabled', '만료/잔여 0회 수강권 CTA 차단'],
    ],
    edges: [
      '아카데미 코스와 단건 레슨이 섞여 보이는 경우',
      '수강권이 만료됐지만 환불 가능 기간인 경우',
      '코치가 일정을 변경하거나 휴강 처리한 경우',
      '무료 체험 중복 신청 또는 노쇼 이력',
    ],
    interactions: [
      'Academy Hub card -> course detail push',
      '일정 선택 chip -> sticky CTA 금액 갱신',
      '수강권 사용 bottom sheet에서 잔여/만료 확인',
      '코치 workspace action toast + persistent status row',
    ],
  },
  marketplace: {
    title: '장터 Marketplace',
    subtitle: '목록, 상세, 등록/수정, 주문/거래 상태, 내 판매글',
    nav: 'marketplace',
    routes: ['/marketplace', '/marketplace/[id]', '/marketplace/new', '/marketplace/orders/[id]'],
    shell: 'MarketplaceOrderStateShell',
    flows: [
      '카탈로그 탐색 -> 상세 -> 구매 문의/주문 -> 거래 상태 추적',
      '판매글 등록 -> 사진/상태/가격 검증 -> 게시/수정',
      '내 판매글 -> 예약중/거래완료/분쟁 상태 관리',
    ],
    states: [
      ['Sold out', '판매 완료/예약중 badge + CTA 차단'],
      ['Pending', '입금/픽업/배송 대기 단계 표시'],
      ['Error', '결제 실패, 판매자 취소, 품절 race 복구'],
      ['Permission', '판매자 본인 글 구매 차단 + 수정 CTA'],
      ['Success', '거래 완료 + 후기/영수증/분쟁 진입'],
    ],
    edges: [
      '사진 업로드 실패 또는 순서 변경 후 저장',
      '판매자가 가격을 수정하는 동안 구매자가 주문한 경우',
      '직거래 위치 미확정/연락 지연',
      '상태 설명과 사진 품질이 불일치하는 신고',
    ],
    interactions: [
      '이미지 gallery swipe + lightbox',
      '가격 제안 bottom sheet',
      '주문 단계 timeline + toast',
      '필터 chip selection + category count update',
    ],
  },
  venues: {
    title: '시설 Venues',
    subtitle: '목록, 지도, 상세, 예약, 리뷰, 시설 운영',
    nav: 'matches',
    routes: ['/venues', '/venues/[id]', '/venues/[id]/schedule', '/admin/venues'],
    shell: 'MapListSplit + BookingSlotShell',
    flows: [
      '목록/지도 탐색 -> 시설 상세 -> 시간대 예약 -> 결제/확정',
      '가격/편의시설/위치/리뷰 확인 -> 예약 판단',
      '시설 운영 콘솔 -> 일정/가격/검수 상태 관리',
    ],
    states: [
      ['Empty', '선택 지역 시설 없음 -> 반경 확장 CTA'],
      ['Disabled', '예약 불가 시간대 disabled + 이유 표시'],
      ['Pending', '시설 승인/예약 승인 대기'],
      ['Error', '시간대 충돌, 휴관, 결제 실패 복구'],
      ['Success', '예약 완료 + 지도/캘린더/영수증 next actions'],
    ],
    edges: [
      '예약 중 다른 사용자가 같은 슬롯을 선점',
      '시설 운영자가 휴관/가격 변경을 적용',
      '지도 권한 거부 또는 현재 위치 미확인',
      '리뷰가 없거나 운영 검수 전인 시설',
    ],
    interactions: [
      '지도 pin -> list row focus sync',
      '날짜 strip horizontal scroll',
      'slot tap -> sticky CTA 금액 갱신',
      '예약 confirm bottom sheet',
    ],
  },
  mercenary: {
    title: '용병 Mercenary',
    subtitle: '용병 모집/지원, 보상, 호스트 신뢰, 공고 등록',
    nav: 'matches',
    routes: ['/mercenary', '/mercenary/[id]', '/mercenary/new'],
    shell: 'DetailSummaryShell',
    flows: [
      '용병 목록 -> 상세 -> 지원/채팅 -> 확정',
      '공고 등록 -> 포지션/보상/조건 입력 -> 게시',
      '호스트 신뢰 확인 -> 지원 취소/확정 상태 추적',
    ],
    states: [
      ['Deadline', '경기 시작 임박 지원 제한'],
      ['Sold out', '모집 완료/대기 지원 분리'],
      ['Pending', '호스트 승인 대기'],
      ['Permission', '본인 공고 지원 차단'],
      ['Error', '중복 지원/보상 조건 변경 충돌'],
    ],
    edges: [
      '포지션이 이미 충원된 직후 지원',
      '보상 금액 변경 후 기존 지원자 동의 필요',
      '호스트 평판 낮음 또는 신고 이력',
      '경기 취소 시 보상/환불 처리',
    ],
    interactions: [
      '지원 CTA -> 조건 확인 sheet',
      '포지션 chip active state',
      '확정 toast + 채팅방 embed',
      '지원 취소 confirm sheet',
    ],
  },
  tournaments: {
    title: '대회 Tournaments',
    subtitle: '대회 목록/상세, 대진표, 참가, 운영 도구',
    nav: 'matches',
    routes: ['/tournaments', '/tournaments/[id]', '/admin/tournaments'],
    shell: 'TournamentOpsShell',
    flows: [
      '대회 탐색 -> 상세/규정 확인 -> 팀/개인 참가 신청',
      '대진표/순위표 -> 경기 결과 반영 -> 상금/정산',
      '운영 도구 -> 참가 승인/대진 배정/공지 발송',
    ],
    states: [
      ['Deadline', '접수 마감 임박 + 제출 가능 여부'],
      ['Sold out', '정원 마감/대기팀 등록'],
      ['Pending', '참가비 결제/운영 승인 대기'],
      ['Error', '대진 충돌, 결과 수정 승인 필요'],
      ['Success', '참가 확정 + 대진/공지 next actions'],
    ],
    edges: [
      '팀원이 부족한 상태에서 참가 신청',
      '결과 이의 제기 후 순위표 pending',
      '비/시설 문제로 경기 일정 일괄 변경',
      '상금 분배 계좌 정보 누락',
    ],
    interactions: [
      '대진표 bracket horizontal scroll',
      '참가 신청 multi-step form progress',
      '공지 toast + pinned notice',
      '결과 입력 confirmation sheet',
    ],
  },
  rental: {
    title: '장비 대여',
    subtitle: '대여 목록/상세, 보증금, 픽업/반납, 파손 처리',
    nav: 'marketplace',
    routes: ['/rentals', '/rentals/[id]', '/rentals/orders/[id]'],
    shell: 'RentalStateShell',
    flows: [
      '장비 탐색 -> 상세 -> 대여 기간 선택 -> 보증금/결제',
      '픽업 -> 사용중 -> 반납 -> 검수/보증금 반환',
      '운영자 -> 재고/파손/청소 상태 관리',
    ],
    states: [
      ['Disabled', '재고 없음/정비중 대여 차단'],
      ['Pending', '픽업 대기/반납 검수 대기'],
      ['Error', '파손 신고, 보증금 차감, 반납 지연'],
      ['Success', '반납 완료 + 보증금 반환 예정'],
      ['Permission', '대여자/소유자/운영자 액션 분리'],
    ],
    edges: [
      '기간 연장 중 다음 예약과 충돌',
      '픽업 QR을 다른 사용자가 제시',
      '반납 사진이 누락되거나 파손 상태 불일치',
      '보증금 반환 계좌 오류',
    ],
    interactions: [
      '기간 selector -> 금액 즉시 갱신',
      'QR pickup confirmation',
      '사진 업로드 progress',
      '반납 완료 success sheet',
    ],
  },
  sports: {
    title: '종목 · 실력 · 안전',
    subtitle: '종목별 입력, 실력 인증, 안전 체크, capability 범위',
    nav: 'matches',
    routes: ['/sports', '/onboarding', '/profile/edit', '/matches/new'],
    shell: 'SportCapabilityShell',
    flows: [
      '종목 선택 -> 종목별 필수 속성 입력 -> 매치/레슨 추천에 반영',
      '실력 인증 -> 검수/승인 -> 공개 프로필에 표시',
      '안전 체크 -> 장비/경력/주의사항 확인 -> 신청 가능',
    ],
    states: [
      ['Pending', '인증 검수 중 badge + 수정 가능 여부'],
      ['Disabled', '필수 장비/안전 조건 미충족 CTA 차단'],
      ['Permission', '미인증 레벨 매치 신청 제한'],
      ['Error', '인증 반려 + 재제출 안내'],
      ['Success', '인증 완료 + 공개 표시 범위 선택'],
    ],
    edges: [
      '축구 선출 여부와 난이도 불일치',
      '테니스 NTRP 직접 입력과 검증값 충돌',
      '아이스하키 장비 미보유/안전 교육 미완료',
      '종목별 개인정보 공개 범위 차이',
    ],
    interactions: [
      'position chip multi select',
      'level slider/stepper',
      'safety checklist check animation',
      '검수 결과 toast + persistent badge',
    ],
  },
  community: {
    title: '커뮤니티 · 채팅 · 알림',
    subtitle: '채팅 목록/방, 매치 embed, 시스템 메시지, 알림 그룹핑',
    nav: 'my',
    routes: ['/chat', '/chat/[id]', '/notifications', '/feed'],
    shell: 'GroupedHistoryShell',
    flows: [
      '알림 그룹 -> 상세/딥링크 이동 -> 읽음 처리',
      '채팅 목록 -> 채팅방 -> 매치 카드 embed -> 상세 이동',
      '시스템 메시지 -> 상태 변경/공지 확인',
    ],
    states: [
      ['Empty', '채팅/알림 없음 -> 추천 매치 CTA'],
      ['Loading', '메시지 skeleton + 이전 메시지 로딩'],
      ['Error', '전송 실패 retry/삭제 상태'],
      ['Pending', '읽음 처리/메시지 전송 대기'],
      ['Permission', '차단/탈퇴/만료 채팅방 입력 제한'],
    ],
    edges: [
      '읽음 처리와 딥링크 이동이 동시에 발생',
      '오프라인 전송 후 재연결',
      '매치가 취소된 embedded card',
      '차단 사용자/신고된 메시지',
    ],
    interactions: [
      'message send optimistic bubble',
      'notification group collapse/expand',
      'swipe row read/delete',
      'system message tap -> detail push',
    ],
  },
  my: {
    title: '마이 · 프로필 · 평판',
    subtitle: '마이 홈, 활동, 리뷰, 뱃지, 공개 프로필, 문의',
    nav: 'my',
    routes: ['/my', '/profile', '/reviews', '/badges', '/users/[id]'],
    shell: 'IdentityProfileShell',
    flows: [
      '마이 홈 -> 내 활동/수강권/판매글/팀/문의로 분기',
      '프로필 수정 -> 공개 범위/실력/사진 저장',
      '리뷰/뱃지 -> 공개 프로필 신뢰 신호로 반영',
    ],
    states: [
      ['Empty', '활동/리뷰 없음 -> 첫 매치 CTA'],
      ['Pending', '프로필 검수/뱃지 산정 중'],
      ['Error', '사진 업로드/닉네임 중복 실패'],
      ['Permission', '비공개 프로필/차단 사용자 접근 제한'],
      ['Success', '프로필 저장 + 공개 미리보기 CTA'],
    ],
    edges: [
      '닉네임 중복 또는 금칙어',
      '평판 신호가 sample/estimated/verified 중 무엇인지 표시',
      '리뷰 작성 가능 기간 만료',
      '공개 프로필에서 민감 정보 숨김',
    ],
    interactions: [
      'profile photo picker sheet',
      'tab segmented control',
      'badge detail bottom sheet',
      '저장 toast + sticky preview CTA',
    ],
  },
  payments: {
    title: '결제 · 환불 · 분쟁',
    subtitle: 'checkout, 성공/실패, 내역, 상세, 환불, 영수증, trust',
    nav: 'my',
    routes: ['/payments', '/payments/[id]', '/payments/[id]/refund', '/my/disputes'],
    shell: 'PaymentDecisionShell',
    flows: [
      'checkout -> 결제 진행 -> 성공/실패/보류 -> 영수증',
      '결제 상세 -> 환불 요청 -> 승인/거절/부분 환불',
      '분쟁/문의 -> 증빙 제출 -> 처리 상태 추적',
    ],
    states: [
      ['Pending', '결제 승인/환불 심사 대기 + 처리 주체'],
      ['Error', '카드 실패/네트워크 실패 + 재시도/수단 변경'],
      ['Disabled', '환불 불가 기간/이미 환불됨 CTA 차단'],
      ['Success', '결제/환불 완료 + 영수증/내역 next actions'],
      ['Permission', '본인 주문이 아닌 결제 상세 접근 제한'],
    ],
    edges: [
      '테스트 결제와 실청구 불가 상태 구분',
      '부분 환불/수수료/포인트 차감',
      '결제 성공 후 서버 확정 지연',
      '분쟁 처리 partial failure',
    ],
    interactions: [
      'payment success confirmation motion',
      '환불 사유 form progress',
      '영수증 copy/download toast',
      '금액 row는 MoneyRow + tabular numbers',
    ],
  },
  settings: {
    title: '설정 · 약관 · 상태',
    subtitle: '계정, 알림, 개인정보/약관, 404/error, generic state family',
    nav: 'my',
    routes: ['/settings', '/settings/account', '/settings/notifications', '/privacy', '/terms'],
    shell: 'StatePanelFamily',
    flows: [
      '설정 홈 -> 계정/알림/약관 상세',
      '알림 토글 -> 저장/실패/권한 복구',
      'error/404 -> 이전 경로/홈/문의로 복구',
    ],
    states: [
      ['Empty', '설정 항목 없음 대신 로드 실패와 구분'],
      ['Loading', '설정 row skeleton'],
      ['Error', '저장 실패 persistent error row'],
      ['Disabled', '시스템 권한 OFF 토글 disabled + OS 설정 CTA'],
      ['Success', '저장 완료 toast + row 상태 유지'],
    ],
    edges: [
      '계정 삭제 대기 기간',
      '푸시 권한이 브라우저/OS에서 차단',
      '약관 버전 업데이트 동의 필요',
      '404에서 인증 여부에 따라 복귀 경로 분기',
    ],
    interactions: [
      'toggle tap -> optimistic on/off + rollback',
      'danger action confirm sheet',
      'legal accordion expand/collapse',
      'error page retry button',
    ],
  },
  public: {
    title: '공개 · 마케팅',
    subtitle: '랜딩, 가격, FAQ, 가이드, 공개 유저 프로필',
    nav: 'home',
    routes: ['/landing', '/pricing', '/faq', '/guide', '/users/[id]'],
    shell: 'PublicConversionShell',
    flows: [
      '랜딩 -> 가치 확인 -> 가입/둘러보기 CTA',
      '가격/FAQ/가이드 -> 의사결정 지원 -> 시작하기',
      '공개 프로필 -> 신뢰 신호 확인 -> 앱 진입',
    ],
    states: [
      ['Loading', 'public profile skeleton'],
      ['Error', '존재하지 않는 공개 프로필/비공개 상태'],
      ['Disabled', '로그인 전 제한 action 안내'],
      ['Success', 'CTA 진입 후 auth/onboarding 연결'],
      ['Permission', '비공개/차단 사용자 프로필 접근 제한'],
    ],
    edges: [
      '비로그인 사용자의 결제/신청 CTA',
      '공개 프로필의 민감 정보 마스킹',
      'FAQ 검색 결과 없음',
      '가격 정책/혜택 종료 안내',
    ],
    interactions: [
      'FAQ accordion',
      'pricing toggle monthly/yearly',
      'public CTA -> auth modal/screen',
      'profile trust badge tooltip',
    ],
  },
  desktop: {
    title: '데스크탑 웹',
    subtitle: '랜딩, 로그인 후 홈, 검색/필터/리스트 split, detail workspace',
    nav: 'home',
    routes: ['/landing', '/home', '/matches', '/lessons', '/venues', '/marketplace'],
    shell: 'DesktopWorkspaceShell',
    flows: [
      '좌측 필터 -> 우측 결과 -> detail preview/workspace',
      '검색/정렬/지도 split view -> 결과 비교',
      '데스크탑 detail -> sticky side panel CTA',
    ],
    states: [
      ['Empty', '검색 결과 없음 + 필터 초기화 CTA'],
      ['Loading', 'table/list skeleton rows'],
      ['Error', '검색 실패 + 조건 유지한 재시도'],
      ['Disabled', 'PC에서 제한된 mobile-only action 안내'],
      ['Success', '예약/신청 완료 side panel confirmation'],
    ],
    edges: [
      '필터 변경 중 결과 race/stale overwrite',
      '지도와 리스트 selection 불일치',
      'wide desktop에서 hero가 과도하게 비는 경우',
      '테이블 숫자 정렬/금액 정렬',
    ],
    interactions: [
      'left filter chip + checkbox selection',
      'result row hover/focus + keyboard navigation',
      'map/list synchronized selection',
      'side panel open/close transition',
    ],
  },
  admin: {
    title: '관리자 · 운영',
    subtitle: '대시보드, 관리 테이블, 신고/정산/분쟁, 운영 도구, audit log',
    nav: 'my',
    routes: ['/admin', '/admin/matches', '/admin/users', '/admin/reports', '/admin/payouts'],
    shell: 'AdminAnalyticsShell',
    flows: [
      'KPI dashboard -> queue/table -> 상세 조치 shell',
      '신고/분쟁/정산 -> 담당자 지정 -> 처리/보류/부분 실패',
      '운영 도구 -> bulk action -> audit log 확인',
    ],
    states: [
      ['Pending', '담당자/승인/정산 처리 대기'],
      ['Error', '부분 실패 row + 재시도/rollback'],
      ['Disabled', '권한 없는 admin action 차단'],
      ['Success', '처리 완료 + 감사 로그 append'],
      ['Permission', 'role별 메뉴/필드 접근 제한'],
    ],
    edges: [
      'bulk action 중 일부 항목 실패',
      '운영자가 동시에 같은 신고를 처리',
      '정산 계좌 오류/보류/재정산',
      '사용자 제재와 환불/분쟁 상태 충돌',
    ],
    interactions: [
      'table row -> detail drawer',
      'bulk select + sticky action bar',
      'status 변경 confirm sheet',
      'audit log expandable history',
    ],
  },
};

const CASE_TONES = {
  Empty: 'grey',
  Loading: 'grey',
  Error: 'red',
  Success: 'green',
  Disabled: 'grey',
  Pending: 'orange',
  Deadline: 'orange',
  'Sold out': 'red',
  Permission: 'blue',
};

const CASE_LABELS = {
  Empty: '빈 상태',
  Loading: '로딩',
  Error: '오류',
  Success: '성공',
  Disabled: '비활성',
  Pending: '대기',
  Deadline: '마감임박',
  'Sold out': '모집/판매 완료',
  Permission: '권한 제한',
};

const CaseMiniRow = ({ i, text }) => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--grey100)' }}>
    <div className="tab-num" style={{
      width: 24, height: 24, borderRadius: 8,
      background: i === 0 ? 'var(--blue50)' : 'var(--grey100)',
      color: i === 0 ? 'var(--blue500)' : 'var(--text-muted)',
      display: 'grid', placeItems: 'center',
      fontSize: 11, fontWeight: 700, flexShrink: 0,
    }}>{i + 1}</div>
    <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--text)', fontWeight: 500 }}>{text}</div>
  </div>
);

const CaseSectionHead = ({ title, sub }) => (
  <div style={{ margin: '18px 0 10px' }}>
    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{title}</div>
    {sub && <div style={{ fontSize: 11, color: 'var(--text-caption)', marginTop: 3, lineHeight: 1.45 }}>{sub}</div>}
  </div>
);

const StateCard = ({ name, text }) => (
  <div style={{
    padding: 12,
    borderRadius: 14,
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    minHeight: 92,
  }}>
    <Badge tone={CASE_TONES[name] || 'grey'} size="sm">{CASE_LABELS[name] || name}</Badge>
    <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.45, marginTop: 8, fontWeight: 500 }}>{text}</div>
  </div>
);

const ModuleCaseMatrix = ({ module }) => {
  const spec = MODULE_CASE_SPECS[module];
  const [tab, setTab] = React.useState('states');
  const tabItems = [
    ['states', '상태', spec.states.length],
    ['edges', '엣지', spec.edges.length],
    ['motion', '인터랙션', spec.interactions.length],
  ];
  return (
    <Phone>
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--grey50)', paddingBottom: 88 }}>
        <div style={{ padding: '14px 20px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <Badge tone="blue" size="sm">CASE MATRIX</Badge>
              <div style={{ fontSize: 23, fontWeight: 700, color: 'var(--text-strong)', marginTop: 8, lineHeight: 1.2 }}>{spec.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.45 }}>{spec.subtitle}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <NumberDisplay value={spec.states.length + spec.edges.length + spec.interactions.length} unit="건" size={28} sub="핸드오프 항목"/>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
            {spec.routes.map((route) => <Badge key={route} tone="grey" size="sm">{route}</Badge>)}
          </div>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
            <KPIStat label="주요 흐름" value={spec.flows.length}/>
            <KPIStat label="상태" value={spec.states.length}/>
            <KPIStat label="엣지/모션" value={spec.edges.length + spec.interactions.length}/>
          </div>

          <CaseSectionHead title="핵심 플로우" sub="개발자는 이 순서대로 route, 상태 저장, CTA 분기를 구현합니다."/>
          <div style={{ borderRadius: 16, background: 'var(--bg)', border: '1px solid var(--border)', padding: '2px 14px' }}>
            {spec.flows.map((flow, i) => <CaseMiniRow key={flow} i={i} text={flow}/>)}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 18, overflowX: 'auto' }}>
            {tabItems.map(([id, label, count]) => (
              <HapticChip key={id} active={tab === id} onClick={() => setTab(id)} count={count}>{label}</HapticChip>
            ))}
          </div>

          {tab === 'states' && (
            <>
              <CaseSectionHead title="상태 커버리지" sub="각 상태는 화면 안에서 원인, 복구 CTA, 다음 상태를 함께 보여야 합니다."/>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {spec.states.map(([name, text]) => <StateCard key={name + text} name={name} text={text}/>)}
              </div>
            </>
          )}

          {tab === 'edges' && (
            <>
              <CaseSectionHead title="엣지케이스" sub="happy path 외 race, 권한, 데이터 지연, business rule 충돌을 명시합니다."/>
              <div style={{ borderRadius: 16, background: 'var(--bg)', border: '1px solid var(--border)', padding: '2px 14px' }}>
                {spec.edges.map((edge, i) => <CaseMiniRow key={edge} i={i} text={edge}/>)}
              </div>
            </>
          )}

          {tab === 'motion' && (
            <>
              <CaseSectionHead title="인터랙션 계약" sub="trigger, feedback, persistent result가 분리되어야 합니다."/>
              <div style={{ borderRadius: 16, background: 'var(--bg)', border: '1px solid var(--border)', padding: '2px 14px' }}>
                {spec.interactions.map((item, i) => <CaseMiniRow key={item} i={i} text={item}/>)}
              </div>
            </>
          )}

          <div style={{ marginTop: 18, padding: 14, borderRadius: 16, background: 'var(--blue50)', border: '1px solid var(--blue100)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue700)' }}>개발 핸드오프 기준</div>
            <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--blue700)', marginTop: 6 }}>
              Shell: {spec.shell}. CTA는 primary blue, 상태/권한/오류는 toast만으로 끝내지 않고 persistent row 또는 sheet에 남깁니다.
            </div>
          </div>
        </div>
      </div>
      <BottomNav active={spec.nav}/>
    </Phone>
  );
};

const WideCaseMatrix = ({ module }) => {
  const spec = MODULE_CASE_SPECS[module];
  return (
    <div style={{
      width: 1280, height: 800, background: 'var(--bg)', fontFamily: 'var(--font)',
      color: 'var(--text-strong)', display: 'grid', gridTemplateColumns: '280px 1fr',
      overflow: 'hidden',
    }}>
      <aside style={{ borderRight: '1px solid var(--border)', padding: '28px 24px', background: 'var(--grey50)' }}>
        <Badge tone="blue">CASE MATRIX</Badge>
        <div style={{ fontSize: 30, fontWeight: 700, marginTop: 14, lineHeight: 1.16 }}>{spec.title}</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 10 }}>{spec.subtitle}</div>
        <div style={{ display: 'grid', gap: 10, marginTop: 28 }}>
          <KPIStat label="핵심 흐름" value={spec.flows.length}/>
          <KPIStat label="상태/엣지/모션" value={spec.states.length + spec.edges.length + spec.interactions.length}/>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 28 }}>
          {spec.routes.map((route) => <Badge key={route} tone="grey" size="sm">{route}</Badge>)}
        </div>
      </aside>
      <main style={{ padding: 28, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>
          <Card pad={18}>
            <CaseSectionHead title="핵심 플로우"/>
            {spec.flows.map((flow, i) => <CaseMiniRow key={flow} i={i} text={flow}/>)}
          </Card>
          <Card pad={18}>
            <CaseSectionHead title="엣지케이스"/>
            {spec.edges.map((edge, i) => <CaseMiniRow key={edge} i={i} text={edge}/>)}
          </Card>
          <Card pad={18}>
            <CaseSectionHead title="인터랙션"/>
            {spec.interactions.map((item, i) => <CaseMiniRow key={item} i={i} text={item}/>)}
          </Card>
        </div>
        <div style={{ marginTop: 18 }}>
          <CaseSectionHead title="상태 커버리지" sub="데스크탑/관리자 화면도 모바일과 같은 상태 언어를 사용합니다."/>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            {spec.states.map(([name, text]) => <StateCard key={name + text} name={name} text={text}/>)}
          </div>
        </div>
        <div style={{ marginTop: 18, padding: 18, borderRadius: 16, background: 'var(--blue50)', border: '1px solid var(--blue100)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue700)' }}>핸드오프 Shell</div>
          <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.55, color: 'var(--blue700)' }}>{spec.shell}</div>
        </div>
      </main>
    </div>
  );
};

const COMMON_STATE_EXAMPLES = [
  ['Empty', '다음 행동을 제안', '관심 종목을 추가하면 오늘 가능한 매치를 추천해요.', '관심 종목 설정'],
  ['Loading', '최종 레이아웃 shape 유지', '카드와 금액 row skeleton이 실제 배치와 동일합니다.', '대기'],
  ['Error', '원인 + 복구 CTA', '정원 정보가 바뀌었어요. 새로고침 후 다시 신청하세요.', '다시 조회'],
  ['Pending', '처리 주체 표시', '환불 심사 중입니다. 운영팀이 24시간 안에 확인합니다.', '상세 보기'],
  ['Deadline', '시간과 CTA 분리', '12분 후 마감됩니다. 결제 완료 기준으로 확정돼요.', '바로 신청'],
  ['Sold out', '대체 행동 제공', '모집이 완료됐어요. 취소표 알림을 받을 수 있습니다.', '알림 받기'],
  ['Permission', '필요 조건 표시', '주장 권한이 있어야 스코어를 확정할 수 있어요.', '권한 요청'],
  ['Disabled', '왜 막혔는지 설명', '수강권 잔여 횟수가 없어 예약할 수 없습니다.', '수강권 구매'],
  ['Success', '다음 행동 제공', '예약이 확정됐어요. 캘린더와 채팅방이 열렸습니다.', '채팅 보기'],
];

const StateCoverageAtlas = () => (
  <Phone>
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--grey50)', paddingBottom: 24 }}>
      <div style={{ padding: '14px 20px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
        <Badge tone="blue" size="sm">STATE ATLAS</Badge>
        <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>상태별 UI 패밀리</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.45 }}>모든 모듈은 아래 9개 상태를 같은 구조로 변형합니다.</div>
      </div>
      <div style={{ padding: 20, display: 'grid', gap: 10 }}>
        {COMMON_STATE_EXAMPLES.map(([name, rule, body, cta]) => (
          <div key={name} style={{ padding: 14, borderRadius: 16, background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <Badge tone={CASE_TONES[name] || 'grey'}>{CASE_LABELS[name] || name}</Badge>
              <span style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 600 }}>{rule}</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--text)', marginTop: 10 }}>{body}</div>
            <button className="tm-pressable tm-break-keep" style={{ marginTop: 12, height: 36, padding: '0 14px', borderRadius: 10, background: name === 'Error' ? 'var(--red500)' : name === 'Success' ? 'var(--green500)' : 'var(--blue500)', color: 'var(--static-white)', fontSize: 12, fontWeight: 700 }}>{cta}</button>
          </div>
        ))}
      </div>
    </div>
  </Phone>
);

const EdgeCaseGallery = () => {
  const clusters = [
    ['데이터 경합', ['정원/재고 race', 'stale filter query', '중복 submit', '서버 확정 지연']],
    ['권한/역할', ['본인 글 구매 차단', '주장 권한 변경', '관리자 role 제한', '비공개 프로필']],
    ['거래/결제', ['테스트 결제 명시', '부분 환불', '보증금 차감', '정산 보류']],
    ['복구/안전', ['오프라인 전송', '재시도', '차단/신고', '장비 안전 미충족']],
  ];
  return (
    <Phone>
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)', paddingBottom: 24 }}>
        <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="orange" size="sm">EDGE CASES</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>엣지케이스 묶음</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>모듈별 matrix에서 반복되는 위험군을 구현 단위로 묶었습니다.</div>
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 14 }}>
          {clusters.map(([title, items], idx) => (
            <div key={title} style={{ borderRadius: 16, border: '1px solid var(--border)', padding: 16, background: idx % 2 === 0 ? 'var(--grey50)' : 'var(--bg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="tab-num" style={{ width: 34, height: 34, borderRadius: 12, background: idx === 0 ? 'var(--blue500)' : 'var(--grey900)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{idx + 1}</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
                {items.map((item) => <Badge key={item} tone="grey">{item}</Badge>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Phone>
  );
};

const InteractionFlowAtlas = () => {
  const flows = [
    ['tap scale', 'press', '0.97 scale', 'state/route update'],
    ['bottom sheet', 'CTA tap', 'scrim + sheet rise', 'confirm/cancel state'],
    ['filter chip', 'chip tap', 'blue active + count', 'list/map refresh'],
    ['toast', 'action result', '2.2s floating feedback', 'persistent row remains'],
    ['sticky CTA', 'scroll detail', 'bottom fixed action', 'sheet/payment/detail'],
    ['push transition', 'card tap', 'detail slides in', 'back restores scroll'],
    ['skeleton shimmer', 'fetch start', 'content-shape shimmer', 'real content swap'],
    ['form progress', 'next/save', 'step indicator update', 'draft/success/error'],
  ];
  return (
    <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
      <Badge tone="blue">INTERACTION ATLAS</Badge>
      <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>공통 인터랙션 전이</div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>각 interaction은 trigger, feedback, final state가 분리되어야 합니다.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 24, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
        <div>패턴</div><div>Trigger</div><div>Feedback</div><div>Final</div>
      </div>
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        {flows.map(([name, trigger, feedback, final], i) => (
          <div key={name} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, alignItems: 'center', padding: 14, borderRadius: 14, border: '1px solid var(--border)', background: i % 2 ? 'var(--bg)' : 'var(--grey50)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 10, background: i === 0 ? 'var(--blue500)' : 'var(--grey100)', color: i === 0 ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center' }}><Icon name={i === 1 ? 'chevD' : i === 2 ? 'filter' : i === 3 ? 'bell' : i === 4 ? 'arrow' : i === 6 ? 'clock' : 'check'} size={15}/></div>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{name}</span>
            </div>
            {[trigger, feedback, final].map((text) => <div key={text} style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.35 }}>{text}</div>)}
          </div>
        ))}
      </div>
    </div>
  );
};

const HandoffReadinessMatrix = () => {
  const rows = Object.entries(MODULE_CASE_SPECS).map(([key, spec]) => ({
    key,
    title: spec.title,
    routes: spec.routes.length,
    flows: spec.flows.length,
    states: spec.states.length,
    edges: spec.edges.length,
    interactions: spec.interactions.length,
    shell: spec.shell,
  }));
  return (
    <div style={{ width: 1280, height: 800, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Badge tone="blue">DEV HANDOFF</Badge>
          <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>모듈별 구현 준비도</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>각 모듈은 route, flow, state, edge, interaction, shell을 함께 가져갑니다.</div>
        </div>
        <NumberDisplay value={rows.reduce((sum, row) => sum + row.states + row.edges + row.interactions, 0)} unit="항목" size={38} sub="상태/엣지/인터랙션 총합"/>
      </div>
      <div style={{ marginTop: 24, border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 68px 68px 68px 68px 88px 1fr', gap: 0, background: 'var(--grey50)', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
          {['모듈', 'Route', 'Flow', 'State', 'Edge', 'Motion', 'Shell'].map((h) => <div key={h} style={{ padding: '12px 14px' }}>{h}</div>)}
        </div>
        <div style={{ maxHeight: 602, overflow: 'auto' }}>
          {rows.map((row) => (
            <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '180px 68px 68px 68px 68px 88px 1fr', borderBottom: '1px solid var(--grey100)', fontSize: 12, alignItems: 'center' }}>
              <div style={{ padding: '11px 14px', fontWeight: 700 }}>{row.title}</div>
              {[row.routes, row.flows, row.states, row.edges, row.interactions].map((v, i) => (
                <div key={i} className="tab-num" style={{ padding: '11px 14px', fontWeight: 700, color: i === 2 ? 'var(--blue500)' : 'var(--text)' }}>{v}</div>
              ))}
              <div style={{ padding: '11px 14px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.shell}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, {
  MODULE_CASE_SPECS,
  ModuleCaseMatrix,
  WideCaseMatrix,
  StateCoverageAtlas,
  EdgeCaseGallery,
  InteractionFlowAtlas,
  HandoffReadinessMatrix,
});
