import { AuthExceptionPageView } from '@/components/auth/auth-page';
import { getAuthExceptionViewModel } from '@/components/auth/auth.view-model';

export default function PasswordResetPage() {
  return <AuthExceptionPageView model={getAuthExceptionViewModel('password-reset')} />;
}
