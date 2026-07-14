import type { NoticeDetailViewModel, NoticeListViewModel, NoticeModel } from './notices.types';

// 실제 날짜 기준 상대 표현으로 변환한다.
// API 데이터가 없을 때 fallback 공지의 날짜가 고정 문자열("오늘", "5월 2일")로
// 영구 노출되지 않도록, 렌더 시점의 날짜를 기준으로 동적으로 계산한다.
function relativeDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  if (daysAgo === 0) return '오늘';
  if (daysAgo === 1) return '어제';
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

const notices: NoticeModel[] = [
  {
    id: 'notice-1',
    tag: '안내',
    title: '이번 주 이용 안내',
    summary: '주말 경기장 입장 시간과 체크인 안내',
    date: relativeDate(0),
    body: [
      '이번 주말 상암, 잠실, 성수 주요 경기장은 예약 경기와 행사 일정이 겹쳐 입장 대기 시간이 길어질 수 있어요.',
      '매치 시작 20분 전까지 현장 체크인을 완료해 주세요. 늦게 도착하는 경우 호스트 채팅방에 먼저 알려야 해요.',
      '체크인 시간이 조정된 경기는 매치 상세와 채팅방 공지에도 같은 안내가 표시돼요.',
    ],
  },
  {
    id: 'notice-2',
    tag: '업데이트',
    title: '매너 점수 업데이트',
    summary: '경기 후 리뷰 반영 기준 안내',
    date: relativeDate(1),
    body: [
      '경기 후 리뷰가 들어오면 매너 점수는 바로 확정되지 않고, 이상 여부를 확인한 뒤 반영돼요.',
      '검토 중인 점수는 확정 점수와 따로 표시돼요.',
    ],
  },
  {
    id: 'notice-3',
    tag: '안내',
    title: '비 예보 경기 안내',
    summary: '우천 시 취소와 환불 기준 확인',
    date: relativeDate(3),
    body: [
      '우천 예보가 있는 경기는 경기장 운영 상태와 호스트 확정 안내를 함께 확인해 주세요.',
      '우천 취소 시 환불 기준은 매치 상세 페이지의 환불 정책을 확인해 주세요.',
    ],
  },
  {
    id: 'notice-4',
    tag: '안내',
    title: '계정 보안 안내',
    summary: '개인정보와 계정 보호 기준 안내',
    date: relativeDate(5),
    body: [
      '이메일, 휴대폰 번호, 생년월일 같은 개인정보는 공개 프로필에 노출하지 않아요.',
      '계정 설정에서 알림과 보안 정보를 관리할 수 있어요.',
    ],
  },
];

export function getNoticeListViewModel(): NoticeListViewModel {
  return {
    filters: [
      { label: '전체', active: true },
      { label: '업데이트' },
      { label: '안내' },
    ],
    notices,
  };
}

export function getNoticeDetailViewModel(id: string): NoticeDetailViewModel {
  return {
    notice: notices.find((notice) => notice.id === id) ?? notices[0],
  };
}
