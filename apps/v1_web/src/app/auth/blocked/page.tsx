import { AuthExceptionPageView } from '@/components/auth/auth-page';
import { getAuthExceptionViewModel } from '@/components/auth/auth.view-model';

export default function BlockedAccountPage() {
  return <AuthExceptionPageView model={getAuthExceptionViewModel('blocked')} />;
}
