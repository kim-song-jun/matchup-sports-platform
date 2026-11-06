'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { EmailVerificationCard } from '@/components/auth/email-verification/email-verification-card';
import { PhoneVerificationCard } from '@/components/auth/phone-verification/phone-verification-card';
import {
  useV1AuthMe,
  useV1FindAccountByPhone,
  useV1FindAccountByEmail,
  useV1ResetPasswordByEmail,
} from '@/hooks/use-v1-api';
import { COMMON_PASSWORD_MESSAGE, accountPasswordIssue } from '@/lib/account-password-rules';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import { sanitizeRedirectPath } from '@/lib/session-storage';
import { usableWithdrawalDate } from '@/lib/withdrawal-grace';
import type { V1FoundAccount } from '@/types/api';
import { AUTH_NOTICE_STAGE, AuthFrame } from './auth-page';
import { AuthStepHeader } from './auth-step-header';
import { AuthStepCta } from './auth-step-cta';
import { describeFoundAccount } from './found-account-login';
import { FoundAccountWithdrawalGuide } from './found-account-withdrawal-guide';
import { RecycledNumberHelp } from './recycled-number-help';
import { formatPhone, normalizeSeparatedDigits } from './signup-profile-validation';
import styles from './account-recovery.module.css';

type Mode = 'find-id' | 'reset-password';
type FindMethod = 'phone' | 'email';
type RecoveryStep = 'purpose' | 'method' | 'identity' | 'verify' | 'result' | 'password' | 'complete';

/**
 * 인증 카드를 띄울지 정하는 가벼운 형식 확인. 최종 판정은 서버(class-validator)가 하고,
 * 여기서는 "아직 다 입력하지 않은 주소"에 카드가 먼저 튀어나오지 않게만 막는다.
 */
function looksLikeEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value.trim());
}

