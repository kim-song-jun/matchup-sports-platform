import type { HomeMatchCard, HomeViewModel } from './home.types';

const matches: HomeMatchCard[] = [
  {
    id: 'match-1',
    sport: 'soccer',
    sportLabel: '축구',
    title: '주말 축구 한 판, 같이 뛰어요',
    venue: '상암월드컵경기장 보조구장',
    date: '5월 3일 (토)',
    time: '14:00',
    currentParticipants: 18,
    maxParticipants: 22,
    actionLabel: '승인제 신청',
    imageUrl: '/mock/generated/team-huddle.webp',
  },
  {
    id: 'match-2',
    sport: 'futsal',
    sportLabel: '풋살',
    title: '수요일 저녁 풋살 매치',
    venue: '이태원 풋살파크 A코트',
    date: '5월 7일 (수)',
    time: '20:30',
    currentParticipants: 9,
    maxParticipants: 10,
    actionLabel: '승인제 신청',
    imageUrl: '/mock/generated/futsal-rooftop.webp',
  },
  {
    id: 'match-3',
    sport: 'running',
    sportLabel: '러닝',
    title: '잠실 아침 러닝 크루',
    venue: '잠실한강공원',
    date: '5월 4일 (일)',
    time: '07:00',
    currentParticipants: 11,
    maxParticipants: 15,
    actionLabel: '승인제 신청',
    imageUrl: '/mock/generated/team-huddle.webp',
  },
  {
    id: 'match-4',
    sport: 'swimming',
    sportLabel: '수영',
    title: '저녁 자유수영 레인 모임',
    venue: '마포 스포츠센터 수영장',
    date: '5월 6일 (화)',
    time: '19:00',
    currentParticipants: 14,
    maxParticipants: 20,
    actionLabel: '승인제 신청',
    imageUrl: '/mock/generated/team-huddle.webp',
  },
];

export function getHomeViewModel(): HomeViewModel {
  const sortedMatches = [...matches].sort(
    (a, b) => b.currentParticipants / b.maxParticipants - a.currentParticipants / a.maxParticipants,
  );

  return {
    viewerName: '정민',
    signedOut: false,
    network: false,
    hasNewNotification: true,
    chatUnreadCount: 4,
    chatHref: '/chat',
    stats: {
      monthlyActivity: 12,
      monthlyActivitySub: '지난달보다 +3',
      mannerScore: '-',
      mannerScoreSub: '-',
      joined: 8,
      trustState: '-',
      pending: '대기 없음',
    },
    featuredMatch: sortedMatches[0],
    recommendedMatches: matches,
    quickActions: [
      { key: 'matches', label: '매치', sub: '개인 경기', href: '/matches', color: 'var(--blue500)', background: 'var(--blue50)' },
      { key: 'team_matches', label: '팀매치', sub: '팀 대항전', href: '/team-matches', color: 'var(--orange500)', background: 'var(--orange50)' },
      { key: 'teams', label: '팀', sub: '팀 둘러보기', href: '/teams', color: 'var(--green500)', background: 'var(--green50)' },
      { key: 'my_team', label: '나의 팀', sub: '내 소속 팀', href: '/my/teams', color: 'var(--grey500)', background: 'var(--grey100)' },
    ],
    weather: {
      city: '마포',
      temp: 18,
      cond: '맑음',
      wind: 2,
    },
    notices: [
      { id: 'notice-1', title: '이번 주 고정 공지', summary: '주말 경기장 혼잡 시간과 체크인 안내', trailing: '오늘' },
      { id: 'notice-2', title: '매너 점수 업데이트', summary: '경기 후 리뷰 반영 기준 안내', trailing: '어제' },
      { id: 'notice-3', title: '비 예보 경기 안내', summary: '우천 시 취소/환불 기준 확인', trailing: '5월 2일' },
    ],
  };
}
