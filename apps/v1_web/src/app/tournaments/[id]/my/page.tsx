import { RequireAuth } from '@/components/auth/require-auth';
import { MyRegistrationPageClient } from './my-registration-client';

export default async function MyRegistrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequireAuth>
      <MyRegistrationPageClient tournamentId={id} />
    </RequireAuth>
  );
}
