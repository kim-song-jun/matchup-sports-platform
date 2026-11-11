import { AppBackLink } from '@/components/v1-ui/app-back-link';
import { MyTournamentStaffPageClient } from '@/components/my/my-tournament-staff-client';
import { AdminPageHeader } from '@/components/admin';

export default function TournamentManagementPage() {
  return <div className="mx-auto max-w-5xl">
    <AppBackLink fallbackHref="/my" label="마이페이지로" className="inline-flex min-h-[44px] items-center text-[var(--text-muted)]">마이페이지로</AppBackLink>
    <AdminPageHeader title="담당 대회 관리" />
    <MyTournamentStaffPageClient directorsOnly />
  </div>;
}
