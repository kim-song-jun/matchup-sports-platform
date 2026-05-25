import type {
  MyHomeViewModel,
  MyMatch,
  MyMatchesViewModel,
  MyTeam,
  MyTeamDetailViewModel,
  MyTeamMembersViewModel,
  MyTeamsViewModel,
  NotificationSettingsViewModel,
  ProfileEditViewModel,
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
    { label: '참여 매치', value: 0, unit: '회' },
    { label: '소속 팀', value: 0, unit: '팀' },
    { label: '매너 점수', value: '-' },
  ],
  monthly: [
    { label: '이번 달 경기', value: 0, unit: '경기' },
    { label: '매너 점수', value: '-' },
    { label: '승률', value: '-' },
  ],
};

export const myHomeModel: MyHomeViewModel = {
  user: myUser,
  sections: [
    {
      title: '내 활동',
      items: [
        { label: '참여한 매치', sub: '승인 대기와 완료 내역을 확인해요', href: '/my/matches/joined', icon: 'M' },
        { label: '내가 만든 매치', sub: '모집 현황과 참가자를 관리해요', href: '/my/matches/created', icon: 'C' },
      ],
    },
    {
      title: '커뮤니티',
      items: [
        { label: '내 팀', sub: '소속 팀과 운영 권한을 확인해요', href: '/my/teams', icon: 'T' },
      ],
    },
    {
      title: '설정',
      items: [
        { label: '알림 설정', sub: '푸시와 매치 알림을 조정해요', href: '/my/settings/notifications', icon: 'N' },
        { label: '계정 설정', sub: '프로필 공개 범위와 보안을 관리해요', href: '/my/settings', icon: 'S' },
      ],
    },
  ],
};

const joinedMatches: MyMatch[] = [
  { id: 'match-1', title: '상암 주말 축구', meta: '5월 23일 토 · 18:00 · 상암 풋살파크', status: 'approved', statusLabel: '승인 완료', note: '경기 2시간 전까지 채팅방에서 출석을 확인해요.', href: '/matches/match-1' },
  { id: 'match-2', title: '강남 수영 레인', meta: '5월 25일 월 · 20:00 · 강남 스포츠센터', status: 'pending', statusLabel: '승인 대기', note: '호스트가 실력 레벨과 매너 기록을 검토 중이에요.', href: '/matches/match-2' },
  { id: 'match-3', title: '마포 풋살', meta: '5월 12일 화 · 19:30 · 마포체육관', status: 'ended', statusLabel: '종료', note: '상대 평가와 리뷰를 남길 수 있어요.', href: '/matches/match-3' },
];

const createdMatches: MyMatch[] = [
  { id: 'match-4', title: '잠실 러닝 크루 매치', meta: '5월 28일 목 · 07:00 · 잠실한강공원', status: 'recruiting', statusLabel: '모집중', note: '6명 중 4명이 참가 확정했어요.', href: '/matches/match-4' },
  { id: 'match-5', title: '목동 풋살 친선전', meta: '6월 1일 월 · 21:00 · 목동풋살장', status: 'approved', statusLabel: '확정', note: '상대 팀과 장소 예약이 확정됐어요.', href: '/matches/match-5' },
];

export function getMyMatchesModel(mode: 'joined' | 'created'): MyMatchesViewModel {
  const matches = mode === 'joined' ? joinedMatches : createdMatches;
  return {
    mode,
    title: mode === 'joined' ? '참여한 매치' : '내가 만든 매치',
    summary: [
      { label: '전체', value: matches.length, unit: '건' },
      { label: mode === 'joined' ? '승인 대기' : '모집중', value: matches.filter((item) => item.status === 'pending' || item.status === 'recruiting').length, unit: '건' },
      { label: '확정', value: matches.filter((item) => item.status === 'approved').length, unit: '건' },
    ],
    matches,
  };
}

