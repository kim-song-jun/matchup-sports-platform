import { SignupFormPageView } from '@/components/auth/auth-page';
import { getSignupFormViewModel } from '@/components/auth/auth.view-model';

export default function SignupPage() {
  return <SignupFormPageView model={getSignupFormViewModel()} />;
}
