import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { ActionPanel, Card, ListItem, MetricCard, PageHeader } from '@/components/v1-ui/primitives';

type AdminSurface = 'dashboard' | 'audit';

const dashboardChecks = [
  { title: '서비스 상태', sub: '매치/팀매치/팀/커뮤니티 API 상태 확인', trailing: '읽기 전용' },
  { title: '감사 로그', sub: '관리자 행동의 주체, 사유, 결과 추적', trailing: '지원' },
  { title: '운영 mutation', sub: '제재, 정산, 분쟁 처리는 v1 최소 화면에서 실행하지 않음', trailing: '미지원' },
];

const auditEvents = [
  { title: 'admin-1', sub: '사유: 운영 상태 조회 · 결과: success · 대상: admin overview', trailing: '읽기' },
  { title: 'system', sub: '사유: 감사 로그 조회 · 결과: success · 대상: action logs', trailing: '읽기' },
  { title: 'admin-1', sub: '사유: 제재/정산/분쟁 mutation 요청 · 결과: unavailable', trailing: '차단' },
];

export function AdminMinimumPageView({ surface }: { surface: AdminSurface }) {
  const audit = surface === 'audit';
  const testId = audit ? 'admin-audit-open-design' : 'admin-open-design';
  const className = audit ? 'tm-admin-audit-open-design' : 'tm-admin-open-design tm-admin-desktop-workbench';

  return (
    <AppChrome
      title={audit ? '감사 로그' : '관리자'}
      desktopNav="admin"
      adminActiveTab={audit ? 'audit' : 'admin'}
      bottomNav={false}
      showSearch={false}
      showNotifications={false}
      wide
    >
      <div className={`tm-create-shell ${className}`} data-testid={testId}>
        {!audit ? (
          <div className="tm-admin-desktop-workbench-strip" data-testid="admin-desktop-workbench">
            <div className="tm-my-section-label">운영 요약</div>
            <div className="tm-my-section-label">검토 큐</div>
            <div className="tm-my-section-label">감사 로그</div>
          </div>
        ) : null}
        <PageHeader
          eyebrow="admin minimum"
          title={audit ? '감사 로그' : '운영 상태'}
          description="현재 v1 관리자 화면은 상태 확인과 감사 로그 조회만 지원합니다. 미지원 운영 액션은 성공처럼 처리하지 않습니다."
          action={<Link className="tm-btn tm-btn-sm tm-btn-secondary" href={audit ? '/admin' : '/admin/audit'}>{audit ? '운영 상태' : '감사 로그'}</Link>}
        />
        <div className="tm-responsive-card-grid">
          <MetricCard label="지원 범위" value="조회" delta="읽기 전용" />
          <MetricCard label="감사 추적" value="사유" delta="주체/결과 표시" tone="up" />
        </div>
        <div className="tm-detail-grid">
          <div>
            <Card pad={16}>
              <div className="tm-text-body-lg">{audit ? '최근 감사 이벤트' : '운영 체크'}</div>
              <div className="tm-my-list-stack" style={{ marginTop: 12 }}>
                {(audit ? auditEvents : dashboardChecks).map((item) => (
                  <ListItem key={`${item.title}:${item.sub}`} title={item.title} sub={item.sub} trailing={item.trailing} />
                ))}
              </div>
            </Card>
          </div>
          <aside>
            <ActionPanel
              title="미지원 운영 액션"
              description="제재, 정산, 분쟁 처리는 현재 v1 route/API 계약이 없으므로 완료 상태로 시뮬레이션하지 않습니다."
              action={<button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled>처리 불가</button>}
            />
          </aside>
        </div>
      </div>
    </AppChrome>
  );
}
