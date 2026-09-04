import { redirect } from 'next/navigation';

/**
 * 받은 리뷰는 `/my/reviews` 의 '받은 리뷰' 탭이 같은 내용을 그린다 — 이 라우트는 앱 안에서
 * 연결되는 곳이 없는 중복 화면이었다(2026-09-04 감사). 옛 링크·북마크를 위해 경로만 남기고
 * 탭으로 보낸다.
 */
export default function ReviewsReceivedRoute() {
  redirect('/my/reviews?tab=received');
}
