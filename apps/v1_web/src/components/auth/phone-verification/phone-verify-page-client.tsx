'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card } from '@/components/v1-ui/primitives';
import { sanitizeRedirectPath } from '@/lib/session-storage';
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
  const searchParams = useSearchParams();
  // 대회 신청처럼 "인증 때문에 막힌 화면"에서 넘어온 경우 그 자리로 돌려보낸다.
  // 외부 URL·javascript: 주입을 막기 위해 상대 경로만 통과시킨다(sanitizeRedirectPath).
  const redirectTo = sanitizeRedirectPath(searchParams.get('redirect')) ?? '/home';
  const authMe = useV1AuthMe();
  /**
   * authMe 가 오기 전에는 번호 UI 를 렌더하지 않는다. 로딩 중 existingPhone 이 '' 라
   * "번호 없는 계정" 모양(입력칸)이 잠깐 떴다가, 데이터가 도착하면 카드로 바뀌며
   * 그 사이 입력한 값이 저장된 번호로 덮인다.
   */
  const authLoading = authMe.isPending;
  const existingPhone = authMe.data?.user.phone ?? '';
  const alreadyVerified = authMe.data?.verification?.phoneVerified === true;
  const [phoneDigits, setPhoneDigits] = useState('');
  const [done, setDone] = useState(false);
  /**
   * 계정에 번호가 이미 있으면 그 번호로 문자가 나간다. 어떤 번호인지 보여주지 않으면
   * 잘못 저장된 번호를 확인할 방법이 없고, 고치려면 프로필까지 가야 했다.
   * 인증 확정 시 서버가 user.phone 을 인증한 번호로 갱신하므로 이 화면에서 바로 고칠 수 있다.
   */
  const [editingPhone, setEditingPhone] = useState(false);

  useEffect(() => {
    if (existingPhone) setPhoneDigits(existingPhone);
  }, [existingPhone]);

  const handleVerified = () => {
    setDone(true);
    router.push(redirectTo);
  };

  const verified = alreadyVerified || done;

  return (
    <AppChrome title="휴대폰 본인인증" activeTab="my" backHref="/my" bottomNav={false} desktopHead>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
        {verified ? (
          <Card pad={16} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--blue50)' }}>
            <CheckCircle2 size={20} color="var(--blue500)" aria-hidden="true" />
            <p className="tm-text-label" style={{ margin: 0, color: 'var(--blue700)' }}>
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

            {authLoading ? (
              <Card pad={16}>
                <p className="tm-text-caption" style={{ margin: 0, color: 'var(--text-caption)' }}>
                  계정 정보를 불러오는 중이에요.
                </p>
              </Card>
            ) : !existingPhone || editingPhone ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                {existingPhone ? (
                  <button
                    type="button"
                    className="tm-btn tm-btn-sm tm-btn-ghost"
                    style={{ alignSelf: 'flex-start', minHeight: 44 }}
                    onClick={() => {
                      setPhoneDigits(existingPhone);
                      setEditingPhone(false);
                    }}
                  >
                    기존 번호로 되돌리기
                  </button>
                ) : null}
              </div>
            ) : (
              <Card pad={16} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="tm-text-caption" style={{ margin: 0, color: 'var(--text-caption)' }}>
                    인증번호를 받을 번호
                  </p>
                  <p className="tm-text-label" style={{ margin: '2px 0 0', color: 'var(--text-strong)' }}>
                    {formatPhone(phoneDigits)}
                  </p>
                </div>
                <button
                  type="button"
                  className="tm-btn tm-btn-sm tm-btn-neutral"
                  style={{ flexShrink: 0, minHeight: 44 }}
                  onClick={() => setEditingPhone(true)}
                  aria-label="인증받을 휴대폰 번호 수정"
                >
                  번호 수정
                </button>
              </Card>
            )}

            {!authLoading && phoneDigits.length === 11 ? (
              <PhoneVerificationCard mode="authed" phone={phoneDigits} onVerified={handleVerified} />
            ) : null}
          </>
        )}
      </div>
    </AppChrome>
  );
}
