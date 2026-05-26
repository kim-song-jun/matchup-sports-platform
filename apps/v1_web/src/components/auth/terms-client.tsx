'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRightIcon } from '@/components/v1-ui/icons';
import { useV1CompleteSocialTerms } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { saveSignupTermsAccepted } from '@/lib/signup-terms-storage';
import { AuthFrame } from './auth-page';
import { getTermsViewModel } from './auth.view-model';

export function TermsClient() {
  const model = getTermsViewModel();
  const router = useRouter();
  const searchParams = useSearchParams();
  const socialTerms = useV1CompleteSocialTerms();
  const mode = searchParams.get('mode');
  const isSocialMode = mode === 'social';
  const [checkedByTitle, setCheckedByTitle] = useState(() =>
    Object.fromEntries(model.agreements.map((agreement) => [agreement.title, false])),
  );
  const [openByTitle, setOpenByTitle] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const requiredAccepted = useMemo(
    () => model.agreements.every((agreement) => !agreement.required || checkedByTitle[agreement.title]),
    [checkedByTitle, model.agreements],
  );
  const requiredChecked = model.agreements.filter((agreement) => agreement.required).every((agreement) => checkedByTitle[agreement.title]);

  const setRequired = (checked: boolean) => {
    setCheckedByTitle((current) => ({
      ...current,
      ...Object.fromEntries(model.agreements.filter((agreement) => agreement.required).map((agreement) => [agreement.title, checked])),
    }));
  };

  const toggleAgreement = (title: string, nextChecked: boolean, locationBased?: boolean) => {
    setCheckedByTitle((current) => ({ ...current, [title]: nextChecked }));

    if (locationBased && nextChecked) {
      setOpenByTitle((current) => ({ ...current, [title]: true }));
    }
  };

  const continueToSignup = () => {
    if (!requiredAccepted) {
      return;
    }

    setError(null);
    if (isSocialMode) {
      socialTerms.mutate(
        { requiredTermsAccepted: true },
        {
          onSuccess: (result) => router.push(result.next?.route ?? '/signup/social'),
          onError: (nextError) => {
            if (nextError instanceof V1ApiError && nextError.code === 'SOCIAL_SIGNUP_EXPIRED') {
              setError('가입 시간이 만료되었습니다. 카카오 로그인부터 다시 진행해 주세요.');
              return;
            }

            setError(nextError instanceof Error ? nextError.message : '약관 동의를 저장하지 못했습니다.');
          },
        },
      );
      return;
    }

    saveSignupTermsAccepted(true);
    router.push('/signup');
  };

  return (
    <AuthFrame
      topTitle="약관 동의"
      backHref={isSocialMode ? undefined : model.backHref}
      fixedAction={
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" disabled={!requiredAccepted || socialTerms.isPending} onClick={continueToSignup} type="button">
          {socialTerms.isPending ? '저장 중' : requiredAccepted ? model.primary.label : '필수 약관 동의 후 가능'}
        </button>
      }
    >
      <div className="tm-auth-body">
        <h1 className="tm-text-heading tm-auth-heading">{model.title}</h1>
        <p className="tm-text-body tm-auth-sub">{model.sub}</p>
        {error ? (
          <div className="tm-auth-soft-card tm-auth-soft-card-error">
            <div className="tm-text-body-lg">약관을 저장하지 못했어요</div>
            <div className="tm-text-caption">{error}</div>
          </div>
        ) : null}
        <button className="tm-card tm-auth-agree-all tm-auth-agree-button tm-pressable" onClick={() => setRequired(!requiredChecked)} type="button">
          <TermsCheck checked={requiredChecked} />
          <span className="tm-text-body-lg">필수 약관 전체 동의</span>
        </button>
        <div className="tm-auth-stack">
          {model.agreements.map((item) => {
            const checked = checkedByTitle[item.title];
            const open = openByTitle[item.title] ?? false;

            return (
              <div key={item.title} className="tm-card tm-auth-agreement-card">
                <div className="tm-auth-agreement">
                  <button
                    aria-pressed={checked}
                    className="tm-auth-check-button tm-pressable"
                    onClick={() => toggleAgreement(item.title, !checked, item.locationBased)}
                    type="button"
                  >
                    <TermsCheck checked={checked} />
                  </button>
                  <button
                    className="tm-auth-agreement-main tm-pressable"
                    onClick={() => toggleAgreement(item.title, !checked, item.locationBased)}
                    type="button"
                  >
                    <span className="tm-text-body-lg">{item.title}</span>
                    <span className="tm-text-caption">{item.meta}</span>
                  </button>
                  <button
                    aria-expanded={open}
                    aria-label={`${item.title} 내용 보기`}
                    className="tm-auth-agreement-arrow tm-pressable"
                    onClick={() => setOpenByTitle((current) => ({ ...current, [item.title]: !open }))}
                    type="button"
                  >
                    <ChevronRightIcon size={16} strokeWidth={2} />
                  </button>
                </div>
                {open ? (
                  <div className="tm-auth-agreement-detail">
                    <div className="tm-text-caption">{item.detail}</div>
                    {item.locationBased ? <LocationConsentStatus checked={checked} /> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </AuthFrame>
  );
}

function TermsCheck({ checked }: { checked: boolean }) {
  return <span className={`tm-auth-check ${checked ? 'tm-auth-check-on' : ''}`}>✓</span>;
}

function LocationConsentStatus({ checked }: { checked: boolean }) {
  if (!checked) {
    return null;
  }

  return (
    <div className="tm-auth-location-status tm-auth-location-status-allowed tm-text-caption">
      위치 기반 서비스 약관에 동의했습니다. 브라우저 위치 권한은 지역 설정 화면에서 별도로 선택할 수 있습니다.
    </div>
  );
}
