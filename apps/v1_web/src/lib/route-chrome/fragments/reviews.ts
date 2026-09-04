// apps/v1_web/src/lib/route-chrome/fragments/reviews.ts
// U35 — reviews 3개 라우트.
//
// components/reviews/reviews-page.tsx 하나가 /my/reviews* 3개 라우트에 걸쳐 4개 뷰를
// 그린다(리뷰 목록/리뷰 남기기/받은 리뷰/제출 완료). §0.4-4가 "my+tournaments 교차"로
// 적어 뒀지만 직접 열어 확인한 결과 실제 소비처는 app/my/reviews/*, app/my/reviews/received/*,
// app/my/reviews/[sourceType]/[sourceId]/* 셋뿐이다 —
// app/tournaments/[id]/reviews/reviews-page-client.tsx 는 이름이 비슷한 완전히 다른 파일이고
// 이 컴포넌트를 import하지 않는다(grep 실측: `ReviewsPageClient` 매치는
// `TournamentReviewsPageClient` 서브스트링 오탐이었다). 그래서 activeTab 전부 'my'다.
import type { RouteChromeEntry } from '../types';

export const REVIEWS_ROUTES: RouteChromeEntry[] = [
  {
    // 목록(pending/written/received 탭 전환은 클라이언트 state, URL은 고정) —
    // reviews-page.tsx:54.
    pattern: '/my/reviews',
    chrome: {
      title: '리뷰',
      activeTab: 'my',
      // 자식 두 라우트와 같이 하단 내비를 숨긴다 — /my 에서 들어온 상세 흐름이라 탭이 남으면
      // 뒤로가기 스택과 어긋난다(2026-09-04 감사: 이 항목만 빠져 있었다).
      bottomNav: false,
      backHref: '/my',
      desktopHead: true,
    },
  },
  {
    // 받은 리뷰 — 라우트는 `/my/reviews?tab=received` 로 redirect 만 한다(중복 화면 정리,
    // 2026-09-04). 리다이렉트 프레임에서도 셸이 깜빡이지 않도록 항목은 남긴다.
    pattern: '/my/reviews/received',
    chrome: {
      title: '받은 리뷰',
      activeTab: 'my',
      bottomNav: false,
      backHref: '/my/reviews?tab=received',
      desktopHead: true,
    },
  },
  {
    // 리뷰 남기기 — reviews-page.tsx:171. 같은 라우트에서 제출 완료 시
    // ReviewSubmitCompleteView(reviews-page.tsx:293, title="")로 전환되는데 그건 `complete`
    // 쿼리 파라미터 + 데이터 로드 여부(런타임)로만 갈리는 분기라 §1.9 R7 원칙대로 override
    // 대상이다 — 여기 테이블엔 로딩/폼 단계의 기본 제목만 넣고, ReviewSubmitCompleteView가
    // useShellOverride({ title: '' })로 직접 덮어쓴다.
    pattern: '/my/reviews/:sourceType/:sourceId',
    chrome: {
      title: '리뷰 남기기',
      activeTab: 'my',
      bottomNav: false,
      backHref: '/my/reviews',
      desktopHead: true,
    },
  },
];
