import { MyTournamentStaffPageClient } from '@/components/my/my-tournament-staff-client';
import { AdminPageHeader } from '@/components/admin';

export default function TournamentManagementPage() {
  return <div className="mx-auto max-w-5xl">
    <AdminPageHeader title="담당 대회 관리" back={{ fallbackHref: '/my', label: '마이페이지로' }} />
    <MyTournamentStaffPageClient directorsOnly />
  </div>;
}
