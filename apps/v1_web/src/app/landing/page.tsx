import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { ActionPanel, MetricCard, PageHeader } from '@/components/v1-ui/primitives';

export default function LandingPage() {
  return (
    <AppChrome title="teameet" activeTab="home" bottomNav={false} showNotifications={false}>
      <div className="tm-responsive-wide-lane" style={{ padding: '28px 20px 48px' }}>
        <PageHeader
          eyebrow="Teameet"
          title="같이 뛸 사람을 한 번에 찾아요"
          description="개인 매치, 팀매치, 팀 탐색을 현재 v1에서 지원하는 범위로 명확하게 연결합니다."
          action={<Link className="tm-btn tm-btn-sm tm-btn-primary" href="/login">시작하기</Link>}
        />
        <div className="tm-responsive-action-row" style={{ marginTop: 18 }}>
          <ActionPanel title="오늘 참여 가능한 경기 찾기" description="검색과 필터는 매치, 팀매치, 팀 도메인으로만 연결됩니다." action={<Link className="tm-btn tm-btn-sm tm-btn-secondary" href="/search">검색하기</Link>} />
        </div>
        <div className="tm-match-card-stack" style={{ marginTop: 18 }}>
          <MetricCard label="지원 도메인" value="3개" delta="매치 · 팀매치 · 팀" />
          <MetricCard label="운영 신호" value="명확" delta="샘플과 추정 신호 구분" />
          <MetricCard label="시작 경로" value="2개" delta="로그인 또는 게스트 홈" />
        </div>
      </div>
    </AppChrome>
  );
}
