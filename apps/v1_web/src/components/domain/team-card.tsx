import Link from 'next/link';
import type { TeamCard as TeamCardType } from '@/lib/mock-data';
import { Badge } from '@/components/ui/badge';

const trustLabel = {
  verified: '검증됨',
  estimated: '추정',
  sample: '샘플',
};

export function TeamCard({ team, href = '#' }: { team: TeamCardType; href?: string }) {
  const trustTone = team.trust === 'verified' ? 'green' : team.trust === 'sample' ? 'orange' : 'blue';

  return (
    <Link href={href} className="v1-card v1-card-pad v1-card-link">
      <div className="v1-row">
        <div>
          <p className="v1-item-title">{team.name}</p>
          <p className="v1-caption" style={{ marginTop: 5 }}>
            {team.region} · {team.members}
          </p>
          <div className="v1-meta">
            <Badge tone="blue">{team.sport}</Badge>
            <Badge tone={trustTone}>{trustLabel[team.trust]}</Badge>
            <Badge tone={team.joinStatus === 'closed' ? 'red' : 'green'}>
              {team.joinStatus === 'closed' ? '모집 마감' : '승인 가능'}
            </Badge>
          </div>
        </div>
      </div>
    </Link>
  );
}
