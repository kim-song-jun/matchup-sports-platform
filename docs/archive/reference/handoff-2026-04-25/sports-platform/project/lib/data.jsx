/* Shared data + images for all Teameet screens */

const IMG = {
  soccer:   'assets/mock/generated/team-huddle.webp',
  futsal:   'assets/mock/generated/futsal-rooftop.webp',
  basket:   'assets/mock/generated/basketball-hardwood.webp',
  badmin:   'assets/mock/generated/badminton-club.webp',
  hockey:   'assets/mock/generated/ice-hockey-arena.webp',
  tennis:   'assets/mock/sports/tennis-baseline.svg',
  swim:     'assets/mock/sports/swimming-lanes.svg',
  venue1:   'assets/mock/generated/venue-clubhouse.webp',
  venue2:   'assets/mock/generated/venue-lights.webp',
  venue3:   'assets/mock/sports/soccer-sunrise.svg',
  coach1:   'assets/mock/profile/profile-01.svg',
  coach2:   'assets/mock/profile/profile-02.svg',
  coach3:   'assets/mock/profile/profile-03.svg',
  coach4:   'assets/mock/profile/profile-04.svg',
  gear1:    'assets/mock/generated/shoes-display.webp',
  gear2:    'assets/mock/generated/racket-stack.webp',
  gear3:    'assets/mock/generated/gear-flatlay.webp',
  gear4:    'assets/mock/marketplace/gear-flatlay.svg',
  av1: 'assets/mock/profile/profile-05.svg',
  av2: 'assets/mock/profile/profile-06.svg',
  av3: 'assets/mock/profile/profile-07.svg',
  av4: 'assets/mock/profile/profile-08.svg',
  av5: 'assets/mock/profile/profile-09.svg',
  av6: 'assets/mock/profile/profile-10.svg',
  av7: 'assets/mock/profile/profile-11.svg',
  av8: 'assets/mock/profile/profile-12.svg',
  av9: 'assets/mock/profile/profile-01.svg',
};

const SPORTS = [
  { id: 'all',        label: '전체',    emoji: '전' },
  { id: 'soccer',     label: '축구',    emoji: '축', img: IMG.soccer },
  { id: 'futsal',     label: '풋살',    emoji: '풋', img: IMG.futsal },
  { id: 'basketball', label: '농구',    emoji: '농', img: IMG.basket },
  { id: 'badminton',  label: '배드민턴', emoji: '배', img: IMG.badmin },
  { id: 'ice_hockey', label: '아이스하키', emoji: '하', img: IMG.hockey },
  { id: 'tennis',     label: '테니스',  emoji: '테', img: IMG.tennis },
];

const MATCHES = [
  { id: 1,  sport: 'soccer',     title: '주말 축구 한 판, 같이 뛰어요',  venue: '상암월드컵경기장 보조구장', date: '5월 3일 (토)', time: '14:00', cur: 18, max: 22, fee: 12000, level: '중급',  img: IMG.soccer, host: '정민', lvl: 'B' },
  { id: 2,  sport: 'futsal',     title: '수요일 저녁 풋살 매치',        venue: '이태원 풋살파크 A코트', date: '5월 7일 (수)', time: '20:30', cur: 9,  max: 10, fee: 8000,  level: '초급',  img: IMG.futsal, host: '지훈', lvl: 'C', urgent: true },
  { id: 3,  sport: 'basketball', title: '3on3 하프코트 농구',          venue: '강남농구장 2번코트',    date: '5월 4일 (일)', time: '10:00', cur: 5,  max: 6,  fee: 5000,  level: '중상급', img: IMG.basket, host: '수아', lvl: 'A' },
  { id: 4,  sport: 'badminton',  title: '복식 배드민턴 정기모임',        venue: '서초체육관',           date: '5월 6일 (화)', time: '19:00', cur: 7,  max: 8,  fee: 6000,  level: '중급',  img: IMG.badmin, host: '소희', lvl: 'B', urgent: true },
  { id: 5,  sport: 'ice_hockey', title: '아이스하키 친선경기',          venue: '목동 아이스링크',      date: '5월 10일 (토)', time: '21:00', cur: 12, max: 20, fee: 18000, level: '상급',  img: IMG.hockey, host: '준호', lvl: 'S' },
  { id: 6,  sport: 'tennis',     title: '테니스 단식 상대 구해요',      venue: '올림픽공원 테니스장',   date: '5월 5일 (월)', time: '07:00', cur: 1,  max: 2,  fee: 15000, level: '중급',  img: IMG.tennis, host: '예은', lvl: 'B' },
];

