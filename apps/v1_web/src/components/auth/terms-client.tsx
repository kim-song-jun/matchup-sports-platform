'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRightIcon } from '@/components/v1-ui/icons';
import { saveSignupTermsAccepted } from '@/lib/signup-terms-storage';
import { AuthFrame } from './auth-page';
import { getTermsViewModel } from './auth.view-model';

export function TermsClient() {
  const model = getTermsViewModel();
  const router = useRouter();
  const [checkedByTitle, setCheckedByTitle] = useState(() =>
    Object.fromEntries(model.agreements.map((agreement) => [agreement.title, false])),
  );

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

  const continueToSignup = () => {
    if (!requiredAccepted) {
      return;
    }

    saveSignupTermsAccepted(true);
    router.push('/signup');
  };

  return (
    <AuthFrame
      topTitle="약관 동의"
      backHref={model.backHref}
      fixedAction={
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" disabled={!requiredAccepted} onClick={continueToSignup} type="button">
          {requiredAccepted ? model.primary.label : '필수 약관 동의 후 가능'}
        </button>
      }
    >
      <div className="tm-auth-body">
        <span className="tm-badge tm-badge-blue">회원가입 전 필수</span>
        <h1 className="tm-text-heading tm-auth-heading">{model.title}</h1>
        <p className="tm-text-body tm-auth-sub">{model.sub}</p>
        <button className="tm-card tm-auth-agree-all tm-auth-agree-button tm-pressable" onClick={() => setRequired(!requiredChecked)} type="button">
          <TermsCheck checked={requiredChecked} />
          <span className="tm-text-body-lg">필수 약관 전체 동의</span>
        </button>
        <div className="tm-auth-stack">
          {model.agreements.map((item) => {
            const checked = checkedByTitle[item.title];

            return (
              <button
                key={item.title}
                className="tm-card tm-auth-agreement tm-auth-agree-button tm-pressable"
                onClick={() => setCheckedByTitle((current) => ({ ...current, [item.title]: !checked }))}
                type="button"
              >
                <TermsCheck checked={checked} />
                <div>
                  <div className="tm-text-body-lg">{item.title}</div>
                  <div className="tm-text-caption">{item.meta}</div>
                </div>
                <ChevronRightIcon size={16} strokeWidth={2} />
              </button>
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