export const myTeams: MyTeam[] = [
  { id: 'team-1', name: 'FC 발빠른놈들', logo: 'F', sport: '축구', region: '서울 마포', role: 'owner', roleLabel: '팀장', members: 18, manner: '4.9', next: '토요일 18:00 정기전', description: '주말 저녁마다 꾸준히 뛰는 축구 팀이에요. 빠른 전환과 즐거운 경기 분위기를 중요하게 봅니다.' },
  { id: 'team-2', name: '강남 러너스', logo: 'R', sport: '러닝', region: '서울 강남', role: 'admin', roleLabel: '운영진', members: 42, manner: '4.8', next: '목요일 07:00 한강 러닝', description: '평일 아침 5km와 주말 LSD를 함께하는 러닝 크루입니다.' },
  { id: 'team-3', name: '마포 스윔', logo: 'S', sport: '수영', region: '서울 마포', role: 'member', roleLabel: '멤버', members: 24, manner: '4.7', next: '수요일 20:00 정기 모임', description: '초보-중수 레인 위주로 매너 있는 운동을 만드는 수영 팀입니다.' },
];

export const myTeamsModel: MyTeamsViewModel = {
  teams: myTeams,
  summary: [
    { label: '소속 팀', value: myTeams.length, unit: '팀' },
    { label: '운영 권한', value: 2, unit: '팀' },
    { label: '평균 매너', value: '4.8' },
  ],
};

export function getMyTeamDetailModel(teamId = 'team-1'): MyTeamDetailViewModel {
  const team = myTeams.find((item) => item.id === teamId) ?? myTeams[0];
  return {
    team,
    actions: [
      { label: '멤버 관리', sub: '초대와 가입 요청을 검토해요', href: `/my/teams/${team.id}/members`, icon: 'M' },
      { label: '팀 매치 내역', sub: '최근 경기와 결과를 확인해요', href: '/team-matches', icon: 'G' },
      { label: '팀 설정', sub: '소개, 조건, 공개 범위를 수정해요', href: `/teams/${team.id}/edit`, icon: 'S' },
    ],
    recentMatches: createdMatches,
  };
}

export const myTeamMembersModel: MyTeamMembersViewModel = {
  teamName: 'FC 발빠른놈들',
  summary: [
    { label: '전체', value: 18, unit: '명' },
    { label: '운영진', value: 3, unit: '명' },
    { label: '요청', value: 2, unit: '명' },
  ],
  members: [
    { name: '김정민', role: '팀장', meta: '공격수 · 매너 4.9', status: '나' },
    { name: '박서준', role: '운영진', meta: '미드필더 · 매너 4.8', status: '활동중' },
    { name: '이하늘', role: '멤버', meta: '수비수 · 매너 4.7', status: '활동중' },
  ],
  requests: [
    { name: '최민호', role: '가입 요청', meta: '축구 32회 · 매너 4.6', status: '검토' },
    { name: '정유진', role: '가입 요청', meta: '풋살 18회 · 매너 4.9', status: '검토' },
  ],
};

export const profileEditModel: ProfileEditViewModel = {
  user: myUser,
  fields: [
    { label: '닉네임', value: myUser.name },
    { label: '활동 지역', value: myUser.region },
    { label: '주 종목', value: myUser.sports.join(', ') },
    { label: '소개', value: myUser.intro, multiline: true },
  ],
};

export const settingsModel: SettingsViewModel = {
  title: '설정',
  groups: [
    {
      title: '계정',
      items: [
        { label: '프로필 수정', sub: '이름, 지역, 종목을 바꿔요', href: '/my/profile/edit', icon: 'P' },
        { label: '알림 설정', sub: '매치와 채팅 알림을 관리해요', href: '/my/settings/notifications', icon: 'N' },
      ],
    },
    {
      title: '서비스',
      items: [
        { label: '약관 및 정책', sub: '이용약관과 개인정보 처리방침', href: '/my/settings/legal', icon: 'L' },
        { label: '회원 탈퇴', sub: '계정 삭제 전 유의사항 확인', href: '/my/settings/withdrawal', icon: 'W' },
      ],
    },
  ],
};

export const notificationSettingsModel: NotificationSettingsViewModel = {
  settings: [
    { label: '매치 승인 알림', sub: '참가 승인, 거절, 대기 상태가 바뀔 때', enabled: true },
    { label: '팀 가입 요청', sub: '내가 운영하는 팀에 요청이 들어올 때', enabled: true },
    { label: '채팅 메시지', sub: '참여 중인 매치와 팀 채팅 새 메시지', enabled: false },
    { label: '마케팅 소식', sub: '새 기능과 이벤트 안내', enabled: false },
  ],
};
