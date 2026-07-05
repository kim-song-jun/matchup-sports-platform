'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRightIcon } from '@/components/v1-ui/icons';
import { Button } from '@/components/v1-ui/button';
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
  const document = searchParams.get('document');
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
              setError('가입 가능 시간이 지났어요. 카카오 로그인부터 다시 시작해 주세요.');
              return;
            }

            setError(nextError instanceof Error ? nextError.message : '약관 동의를 저장하지 못했어요.');
          },
        },
      );
      return;
    }

    saveSignupTermsAccepted(true);
    router.push('/signup');
  };

  if (document === 'privacy' || document === 'terms') {
    const item = model.agreements.find((agreement) =>
      document === 'privacy' ? agreement.title.includes('개인정보') : agreement.title.includes('이용약관'),
    );
    const sections = getLegalDocumentSections(document);

    return (
      <AuthFrame topTitle={item?.title ?? '약관'} backHref="/login">
        <div className="tm-auth-body">
          <h1 className="tm-text-heading tm-auth-heading">{item?.title ?? '약관'}</h1>
          <p className="tm-text-body tm-auth-sub">{item?.detail ?? '약관 내용을 불러오지 못했어요.'}</p>
          <div className="tm-auth-soft-card" style={{ display: 'grid', gap: 14, marginTop: 18 }}>
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="tm-text-body-lg" style={{ margin: 0 }}>{section.title}</h2>
                <p className="tm-text-caption" style={{ margin: '6px 0 0', lineHeight: 1.65 }}>{section.body}</p>
              </section>
            ))}
          </div>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      topTitle="약관 동의"
      backHref={isSocialMode ? undefined : model.backHref}
      fixedAction={
        <Button
          block
          disabled={!requiredAccepted}
          loading={socialTerms.isPending}
          onClick={continueToSignup}
          size="lg"
          type="button"
          variant="primary"
        >
          {requiredAccepted ? model.primary.label : '필수 약관에 동의해 주세요'}
        </Button>
      }
    >
      <div className="tm-auth-body">
        <h1 className="tm-text-heading tm-auth-heading">{model.title}</h1>
        <p className="tm-text-body tm-auth-sub" style={{ whiteSpace: 'pre-line' }}>{model.sub}</p>
        {error ? (
          <div className="tm-auth-soft-card tm-auth-soft-card-error">
            <div className="tm-text-body-lg">약관을 저장하지 못했어요</div>
            <div className="tm-text-caption">{error}</div>
          </div>
        ) : null}
        <button className="tm-card tm-auth-agree-all tm-auth-agree-button tm-pressable" onClick={() => setRequired(!requiredChecked)} type="button" aria-pressed={requiredChecked}>
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

function getLegalDocumentSections(document: 'privacy' | 'terms') {
  if (document === 'privacy') {
    return [
      {
        title: '수집하는 정보',
        body: '회원 식별과 서비스 이용을 위해 이메일, 닉네임, 프로필 이미지, 선호 종목, 활동 지역, 팀·매치 참여 기록을 수집할 수 있어요.',
      },
      {
        title: '이용 목적',
        body: '로그인, 매치 신청, 팀 가입, 채팅, 알림 발송, 부정 이용 방지, 고객 문의 대응과 서비스 품질 개선에 사용해요.',
      },
      {
        title: '보관 기간',
        body: '회원 탈퇴 시 개인정보는 지체 없이 삭제해요. 다만 법령상 보관이 필요한 결제, 분쟁, 신고 기록은 정해진 기간 동안 분리 보관할 수 있어요.',
      },
      {
        title: '이용자 권리',
        body: '사용자는 언제든지 프로필을 수정하거나 계정 삭제를 요청할 수 있어요. 개인정보 관련 요청은 설정 또는 고객 문의를 통해 접수해 주세요.',
      },
    ];
  }

  return [
    {
      title: '서비스 이용',
      body: 'Teameet은 스포츠 매치, 팀 운영, 팀매치, 대회 참가와 커뮤니티 기능을 제공해요. 사용자는 정확한 정보로 서비스를 이용해야 해요.',
    },
    {
      title: '사용자 책임',
      body: '허위 정보 등록, 타인 사칭, 무단 홍보, 욕설·차별·위협, 노쇼와 반복적인 약속 불이행은 제한될 수 있어요.',
    },
    {
      title: '팀과 매치 운영',
      body: '팀장과 운영진은 멤버 승인, 일정 안내, 공개 범위 설정을 책임 있게 관리해야 해요. 참가자는 모집 조건과 환불 정책을 확인해야 해요.',
    },
    {
      title: '서비스 제한',
      body: '안전한 이용을 해치거나 운영 정책을 위반한 계정은 경고, 기능 제한, 이용 정지 또는 탈퇴 처리될 수 있어요.',
    },
  ];
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
      위치 기반 서비스 약관에 동의했어요. 브라우저 위치 권한은 지역 설정 화면에서 따로 선택할 수 있어요.
    </div>
  );
}
