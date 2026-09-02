import { AdminBoardListSkeleton, AdminKpiGridSkeleton } from '@/components/admin/admin-skeleton';

// 모니터링 페이지는 신호 카드 4개(에러/웹푸시/SMS/감사) 행 + 탭 + 목록이다. 순수
// AdminBoardListSkeleton만 쓰면 실제로 뜨는 4개 카드 자리가 스켈레톤에 없어 레이아웃이
// 튄다 — KPI 그리드를 앞에 붙인다(app-motion-system.md §3.2.1).
export default function Loading() {
  return (
    <>
      <AdminKpiGridSkeleton count={4} />
      <AdminBoardListSkeleton />
    </>
  );
}
