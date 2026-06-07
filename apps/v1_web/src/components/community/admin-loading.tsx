import { Card } from '@/components/v1-ui/primitives';
import type { AdminFunctionPageModel, AdminFunctionStatModel } from './admin.types';

type AdminLoadingStatusProps = {
  readonly title: string;
  readonly body: string;
};

export function AdminLoadingStatus({ title, body }: AdminLoadingStatusProps) {
  return (
    <div className="tm-admin-loading-status" role="status" aria-live="polite">
      <div className="tm-text-body-lg">{title}</div>
      <div className="tm-text-caption">{body}</div>
    </div>
  );
}

export function AdminDashboardLoading({ operatorName }: { readonly operatorName: string }) {
  return (
    <>
      <AdminLoadingStatus
        title="운영 워크스페이스를 준비하고 있습니다"
        body={`${operatorName}님의 팀, 매치, 알림, 리뷰를 우선순위대로 정리하고 있습니다.`}
      />
      <section className="tm-admin-kpi-grid" aria-label="업무 요약" aria-busy="true">
        {['오늘 업무', '개인 매치', '팀매치', '팀', '알림 · 리뷰'].map((label) => (
          <AdminSkeletonMetric key={label} label={label} />
        ))}
      </section>
      <section className="tm-admin-workspace" aria-busy="true">
        <div className="tm-admin-main-column">
          <AdminSkeletonSection title="오늘 처리할 업무" rows={3} />
          <div className="tm-admin-operations-grid">
            <AdminSkeletonSection title="개인 매치" rows={2} />
            <AdminSkeletonSection title="팀매치" rows={2} />
          </div>
          <AdminSkeletonSection title="팀" rows={2} />
        </div>
        <aside className="tm-admin-side-column">
          <AdminSkeletonSection title="운영 담당자" rows={2} compact />
          <AdminSkeletonSection title="빠른 생성" rows={3} compact />
          <AdminSkeletonSection title="알림 · 리뷰" rows={2} compact />
        </aside>
      </section>
    </>
  );
}

export function AdminActivityLoading({ operatorName }: { readonly operatorName: string }) {
  return (
    <>
      <AdminLoadingStatus
        title="업무 이력을 준비하고 있습니다"
        body={`${operatorName}님의 최근 매치, 알림, 리뷰 흐름을 시간순으로 정리하고 있습니다.`}
      />
      <section className="tm-admin-audit-layout" aria-busy="true">
        <Card className="tm-admin-table-card" pad={0}>
          <div className="tm-admin-table-head">
            <div>
              <div className="tm-text-body-lg">최근 업무 흐름</div>
              <div className="tm-text-caption">업무 이력 데이터를 확인하고 있습니다.</div>
            </div>
          </div>
          <div className="tm-admin-skeleton-table" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => (
              <AdminSkeletonTableRow key={index} />
            ))}
          </div>
        </Card>
        <aside className="tm-admin-side-column">
          <AdminSkeletonSection title="운영 담당자" rows={2} compact />
        </aside>
      </section>
    </>
  );
}

export function AdminFunctionLoading({ model }: { readonly model: AdminFunctionPageModel }) {
  return (
    <>
      <AdminLoadingStatus title={model.loadingTitle} body={model.loadingBody} />
      <section className="tm-admin-kpi-grid" aria-label={`${model.title} 요약`} aria-busy="true">
        {model.stats.map((stat) => (
          <AdminSkeletonMetric key={stat.id} label={stat.label} />
        ))}
      </section>
      <section className="tm-admin-function-layout" aria-busy="true">
        <Card className="tm-admin-function-table-card" pad={0}>
          <div className="tm-admin-table-head">
            <div>
              <div className="tm-text-body-lg">{model.summaryLabel}</div>
              <div className="tm-text-caption">{model.loadingBody}</div>
            </div>
          </div>
          <div className="tm-admin-skeleton-table" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => (
              <AdminSkeletonTableRow key={index} />
            ))}
          </div>
        </Card>
        <aside className="tm-admin-function-rail">
          <AdminSkeletonSection title={model.sideTitle} rows={2} compact />
        </aside>
      </section>
    </>
  );
}

function AdminSkeletonMetric({ label }: { readonly label: AdminFunctionStatModel['label'] }) {
  return (
    <Card className="tm-admin-kpi-card tm-admin-skeleton-card" pad={16}>
      <div className="tm-metric-label">{label}</div>
      <span className="tm-admin-skeleton-line tm-admin-skeleton-line-lg" />
      <span className="tm-admin-skeleton-line tm-admin-skeleton-line-sm" />
    </Card>
  );
}

function AdminSkeletonSection({ title, rows, compact = false }: { readonly title: string; readonly rows: number; readonly compact?: boolean }) {
  return (
    <Card className="tm-admin-section tm-admin-skeleton-card" pad={18}>
      <div className="tm-admin-section-head">
        <div className="tm-text-body-lg">{title}</div>
        <span className="tm-admin-skeleton-line tm-admin-skeleton-line-md" />
      </div>
      <div className={compact ? 'tm-admin-skeleton-stack tm-admin-skeleton-stack-compact' : 'tm-admin-skeleton-stack'}>
        {Array.from({ length: rows }, (_, index) => (
          <span key={index} className="tm-admin-skeleton-block" />
        ))}
      </div>
    </Card>
  );
}

function AdminSkeletonTableRow() {
  return (
    <div className="tm-admin-skeleton-table-row">
      <span className="tm-admin-skeleton-line tm-admin-skeleton-line-lg" />
      <span className="tm-admin-skeleton-line tm-admin-skeleton-line-md" />
      <span className="tm-admin-skeleton-line tm-admin-skeleton-line-lg" />
      <span className="tm-admin-skeleton-line tm-admin-skeleton-line-sm" />
    </div>
  );
}
