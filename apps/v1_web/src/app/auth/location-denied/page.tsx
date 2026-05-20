import { AuthExceptionPageView } from '@/components/auth/auth-page';
import { getAuthExceptionViewModel } from '@/components/auth/auth.view-model';

export default function LocationDeniedPage() {
  return <AuthExceptionPageView model={getAuthExceptionViewModel('location-denied')} />;
}
