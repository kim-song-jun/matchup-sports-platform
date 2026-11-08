import { AlertBanner } from '@/components/v1-ui/primitives';
import type { V1GameRosterView } from '@/hooks/use-v1-game-roster';
import { isDisciplineImminent } from '@/lib/competition-status';
import { rosterPersonLabel } from '@/lib/roster-presentation';

type BannerView = Pick<V1GameRosterView, 'gameState' | 'suspended' | 'base' | 'disciplineRules'>;

/** 이 경기에 나설 수 없는 선수와 경고 한 장이면 정지인 선수. 시작 전 경기에서만 의미가 있다. */
export function disciplineBannerMessages(view: BannerView): { suspended: string | null; imminent: string | null } {
  if (view.gameState !== 'SCHEDULED') return { suspended: null, imminent: null };
  const suspended = view.suspended.map((row) => rosterPersonLabel(row));
  const imminent = view.base
    .filter((row) => row.status === 'PARTICIPATING' && isDisciplineImminent(row.cards, view.disciplineRules))
    .map((row) => rosterPersonLabel(row));
  return {
    suspended:
      suspended.length === 0
        ? null
        : `출전정지 ${suspended.length}명은 이 경기에 나설 수 없어요. ${suspended.join(' · ')} — 명단에서 자동으로 빠졌어요.`,
    imminent:
      imminent.length === 0
        ? null
        : `경고 임박 ${imminent.length}명 — ${imminent.join(' · ')}. 이번 경기에서 경고를 받으면 다음 경기부터 출전정지예요.`,
  };
}

/** 경기 명단·킥오프 준비 맨 위 안내. 표·목록은 그대로 두고 먼저 알리기만 한다. */
export function GameRosterDisciplineBanners({ view }: { view: BannerView }) {
  const { suspended, imminent } = disciplineBannerMessages(view);
  if (suspended === null && imminent === null) return null;
  return (
    <div className="flex flex-col gap-2">
      {suspended === null ? null : <AlertBanner tone="warning" message={suspended} />}
      {imminent === null ? null : <AlertBanner tone="info" message={imminent} />}
    </div>
  );
}
