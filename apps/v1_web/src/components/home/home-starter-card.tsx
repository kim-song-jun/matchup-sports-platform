import Link from 'next/link';
import { Users } from 'lucide-react';
import { Card, EmptyState } from '@/components/v1-ui/primitives';

/**
 * 팀이 없는 새 가입자의 "다음 경기" 자리. 보여 줄 경기가 없으니 먼저 해 볼 일을 안내한다.
 * 팀 만들기가 주 행동이고, 팀 찾기·매치 둘러보기는 팀 없이도 시작하는 길이라 함께 둔다.
 */
export function HomeStarterCard() {
  return (
    <section aria-label="먼저 해 볼 일" className="tm-home-starter">
      <Card pad={16} style={{ marginBottom: 16 }}>
        <div className="tm-text-caption-strong" style={{ color: 'var(--blue700)' }}>먼저 해 볼 일</div>
        <EmptyState
          icon={<Users size={32} strokeWidth={1.5} />}
          title="팀에 들어가면 경기 일정이 여기 떠요"
          sub="팀을 만들거나 내 지역 팀을 찾아보세요. 팀 없이도 개인 매치에 참가할 수 있어요."
          cta="팀 만들기"
          ctaHref="/teams/new"
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="tm-btn tm-btn-sm tm-btn-outline" href="/teams" style={{ flex: 1 }}>
            팀 찾기
          </Link>
          <Link className="tm-btn tm-btn-sm tm-btn-outline" href="/matches" style={{ flex: 1 }}>
            매치 둘러보기
          </Link>
        </div>
      </Card>
    </section>
  );
}
