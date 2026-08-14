import { Eye } from 'lucide-react';
import { TournamentSponsorSection } from '@/components/tournaments/tournament-sponsor-section';
import type { V1AdminTournamentSponsor } from '@/types/api';

export function TournamentSponsorsPreview({
  sponsors,
}: {
  readonly sponsors: V1AdminTournamentSponsor[];
}) {
  const activeSponsors = sponsors.filter((sponsor) => sponsor.isActive);

  return (
    <section
      aria-label="캠페인 협찬 미리보기"
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-surface)]"
    >
      <div className="flex items-start gap-2 border-b border-[var(--border)] px-5 py-4">
        <Eye size={16} className="mt-0.5 shrink-0 text-blue-500" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-bold text-[var(--text-strong)]">캠페인 노출 미리보기</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">저장된 공개 협찬만 실제 캠페인과 같은 형태로 표시해요.</p>
        </div>
      </div>
      <div className="px-5 pb-6 sm:px-7 sm:pb-8">
        <TournamentSponsorSection
          sponsors={activeSponsors}
          showEmptyState
          variant="embedded"
        />
      </div>
    </section>
  );
}
