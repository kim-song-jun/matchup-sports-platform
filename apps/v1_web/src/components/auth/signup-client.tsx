'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/v1-ui/primitives';
import { useV1Register } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { saveStoredV1Session } from '@/lib/session-storage';
import { readSignupTermsAccepted } from '@/lib/signup-terms-storage';
import { AuthFrame } from './auth-page';
import { getSignupFormViewModel } from './auth.view-model';

type SignupFieldErrors = Partial<Record<'nickname' | 'email' | 'password' | 'passwordConfirm' | 'terms', string>>;

export function SignupClient() {
  const model = getSignupFormViewModel();
  const router = useRouter();
  const register = useV1Register();
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [requiredTermsAccepted, setRequiredTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});

  useEffect(() => {
    setRequiredTermsAccepted(readSignupTermsAccepted());
  }, []);

  const passwordMismatch = passwordConfirm.length > 0 && password !== passwordConfirm;
  const isBlocked = register.isPending || passwordMismatch || !requiredTermsAccepted;
  const disabledReason = !requiredTermsAccepted
    ? '필수 약관 동의 후 가입할 수 있습니다.'
    : passwordMismatch
      ? '비밀번호 확인을 먼저 해결해주세요.'
      : null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!requiredTermsAccepted) {
      setFieldErrors({ terms: '필수 약관에 동의해야 회원가입할 수 있습니다.' });
      return;
    }

    if (password !== passwordConfirm) {
      setFieldErrors({ passwordConfirm: '비밀번호가 일치하지 않아요.' });
      return;
    }

    register.mutate(
      { nickname, email, password, requiredTermsAccepted },
      {
        onSuccess: (result) => {
          saveStoredV1Session(result.session);
          router.replace('/signup/complete');
        },
        onError: (nextError) => {
          const nextMessage = nextError instanceof Error ? nextError.message : '회원가입에 실패했습니다.';

          if (nextError instanceof V1ApiError && nextError.statusCode === 409) {
            setFieldErrors({ email: '이미 가입된 이메일이에요.' });
            setError('이미 가입된 정보가 있어요. 기존 계정으로 로그인하거나 다른 이메일을 사용해주세요.');
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'VALIDATION_ERROR') {
            setError('입력값을 다시 확인해주세요. 필수 약관과 입력 형식을 유지한 채 다시 시도할 수 있습니다.');
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'TERMS_NOT_READY') {
            setFieldErrors({ terms: '필수 약관 문서가 아직 준비되지 않았습니다.' });
            setError('필수 약관을 저장할 수 없어 가입을 완료하지 못했습니다.');
            return;
          }

          setError(nextMessage);
        },
      },
    );
  };

  return (
    <AuthFrame
      topTitle="회원가입"
      backHref={model.backHref}
      fixedAction={
        <>
          <button className={`tm-btn tm-btn-lg ${isBlocked ? 'tm-btn-neutral' : 'tm-btn-primary'} tm-btn-block`} disabled={isBlocked} form="v1-signup-form" type="submit">
            {register.isPending ? '가입 중' : isBlocked ? '오류 수정 후 가입 가능' : model.primary.label}
          </button>
          {disabledReason ? <div className="tm-text-micro tm-auth-fixed-reason">{disabledReason}</div> : null}
        </>
      }
    >
      <form className="tm-auth-body" id="v1-signup-form" onSubmit={submit}>
        <span className={`tm-badge ${error || Object.keys(fieldErrors).length > 0 ? 'tm-badge-orange' : 'tm-badge-blue'}`}>
          {error || Object.keys(fieldErrors).length > 0 ? 'SIGN UP CHECK' : 'SIGN UP'}
        </span>
        <h1 className="tm-text-heading tm-auth-heading">{error || Object.keys(fieldErrors).length > 0 ? '가입 전\n확인이 필요해요' : model.title}</h1>
        {!error && Object.keys(fieldErrors).length === 0 ? <p className="tm-text-body tm-auth-sub">{model.sub}</p> : null}
        <div className="tm-auth-form tm-auth-signup-form">
          <label className="tm-auth-field">
            <span className="tm-text-label">닉네임</span>
            <span className="tm-auth-field-with-action">
              <input
                className={`tm-input tm-auth-input ${fieldErrors.nickname ? 'tm-auth-input-error' : nickname.length >= 2 ? 'tm-auth-input-success' : ''}`}
                minLength={2}
                onChange={(event) => {
                  setNickname(event.target.value);
                  setFieldErrors((current) => ({ ...current, nickname: undefined }));
                }}
                placeholder="사용할 닉네임"
                required
                type="text"
                value={nickname}
              />
              <button className="tm-btn tm-btn-md tm-btn-neutral" disabled type="button">중복체크</button>
            </span>
            <span className={`tm-text-caption tm-auth-field-helper ${fieldErrors.nickname ? 'tm-auth-field-helper-error' : nickname.length >= 2 ? 'tm-auth-field-helper-success' : ''}`}>
              {fieldErrors.nickname ?? (nickname.length >= 2 ? '사용 가능한 닉네임이에요.' : '2자 이상 입력해 주세요.')}
            </span>
          </label>
          <label className="tm-auth-field">
            <span className="tm-text-label">이메일</span>
            <input
              className={`tm-input tm-auth-input ${fieldErrors.email ? 'tm-auth-input-error' : email.includes('@') ? 'tm-auth-input-success' : ''}`}
              onChange={(event) => {
                setEmail(event.target.value);
                setFieldErrors((current) => ({ ...current, email: undefined }));
              }}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
            {fieldErrors.email || email.includes('@') ? (
              <span className={`tm-text-caption tm-auth-field-helper ${fieldErrors.email ? 'tm-auth-field-helper-error' : 'tm-auth-field-helper-success'}`}>
                {fieldErrors.email ?? '사용 가능한 이메일이에요.'}
              </span>
            ) : null}
          </label>
          <label className="tm-auth-field">
            <span className="tm-text-label">비밀번호</span>
            <input
              className={`tm-input tm-auth-input ${fieldErrors.password ? 'tm-auth-input-error' : ''}`}
              minLength={8}
              onChange={(event) => {
                setPassword(event.target.value);
                setFieldErrors((current) => ({ ...current, password: undefined, passwordConfirm: undefined }));
              }}
              placeholder="8자 이상"
              required
              type="password"
              value={password}
            />
            {fieldErrors.password ? <span className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">{fieldErrors.password}</span> : null}
          </label>
          <label className="tm-auth-field">
            <span className="tm-text-label">비밀번호 확인</span>
            <input
              className={`tm-input tm-auth-input ${fieldErrors.passwordConfirm || passwordMismatch ? 'tm-auth-input-error' : passwordConfirm.length > 0 ? 'tm-auth-input-success' : ''}`}
              minLength={8}
              onChange={(event) => {
                setPasswordConfirm(event.target.value);
                setFieldErrors((current) => ({ ...current, passwordConfirm: undefined }));
              }}
              placeholder="비밀번호 다시 입력"
              required
              type="password"
              value={passwordConfirm}
            />
            <span className={`tm-text-caption tm-auth-field-helper ${fieldErrors.passwordConfirm || passwordMismatch ? 'tm-auth-field-helper-error' : ''}`}>
              {fieldErrors.passwordConfirm ?? (passwordMismatch ? '비밀번호가 일치하지 않아요.' : '일치하지 않으면 가입 CTA는 비활성화한다.')}
            </span>
          </label>
        </div>
        {error ? (
          <Card pad={16} className="tm-auth-soft-card tm-auth-soft-card-error">
            <div className="tm-text-body-lg">가입을 완료하지 못했어요</div>
            <div className="tm-text-caption">{error}</div>
          </Card>
        ) : fieldErrors.terms ? (
          <Card pad={16} className="tm-auth-soft-card tm-auth-soft-card-warning">
            <div className="tm-text-body-lg">약관 확인이 필요해요</div>
            <div className="tm-text-caption">{fieldErrors.terms}</div>
          </Card>
        ) : (
          <Card pad={16} className="tm-auth-soft-card">
            <div className="tm-text-body-lg">{model.notice.title}</div>
            <div className="tm-text-caption">{model.notice.body}</div>
          </Card>
        )}
      </form>
    </AuthFrame>
  );
}
