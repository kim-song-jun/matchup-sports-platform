import type {
  MyHomeViewModel,
  SettingsViewModel,
} from './my.types';

export const myUser = {
  userId: null,
  name: '—',
  handle: '—',
  region: '지역 미정',
  sports: [],
  intro: '',
  initials: '—',
  profileImageUrl: null,
  genderLabel: '성별 미등록',
  stats: [
    // '활동' 이던 라벨을 '전체 활동' 으로 -- 카드 제목("활동") 과 같은 단어라
    // "활동 / 활동 / 4회" 로 겹쳐 읽혔다. 카드가 세는 출전(대회·팀경기)과 달리
    // 개인 매치까지 포함한 누적이라는 뜻도 이 라벨이 같이 진다.
    { label: '전체 활동', value: '—' },
    { label: '소속 팀', value: '—' },
    { label: '매너 점수', value: '-' },
  ],
  // '매너 점수'는 상단 활동 요약(stats)에만 표시. monthly는 이번 달 경기 수·승률만 보여 이중 표기를 해소함.
  // 두 줄 사이에 선을 긋지 않으므로 라벨이 스스로 범위를 말해야 한다 -- 그래서 '승률'이 아니라 '이번 달 승률'.
  monthly: [
    { label: '이번 달 경기', value: '—' },
    { label: '이번 달 승률', value: '-' },
  ],
};

export const myHomeModel: MyHomeViewModel = {
  user: myUser,
  sections: [
    // 섹션은 "무엇에 관한 것인가"가 아니라 **지금 나한테 온 것 / 내가 보러 가는 것**으로
    // 가른다(사용자 선택 2안, 2026-09-20). 배지가 붙는 항목이 한 곳에 모여야 처리할 일이
    // 있는지 한 번에 보이고, 그 섹션을 카드 바로 아래로 올리면 첫 화면이 곧 할 일 목록이 된다.
    // 이전 '커뮤니티' 7행은 실제로 소통인 것이 채팅 하나뿐이라 이름이 내용을 설명하지 못했다.
    {
      title: '받은 소식',
      // 모바일에서 카드 바로 아래로 올라가는 섹션(globals.css 의 order).
      // 실측(2026-09-20): 그 전에는 첫 메뉴 행까지 1231px 를 내려야 했다.
      primary: true,
      items: [
        // icon 값: Lucide 컴포넌트 이름 — my-page.tsx MenuSection이 매핑해 렌더함
        // 채팅(=매치·팀·팀컨택 대화)으로 가는 상시 입구. 하단탭엔 채팅이 없어 홈 위젯과 여기서만 닿는다.
        // badge 는 my-api-clients 가 대기 중 받은 컨택 수로 채운다.
        { label: '채팅', sub: '매치·팀·컨택 대화를 한곳에서 확인해요', href: '/chat', icon: 'MessageCircle' },
        { label: '받은 초대', sub: '팀에서 보낸 초대를 확인하고 수락해요', href: '/my/invitations', icon: 'Mail' },
        // 리뷰 항목은 my-api-clients.tsx의 toMyHomeModel에서 동적으로 여기에 끼워 넣는다.
        // 보낸 가입 신청은 내가 보낸 것이지만 **결과를 기다린다**는 점에서 같은 줄에 선다.
        { label: '보낸 가입 신청', sub: '승인 대기와 처리 결과를 확인해요', href: '/my/join-applications', icon: 'Send' },
      ],
    },
    {
      title: '내 활동',
      items: [
        { label: '참여한 매치', sub: '승인 대기와 완료 내역을 확인해요', href: '/my/matches/joined', icon: 'ClipboardList' },
        { label: '내가 만든 매치', sub: '모집 현황과 참가자를 관리해요', href: '/my/matches/created', icon: 'Plus' },
        // '내 활동 기록'은 내 userId 가 필요해 my-api-clients 가 동적으로 붙인다.
      ],
    },
    {
      title: '내 팀',
      items: [
        { label: '내 팀', sub: '소속 팀과 운영 권한을 확인해요', href: '/my/teams', icon: 'Users' },
        // R4: 리그 참가는 운영자가 지정하므로(D-2) 팀이 참가 사실을 알 계기가 이 노출뿐이다.
        { label: '내 리그', sub: '내 팀이 참가 중인 리그를 확인해요', href: '/my/leagues', icon: 'ListOrdered' },
        // 2026-09-04 감사: /my/schedule 은 앱 안에서 들어갈 링크가 한 곳도 없어 URL 직접 입력으로만
        // 닿는 고아 라우트였다. 소속 팀 일정을 한 번에 보는 화면이라 팀 항목 옆에 둔다.
        { label: '내 일정', sub: '소속 팀 일정을 한 번에 확인해요', href: '/my/schedule', icon: 'CalendarDays' },
      ],
    },
    {
      // 문의는 1행짜리 섹션이었다 -- 라벨 하나에 26px 를 쓰면서 가르는 것이 한 줄뿐이라
      // 설정과 한 서랍에 넣는다. 둘 다 "쓰다가 막혔을 때 여는 것"이다.
      title: '설정·문의',
      items: [
        { label: '프로필 수정', sub: '사진·이름·지역·성별을 바꿔요', href: '/my/profile/edit', icon: 'Pencil' },
        { label: '운동 정보', sub: '종목, 난이도, 기본 활동 지역을 관리해요', href: '/my/settings/sports', icon: 'Dumbbell' },
        { label: '계정 설정', sub: '계정 보안과 알림을 관리해요', href: '/my/settings', icon: 'Settings' },
        { label: '문의하기', sub: '계정, 매치, 대회, 결제 문제를 운영팀에 남겨요', href: '/my/inquiries', icon: 'Mail' },
      ],
    },
  ],
};

