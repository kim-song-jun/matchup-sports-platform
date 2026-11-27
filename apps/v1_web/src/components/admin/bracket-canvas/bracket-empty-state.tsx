'use client';

import { ScopedLink as Link } from '@/components/providers/navigation-scope';
import { EmptyState } from '@/components/v1-ui/primitives';
import type { BracketCreateKey } from './bracket-tool-menus';

const SUB: Record<BracketCreateKey, string> = {
  template: '템플릿을 고르면 조와 경기가 한 번에 만들어져요. 팀은 나중에 넣어도 돼요.',
  stage: '단계 구성에 맞춰 조와 경기가 한 번에 만들어져요. 팀은 나중에 넣어도 돼요.',
  'multi-finals-create': '예선 조를 편성하면 토너먼트까지 한 번에 만들어져요.',
};

export function BracketEmptyState({ canWrite, create, onCreate, sixTeamNotice, infoHref, onShowList }: {
  canWrite: boolean;
  create: { key: BracketCreateKey; label: string } | null;
  onCreate: () => void;
  /** 6팀 일반 토너먼트인데 6강 방식을 아직 안 정한 대진 — 방식을 먼저 정하도록 안내한다. */
  sixTeamNotice: boolean;
  /** 6강 방식을 정하는 대회 정보 화면의 주소. */
  infoHref: string;
  /** 있으면 목록 보기의 수동 조 만들기로 가는 길을 작게 남긴다. */
  onShowList?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <EmptyState
        title="아직 대진이 없어요"
        sub={canWrite && create !== null ? SUB[create.key] : '아직 만들어진 대진이 없어요.'}
        cta={canWrite ? create?.label : undefined}
        onCta={onCreate}
      />
      {canWrite && sixTeamNotice ? (
        <p className="tm-text-caption text-[var(--text-muted)]">
          6팀 대회예요. <Link href={infoHref} className="font-semibold text-[var(--blue700)] underline">6강 방식을 먼저 정해요</Link>
        </p>
      ) : null}
      {canWrite && onShowList ? (
        <button type="button" onClick={onShowList} className="tm-text-caption min-h-11 px-3 text-[var(--text-muted)] underline">직접 조 만들기</button>
      ) : null}
    </div>
  );
}
