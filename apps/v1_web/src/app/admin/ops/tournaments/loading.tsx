import { AdminBoardListSkeleton } from '@/components/admin/admin-skeleton';

// admin board 세그먼트 라우트 전환 스켈레톤. 필터바+테이블만 있고 KPI 그리드가 없는
// 페이지 전용(app-motion-system.md §3.2.1) — U23 대량생성.
export default function Loading() {
  return <AdminBoardListSkeleton />;
}
