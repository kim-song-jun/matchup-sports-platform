import type {
  MyHomeViewModel,
  SettingsViewModel,
} from './my.types';

export const myUser = {
  name: '김정민',
  handle: '@jungmin',
  region: '서울 강남구',
  sports: ['축구', '풋살', '러닝'],
  intro: '퇴근 후에도 꾸준히 움직이는 팀 스포츠 유저',
  initials: '김',
  stats: [
    { label: '활동', value: 0, unit: '회' },
    { label: '소속 팀', value: 0, unit: '팀' },
    { label: '매너 점수', value: '-' },
  ],
  // '매너 점수'는 상단 활동 요약(stats)에만 표시. monthly는 이번 달 경기 수·승률만 보여 이중 표기를 해소함.
  monthly: [
    { label: '이번 달 경기', value: 0, unit: '경기' },
    { label: '승률', value: '-' },
  ],
};

export const myHomeModel: MyHomeViewModel = {
  user: myUser,
  sections: [
    {
      title: '내 활동',
      items: [
        // icon 값: Lucide 컴포넌트 이름 — my-page.tsx MenuSection이 매핑해 렌더함
        { label: '참여한 매치', sub: '승인 대기와 완료 내역을 확인해요', href: '/my/matches/joined', icon: 'ClipboardList' },
        { label: '내가 만든 매치', sub: '모집 현황과 참가자를 관리해요', href: '/my/matches/created', icon: 'Plus' },
      ],
    },
    {
      title: '커뮤니티',
      items: [
        { label: '내 팀', sub: '소속 팀과 운영 권한을 확인해요', href: '/my/teams', icon: 'Users' },
        // 리뷰 항목은 my-api-clients.tsx의 toMyHomeModel에서 동적으로 추가됨
      ],
    },
    {
      title: '설정',
      items: [
        { label: '운동 정보', sub: '종목, 난이도, 기본 활동 지역을 관리해요', href: '/my/settings/sports', icon: 'Dumbbell' },
        { label: '계정 설정', sub: '프로필 공개 범위와 보안을 관리해요', href: '/my/settings', icon: 'Settings' },
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
