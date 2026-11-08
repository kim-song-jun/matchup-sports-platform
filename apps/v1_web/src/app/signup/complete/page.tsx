import { SignupCompletePageView } from '@/components/auth/auth-page';
import { getSignupCompleteViewModel } from '@/components/auth/auth.view-model';
import { SignupPhotoNotice } from '@/components/auth/signup-photo-notice';

export default function SignupCompletePage() {
  return <SignupCompletePageView model={getSignupCompleteViewModel()} notice={<SignupPhotoNotice />} />;
}
