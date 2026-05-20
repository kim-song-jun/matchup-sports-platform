import type { NoticeDetailViewModel, NoticeListViewModel, NoticeModel } from './notices.types';

const notices: NoticeModel[] = [
  {
    id: 'notice-1',
    tag: '고정',
    title: '이번 주 고정 공지',
    summary: '주말 경기장 혼잡 시간과 체크인 안내',
    date: '오늘',
    pinned: true,
    body: [
      '이번 주말 상암, 잠실, 성수 주요 경기장은 예약 경기와 행사 일정이 겹쳐 입장 대기 시간이 길어질 수 있습니다.',
      '매치 시작 20분 전까지 현장 체크인을 완료해 주세요. 늦게 도착하는 경우 호스트 채팅방에 먼저 알려야 합니다.',
      '체크인 시간이 조정된 경기는 매치 상세와 채팅방 공지에도 같은 안내가 표시됩니다.',
    ],
  },
  {
    id: 'notice-2',
    tag: '업데이트',
    title: '매너 점수 업데이트',
    summary: '경기 후 리뷰 반영 기준 안내',
    date: '어제',
    body: [
      '경기 후 리뷰가 제출되면 매너 점수는 즉시 확정되지 않고 이상 패턴 확인 후 반영됩니다.',
      '샘플 데이터와 추정 신호는 실제 신뢰 점수처럼 표시하지 않도록 구분합니다.',
    ],
  },
  {
    id: 'notice-3',
    tag: '안내',
    title: '비 예보 경기 안내',
    summary: '우천 시 취소/환불 기준 확인',
    date: '5월 2일',
    body: [
      '우천 예보가 있는 경기는 경기장 운영 상태와 호스트 확정 안내를 함께 확인해 주세요.',
      '테스트 결제 흐름에서는 실제 청구나 환불이 발생하지 않습니다.',
    ],
  },
];

export function getNoticeListViewModel(): NoticeListViewModel {
  return {
    filters: [
      { label: '전체', active: true },
      { label: '고정' },
      { label: '업데이트' },
      { label: '안내' },
    ],
    notices,
  };
}

export function getNoticeDetailViewModel(id: string): NoticeDetailViewModel {
  return {
    notice: notices.find((notice) => notice.id === id) ?? notices[0],
    relatedHref: '/matches',
  };
}