/** 번호로 찾은 계정이 실제로 쓰는 로그인 수단만 안내하고, 수단마다 맞는 화면으로 보낸다. */
function FoundAccountCard({ account, emailLoginHref, loginHref, onResetPassword, showRecycledNumberHelp }: {
  account: V1FoundAccount;
  emailLoginHref: string;
  loginHref: string;
  onResetPassword: () => void;
  showRecycledNumberHelp: boolean;
}) {
  const { label, value, socialNames, appleUnavailable, links } = describeFoundAccount(account, { emailLoginHref, loginHref });
  let guidance: string | null = null;
  if (!account.hasPassword) {
    guidance = socialNames
      ? `이 계정은 ${socialNames} 로그인으로 가입했어요. 가입한 방법으로 로그인해 주세요.`
      : '이 계정으로 로그인할 수 있는 방법을 확인하지 못했어요. 문의 창구로 알려 주세요.';
  } else if (socialNames) {
    guidance = `${socialNames} 로그인도 쓸 수 있어요.`;
  }

  return (
    <Card pad={16} className="tm-auth-soft-card">
      <div className="tm-text-body-lg">{label}</div>
      {value ? <div className="tm-text-heading" style={{ marginTop: 4 }}>{value}</div> : null}
      {account.withdrawalPending ? (
        <div className="tm-text-caption" style={{ marginTop: 8 }}>탈퇴를 신청한 계정이에요. 로그인하면 탈퇴를 취소할 수 있어요.</div>
      ) : null}
      {guidance ? <div className="tm-text-caption" style={{ marginTop: 8 }}>{guidance}</div> : null}
      {appleUnavailable ? <div className="tm-text-caption" style={{ marginTop: 4 }}>Apple 로그인은 iOS 앱에서 쓸 수 있어요.</div> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        {links.map((link, index) => (
          <Link
            key={link.label}
            className={`tm-btn tm-btn-lg tm-btn-block ${link.kakao ? 'tm-auth-kakao' : index === 0 ? 'tm-btn-primary' : 'tm-btn-neutral'}`}
            href={link.href}
          >
            {link.label}
          </Link>
        ))}
        {/* 이 환경에서 쓸 수 있는 로그인 버튼이 없으면 막다른 길이 되지 않게 문의 창구를 준다. */}
        {links.length === 0 ? (
          <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href="/contact">문의 창구 보기</Link>
        ) : null}
        {account.hasPassword ? (
          <Button block onClick={onResetPassword} size="sm" type="button" variant="ghost">비밀번호 재설정하기</Button>
        ) : null}
      </div>
      {showRecycledNumberHelp ? <RecycledNumberHelp variant="not-mine" spaced /> : null}
    </Card>
  );
}

export function AccountRecoveryClient({ initialMode, backHref = '/login/email', redirectPath }: {
  initialMode?: Mode;
  backHref?: string;
  redirectPath?: string | null;
}) {
  const fieldId = useId();
  const redirect = sanitizeRedirectPath(redirectPath);
  const loginHref = redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login';
  const emailLoginHref = redirect ? `/login/email?redirect=${encodeURIComponent(redirect)}` : '/login/email';
  const recoveryBackHref = backHref === '/login/email' ? emailLoginHref : backHref;
  const returnToSettings = backHref === '/my/settings';
  const currentAccount = useV1AuthMe({ enabled: returnToSettings });
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>(initialMode ?? 'find-id');
  const [step, setStep] = useState<RecoveryStep>(initialMode ? 'identity' : 'purpose');
  const [findMethod, setFindMethod] = useState<FindMethod>('phone');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [proofToken, setProofToken] = useState<string | null>(null);
  const [found, setFound] = useState<V1FoundAccount | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [emailProofToken, setEmailProofToken] = useState<string | null>(null);
  /**
   * 소셜 전용 계정이라는 사실은 사서함 주인임을 증명한 **뒤**에야 드러난다 — 요청 단계에서
   * 알려 주면 이메일 하나로 계정 종류를 훑을 수 있기 때문이다. 그래서 서버가 재설정을 막을 때
   * (PASSWORD_LOGIN_UNAVAILABLE) 비로소 세운다. 응답은 어느 제공자인지 알려 주지 않는다.
   */
  const [resetBlockedSocialOnly, setResetBlockedSocialOnly] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [resetDone, setResetDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const phoneRequestGeneration = useRef(0);
  // 같은 번호를 다시 입력해도 새 카드를 렌더해 이전 OTP의 늦은 완료 상태를 분리한다.
  const [phoneFlowGeneration, setPhoneFlowGeneration] = useState(0);
  const emailRequestGeneration = useRef(0);
  // 정규화 주소가 같아도 실제 입력을 고치면 이전 인증 카드와 저장 응답을 분리한다.
  const [emailFlowGeneration, setEmailFlowGeneration] = useState(0);

  useEffect(() => {
    mounted.current = true;
    setReady(true);
    return () => { mounted.current = false; };
  }, []);

  const findAccount = useV1FindAccountByPhone();
  const findAccountByEmail = useV1FindAccountByEmail();
  const resetPasswordByEmail = useV1ResetPasswordByEmail();

  const normalizedEmail = emailInput.trim().toLowerCase();
  const accountPhone = currentAccount.data?.user.phone ?? '';
  const accountEmail = currentAccount.data?.user.email ?? '';
  useEffect(() => {
    if (!returnToSettings) return;
    phoneRequestGeneration.current += 1;
    setPhoneFlowGeneration(phoneRequestGeneration.current);
    emailRequestGeneration.current += 1;
    setEmailFlowGeneration(emailRequestGeneration.current);
    setPhoneDigits(normalizeSeparatedDigits(accountPhone));
    setEmailInput(accountEmail);
    setProofToken(null);
    setFound(null);
    setEmailProofToken(null);
    setResetDone(false);
  }, [returnToSettings, accountPhone, accountEmail]);

  // 앞 단계에서 받은 증명·결과를 버린다 — 남겨 두면 "다른 방법으로 인증했는데 이 화면이
  // 이미 인증된 것처럼 보이는" 상태가 된다.
  const resetProgress = () => {
    phoneRequestGeneration.current += 1;
    setPhoneFlowGeneration(phoneRequestGeneration.current);
    emailRequestGeneration.current += 1;
    setEmailFlowGeneration(emailRequestGeneration.current);
    setProofToken(null);
    setFound(null);
    setEmailProofToken(null);
    setResetBlockedSocialOnly(false);
    setNewPassword('');
    setPasswordConfirm('');
    setResetDone(false);
    setError(null);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    resetProgress();
    setStep(next === 'find-id' ? 'method' : 'identity');
  };

  const switchFindMethod = (next: FindMethod) => {
    if (next === findMethod) return;
    setFindMethod(next);
    resetProgress();
  };

  const onPhoneVerified = async (token?: string) => {
    // 인증 중 번호/방법이 바뀌거나 화면을 떠나면 이전 카드의 증명으로 조회를 시작하지 않는다.
    if (!token || !mounted.current || mode !== 'find-id' || findMethod !== 'phone' || phoneFlowGeneration !== phoneRequestGeneration.current) return;
    const lookupGeneration = ++phoneRequestGeneration.current;
    setPhoneFlowGeneration(lookupGeneration);
    setProofToken(token);
    setError(null);
    try {
      const account = await findAccount.mutateAsync({ phone: phoneDigits, proofToken: token });
      if (!mounted.current || lookupGeneration !== phoneRequestGeneration.current) return;
      setFound(account);
      setStep('result');
    } catch (err) {
      if (!mounted.current || lookupGeneration !== phoneRequestGeneration.current) return;
      setFound(null);
      setError(extractErrorMessage(err, '계정을 찾지 못했어요.'));
    }
  };

  const onEmailVerified = async (token?: string) => {
    if (!token || !mounted.current || emailFlowGeneration !== emailRequestGeneration.current) return;
    setEmailProofToken(token);
    setError(null);
    if (mode === 'reset-password') {
      if (!returnToSettings || (currentAccount.data && normalizedEmail === accountEmail.trim().toLowerCase())) setStep('password');
      return;
    }
    if (findMethod !== 'email') return;
    const lookupGeneration = emailRequestGeneration.current;
    try {
      const account = await findAccountByEmail.mutateAsync({ email: normalizedEmail, proofToken: token });
      if (!mounted.current || lookupGeneration !== emailRequestGeneration.current) return;
      setFound(account);
      setStep('result');
    } catch (err) {
      if (!mounted.current || lookupGeneration !== emailRequestGeneration.current) return;
      setFound(null);
      if (extractErrorCode(err) === 'EMAIL_NOT_VERIFIED') {
        emailRequestGeneration.current += 1;
        setEmailFlowGeneration(emailRequestGeneration.current);
        setEmailProofToken(null);
      }
      setError(extractErrorMessage(err, '계정을 찾지 못했어요.'));
    }
  };

  const resetting = resetPasswordByEmail.isPending;
  // 날짜를 모르거나 이미 지났으면 일반 결과 카드다 — 그 계정으로 로그인해도 403 이 탈퇴 취소 화면으로 이어 준다.
  const withdrawalGraceEnd = found ? usableWithdrawalDate(found.withdrawalPendingUntil) : null;

  // 본인 확인을 마쳤고 아직 비밀번호를 못 바꾼 상태에서만 새 비밀번호 입력을 띄운다.
  const verifiedForReset = Boolean(emailProofToken);
  const matchesCurrentAccount = !returnToSettings || Boolean(currentAccount.data
    && normalizedEmail && normalizedEmail === accountEmail.trim().toLowerCase());
  const passwordFormVisible = mode === 'reset-password' && verifiedForReset && matchesCurrentAccount && !resetBlockedSocialOnly && !resetDone;
  const passwordIssue = accountPasswordIssue(newPassword);
  const passwordReady = passwordIssue === null && newPassword === passwordConfirm;

  const submitReset = async () => {
    if (!mounted.current || mode !== 'reset-password' || emailFlowGeneration !== emailRequestGeneration.current
      || !passwordReady || resetting || !matchesCurrentAccount || !emailProofToken || resetBlockedSocialOnly) return;
    const resetGeneration = emailFlowGeneration;
    setError(null);
    try {
      await resetPasswordByEmail.mutateAsync({ email: normalizedEmail, proofToken: emailProofToken, newPassword });
      if (!mounted.current || resetGeneration !== emailRequestGeneration.current) return;
      setResetDone(true);
      setStep('complete');
    } catch (err) {
      if (!mounted.current || resetGeneration !== emailRequestGeneration.current) return;
      if (extractErrorCode(err) === 'PASSWORD_LOGIN_UNAVAILABLE') {
        setResetBlockedSocialOnly(true);
        setStep('result');
        return;
      }
      setError(extractErrorMessage(err, '비밀번호를 바꾸지 못했어요.'));
    }
  };

  const flow: RecoveryStep[] = mode === 'find-id'
    ? ['purpose', 'method', 'identity', 'verify', 'result']
    : ['purpose', 'identity', 'verify', 'password', 'complete'];
  const visibleFlow = initialMode ? flow.filter((item) => item !== 'purpose') : flow;
  const progressStep = mode === 'reset-password' && step === 'result' ? 'password' : step;
  const progressIndex = Math.max(0, visibleFlow.indexOf(progressStep));
  const phoneFlow = mode === 'find-id' && findMethod === 'phone';
  const titles: Record<RecoveryStep, { title: string; sub?: string }> = {
    purpose: { title: '어떤 도움이 필요하세요?', sub: '찾을 항목을 선택해 주세요.' },
    method: { title: '어떤 방법으로 확인할까요?', sub: '가입할 때 등록한 방법을 선택해 주세요.' },
    identity: phoneFlow
      ? { title: '휴대폰 번호를 입력해 주세요', sub: '인증번호를 보내 본인인지 확인할게요.' }
      : { title: '가입한 이메일을 입력해 주세요', sub: '이메일로 인증번호를 보내드려요.' },
    verify: { title: '인증번호를 확인해 주세요', sub: phoneFlow ? '입력한 휴대폰으로 인증번호를 받아 주세요.' : '입력한 이메일로 인증번호를 받아 주세요.' },
    result: mode === 'find-id'
      ? { title: '가입한 방법을 찾았어요', sub: '확인한 로그인 방법으로 계속해 주세요.' }
      : { title: '로그인 방법을 확인해 주세요' },
    password: { title: '새 비밀번호를 정해 주세요', sub: '8자 이상으로 입력해 주세요.' },
    complete: { title: '비밀번호를 바꿨어요', sub: returnToSettings ? '현재 계정의 비밀번호를 바꿨어요.' : '새 비밀번호로 로그인해 주세요.' },
  };
  const firstStep = step === 'purpose' || Boolean(initialMode === mode && step === 'identity');
  const previousStep = () => {
    resetProgress();
    if (step === 'method') setStep('purpose');
    else if (step === 'identity') setStep(mode === 'find-id' ? 'method' : 'purpose');
    else setStep('identity');
  };
  const nextDisabled = !ready || (step === 'identity' && (phoneFlow ? phoneDigits.length !== 11 : !looksLikeEmail(emailInput)));
  const next = () => {
    if (step === 'purpose') switchMode(mode);
    else if (step === 'method') setStep('identity');
    else if (step === 'identity' && !nextDisabled) setStep('verify');
  };
  const fixedAction = ['purpose', 'method', 'identity'].includes(step)
    ? <AuthStepCta action={{ label: '다음', disabled: nextDisabled, loading: !ready, onClick: next }} hint={ready ? null : '화면을 준비하고 있어요.'} />
    : undefined;

  return (
    <AuthFrame
      topTitle={returnToSettings ? '비밀번호 변경' : '계정 찾기'}
      backHref={firstStep ? recoveryBackHref : undefined}
      onBack={firstStep ? undefined : previousStep}
      backLabel={firstStep ? undefined : '이전 단계'}
      appBack={returnToSettings}
      fixedAction={fixedAction}
      stage={AUTH_NOTICE_STAGE}
    >
      <div className="tm-auth-body">
        <AuthStepHeader name="계정 찾기" steps={visibleFlow} index={progressIndex} title={titles[step].title} sub={titles[step].sub} focusOnChange />

        {step === 'purpose' ? (
          <div className={styles.choiceGroup} role="group" aria-label="찾을 항목">
            <button className={styles.choice} type="button" disabled={!ready} aria-pressed={mode === 'find-id'} onClick={() => setMode('find-id')}>아이디·로그인 방법 찾기</button>
            <button className={styles.choice} type="button" disabled={!ready} aria-pressed={mode === 'reset-password'} onClick={() => setMode('reset-password')}>비밀번호 재설정</button>
          </div>
        ) : null}

        {step === 'method' ? (
          <div className={styles.choiceGroup} role="group" aria-label="본인 확인 방법">
            <button className={styles.choice} type="button" disabled={!ready} aria-pressed={findMethod === 'phone'} onClick={() => switchFindMethod('phone')}>휴대폰으로 찾기</button>
            <button className={styles.choice} type="button" disabled={!ready} aria-pressed={findMethod === 'email'} onClick={() => switchFindMethod('email')}>이메일로 찾기</button>
          </div>
        ) : null}

        {returnToSettings && currentAccount.isError ? (
          <Card pad={16} className="tm-auth-soft-card-error"><div role="alert">{extractErrorMessage(currentAccount.error, '계정 정보를 확인하지 못했어요. 설정에서 다시 시도해 주세요.')}</div></Card>
        ) : verifiedForReset && !matchesCurrentAccount ? (
          <Card pad={16} className="tm-auth-soft-card-error"><div role="alert">로그인한 계정의 이메일로 본인인증해 주세요.</div></Card>
        ) : null}

        <div className="tm-auth-form">
          {step === 'identity' && phoneFlow ? (
            <label className="tm-auth-field" htmlFor={`${fieldId}-phone`}>
              <span className="tm-text-label">휴대폰 번호</span>
              <input id={`${fieldId}-phone`} className="tm-input tm-auth-input" disabled={!ready} inputMode="numeric" placeholder="010-0000-0000" value={formatPhone(phoneDigits)} onChange={(event) => {
                resetProgress();
                setPhoneDigits(normalizeSeparatedDigits(event.target.value));
              }} />
            </label>
          ) : null}

          {step === 'identity' && !phoneFlow ? (
            <label className="tm-auth-field" htmlFor={`${fieldId}-email`}>
              <span className="tm-text-label">이메일</span>
              <input id={`${fieldId}-email`} autoComplete="email" className="tm-input tm-auth-input" disabled={!ready} inputMode="email" placeholder="you@example.com" type="email" value={emailInput} onChange={(event) => {
                resetProgress();
                setEmailInput(event.target.value);
              }} />
            </label>
          ) : null}

          {step === 'verify' && phoneFlow && !proofToken ? (
            <PhoneVerificationCard key={phoneFlowGeneration} mode="public" purpose="password_reset" surface="plain" phone={phoneDigits} onVerified={(token) => void onPhoneVerified(token)} />
          ) : null}
          {step === 'verify' && !phoneFlow && !emailProofToken ? (
            <>
              <EmailVerificationCard key={emailFlowGeneration} email={normalizedEmail} surface="plain" onVerified={(token) => void onEmailVerified(token)} />
              <p className="tm-text-caption" style={{ margin: 0 }}>가입된 이메일이면 인증번호를 보내드려요. 메일이 오지 않으면 주소를 다시 확인하거나 스팸함을 확인해 주세요.</p>
            </>
          ) : null}
          {step === 'verify' && (findAccount.isPending || findAccountByEmail.isPending) ? (
            <p className="tm-text-body" role="status">가입한 로그인 방법을 확인하고 있어요.</p>
          ) : null}

          {step === 'result' && found && mode === 'find-id' ? (
            withdrawalGraceEnd !== null ? (
              <FoundAccountWithdrawalGuide account={found} until={withdrawalGraceEnd} emailLoginHref={emailLoginHref} loginHref={loginHref} />
            ) : (
              <FoundAccountCard account={found} emailLoginHref={emailLoginHref} loginHref={loginHref} onResetPassword={() => switchMode('reset-password')} showRecycledNumberHelp={findMethod === 'phone'} />
            )
          ) : null}

          {step === 'result' && mode === 'reset-password' && resetBlockedSocialOnly ? (
            <Card pad={16} className="tm-auth-soft-card">
              <div className="tm-text-body-lg" role="alert">비밀번호가 없는 계정이에요</div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>카카오나 Apple 같은 소셜 로그인으로 가입해서 바꿀 비밀번호가 없어요. 가입한 방법으로 로그인해 주세요.</div>
              <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href={loginHref} style={{ marginTop: 16 }}>로그인 화면으로</Link>
            </Card>
          ) : null}

          {step === 'password' && passwordFormVisible ? (
            <>
              <label className="tm-auth-field" htmlFor={`${fieldId}-password`}>
                <span className="tm-text-label">새 비밀번호</span>
                <input id={`${fieldId}-password`} className="tm-input tm-auth-input" onChange={(event) => setNewPassword(event.target.value)} placeholder="8자 이상" type="password" value={newPassword} />
                {passwordIssue === 'too_common' ? <span className="tm-text-caption tm-auth-field-helper-error" role="alert">{COMMON_PASSWORD_MESSAGE}</span> : null}
              </label>
              <label className="tm-auth-field" htmlFor={`${fieldId}-password-confirm`}>
                <span className="tm-text-label">새 비밀번호 확인</span>
                <input id={`${fieldId}-password-confirm`} className="tm-input tm-auth-input" onChange={(event) => setPasswordConfirm(event.target.value)} placeholder="비밀번호 다시 입력" type="password" value={passwordConfirm} />
                {passwordConfirm.length > 0 && newPassword !== passwordConfirm ? <span className="tm-text-caption tm-auth-field-helper-error" role="alert">비밀번호가 일치하지 않아요.</span> : null}
              </label>
              <Button block disabled={!passwordReady} loading={resetting} onClick={() => void submitReset()} size="lg" type="button" variant={passwordReady ? 'primary' : 'neutral'}>비밀번호 바꾸기</Button>
            </>
          ) : null}

          {step === 'complete' && resetDone ? (
            <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href={returnToSettings ? backHref : emailLoginHref}>
              {returnToSettings ? '계정 설정으로 돌아가기' : '로그인하러 가기'}
            </Link>
          ) : null}

          {error ? (
            <Card pad={16} className="tm-auth-soft-card tm-auth-soft-card-error">
              <div className="tm-text-body-lg">계정을 확인하지 못했어요</div>
              <div className="tm-text-caption" role="alert">{error}</div>
              {step === 'verify' && mode === 'find-id' && findMethod === 'email' && emailProofToken ? (
                <Button type="button" variant="neutral" size="sm" loading={findAccountByEmail.isPending} onClick={() => void onEmailVerified(emailProofToken)}>다시 확인하기</Button>
              ) : null}
              {step === 'verify' && phoneFlow && proofToken ? (
                <Button type="button" variant="neutral" size="sm" loading={findAccount.isPending} onClick={() => void onPhoneVerified(proofToken)}>다시 확인하기</Button>
              ) : null}
            </Card>
          ) : null}
        </div>

        {(!returnToSettings && step === 'identity') || (step === 'result' && mode === 'find-id' && withdrawalGraceEnd !== null && found?.hasPassword) ? (
          <div className={styles.alternative}>
            <span>{mode === 'find-id' ? '비밀번호를 잊으셨나요?' : '가입한 로그인 방법이 궁금하신가요?'}</span>
            <button type="button" disabled={!ready} onClick={() => switchMode(mode === 'find-id' ? 'reset-password' : 'find-id')}>
              {mode === 'find-id' ? '비밀번호 재설정' : '로그인 방법 찾기'}
            </button>
          </div>
        ) : null}
      </div>
    </AuthFrame>
  );
}
