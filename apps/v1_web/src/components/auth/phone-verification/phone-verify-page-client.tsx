'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card } from '@/components/v1-ui/primitives';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { formatPhone, normalizeSeparatedDigits } from '@/components/auth/signup-profile-validation';
import { PhoneVerificationCard } from './phone-verification-card';

/**
 * 레거시 미인증 계정 · 프로필의 휴대폰 본인인증 진입점.
 * 홈 배너("인증하기" CTA)와 /my 설정에서 이 경로로 연결된다.
 * useV1AuthedPhoneConfirm이 성공 시 authMe 쿼리를 이미 invalidate하므로,
 * 이 화면은 완료 안내 후 홈으로 이동만 담당한다.
 */
export function PhoneVerifyPageClient() {
  const router = useRouter();
  const authMe = useV1AuthMe();
  const existingPhone = authMe.data?.user.phone ?? '';
  const alreadyVerified = authMe.data?.verification?.phoneVerified === true;
  const [phoneDigits, setPhoneDigits] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (existingPhone) setPhoneDigits(existingPhone);
  }, [existingPhone]);

  const handleVerified = () => {
    setDone(true);
    router.push('/home');
  };

  const verified = alreadyVerified || done;

  return (
    <AppChrome title="휴대폰 본인인증" activeTab="my" backHref="/my" bottomNav={false}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
        {verified ? (
          <Card pad={16} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--blue50)' }}>
            <CheckCircle2 size={20} color="var(--blue500)" aria-hidden="true" />
            <p className="tm-text-label" style={{ margin: 0, color: 'var(--blue500)' }}>
              휴대폰 본인인증이 완료됐어요.
            </p>
          </Card>
        ) : (
          <>
            <Card pad={16}>
              <p className="tm-text-body" style={{ margin: 0 }}>
                안전한 이용을 위해 휴대폰 본인인증이 필요해요.
              </p>
            </Card>

            {!existingPhone ? (
              <label className="tm-auth-field">
                <span className="tm-text-label">휴대폰 번호</span>
                <input
                  className="tm-input tm-auth-input"
                  inputMode="numeric"
                  onChange={(event) => setPhoneDigits(normalizeSeparatedDigits(event.target.value))}
                  placeholder="010-0000-0000"
                  value={formatPhone(phoneDigits)}
                />
              </label>
            ) : null}

            {phoneDigits.length === 11 ? (
              <PhoneVerificationCard mode="authed" phone={phoneDigits} onVerified={handleVerified} />
            ) : null}
          </>
        )}
      </div>
    </AppChrome>
  );
}
