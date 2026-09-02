import { AdminKpiGridSkeleton } from '@/components/admin/admin-skeleton';

// 대회 개요 탭은 board(필터+테이블) 형태가 아니라 상태 밴드 + KPI 카드 3개 + 체크리스트다.
// AdminBoardListSkeleton(테이블 골격)을 쓰면 실제로 안 뜰 테이블이 보이는 레이아웃 튐이
// 생겨, 컴포넌트 자신의 isPending 폴백(overview-section.tsx)과 동일한 걸 그대로 쓴다
// (app-motion-system.md §3.2.1 — KPI 그리드 유무 개별 확인).
export default function Loading() {
  return <AdminKpiGridSkeleton count={3} />;
}
