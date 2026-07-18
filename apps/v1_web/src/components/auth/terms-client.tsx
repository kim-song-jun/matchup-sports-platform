'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRightIcon } from '@/components/v1-ui/icons';
import { Button } from '@/components/v1-ui/button';
import { useV1CompleteSocialTerms } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { trackEvent } from '@/lib/analytics';
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
  const [legalDialog, setLegalDialog] = useState<null | { title: string; sections: LegalDocumentSection[] }>(null);
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

  const toggleAgreement = (title: string, nextChecked: boolean) => {
    setCheckedByTitle((current) => ({ ...current, [title]: nextChecked }));
  };

  useEffect(() => {
    if (!legalDialog) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLegalDialog(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [legalDialog]);

  const continueToSignup = () => {
    if (!requiredAccepted) {
      return;
    }
    // 로딩 중 재클릭 시 중복 제출 방지 — isPending 은 disabled 속성과 동일하게 리렌더
    // 이후에나 반영되는 값이라 동시 클릭까지 막지는 못하지만, 스피너가 보이는 동안의
    // 재클릭은 막는다(동시 클릭 방지가 필요하면 ref 락을 따로 둔다).
    if (socialTerms.isPending) return;

    setError(null);
    if (isSocialMode) {
      socialTerms.mutate(
        { requiredTermsAccepted: true },
        {
          onSuccess: (result) => router.replace(result.next.route),
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

    trackEvent('sign_up_start', { method: 'email' });
    saveSignupTermsAccepted(true);
    router.push('/signup');
  };

  const legalDocument = resolveLegalDocument(document);
  if (legalDocument) {
    const item = model.agreements.find((agreement) =>
      legalDocument.key === 'privacy' ? agreement.title.includes('개인정보') : agreement.title.includes('이용약관'),
    );

    return (
      <AuthFrame topTitle={legalDocument.title} backHref="/login">
        <div className="tm-auth-body">
          <h1 className="tm-text-heading tm-auth-heading">{legalDocument.title}</h1>
          <p className="tm-text-body tm-auth-sub">{item?.detail ?? legalDocument.description}</p>
          <div className="tm-auth-soft-card" style={{ display: 'grid', gap: 14, marginTop: 18 }}>
            {legalDocument.sections.map((section) => (
              <section key={section.title}>
                <h2 className="tm-text-body-lg" style={{ margin: 0 }}>{section.title}</h2>
                <p className="tm-text-caption" style={{ margin: '6px 0 0', lineHeight: 1.65, whiteSpace: 'pre-line' }}>{section.body}</p>
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
      <div className="tm-auth-body" style={{ paddingBottom: 112 }}>
        <h1 className="tm-text-heading tm-auth-heading" style={{ overflowWrap: 'break-word', textWrap: 'balance' }}>{model.title}</h1>
        <p className="tm-text-body tm-auth-sub" style={{ whiteSpace: 'pre-line' }}>{model.sub}</p>
        {error ? (
          <div className="tm-auth-soft-card tm-auth-soft-card-error">
            <div className="tm-text-body-lg">약관을 저장하지 못했어요</div>
            <div className="tm-text-caption">{error}</div>
          </div>
        ) : null}
        <button className="tm-card tm-auth-agree-all tm-auth-agree-button tm-pressable" onClick={() => setRequired(!requiredChecked)} type="button" aria-pressed={requiredChecked}>
          <TermsCheck checked={requiredChecked} />
          <span style={{ display: 'grid', gap: 3 }}>
            <span className="tm-text-body-lg">필수 약관 전체 동의 (필수)</span>
            <span className="tm-text-caption">서비스 이용약관, 개인정보 수집 및 이용 동의에 모두 동의합니다.</span>
          </span>
        </button>
        <div className="tm-auth-stack">
          {model.agreements.map((item) => {
            const checked = checkedByTitle[item.title];
            const open = openByTitle[item.title] ?? false;
            const documentSections = getAgreementDocumentSections(item.title);

            return (
              <div key={item.title} className="tm-card tm-auth-agreement-card">
                <div className="tm-auth-agreement">
                  <button
                    aria-pressed={checked}
                    className="tm-auth-check-button tm-pressable"
                    onClick={() => toggleAgreement(item.title, !checked)}
                    type="button"
                  >
                    <TermsCheck checked={checked} />
                  </button>
                  <button
                    className="tm-auth-agreement-main tm-pressable"
                    onClick={() => toggleAgreement(item.title, !checked)}
                    type="button"
                  >
                    <span
                      className="tm-text-body-lg"
                      style={{ fontSize: 15, lineHeight: '20px', whiteSpace: 'nowrap' }}
                    >
                      {item.title} ({item.required ? '필수' : '선택'})
                    </span>
                    {item.meta === '필수' ? null : <span className="tm-text-caption">{item.meta}</span>}
                    {item.detail ? <span className="tm-text-caption" style={{ lineHeight: 1.5 }}>{item.detail}</span> : null}
                  </button>
                  <button
                    aria-expanded={documentSections ? undefined : open}
                    aria-haspopup={documentSections ? 'dialog' : undefined}
                    aria-label={`${item.title} 내용 보기`}
                    className="tm-auth-agreement-arrow tm-pressable"
                    onClick={() => {
                      if (documentSections) {
                        setLegalDialog({ title: item.title, sections: documentSections });
                        return;
                      }

                      setOpenByTitle((current) => ({ ...current, [item.title]: !open }));
                    }}
                    type="button"
                  >
                    <ChevronRightIcon size={16} strokeWidth={2} />
                  </button>
                </div>
                {open ? (
                  <div className="tm-auth-agreement-detail">
                    <div className="tm-text-caption">{item.detail}</div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <Link
          className="tm-card tm-auth-agree-button tm-pressable"
          href="/terms?document=location"
          style={{ width: '100%', textAlign: 'left' }}
        >
          <span className="tm-text-body-lg">위치 기능은 사용할 때마다 따로 동의해요</span>
          <span className="tm-text-caption">
            회원가입 동의로 저장하지 않으며, 현재 위치 버튼을 누르기 전에 좌표 전송 범위를 안내해요.
          </span>
        </Link>
        {legalDialog ? (
          <LegalDocumentDialog
            title={legalDialog.title}
            sections={legalDialog.sections}
            onClose={() => setLegalDialog(null)}
          />
        ) : null}
      </div>
    </AuthFrame>
  );
}

type LegalDocumentSection = {
  title: string;
  body: string;
};

type LegalDocumentKey = 'terms' | 'privacy' | 'location' | 'tournament-policy' | 'support';

type LegalDocument = {
  key: LegalDocumentKey;
  title: string;
  description: string;
  sections: LegalDocumentSection[];
};

function resolveLegalDocument(document: string | null): LegalDocument | null {
  if (!document || !isLegalDocumentKey(document)) return null;

  if (document === 'terms') {
    return {
      key: document,
      title: '서비스 이용약관',
      description: '팀밋 서비스 이용 전 확인해야 하는 기본 약관입니다.',
      sections: getLegalDocumentSections('terms'),
    };
  }

  if (document === 'privacy') {
    return {
      key: document,
      title: '개인정보처리방침',
      description: '팀밋이 개인정보를 수집하고 이용하는 기준을 안내합니다.',
      sections: getPrivacyPolicySections(),
    };
  }

  if (document === 'location') {
    return {
      key: document,
      title: '위치기반서비스 이용약관',
      description: '주변 매치와 팀 추천에 사용하는 위치 기반 서비스 기준입니다.',
      sections: getLocationDocumentSections(),
    };
  }

  if (document === 'tournament-policy') {
    return {
      key: document,
      title: '대회 운영정책',
      description: '대회 참가, 운영, 환불, 제재 기준을 안내합니다.',
      sections: getTournamentPolicyDocumentSections(),
    };
  }

  return {
    key: document,
    title: '고객센터',
    description: '문의가 필요한 경우 아래 연락처로 접수해 주세요.',
    sections: getSupportDocumentSections(),
  };
}

function isLegalDocumentKey(value: string): value is LegalDocumentKey {
  return value === 'terms' || value === 'privacy' || value === 'location' || value === 'tournament-policy' || value === 'support';
}

function getAgreementDocumentSections(title: string): LegalDocumentSection[] | null {
  if (title === '서비스 이용약관') {
    return getLegalDocumentSections('terms');
  }

  if (title === '개인정보 수집 및 이용 동의') {
    return getLegalDocumentSections('privacy');
  }

  if (title === '위치기반서비스 이용 동의') {
    return getLocationDocumentSections();
  }

  return null;
}

function getLegalDocumentSections(document: 'privacy' | 'terms') {
  if (document === 'privacy') {
    return [
      {
        title: '개인정보 수집 및 이용 동의',
        body: '아이위(IWI)(대표 김봉목, 이하 “회사”)는 팀밋(Teameet) 서비스 제공을 위해 아래와 같이 개인정보를 수집 및 이용합니다.',
      },
      {
        title: '1. 수집 항목',
        body: '회원가입 시:\n이름, 이메일, 휴대전화번호, 비밀번호, 생년월일, 성별, 만 14세 이상 여부\n\n프로필 및 팀 기능 이용 시:\n닉네임, 프로필 이미지, 활동 지역, 종목, 포지션, 실력 레벨, 팀명, 팀 소개, 팀 가입 및 탈퇴 이력\n\n서비스 이용 과정에서 자동 수집될 수 있는 정보:\n접속 IP, 쿠키, 서비스 이용 기록, 접속 로그, 기기 정보, 브라우저 정보, 운영체제 정보, 불량 이용 기록',
      },
      {
        title: '2. 이용 목적',
        body: '회사는 수집한 개인정보를 다음 목적으로 이용합니다.\n\n1. 회원가입 및 본인 확인\n2. 계정 관리\n3. 팀 생성, 팀 가입, 팀원 모집\n4. 경기 매칭 및 서비스 이용\n5. 대회 신청 및 참가 관리\n6. 문의 및 신고 처리\n7. 부정 이용 방지\n8. 서비스 운영 및 개선',
      },
      {
        title: '3. 보유 및 이용 기간',
        body: '개인정보는 회원 탈퇴 시까지 보관합니다.\n\n단, 관련 법령에 따라 보관이 필요한 경우, 분쟁 대응이 필요한 경우, 부정 이용 방지가 필요한 경우에는 필요한 기간 동안 보관할 수 있습니다.',
      },
      {
        title: '4. 동의 거부 안내',
        body: '이용자는 개인정보 수집 및 이용에 동의하지 않을 권리가 있습니다.\n\n다만 필수 개인정보 수집 및 이용에 동의하지 않을 경우 회원가입 및 팀밋 서비스 이용이 제한됩니다.',
      },
      {
        title: '5. 개인정보 보호책임자',
        body: '성명: 김봉목\n직책: 대표\n이메일: teameetsports@naver.com\n\n회사명: 아이위(IWI)\n대표자: 김봉목\n시행일: 2026년 7월 1일',
      },
    ];
  }

  return [
    {
      title: '제1조 목적',
      body: '본 약관은 아이위(IWI)(대표 김봉목, 이하 “회사”)가 제공하는 팀밋(Teameet, 이하 “서비스”)의 이용과 관련하여 회사와 회원 간의 권리, 의무 및 책임사항, 서비스 이용 조건과 절차, 기타 필요한 사항을 규정하는 것을 목적으로 합니다.',
    },
    {
      title: '제2조 서비스의 내용',
      body: '회사는 회원에게 다음과 같은 서비스를 제공합니다.\n\n1. 팀 생성 및 팀 관리 서비스\n2. 팀 검색, 팀 가입, 팀원 모집 서비스\n3. 경기, 매치, 용병, 모임 관련 정보 제공 서비스\n4. 대회 신청 및 참가 관리 서비스\n5. 회원 프로필, 종목, 포지션, 활동 지역, 실력 레벨 등록 서비스\n6. 경기 후기, 매너평가, 신고 및 제재 관련 서비스\n7. 기타 회사가 정하는 서비스',
    },
    {
      title: '제3조 회원가입 및 계정 관리',
      body: '회원은 본인의 실제 정보를 입력해야 하며, 타인의 정보를 도용하거나 허위 정보를 입력해서는 안 됩니다.\n\n회원은 자신의 계정과 비밀번호를 직접 관리해야 하며, 계정을 제3자에게 양도, 대여, 공유할 수 없습니다.\n\n회원의 계정 관리 소홀, 제3자 사용 등으로 발생한 손해는 회원 본인이 부담합니다.',
    },
    {
      title: '제4조 회원의 의무',
      body: '회원은 서비스 이용 시 다음 행위를 해서는 안 됩니다.\n\n1. 타인의 개인정보 또는 계정을 도용하는 행위\n2. 허위 정보를 등록하는 행위\n3. 다른 회원에게 피해를 주는 행위\n4. 경기, 대회, 팀 운영을 방해하는 행위\n5. 욕설, 비방, 차별, 혐오, 성희롱, 위협, 폭력적 언행\n6. 광고, 스팸, 사기, 불법 홍보 행위\n7. 회사 또는 제3자의 권리, 명예, 신용을 침해하는 행위\n8. 기타 관련 법령, 본 약관, 운영정책에 위반되는 행위',
    },
    {
      title: '제5조 팀 생성 및 운영',
      body: '회원은 회사가 정한 절차에 따라 팀을 생성하거나 가입할 수 있습니다.\n\n팀장은 팀명, 팀 소개, 활동 지역, 종목, 팀원 구성 등 팀 운영에 필요한 정보를 등록하고 관리할 수 있습니다.\n\n회사는 허위 정보, 부적절한 팀명, 상업적 홍보, 반복적인 신고 또는 비매너 행위가 확인되는 팀에 대해 노출 제한, 수정 요청, 이용 제한, 삭제 등의 조치를 할 수 있습니다.',
    },
    {
      title: '제6조 경기 및 매칭 이용',
      body: '회원은 서비스에서 제공하는 경기, 매칭, 용병, 모임 정보를 확인하고 신청할 수 있습니다.\n\n회원은 경기 신청 전 일정, 장소, 참가비, 준비물, 경기 방식, 주의사항을 직접 확인해야 합니다.\n\n회원 간 자율적으로 진행한 경기에서 발생한 부상, 사고, 분쟁, 손해에 대해 회사는 고의 또는 중대한 과실이 없는 한 책임을 지지 않습니다.',
    },
    {
      title: '제7조 대회 신청 및 참가',
      body: '회원 또는 팀은 회사가 정한 절차에 따라 대회 참가를 신청할 수 있습니다.\n\n대회 참가 신청, 참가비 입금, 환불, 노쇼, 실격, 참가 자격 등 세부 사항은 대회별 안내사항 및 대회 규정에 따릅니다.',
    },
    {
      title: '제8조 이용 제한',
      body: '회사는 회원이 본 약관 또는 운영정책을 위반한 경우 다음 조치를 할 수 있습니다.\n\n1. 경고\n2. 게시물 삭제 또는 비공개\n3. 경기 또는 대회 신청 제한\n4. 매너점수 또는 신뢰도 반영\n5. 일정 기간 서비스 이용 제한\n6. 계정 정지 또는 회원 자격 박탈',
    },
    {
      title: '제9조 책임 제한',
      body: '회사는 천재지변, 통신 장애, 시설 장애 등 불가항력으로 서비스를 제공할 수 없는 경우 책임을 지지 않습니다.\n\n회사는 회원의 귀책 사유로 발생한 서비스 이용 장애 또는 손해에 대해 책임을 지지 않습니다.\n\n회원은 본인의 건강 상태, 운동 능력, 부상 위험을 스스로 확인한 뒤 경기 및 대회에 참여해야 합니다.',
    },
    {
      title: '제10조 준거법 및 관할',
      body: '본 약관은 대한민국 법령에 따라 해석되며, 회사와 회원 간 발생한 분쟁에 관한 소송은 관련 법령에 따른 관할 법원을 제1심 관할 법원으로 합니다.',
    },
    {
      title: '회사 정보 및 시행일',
      body: '회사명: 아이위(IWI)\n대표자: 김봉목\n이메일: teameetsports@naver.com\n시행일: 2026년 7월 1일',
    },
  ];
}

function getLocationDocumentSections(): LegalDocumentSection[] {
  return [
    {
      title: '위치기반서비스 이용 동의',
      body: '팀밋은 이용자의 주변 경기, 팀, 대회, 시설 추천을 위해 위치정보 또는 활동 지역 정보를 이용할 수 있습니다.',
    },
    {
      title: '1. 수집 및 이용 항목',
      body: '현재 위치 정보 또는 이용자가 직접 선택한 활동 지역 정보',
    },
    {
      title: '2. 이용 목적',
      body: '1. 주변 경기 추천\n2. 주변 팀 추천\n3. 주변 대회 및 시설 안내\n4. 거리 기반 서비스 제공\n5. 맞춤형 매치 및 활동 추천',
    },
    {
      title: '3. 보유 및 이용 기간',
      body: '위치정보는 서비스 제공 목적 달성 후 지체 없이 파기합니다.\n\n단, 이용자가 직접 설정한 활동 지역 정보는 회원 탈퇴 또는 해당 정보 삭제 시까지 보관될 수 있습니다.',
    },
    {
      title: '4. 동의 거부 안내',
      body: '위치기반서비스 이용 동의는 선택 사항입니다.\n\n동의하지 않아도 팀밋의 기본 서비스 이용은 가능하나, 주변 경기 추천 등 위치 기반 기능 이용이 제한될 수 있습니다.',
    },
    {
      title: '회사 정보 및 시행일',
      body: '회사명: 아이위(IWI)\n대표자: 김봉목\n이메일: teameetsports@naver.com\n시행일: 2026년 7월 1일',
    },
  ];
}

function getPrivacyPolicySections(): LegalDocumentSection[] {
  return [
    {
      title: '개인정보처리방침',
      body: `아이위(IWI)(대표 김봉목, 이하 “회사”)는 팀밋(Teameet) 이용자의 개인정보를 중요하게 생각하며, 개인정보 보호 관련 법령을 준수하기 위해 다음과 같이 개인정보처리방침을 수립·공개합니다.

1. 개인정보의 처리 목적

회사는 다음의 목적을 위해 개인정보를 처리합니다.

1. 회원가입 및 계정 관리
2. 팀 생성 및 팀 가입 서비스 제공
3. 경기, 매칭, 용병, 모임 서비스 제공
4. 대회 신청 및 참가 관리
5. 참가비 입금 확인 및 환불 처리
6. 문의 및 신고 처리
7. 노쇼, 지각, 비매너 행위 확인 및 제재 관리
8. 서비스 개선 및 통계 분석
9. 이벤트, 대회, 제휴 혜택 안내

2. 처리하는 개인정보 항목

회원가입 시:
이름, 이메일, 휴대전화번호, 비밀번호, 생년월일, 성별, 만 14세 이상 여부

프로필 및 팀 기능 이용 시:
닉네임, 프로필 이미지, 활동 지역, 종목, 포지션, 실력 레벨, 팀명, 팀 소개, 팀 가입 및 탈퇴 이력

경기 및 대회 신청 시:
이름, 연락처, 생년월일, 성별, 팀명, 참가 종목, 포지션, 선출·비선출 여부, 참가 신청 내역

참가비 입금 및 환불 처리 시:
입금자명, 입금 여부, 입금 일시, 환불 계좌정보, 예금주명

문의 및 신고 처리 시:
이름, 연락처, 이메일, 문의 내용, 신고 내용, 첨부 자료

서비스 이용 과정에서 자동 생성되는 정보:
접속 IP, 쿠키, 서비스 이용 기록, 접속 로그, 기기 정보, 브라우저 정보, 운영체제 정보, 불량 이용 기록

3. 개인정보의 보유 및 이용 기간

회사는 개인정보 수집 및 이용 목적이 달성된 후 해당 정보를 지체 없이 파기합니다.

다만 다음의 경우 일정 기간 보관할 수 있습니다.

회원 정보:
회원 탈퇴 시까지. 단, 부정 이용 방지 및 분쟁 대응을 위해 탈퇴 후 최대 1년간 보관 가능

대회 및 경기 참가 정보:
대회 또는 경기 종료 후 최대 3년

결제 및 환불 관련 정보:
관련 법령상 보관 기간 또는 회계 처리 목적상 필요한 기간

문의 및 신고 처리 기록:
처리 완료 후 최대 3년

부정 이용 및 제재 기록:
서비스 질서 유지 및 재가입 방지를 위해 최대 3년

4. 만 14세 미만 아동의 개인정보 처리

회사는 원칙적으로 만 14세 미만 아동의 회원가입 및 서비스 이용을 허용하지 않습니다.

만 14세 미만 아동이 법정대리인 동의 없이 가입한 사실이 확인되는 경우 해당 계정을 제한하거나 삭제할 수 있습니다.

5. 개인정보의 제3자 제공

회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다.

다만 이용자가 사전에 동의한 경우, 법령에 따른 요청이 있는 경우, 대회 운영 및 안전관리를 위해 필요한 범위에서 동의를 받은 경우에는 개인정보를 제공할 수 있습니다.

6. 개인정보 처리업무의 위탁

회사는 원활한 서비스 제공을 위해 문자, 알림톡, 이메일 발송, 서버 호스팅, 결제 및 입금 확인, 고객 문의 관리, 대회 운영 보조, 사진 및 영상 촬영·편집 업무를 외부에 위탁할 수 있습니다.

위탁 업무가 발생하는 경우 수탁자, 위탁 업무 내용, 보유 및 이용 기간을 본 방침 또는 별도 공지를 통해 공개합니다.

7. 개인정보의 파기 절차 및 방법

전자적 파일 형태의 개인정보는 복구 및 재생이 불가능한 방법으로 삭제합니다.

종이 문서 형태의 개인정보는 분쇄하거나 소각하여 파기합니다.

8. 이용자의 권리

이용자는 언제든지 개인정보 열람, 정정, 삭제, 처리정지, 동의 철회, 회원 탈퇴를 요청할 수 있습니다.

회사는 이용자의 요청을 확인한 후 관련 법령에 따라 지체 없이 조치합니다.

9. 개인정보의 안전성 확보조치

회사는 개인정보 접근 권한 관리, 개인정보 처리 담당자 최소화, 비밀번호 암호화, 보안 조치, 접속 기록 보관 및 점검 등 필요한 안전성 확보조치를 시행합니다.

10. 개인정보 보호책임자

성명: 김봉목
직책: 대표
이메일: teameetsports@naver.com

회사명: 아이위(IWI)
대표자: 김봉목
시행일: 2026년 7월 1일`,
    },
  ];
}

function getTournamentPolicyDocumentSections(): LegalDocumentSection[] {
  return [
    {
      title: '팀밋 풋살대회 규정 및 안내사항',
      body: `[필수] 대회 규정 및 안내사항을 확인하였으며 이에 동의합니다.

본인은 팀밋 풋살대회의 참가 신청, 참가비 입금, 신청 취소 및 환불 기준, 노쇼 및 실격 기준, 선출·비선출 구분, 허위 신분 제출 시 팀 탈락 가능성, 경기 운영 방식, 안전 및 촬영 안내사항을 모두 확인하였으며 이에 동의합니다.

본 규정 및 안내사항은 아이위(IWI)(대표 김봉목)가 운영하는 팀밋(Teameet) 풋살대회의 원활하고 공정한 운영을 위해 마련되었습니다.

대회에 참가하는 모든 팀과 참가자는 본 규정 및 안내사항을 반드시 확인해야 하며, 대회 신청 및 참가 확정 시 본 내용에 동의한 것으로 간주합니다.

시행일: 2026년 7월 1일

1. 대회 기본 안내

본 대회는 팀밋이 주최 또는 운영하는 생활체육 풋살대회입니다.

참가팀은 대회 신청 전 일정, 장소, 참가비, 경기 방식, 참가 자격, 환불 기준, 실격 기준, 촬영 및 홍보 활용 여부를 반드시 확인해야 합니다.

대회 운영 방식, 경기 시간, 조 편성, 순위 결정 방식, 시상 내역, 현장 운영 안내 등 세부 사항은 대회별 공지사항 및 운영진 안내에 따릅니다.

2. 참가 신청 및 참가 확정

대회 참가 신청은 신청 완료만으로 최종 확정되지 않습니다.

참가 신청 후 운영진의 신청 내용 확인과 참가비 입금 확인이 완료되어야 최종 참가가 확정됩니다.

참가자는 대회 신청 시 팀명, 대표자명, 연락처, 참가자 명단, 생년월일, 성별, 포지션, 선출·비선출 여부 등 대회 운영에 필요한 정보를 정확히 입력해야 합니다.

참가 신청 정보가 허위로 확인되거나 참가 자격에 맞지 않는 경우, 참가 신청은 취소될 수 있으며 대회 중 확인되는 경우 해당 팀은 몰수패 또는 실격 처리될 수 있습니다.

3. 참가비 입금 안내

참가 신청 후 팀밋이 안내한 계좌로 참가비를 입금해야 합니다.

참가 신청 후 2시간 이내에 참가비 입금이 확인되지 않는 경우 해당 신청은 자동 취소됩니다.

입금자명은 신청자명 또는 팀명과 동일하게 입력하는 것을 원칙으로 합니다.

입금자명이 신청 정보와 일치하지 않아 입금 확인이 지연되는 경우, 그로 인한 신청 취소 또는 참가 제한의 책임은 신청자에게 있습니다.

참가 확정은 운영진의 입금 확인 후 최종 안내됩니다.

4. 신청 취소 및 환불 안내

참가비 입금 후 신청자의 단순 변심, 일정 착오, 팀 내부 사정, 선수 구성 실패, 개인 사정 등을 이유로 한 신청 취소는 원칙적으로 불가합니다.

참가자는 신청 전 대회 일정, 장소, 참가비, 경기 방식, 참가 자격, 환불 기준을 충분히 확인해야 합니다.

팀밋 또는 주최 측 사정으로 대회가 취소되는 경우 참가비는 100% 환불됩니다.

기상 악화, 천재지변, 시설 문제, 안전 문제, 감염병, 행정명령 등 불가피한 사유로 대회가 취소되는 경우에도 참가비는 100% 환불됩니다.

대회 취소가 결정되는 경우 팀밋은 사전에 서비스 공지, 문자, 알림톡, 이메일, 대표자 연락 등 가능한 방법으로 안내합니다.

5. 대회 연기 안내

기상 악화, 시설 사정, 안전 문제, 천재지변, 감염병, 행정명령, 운영상 불가피한 사정이 있는 경우 대회가 연기될 수 있습니다.

대회가 연기되는 경우 팀밋은 변경 일정, 장소, 운영 방식 등을 사전에 안내합니다.

대회가 연기되는 경우 참가자는 기존 대회일 기준 2주 전까지 참가 취소 및 환불을 요청할 수 있습니다.

기존 대회일 기준 2주 전이 지난 이후에는 연기된 일정에 참가하지 않더라도 환불이 제한될 수 있습니다.

연기된 일정에 참가가 어려운 경우, 참가팀은 운영진에게 팀원 변경 또는 대표자 변경 가능 여부를 문의할 수 있습니다.

6. 참가 자격 및 선수 등록

참가자는 대회별로 정해진 참가 자격을 충족해야 합니다.

참가자는 신청 시 본인의 이름, 생년월일, 성별, 선출·비선출 여부, 포지션 등 참가 자격 확인에 필요한 정보를 사실대로 제출해야 합니다.

참가자 명단은 운영진이 정한 기한 내에 제출해야 하며, 명단 제출 이후 선수 변경은 운영진의 사전 승인 하에만 가능합니다.

운영진의 승인 없이 명단에 없는 선수가 출전하는 경우 해당 팀은 몰수패 또는 실격 처리될 수 있습니다.

참가자는 본인 확인을 위해 대회 당일 신분증 또는 본인을 확인할 수 있는 자료 제출을 요청받을 수 있습니다.

7. 선출·비선출 구분 및 허위 신분 제출 금지

본 대회는 공정한 경기 운영을 위해 선출·비선출 여부를 구분하여 참가 자격을 확인할 수 있습니다.

참가자는 본인의 선수 경력, 선출 여부, 소속 이력, 대회 참가 기준과 관련된 정보를 사실대로 제출해야 합니다.

선출·비선출 구분을 피하거나 참가 자격을 충족하는 것처럼 보이기 위해 신분, 선수 이력, 이름, 생년월일, 소속, 경력 등을 허위로 제출하거나 숨기는 행위는 엄격히 금지됩니다.

대회 신청 단계 또는 대회 진행 중 신분을 속인 사실이 확인되는 경우 해당 선수는 즉시 출전 제한될 수 있으며, 해당 선수가 소속된 팀은 몰수패 또는 팀 탈락 처리될 수 있습니다.

대회 종료 후라도 허위 신분, 허위 이력, 대리 참가, 참가 자격 위반이 확인되는 경우 수상 취소, 기록 삭제, 시상 회수, 향후 팀밋 대회 참가 제한 등의 조치가 이루어질 수 있습니다.

신분을 속인 행위로 인해 다른 팀, 참가자, 운영진, 협찬사 또는 대회 운영에 손해가 발생한 경우 해당 참가자 또는 팀은 이에 대한 책임을 부담할 수 있습니다.

8. 대리 참가 및 명의 도용 금지

참가자는 반드시 본인 명의로 참가해야 합니다.

타인의 이름, 생년월일, 연락처, 계정, 선수 정보 등을 이용하여 참가 신청하거나 출전하는 행위는 금지됩니다.

대리 참가, 명의 도용, 허위 명단 제출이 확인되는 경우 해당 팀은 몰수패 또는 실격 처리될 수 있습니다.

대리 참가 또는 명의 도용이 경기 결과에 영향을 미친 경우, 운영진은 해당 경기의 결과를 무효로 처리할 수 있습니다.

9. 팀원 변경 기준

팀원 변경은 대회별로 공지된 기한 내에만 가능합니다.

팀원 변경이 필요한 경우 팀 대표자는 운영진에게 변경 사유와 변경 대상자의 정보를 전달해야 합니다.

운영진의 승인 없이 임의로 선수를 변경하거나 명단에 없는 선수를 출전시키는 것은 금지됩니다.

팀원 변경이 승인되지 않았음에도 해당 선수가 출전한 경우 해당 팀은 몰수패 또는 실격 처리될 수 있습니다.

팀원 변경 실패, 인원 부족, 개인 사정 등은 참가 취소 또는 환불 사유가 되지 않습니다.

10. 경기 진행 방식

경기 방식, 경기 시간, 휴식 시간, 교체 방식, 조 편성, 토너먼트 방식, 순위 결정 기준은 대회별 안내에 따릅니다.

참가팀은 경기 시작 전 지정된 시간까지 현장에 도착하여 출석 확인 및 경기 준비를 완료해야 합니다.

경기 시작 시간까지 운영진이 정한 최소 인원이 도착하지 않은 경우 해당 팀은 지각, 몰수패 또는 실격 처리될 수 있습니다.

경기 중 모든 참가자는 심판 및 운영진의 안내에 따라야 합니다.

심판 판정은 경기 운영상 최종 결정으로 존중되어야 하며, 과도한 항의 또는 경기 지연 행위는 제재 대상이 될 수 있습니다.

11. 노쇼 및 실격 기준

참가 확정 후 대회 당일 사전 통보 없이 불참하는 경우 노쇼로 간주합니다.

노쇼가 발생한 팀 또는 참가자는 실격 처리됩니다.

노쇼로 실격 처리된 경우 참가비는 환불되지 않습니다.

팀 단위 대회에서 팀 전체가 불참하거나 경기 진행이 불가능한 수준으로 인원이 부족한 경우 해당 팀은 실격 처리될 수 있습니다.

노쇼 이력이 있는 회원 또는 팀은 향후 팀밋 대회, 경기, 이벤트 신청이 제한될 수 있습니다.

12. 지각 및 몰수패 기준

참가팀은 대회별로 공지된 집결 시간과 경기 시작 시간을 반드시 준수해야 합니다.

사전 연락 없이 늦게 도착하여 경기 운영에 차질을 주는 경우 지각으로 간주합니다.

경기 시작 시간까지 운영진이 정한 최소 인원이 도착하지 않은 경우 해당 팀은 몰수패 처리될 수 있습니다.

반복 지각, 고의적인 경기 지연, 심판 또는 운영진의 진행 안내 불이행은 실격 사유가 될 수 있습니다.

지각, 불참, 경기 포기 등 참가자 또는 참가팀 귀책 사유로 인한 손해에 대해 팀밋은 책임을 지지 않습니다.

13. 경기 중 금지행위

참가자는 대회 중 다음 행위를 해서는 안 됩니다.

1. 폭언, 욕설, 비방, 조롱
2. 심판, 운영진, 상대팀, 관중에 대한 위협적 언행
3. 폭행 또는 물리적 충돌
4. 고의적인 위험 플레이
5. 경기 지연 행위
6. 심판 판정에 대한 과도한 항의
7. 음주 후 경기 참가
8. 허위 정보 제출
9. 대리 참가
10. 명단에 없는 선수 출전
11. 선출·비선출 여부를 속이는 행위
12. 시설물 훼손
13. 협찬사, 제휴사, 운영 부스 운영 방해
14. 대회 진행을 방해하는 행위
15. 기타 운영진이 대회 질서에 반한다고 판단하는 행위

위 행위가 확인되는 경우 운영진은 경고, 퇴장, 몰수패, 실격, 팀 탈락, 향후 대회 참가 제한 등의 조치를 할 수 있습니다.

14. 심판 판정 및 이의제기

경기 중 심판의 판정은 존중되어야 합니다.

판정에 대한 이의가 있는 경우 팀 대표자를 통해 운영진에게 전달해야 합니다.

선수 개인의 과도한 항의, 욕설, 위협, 경기 지연 행위는 제재 대상입니다.

경기 종료 후 결과에 대한 이의제기는 대회별로 정해진 시간 내에만 가능합니다.

이의제기 시 운영진은 심판 의견, 경기 상황, 기록, 현장 확인 자료 등을 종합하여 최종 판단합니다.

15. 안전 및 부상 안내

참가자는 본인의 건강 상태를 확인한 후 대회에 참가해야 합니다.

참가자는 경기 중 부상 위험이 있음을 인지하고, 무리한 플레이나 위험한 행동을 해서는 안 됩니다.

운영진은 대회 운영상 필요한 범위 내에서 구급용품, 응급처치 인력, 안전 안내 등을 준비할 수 있습니다.

경기 중 발생한 부상, 개인 질환, 참가자 간 충돌, 장비 미착용 등으로 인한 사고에 대해 팀밋은 고의 또는 중대한 과실이 없는 한 책임을 지지 않습니다.

참가자는 운영진의 안전 지시에 따라야 하며, 이를 위반하여 발생한 손해는 참가자 본인이 부담합니다.

16. 개인 장비 및 준비물

참가자는 대회 참가에 필요한 운동복, 풋살화, 보호대, 개인 음료, 개인 의약품 등 필요한 장비를 직접 준비해야 합니다.

대회별로 정강이 보호대, 풋살화, 유니폼 색상 등 필수 장비가 지정될 수 있습니다.

필수 장비를 착용하지 않아 출전이 제한되는 경우, 해당 책임은 참가자 또는 참가팀에게 있습니다.

개인 소지품 분실, 도난, 파손에 대해 팀밋은 고의 또는 중대한 과실이 없는 한 책임을 지지 않습니다.

17. 시설 이용 안내

참가자는 대회가 진행되는 시설의 이용 규칙을 준수해야 합니다.

시설 내 흡연, 음주, 쓰레기 무단 투기, 기물 파손, 무단 출입 등은 금지됩니다.

참가자 또는 동반자가 시설물을 훼손한 경우 해당 참가자 또는 팀은 손해배상 책임을 부담할 수 있습니다.

주차, 탈의실, 샤워실, 화장실, 대기 공간 등 시설 이용 가능 범위는 대회별 안내 및 현장 시설 기준에 따릅니다.

18. 사진·영상 촬영 안내

대회 현장에서는 사진, 영상, 음성 등이 촬영될 수 있습니다.

촬영 자료는 대회 기록, 결과 보고, 팀밋 서비스 홍보, SNS 콘텐츠, 홈페이지, 보도자료, 제안서, 협찬사 결과 보고 등에 활용될 수 있습니다.

촬영을 원하지 않는 참가자는 대회 시작 전 운영진에게 사전에 알려야 하며, 운영진은 합리적인 범위 내에서 이를 반영하기 위해 노력합니다.

다만 경기 장면, 단체 사진, 현장 스케치 등 특정 개인만을 분리하기 어려운 촬영물은 삭제 또는 사용 중단이 제한될 수 있습니다.

19. 협찬사 및 현장 부스 안내

대회 현장에는 협찬사, 제휴사 또는 운영 부스가 설치될 수 있습니다.

참가자는 현장 부스, 협찬 물품, 이벤트 참여 시 각 부스별 안내사항을 확인해야 합니다.

협찬 물품, 이벤트 경품, 현장 혜택은 대회 운영 상황 및 협찬사 사정에 따라 변경될 수 있습니다.

협찬사 또는 부스 운영을 방해하거나 부적절한 언행을 하는 경우 운영진은 해당 참가자에게 경고 또는 퇴장 조치를 할 수 있습니다.

20. 대회 일정 및 운영 변경

팀밋은 기상 상황, 시설 사정, 참가팀 수, 안전 문제, 운영상 필요에 따라 경기 일정, 경기 방식, 조 편성, 경기 시간, 장소, 시상 내역 등을 변경할 수 있습니다.

변경 사항이 발생하는 경우 팀밋은 서비스 공지, 문자, 알림톡, 이메일, 대표자 연락 등 가능한 방법으로 안내합니다.

참가자는 대회 전 공지사항 및 운영진 안내를 반드시 확인해야 합니다.

참가자가 공지사항을 확인하지 않아 발생한 불이익에 대해 팀밋은 책임을 지지 않습니다.

21. 수상 취소 및 기록 정정

대회 종료 후라도 허위 신분 제출, 선출·비선출 여부 허위 기재, 대리 참가, 명단 외 선수 출전, 참가 자격 위반, 경기 결과에 영향을 미친 부정행위가 확인되는 경우 운영진은 수상 취소, 기록 정정, 시상 회수, 팀 탈락 처리, 향후 대회 참가 제한 등의 조치를 할 수 있습니다.

부정행위로 인해 다른 팀의 순위 또는 시상 결과에 영향을 준 경우, 운영진은 대회 기록을 재검토하여 순위와 시상 내역을 정정할 수 있습니다.

22. 개인정보 확인 및 본인 확인

대회 운영 및 참가 자격 확인을 위해 운영진은 참가자에게 신분 확인을 요청할 수 있습니다.

본인 확인이 불가능하거나 신청 정보와 실제 참가자가 일치하지 않는 경우 출전이 제한될 수 있습니다.

참가자는 본인 확인 요청에 협조해야 하며, 정당한 사유 없이 확인을 거부하는 경우 출전 제한, 몰수패 또는 실격 처리될 수 있습니다.

23. 최종 확인

참가자는 대회 신청 전 본 규정 및 안내사항을 충분히 확인해야 합니다.

대회 신청 및 참가비 입금이 완료된 경우 참가자는 본 규정 및 안내사항에 동의한 것으로 봅니다.

본 규정에서 정하지 않은 사항은 팀밋 서비스 이용약관, 개인정보처리방침, 대회별 공지사항, 운영진의 현장 판단 및 관련 법령에 따릅니다.

회사명: 아이위(IWI)
대표자: 김봉목
개인정보 보호책임자: 김봉목
이메일: kpb880605@gmail.com
시행일: 2026년 7월 1일`,
    },
  ];
}

function getSupportDocumentSections(): LegalDocumentSection[] {
  return [
    {
      title: '고객센터',
      body: `팀밋 서비스 이용, 대회 신청, 입금 확인, 환불, 신고 및 문의가 필요한 경우 아래 연락처로 문의해 주세요.

운영사: 아이위(IWI)
대표자: 김봉목
이메일: teameetsports@naver.com

문의 가능 항목:
1. 회원가입 및 계정 문의
2. 팀 생성 및 팀 가입 문의
3. 대회 신청 및 참가 문의
4. 참가비 입금 확인 문의
5. 환불 문의
6. 노쇼, 비매너, 부정 참가 신고
7. 개인정보 관련 문의`,
    },
  ];
}

function getTournamentPolicySections(): LegalDocumentSection[] {
  return [
    {
      title: '1. 참가 신청',
      body: '대회 참가 신청은 각 대회 상세 화면에서 안내하는 참가 자격, 모집 기간, 팀 구성 기준을 충족해야 접수할 수 있습니다.',
    },
    {
      title: '2. 참가 확정',
      body: '참가 확정은 운영자가 신청 정보, 입금 여부, 참가 자격을 확인한 뒤 처리합니다. 대기 상태의 신청은 확정 참가로 간주하지 않습니다.',
    },
    {
      title: '3. 일정 및 대진',
      body: '대회 일정, 조 편성, 대진표는 운영 사정이나 기상, 시설 상황에 따라 변경될 수 있습니다. 변경 사항은 공지사항 또는 대회 상세 화면을 통해 안내합니다.',
    },
    {
      title: '4. 취소 및 환불',
      body: '취소와 환불 기준은 대회별 안내사항을 우선합니다. 이미 진행된 경기, 노쇼, 운영정책 위반으로 인한 실격은 환불이 제한될 수 있습니다.',
    },
    {
      title: '5. 제재 및 분쟁',
      body: '허위 신청, 부정 선수 등록, 폭언·폭력, 경기 운영 방해가 확인되면 경고, 몰수패, 실격, 향후 참가 제한 조치가 적용될 수 있습니다.',
    },
  ];
}

function getSupportSections(): LegalDocumentSection[] {
  return [
    {
      title: '문의 접수',
      body: '서비스 이용, 계정 제한, 대회 운영, 신고 문의는 teameetsports@naver.com 으로 접수해 주세요.',
    },
    {
      title: '처리 안내',
      body: '문의에는 계정 이메일, 발생 화면, 문제 상황, 관련 대회 또는 매치 정보를 함께 적어 주세요. 접수된 내용은 운영 확인 후 순차적으로 답변합니다.',
    },
    {
      title: '지원 범위',
      body: '현재 v1은 고객센터 티켓 생성 API를 제공하지 않습니다. 화면에서 문의 완료를 가짜로 처리하지 않으며, 이메일 접수만 안내합니다.',
    },
  ];
}

function LegalDocumentDialog({ title, sections, onClose }: { title: string; sections: LegalDocumentSection[]; onClose: () => void }) {
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(25, 31, 40, 0.32)',
        padding: '20px',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-dialog-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(100%, 480px)',
          maxHeight: '82dvh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 18,
          background: 'var(--bg)',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '18px 18px 12px',
            borderBottom: '1px solid var(--grey100)',
          }}
        >
          <h2 id="terms-dialog-title" className="tm-text-subhead" style={{ margin: 0 }}>{title}</h2>
          <button className="tm-btn tm-btn-sm tm-btn-ghost" onClick={onClose} type="button">
            닫기
          </button>
        </header>
        <div style={{ overflowY: 'auto', padding: '18px', display: 'grid', gap: 18 }}>
          {sections.map((section) => (
            <section key={section.title}>
              <h3 className="tm-text-body-lg" style={{ margin: 0 }}>{section.title}</h3>
              <p className="tm-text-caption" style={{ margin: '8px 0 0', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

function TermsCheck({ checked }: { checked: boolean }) {
  return <span className={`tm-auth-check ${checked ? 'tm-auth-check-on' : ''}`}>✓</span>;
}
