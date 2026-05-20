import { EmailLoginPageView } from '@/components/auth/auth-page';
import { getEmailLoginViewModel } from '@/components/auth/auth.view-model';

export default function EmailLoginPage() {
  return <EmailLoginPageView model={getEmailLoginViewModel()} />;
}
