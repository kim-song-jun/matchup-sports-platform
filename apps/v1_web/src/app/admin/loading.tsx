import { AdminPageSkeleton } from '@/components/admin/admin-skeleton';

// 어드민 대시보드(admin/page.tsx)는 board 세그먼트에서 유일하게 KPI 그리드를 포함하는
// 페이지라 AdminBoardListSkeleton이 아니라 KPI 포함 AdminPageSkeleton을 쓴다
// (app-motion-system.md §3.2.1).
export default function Loading() {
  return <AdminPageSkeleton />;
}
