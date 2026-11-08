import { notFound } from 'next/navigation';
import { TournamentOverviewSection } from '@/app/admin/tournaments/[id]/overview-section';
import { TournamentInfoSection } from '@/app/admin/tournaments/[id]/info-section';
import Registrations from '@/app/admin/tournaments/[id]/registrations/page';
import Bracket from '@/app/admin/tournaments/[id]/bracket/page';
import Announcements from '@/app/admin/tournaments/[id]/announcements/page';
import Sponsors from '@/app/admin/tournaments/[id]/sponsors/page';
import Campaign from '@/app/admin/tournaments/[id]/campaign/page';
import Reviews from '@/app/admin/tournaments/[id]/reviews/page';
import Awards from '@/app/admin/tournaments/[id]/awards/page';
import Statistics from '@/app/admin/tournaments/[id]/statistics/page';
import { PopupsView } from '@/app/admin/content/popups-view';
import { OperationsBoardClient } from '@/components/tournament-live/operations-board-client';
import { StaffClient } from '@/components/tournament-live/staff-client';
import { TournamentOpsRoleProvider } from '@/components/tournament-ops/role-context';
import { ADMIN_DEMO_ID } from '@/lib/tournament-admin-demo';

const sections = {
  overview: TournamentOverviewSection, info: TournamentInfoSection, registrations: Registrations,
  bracket: Bracket, announcements: Announcements, sponsors: Sponsors, campaign: Campaign,
  reviews: Reviews, awards: Awards, statistics: Statistics, popups: PopupsView,
};

export default async function TournamentDemoSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === 'staff' || section === 'operations') {
    return <TournamentOpsRoleProvider role="PLATFORM_OPS">
      {section === 'staff' ? <StaffClient tournamentId={ADMIN_DEMO_ID} /> : <OperationsBoardClient tournamentId={ADMIN_DEMO_ID} />}
    </TournamentOpsRoleProvider>;
  }
  if (!Object.hasOwn(sections, section)) notFound();
  const Section = sections[section as keyof typeof sections];
  return <Section />;
}
