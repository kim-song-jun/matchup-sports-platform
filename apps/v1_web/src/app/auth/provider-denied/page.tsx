import { AuthExceptionPageView } from '@/components/auth/auth-page';
import { getAuthExceptionViewModel } from '@/components/auth/auth.view-model';

export default function ProviderDeniedPage() {
  return <AuthExceptionPageView model={getAuthExceptionViewModel('provider-denied')} />;
}