export const settingsModel: SettingsViewModel = {
  title: '설정',
  groups: [
    {
      title: '계정',
      items: [
        { label: '위치 및 활동 지역', sub: '현재 위치로 활동 지역을 업데이트해요', href: '/my/settings/location', icon: 'MapPin' },
        { label: '알림 설정', sub: '매치와 채팅 알림을 관리해요', href: '/my/settings/notifications', icon: 'Bell' },
        { label: '화면 테마', sub: '라이트, 다크, 기기 설정 중에서 골라요', href: '/my/settings/theme', icon: 'Moon' },
        // F2: 팀 라인업에 연결된 내 경기 기록을 공개 프로필(/users/:id/records)에 노출할지
        // 사용자 단위로 한 번에 켜고 끈다. 새 API 계약: GET/PUT /me/record-consent.
        { label: '경기 기록 공개', sub: '내 활동 기록을 공개 프로필에 표시할지 정해요', href: '/my/settings/record-consent', icon: 'ShieldCheck' },
        // 2026-08-18: 대회 경기 기록(라인업/득점자/MVP)의 이름 표시를 닉네임 기본에서
        // 실명으로 바꾸는 스위치. 위 record-consent와는 별개 축 -- 그건 "기록이 보이는가",
        // 이건 "보이면 어떤 이름인가". API 계약: GET/PATCH /me/tournament-real-name-visibility.
        { label: '대회 기록 실명 표시', sub: '대회 라인업·득점자 이름을 실명으로 보여줄지 정해요', href: '/my/settings/tournament-real-name', icon: 'UserCheck' },
        // 선수 카드 숨김(Task 155). 컬럼은 카드와 함께 넣었는데 켜는 경로가 없어
        // 사용자가 잠글 수 없었다 -- 게임화 거부감에 대한 탈출구가 목적이므로 여기서 연다.
        { label: '선수 카드', sub: '경기 기록으로 만든 카드를 숨길 수 있어요', href: '/my/settings/player-card', icon: 'Award' },
      ],
    },
    {
      title: '서비스',
      items: [
        { label: '약관 및 정책', sub: '이용약관과 개인정보 처리방침', href: '/my/settings/legal', icon: 'FileText' },
        { label: '회원 탈퇴', sub: '탈퇴 전 꼭 확인해 주세요', href: '/my/settings/withdrawal', icon: 'LogOut' },
      ],
    },
  ],
};
