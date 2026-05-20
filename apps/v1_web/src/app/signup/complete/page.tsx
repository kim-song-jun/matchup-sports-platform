import { SignupCompletePageView } from '@/components/auth/auth-page';
import { getSignupCompleteViewModel } from '@/components/auth/auth.view-model';

export default function SignupCompletePage() {
  return <SignupCompletePageView model={getSignupCompleteViewModel()} />;
}