const TEAM_MATCHES = [
  { id: 1, title: 'FC 발빠른놈들 vs 상대팀 구합니다', sport: '축구', venue: '상암 월드컵 A구장', date: '5월 11일 (일)', time: '09:00', format: '11:11', grade: 'A', pro: 2, cost: 280000, free: false, uniform: '빨강', host: 'FC 발빠른놈들' },
  { id: 2, title: '주말 친선 풋살 상대 찾습니다',      sport: '풋살', venue: '신도림 풋살파크',    date: '5월 12일 (월)', time: '20:00', format: '5:5',   grade: 'B', pro: 0, cost: 80000,  free: true,  uniform: '파랑', host: '다이나믹 FS' },
  { id: 3, title: '평일 저녁 6:6 풋살 교환매치',      sport: '풋살', venue: '잠실종합운동장 풋살장', date: '5월 14일 (수)', time: '19:30', format: '6:6',   grade: 'C', pro: 1, cost: 60000,  free: false, uniform: '검정', host: '퇴근후풋살' },
];

const TEAMS = [
  { id: 1, name: 'FC 발빠른놈들',    sport: '축구',   members: 24, level: 'B', manner: 4.8, logo: '⚽', color: 'var(--blue500)' },
  { id: 2, name: '다이나믹 FS',      sport: '풋살',   members: 14, level: 'B', manner: 4.6, logo: '🔥', color: 'var(--red500)' },
  { id: 3, name: '강남 바스켓',      sport: '농구',   members: 12, level: 'A', manner: 4.9, logo: '🏀', color: 'var(--orange500)' },
  { id: 4, name: '서초 셔틀콕',      sport: '배드민턴', members: 18, level: 'B', manner: 4.7, logo: '🏸', color: 'var(--green500)' },
];

const LESSONS = [
  { id: 1, title: '1:1 맞춤 축구 개인레슨', coach: '박준수 코치', img: IMG.coach1, avatar: IMG.av1, price: 60000, unit: '회', venue: '상암 풋볼파크', rating: 4.9, reviews: 128, tags: ['초급', '1:1'] },
  { id: 2, title: '주니어 축구 그룹레슨',    coach: '김지훈 코치', img: IMG.coach2, avatar: IMG.av2, price: 35000, unit: '회', venue: '반포 체육공원', rating: 4.8, reviews: 76,  tags: ['초등', '그룹'] },
  { id: 3, title: '성인 풋살 기초반',        coach: '이민정 코치', img: IMG.coach3, avatar: IMG.av3, price: 45000, unit: '회', venue: '이태원 풋살파크', rating: 4.7, reviews: 54,  tags: ['기초', '그룹'] },
  { id: 4, title: '농구 슛 집중 원데이',     coach: '최현우 코치', img: IMG.coach4, avatar: IMG.av4, price: 55000, unit: '회', venue: '강남 농구장', rating: 4.9, reviews: 42,  tags: ['원데이'] },
];

const LISTINGS = [
  { id: 1, title: '나이키 머큐리얼 슈퍼플라이 9 (275mm)', price: 180000, img: IMG.gear1, venue: '강남구', cond: '상태 최상', category: '축구화' },
  { id: 2, title: '요넥스 아크세이버 11 프로 배드민턴 라켓', price: 120000, img: IMG.gear2, venue: '서초구', cond: '거의 새것', category: '라켓' },
  { id: 3, title: '아디다스 프레데터 엣지+ 풋살화',           price: 95000,  img: IMG.gear3, venue: '마포구', cond: '사용감 있음', category: '풋살화' },
  { id: 4, title: '몰텐 농구공 GG7X (공식구)',              price: 65000,  img: IMG.gear4, venue: '송파구', cond: '새상품', category: '농구공' },
];

