'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRightIcon } from '@/components/v1-ui/icons';
import { TermsDocumentSubtitleAndCard } from '@/components/auth/terms-document-body';
import { Button } from '@/components/v1-ui/button';
import {
  useV1AcceptSignupTerms,
  useV1CompleteSocialTerms,
  useV1CurrentSignupTerms,
  useV1CurrentTerms,
} from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { trackEvent } from '@/lib/analytics';
import { resolveAuthContinuationPath, sanitizeRedirectPath } from '@/lib/session-storage';
import { saveSignupTermsDocumentIds } from '@/lib/signup-terms-storage';
import { AUTH_WELCOME_STAGE, AuthFrame } from './auth-page';
import { getTermsViewModel } from './auth.view-model';
import { useSocialSignupExit } from './use-social-signup-exit';
import { extractErrorMessage } from '@/lib/error-message';

const AGREEMENT_TITLE_STYLE = { fontSize: 15, lineHeight: '20px', overflowWrap: 'anywhere' } as const;

export function TermsClient() {
  const model = getTermsViewModel();
  const router = useRouter();
  const searchParams = useSearchParams();
  const socialTerms = useV1CompleteSocialTerms();
  const acceptTerms = useV1AcceptSignupTerms();
  // 이 화면의 가입 그만두기 출구는 social 모드에만 있고, 그 모드는 약관 미동의 가입 대기 계정만 들어온다.
  const exitFlow = useSocialSignupExit({ onboardingStatus: 'social_terms_required' });
  const mode = searchParams.get('mode');
  const document = searchParams.get('document');
  const isSocialMode = mode === 'social';
  // 쿼리가 하나도 없는 /terms 는 외부 유입(북마크·검색엔진·공유 링크)의 도착지다.
  // 가입 동의 단계는 ?mode=signup 으로 명시하므로, mode 도 document 도 없으면 이 화면은
  // 읽으러 온 사람의 것이다.
  const wantsPublicDocument = !document && !mode;
  const currentTerms = useV1CurrentSignupTerms({ enabled: !document });
  const footerTerms = useV1CurrentTerms('footer', {
    enabled: Boolean(document) || wantsPublicDocument,
  });
  const isRenewalMode = mode === 'renewal'
    || (!isSocialMode && currentTerms.data?.compliance?.compliant === false);
  const [checkedByDocumentId, setCheckedByDocumentId] = useState<Record<string, boolean>>({});
  const [openByDocumentId, setOpenByDocumentId] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  // 서버 약관 문서가 아니라 소셜 가입 전용 로컬 확인 — ageConfirmed 로 따로 전송한다.
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  const agreements = useMemo(() => currentTerms.data?.items ?? [], [currentTerms.data?.items]);
  const requiredAgreements = agreements.filter((agreement) => agreement.requirement === 'required');
  const requiredAccepted = requiredAgreements.length > 0
    && requiredAgreements.every(
      (agreement) => agreement.accepted || checkedByDocumentId[agreement.documentId],
    )
    && (!isSocialMode || ageConfirmed);
  // 전체 동의는 선택 항목까지 포함한다. 그래서 버튼의 켜짐 상태도 필수만이 아니라
  // 모든 항목 기준이어야 한다 — 필수 기준으로 두면 선택 하나를 해제해도 버튼이 켜진 채라
  // 실제 상태와 어긋난다. 이미 동의한 항목(accepted)은 체크된 것으로 센다.
  const allChecked = agreements.length > 0
    && agreements.every(
      (agreement) => agreement.accepted || checkedByDocumentId[agreement.documentId],
    )
    && (!isSocialMode || ageConfirmed);
  const lastRequiredDocumentId = requiredAgreements[requiredAgreements.length - 1]?.documentId;

  useEffect(() => {
    if (!currentTerms.data) return;
    setCheckedByDocumentId((current) =>
      Object.fromEntries(
        currentTerms.data.items.map((item) => [
          item.documentId,
          item.accepted || current[item.documentId] || false,
        ]),
      ),
    );
  }, [currentTerms.data]);

  /**
   * 전체 동의 — 필수와 선택을 함께 켜고 끈다. 선택 항목은 각 카드에서 개별로 다시 해제할 수
   * 있고, 제출 게이트(requiredAccepted)는 여전히 필수 항목만 본다. 즉 선택을 꺼도 가입은
   * 막히지 않는다.
   */
  const setAllAgreements = (checked: boolean) => {
    if (isSocialMode) setAgeConfirmed(checked);
    setCheckedByDocumentId((current) => ({
      ...current,
      ...Object.fromEntries(
        agreements
          .filter((agreement) => !agreement.accepted)
          .map((agreement) => [agreement.documentId, checked]),
      ),
    }));
  };

  const toggleAgreement = (documentId: string, nextChecked: boolean) => {
    setCheckedByDocumentId((current) => ({ ...current, [documentId]: nextChecked }));
  };

  useEffect(() => {
    if (!isRenewalMode || document) return undefined;
    const renewalUrl = window.location.href;
    window.history.pushState({ termsRenewal: true }, '', renewalUrl);
    const preventBack = () => {
      window.history.pushState({ termsRenewal: true }, '', renewalUrl);
    };
    window.addEventListener('popstate', preventBack);
    return () => window.removeEventListener('popstate', preventBack);
  }, [document, isRenewalMode]);

  const continueAfterRenewal = (nextRoute?: string | null) => {
    router.replace(resolveAuthContinuationPath(nextRoute, searchParams.get('redirect')));
  };

  const continueToSignup = () => {
    if (!requiredAccepted) {
      return;
    }
    // 로딩 중 재클릭 시 중복 제출 방지 — isPending 은 disabled 속성과 동일하게 리렌더
    // 이후에나 반영되는 값이라 동시 클릭까지 막지는 못하지만, 스피너가 보이는 동안의
    // 재클릭은 막는다(동시 클릭 방지가 필요하면 ref 락을 따로 둔다).
    if (socialTerms.isPending || acceptTerms.isPending) return;

    setError(null);
    const acceptedTermsDocumentIds = agreements
      .filter((agreement) => agreement.accepted || checkedByDocumentId[agreement.documentId])
      .map((agreement) => agreement.documentId);
    if (isSocialMode) {
      socialTerms.mutate(
        { requiredTermsAccepted: true, acceptedTermsDocumentIds, ageConfirmed: true },
        {
          onSuccess: (result) => router.replace(result.next.route),
          onError: (nextError) => {
            if (nextError instanceof V1ApiError && nextError.code === 'SOCIAL_SIGNUP_EXPIRED') {
              setError('가입 가능 시간이 지났어요. 카카오 로그인부터 다시 시작해 주세요.');
              return;
            }

            setError(extractErrorMessage(nextError, '약관 동의를 저장하지 못했어요.'));
          },
        },
      );
      return;
    }

    if (isRenewalMode) {
      const documentIds = agreements
        .filter((agreement) => !agreement.accepted && checkedByDocumentId[agreement.documentId])
        .map((agreement) => agreement.documentId);
      if (documentIds.length === 0) {
        continueAfterRenewal(currentTerms.data?.compliance?.compliant === false
          ? currentTerms.data.compliance.nextRoute ?? '/terms?mode=renewal' : null);
        return;
      }
      acceptTerms.mutate(
        { documentIds },
        {
          onSuccess: (result) => continueAfterRenewal(result?.compliance?.compliant === false
            ? result.compliance.nextRoute ?? '/terms?mode=renewal' : null),
          onError: (nextError) =>
            setError(extractErrorMessage(nextError, '약관 동의를 저장하지 못했어요.')),
        },
      );
      return;
    }

    trackEvent('sign_up_start', { method: 'email' });
    saveSignupTermsDocumentIds(acceptedTermsDocumentIds);
    router.push('/signup');
  };

  // 재동의 대상(compliance=false)은 예외로 남긴다 — pending-social-signup-gate 는 /terms 에서
  // 리다이렉트를 걸지 않으므로(무한 루프 방지) 이 화면이 재동의 게이트를 직접 맡는다.
  // 로딩 중에는 compliant 가 undefined 라 본문을 먼저 보여주고, 비준수로 확인되면 게이트로
  // 넘어간다 — 흔한 쪽(읽으러 온 방문자)을 기다리게 하지 않기 위해서다.
  const showPublicTerms =
    wantsPublicDocument && currentTerms.data?.compliance?.compliant !== false;
  const legalDocument = resolveLegalDocument(document ?? (showPublicTerms ? 'terms' : null));
  if (legalDocument) {
    const codeByDocument: Record<LegalDocumentKey, string> = {
      terms: 'footer_service_terms',
      privacy: 'privacy_policy',
      location: 'location_terms',
      'tournament-policy': 'tournament_policy',
      support: 'support',
    };
    const managedDocument = footerTerms.data?.items.find(
      (item) => item.code === codeByDocument[legalDocument.key],
    );

    return (
      // topTitle is a static breadcrumb-style label (every other AuthFrame consumer follows
      // this — "이메일 로그인", "계정 찾기", "회원가입" — distinct from the h1 below). Reusing
      // the document's own title here duplicated it: AuthFrame renders topTitle in both the
      // mobile topbar and the desktop nav, and the h1 (unlike topTitle) is never hidden at
      // either width, so a matching value doubled the same text on screen.
      <AuthFrame topTitle="약관" backHref={sanitizeRedirectPath(searchParams.get('from')) ?? '/login'} appBack={Boolean(sanitizeRedirectPath(searchParams.get('from')))}>
        <div className="tm-auth-body">
          <h1 className="tm-text-heading tm-auth-heading">{managedDocument?.title ?? legalDocument.title}</h1>
          {footerTerms.isPending ? <p className="tm-text-body tm-auth-sub">약관을 불러오고 있어요.</p> : null}
          {footerTerms.isError || (footerTerms.data && !managedDocument) ? (
            <div className="tm-auth-soft-card tm-auth-soft-card-error">
              <div className="tm-text-body-lg">현재 약관을 불러오지 못했어요</div>
              <div className="tm-text-caption">잠시 후 다시 시도해 주세요.</div>
            </div>
          ) : null}
          {managedDocument ? (
            <TermsDocumentSubtitleAndCard
              subtitle={managedDocument.subtitle}
              content={managedDocument.content}
            />
          ) : null}
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      stage={AUTH_WELCOME_STAGE}
      topTitle="약관 동의"
      // social 모드는 가입이 끝날 때까지 게이트가 다른 경로를 전부 되돌리므로, 단순 이동 링크
      // 대신 "가입 그만두기(로그아웃)" 출구를 준다. renewal(기존 회원 재동의)은 성격이 달라
      // 이번 변경 범위에서 제외한다 — 여전히 backHref 없음.
      backHref={isSocialMode || isRenewalMode ? undefined : model.backHref}
      onBack={isSocialMode ? () => void exitFlow.exit() : undefined}
      backLabel={isSocialMode ? '가입 그만두기' : undefined}
      fixedAction={
        <>
          {!isRenewalMode && (mode === 'signup' || isSocialMode) ? (
            <p className="tm-text-caption" style={{ color: 'var(--text-caption)', margin: '0 0 var(--spacing-3)' }}>
              <span style={{ display: 'block' }}>경기 기록은 닉네임으로 기본 공개돼요.</span>
              <span style={{ display: 'block' }}>공개 여부는 가입 후 설정에서 변경할 수 있어요.</span>
            </p>
          ) : null}
          <Button
            block
            disabled={!currentTerms.data?.ready || !requiredAccepted}
            loading={currentTerms.isPending || socialTerms.isPending || acceptTerms.isPending}
            onClick={continueToSignup}
            size="lg"
            type="button"
            variant="primary"
          >
            {requiredAccepted
              ? isRenewalMode
                ? '동의하고 계속하기'
                : model.primary.label
              : '필수 약관에 동의해 주세요'}
          </Button>
        </>
      }
    >
      <div className="tm-auth-body" style={{ paddingBottom: 112 }}>
        <h1 className="tm-text-heading tm-auth-heading">
          {isRenewalMode ? '새 필수 약관을 확인해 주세요' : model.title}
        </h1>
        <p className="tm-text-body tm-auth-sub">
          {isRenewalMode
            ? '기존에 동의한 약관은 그대로 유지돼요. 새로 추가되거나 재동의가 필요한 항목만 확인하면 돼요.'
            : model.sub}
        </p>
        {currentTerms.isPending ? (
          <div className="tm-auth-soft-card"><div className="tm-text-caption">현재 약관을 불러오고 있어요.</div></div>
        ) : null}
        {currentTerms.isError ? (
          <div className="tm-auth-soft-card tm-auth-soft-card-error">
            <div className="tm-text-body-lg">현재 약관을 불러오지 못했어요</div>
            <div className="tm-text-caption">잠시 후 다시 시도해 주세요.</div>
          </div>
        ) : null}
        {currentTerms.data && !currentTerms.data.ready ? (
          <div className="tm-auth-soft-card tm-auth-soft-card-error">
            <div className="tm-text-body-lg">필수 약관이 준비되지 않았어요</div>
            <div className="tm-text-caption">운영자에게 문의해 주세요.</div>
          </div>
        ) : null}
        {error ? (
          <div className="tm-auth-soft-card tm-auth-soft-card-error">
            <div className="tm-text-body-lg">약관을 저장하지 못했어요</div>
            <div className="tm-text-caption">{error}</div>
          </div>
        ) : null}
        <button className="tm-card tm-auth-agree-all tm-auth-agree-button tm-pressable" onClick={() => setAllAgreements(!allChecked)} type="button" aria-pressed={allChecked}>
          <TermsCheck checked={allChecked} />
          <span style={{ display: 'grid', gap: 3 }}>
            <span className="tm-text-body-lg">전체 동의</span>
            <span className="tm-text-caption">선택 항목을 포함해 모두 동의해요. 선택 항목은 따로 해제할 수 있어요.</span>
          </span>
        </button>
        <div className="tm-auth-stack">
          {agreements.map((item) => {
            const checked = item.accepted || checkedByDocumentId[item.documentId];
            const open = openByDocumentId[item.documentId] ?? false;

            return (
              <Fragment key={item.documentId}>
              <div className="tm-card tm-auth-agreement-card">
                <div className="tm-auth-agreement">
                  <button
                    aria-label={`${item.title} 체크`}
                    aria-pressed={checked}
                    className="tm-auth-check-button tm-pressable"
                    disabled={item.accepted}
                    onClick={() => toggleAgreement(item.documentId, !checked)}
                    type="button"
                  >
                    <TermsCheck checked={checked} />
                  </button>
                  <button
                    className="tm-auth-agreement-main tm-pressable"
                    onClick={() => {
                      if (!item.accepted) toggleAgreement(item.documentId, !checked);
                    }}
                    type="button"
                  >
                    <span
                      className="tm-text-body-lg"
                      style={AGREEMENT_TITLE_STYLE}
                    >
                      {item.title} ({item.requirement === 'required' ? '필수' : '선택'})
                    </span>
                    {item.subtitle ? (
                      <span className="tm-text-label" style={{ lineHeight: '20px' }}>
                        {item.subtitle}
                      </span>
                    ) : null}
                    {isRenewalMode && item.requiresAction && item.changeSummary ? (
                      <span className={'tm-text-caption'} style={{ lineHeight: '20px' }}>
                        이번 변경: {item.changeSummary}
                      </span>
                    ) : null}
                    {/* 문서 버전('v1')과 '새 동의 필요'·'동의 완료' 상태 문구는 표시하지 않는다 —
                        내부 표기라 사용자에게 의미가 없고, 이미 동의한 항목은 체크가 켜진 채
                        비활성이라 상태가 체크박스로 드러난다. */}
                  </button>
                  <button
                    aria-expanded={open}
                    aria-label={`${item.title} 내용 보기`}
                    className="tm-auth-agreement-arrow tm-pressable"
                    onClick={() => {
                      setOpenByDocumentId((current) => ({ ...current, [item.documentId]: !open }));
                    }}
                    type="button"
                  >
                    <ChevronRightIcon size={16} strokeWidth={2} />
                  </button>
                </div>
                {open ? (
                  <div className="tm-auth-agreement-detail">
                    <div className="tm-text-caption" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{item.content}</div>
                  </div>
                ) : null}
              </div>
              {isSocialMode && item.documentId === lastRequiredDocumentId ? (
                <div className="tm-card tm-auth-agreement-card">
                  <div className="tm-auth-agreement">
                    <button
                      aria-label="만 14세 이상이에요 체크"
                      aria-pressed={ageConfirmed}
                      className="tm-auth-check-button tm-pressable"
                      onClick={() => setAgeConfirmed((current) => !current)}
                      type="button"
                    >
                      <TermsCheck checked={ageConfirmed} />
                    </button>
                    <button
                      className="tm-auth-agreement-main tm-pressable"
                      onClick={() => setAgeConfirmed((current) => !current)}
                      type="button"
                    >
                      <span
                        className="tm-text-body-lg"
                        style={AGREEMENT_TITLE_STYLE}
                      >
                        만 14세 이상이에요 (필수)
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}
              </Fragment>
            );
          })}
        </div>
        {exitFlow.error ? (
          <div className="tm-text-caption tm-auth-field-helper-error" role="alert">{exitFlow.error}</div>
        ) : null}
      </div>
      {exitFlow.ConfirmModal}
    </AuthFrame>
  );
}

type LegalDocumentKey = 'terms' | 'privacy' | 'location' | 'tournament-policy' | 'support';

type LegalDocument = {
  key: LegalDocumentKey;
  title: string;
};

// 본문은 서버가 내려 주는 약관 문서를 쓰고, 이 제목은 문서를 불러오는 동안 보여 주는 값이다.
const LEGAL_DOCUMENT_TITLES = {
  terms: '서비스 이용약관',
  privacy: '개인정보처리방침',
  location: '위치기반서비스 이용약관',
  'tournament-policy': '대회 운영정책',
  support: '고객센터',
} satisfies Record<LegalDocumentKey, string>;

function resolveLegalDocument(document: string | null): LegalDocument | null {
  if (!document || !isLegalDocumentKey(document)) return null;
  return { key: document, title: LEGAL_DOCUMENT_TITLES[document] };
}

function isLegalDocumentKey(value: string): value is LegalDocumentKey {
  return value === 'terms' || value === 'privacy' || value === 'location' || value === 'tournament-policy' || value === 'support';
}

// 체크 표시는 동의했을 때만 그린다 — 미동의 원 안에 회색 ✓ 가 남으면 이미 동의한 것으로 읽힌다.
function TermsCheck({ checked }: { checked: boolean }) {
  return (
    <span className={`tm-auth-check ${checked ? 'tm-auth-check-on' : ''}`} aria-hidden="true">
      {checked ? '✓' : null}
    </span>
  );
}
