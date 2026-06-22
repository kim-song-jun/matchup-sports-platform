// ── Shell ─────────────────────────────────────────────────────────────────
export { AdminShell } from './admin-shell';

// ── Page primitives ───────────────────────────────────────────────────────
export { AdminPageHeader } from './admin-page-header';
export { AdminKpiCard } from './admin-kpi-card';

// ── Data display ──────────────────────────────────────────────────────────
export { AdminDataTable } from './admin-data-table';
export type { AdminTableColumn } from './admin-data-table';
export { AdminCardList } from './admin-card-list';
export type { AdminCardModel, AdminCardMeta } from './admin-card-list';
export { AdminStatusPill, STATUS_META } from './admin-status-pill';
export type { StatusMeta } from './admin-status-pill';

// ── Filter / search ───────────────────────────────────────────────────────
export { AdminFilterBar } from './admin-filter-bar';
export type { StatusOption } from './admin-filter-bar';

// ── Modals ────────────────────────────────────────────────────────────────
export { AdminReasonModal } from './admin-reason-modal';
export type { ReasonStatusOption } from './admin-reason-modal';

// ── Empty / error / loading ───────────────────────────────────────────────
export { AdminEmpty } from './admin-empty';
export {
  AdminKpiGridSkeleton,
  AdminListSkeleton,
  AdminTableSkeleton,
  AdminPageSkeleton,
} from './admin-skeleton';

// ── Toast ─────────────────────────────────────────────────────────────────────
export { useAdminToast, AdminToasts } from './admin-toast';
export type { AdminToastItem, AdminToastVariant } from './admin-toast';

