import { Suspense } from 'react';
import { TermsClient } from '@/components/auth/terms-client';
import { AuthFrame } from '@/components/auth/auth-page';

export default function TermsPage() {
  return (
    <Suspense fallback={<TermsFallback />}>
      <TermsClient />
    </Suspense>
  );
}

function TermsFallback() {
  return (
    <AuthFrame topTitle="약관 동의">
      <div className="tm-auth-body">
        <h1 className="tm-text-heading tm-auth-heading">약관을 불러오고 있어요</h1>
      </div>
    </AuthFrame>
  );
}