const VENUES = [
  { id: 1, name: '상암 월드컵경기장 보조구장', type: '축구장',   img: IMG.venue1, address: '서울 마포구 상암동 1-1',  region: '마포', district: '서울', price: 180000, unit: '시간', rating: 4.7, reviews: 234, dist: '2.1km', indoor: false, facilities: ['샤워실', '주차', '라커', '야간조명'], openNow: true, nextSlot: '오늘 18:00' },
  { id: 2, name: '이태원 풋살파크',            type: '풋살장',   img: IMG.venue2, address: '서울 용산구 이태원동 22',  region: '용산', district: '서울', price: 60000,  unit: '시간', rating: 4.5, reviews: 189, dist: '4.8km', indoor: true,  facilities: ['실내', '주차', '샤워실'],              openNow: true, nextSlot: '오늘 20:30' },
  { id: 3, name: '강남 농구장',               type: '농구장',   img: IMG.venue3, address: '서울 강남구 역삼동 723',   region: '강남', district: '서울', price: 25000,  unit: '시간', rating: 4.6, reviews: 92,  dist: '1.3km', indoor: false, facilities: ['야외', '야간조명', '3on3'],            openNow: false, nextSlot: '내일 07:00' },
  { id: 4, name: '잠실종합운동장 테니스장',     type: '테니스장', img: IMG.tennis, address: '서울 송파구 올림픽로 25',   region: '송파', district: '서울', price: 45000,  unit: '시간', rating: 4.8, reviews: 312, dist: '6.2km', indoor: false, facilities: ['하드코트', '주차', '샤워실', '라커'],   openNow: true, nextSlot: '오늘 16:00' },
  { id: 5, name: '목동 아이스링크',             type: '아이스링크', img: IMG.hockey, address: '서울 양천구 목동서로 161', region: '양천', district: '서울', price: 120000, unit: '시간', rating: 4.6, reviews: 78,  dist: '9.4km', indoor: true,  facilities: ['국제규격', '라커', '장비대여'],         openNow: false, nextSlot: '내일 21:00' },
  { id: 6, name: '서초체육관 배드민턴장',       type: '배드민턴장', img: IMG.badmin, address: '서울 서초구 반포대로 58',  region: '서초', district: '서울', price: 18000,  unit: '시간', rating: 4.4, reviews: 156, dist: '3.5km', indoor: true,  facilities: ['실내', '주차', '샤워실'],               openNow: true, nextSlot: '오늘 19:00' },
];

const REGIONS = [
  { id: 'all',  label: '전체',    count: 48 },
  { id: 'gn',   label: '강남',    count: 12 },
  { id: 'sc',   label: '서초',    count: 8 },
  { id: 'mp',   label: '마포',    count: 6 },
  { id: 'sp',   label: '송파',    count: 7 },
  { id: 'yt',   label: '양천',    count: 3 },
  { id: 'yd',   label: '영등포', count: 5 },
  { id: 'ys',   label: '용산',    count: 4 },
  { id: 'gr',   label: '구로',    count: 3 },
];

const CHATS = [
  { id: 1, name: 'FC 발빠른놈들',      last: '내일 몇 시에 모여요?',          time: '2분 전',  unread: 3, group: true, avatar: IMG.av1, members: 14 },
  { id: 2, name: '박준수 코치',         last: '레슨 장소 공유드렸어요',         time: '15분 전', unread: 0, group: false, avatar: IMG.av1 },
  { id: 3, name: '주말 축구 매치',      last: '수아님이 참가하셨어요',          time: '1시간 전', unread: 1, group: true, avatar: IMG.av3, members: 18 },
  { id: 4, name: '지훈',                last: '라켓 거래 가능하실까요?',        last2: true, time: '어제',  unread: 0, group: false, avatar: IMG.av2 },
  { id: 5, name: '다이나믹 FS',         last: '이번주 연습 공지',              time: '2일 전', unread: 0, group: true, avatar: IMG.av4, members: 12 },
];

const NOTIFS = [
  { id: 1, type: 'match',   title: '매치 참가 확정', body: '주말 축구 한 판 매치 참가가 확정되었어요.', time: '방금 전', unread: true },
  { id: 2, type: 'team',    title: '팀 초대',       body: 'FC 발빠른놈들에서 초대장이 도착했어요.', time: '10분 전', unread: true },
  { id: 3, type: 'pay',     title: '결제 완료',      body: '8,000원이 결제되었어요.', time: '1시간 전', unread: false },
  { id: 4, type: 'chat',    title: '새 메시지',      time: '3시간 전', body: '박준수 코치님이 메시지를 보냈어요.', unread: false },
  { id: 5, type: 'review',  title: '리뷰 받기',      body: '지난 매치 후기를 남겨주세요.', time: '어제', unread: false },
];

Object.assign(window, { IMG, SPORTS, MATCHES, TEAM_MATCHES, TEAMS, LESSONS, LISTINGS, VENUES, REGIONS, CHATS, NOTIFS });
