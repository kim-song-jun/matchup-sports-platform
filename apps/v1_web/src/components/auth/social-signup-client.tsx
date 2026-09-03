'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Card, DatePickerTextInput } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { PhoneVerificationCard } from '@/components/auth/phone-verification/phone-verification-card';
import { useV1AuthMe, useV1CheckNickname, useV1CompleteSocialProfile } from '@/hooks/use-v1-api';
import { useSocialSignupExit } from './use-social-signup-exit';
import { V1ApiError } from '@/lib/api-client';
import { trackEvent } from '@/lib/analytics';
import { clearV1IdentityCache } from '@/lib/query-keys';
import { saveStoredV1Session } from '@/lib/session-storage';
import { AUTH_WELCOME_STAGE, AuthFrame } from './auth-page';
import {
  formatBirthDate,
  formatPhone,
  getSignupProfileIssue,
  isCompleteSignupProfile,
  normalizeSeparatedDigits,
  normalizeSignupDisplayName,
  SIGNUP_PROFILE_ERROR_MESSAGES,
} from './signup-profile-validation';

type FieldErrors = Partial<Record<'nickname' | 'gender', string>>;
type DuplicateCheckState = {
  status: 'idle' | 'available' | 'taken' | 'error';
  value: string;
};

export function SocialSignupClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const completeProfile = useV1CompleteSocialProfile();
  const checkNickname = useV1CheckNickname();
  const [nickname, setNickname] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [birthDateDigits, setBirthDateDigits] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [nicknameCheck, setNicknameCheck] = useState<DuplicateCheckState>({ status: 'idle', value: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const exitFlow = useSocialSignupExit();

  // 카카오가 동의항목 승인 하에 내려준 값(이름·번호·성별)을 자동으로 채운다.
  // 동의항목이 없으면 socialSignupPrefill 이 null 이라 아무것도 하지 않고 직접 입력 흐름 그대로다.
  const authMe = useV1AuthMe();
  const prefill = authMe.data?.socialSignupPrefill ?? null;
  // 카카오가 확인해 준 값은 사용자가 임의로 바꾸지 못하게 잠근다. 단 전화번호는 예외 —
  // 카카오 계정 번호와 실제 쓰는 번호가 다를 수 있고, 잠그면 OTP 본인인증을 통과할 방법이
  // 사라져 가입 자체가 막힌다. 그래서 채워 주기만 하고 수정은 허용한다.
  const lockedName = Boolean(prefill?.name);
  const lockedGender = Boolean(prefill?.gender);

  const [prefillApplied, setPrefillApplied] = useState(false);
  useEffect(() => {
    if (!prefill || prefillApplied) return;
    // 보통은 게이트가 이미 /auth/me 를 받아 둔 뒤라 첫 렌더에 값이 있지만, 캐시가 비어
    // 늦게 도착할 수 있다. 그때 이미 입력 중이던 값을 덮어쓰면 입력이 유실된다.
    // 잠기는 필드(이름·성별)는 카카오 값이 권위이므로 그대로 반영하고,
    // 사용자가 직접 고치라고 열어 둔 전화번호만 비어 있을 때에만 채운다.
    if (prefill.name) setDisplayName(prefill.name);
    if (prefill.gender) setGender(prefill.gender);
    if (prefill.phone) setPhoneDigits((current) => (current.length > 0 ? current : prefill.phone!));
    setPrefillApplied(true);
  }, [prefill, prefillApplied]);

  const nicknameVerified = nicknameCheck.status === 'available' && nicknameCheck.value === nickname.trim();
  const profileDraft = { displayName, phone: phoneDigits, birthDate: birthDateDigits, gender };
  const profileIssue = getSignupProfileIssue(profileDraft);
  const isBlocked = completeProfile.isPending || checkNickname.isPending || !nicknameVerified || profileIssue !== null;
  const disabledReason = !nicknameVerified ? '닉네임 중복 확인이 필요해요.' : null;

  const actionReason = disabledReason ?? (profileIssue ? SIGNUP_PROFILE_ERROR_MESSAGES[profileIssue] : null);
  const runNicknameCheck = () => {
    const nextNickname = nickname.trim();
    setError(null);
    if (nextNickname.length < 2) {
      setFieldErrors((current) => ({ ...current, nickname: '2자 이상 입력해 주세요.' }));
      setNicknameCheck({ status: 'idle', value: '' });
      return;
    }

    checkNickname.mutate(nextNickname, {
      onSuccess: (result) => {
        setNicknameCheck({ status: result.available ? 'available' : 'taken', value: nextNickname });
        setFieldErrors((current) => ({ ...current, nickname: result.available ? undefined : '이미 사용 중인 닉네임이에요.' }));
      },
      onError: () => {
        setNicknameCheck({ status: 'error', value: nextNickname });
        setFieldErrors((current) => ({ ...current, nickname: '중복 확인에 실패했어요. 다시 시도해 주세요.' }));
      },
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // 로딩 중 재클릭 시 중복 제출 방지 — isPending 은 disabled 속성과 동일하게 리렌더
    // 이후에나 반영되는 값이라 동시 클릭까지 막지는 못하지만, 스피너가 보이는 동안의
    // 재클릭은 막는다(동시 클릭 방지가 필요하면 ref 락을 따로 둔다).
    if (completeProfile.isPending) return;
    setError(null);
    setFieldErrors({});

    if (!nicknameVerified) {
      setFieldErrors({ nickname: '닉네임 중복 확인이 필요해요.' });
      return;
    }

    if (!isCompleteSignupProfile(profileDraft)) {
      const nextProfileIssue = getSignupProfileIssue(profileDraft);
      if (nextProfileIssue) {
        setError(SIGNUP_PROFILE_ERROR_MESSAGES[nextProfileIssue]);
      }
      return;
    }

    if (!phoneVerified) {
      setError('휴대폰 본인인증을 완료해 주세요.');
      return;
    }

    completeProfile.mutate(
      {
        nickname: nickname.trim(),
        displayName: normalizeSignupDisplayName(profileDraft.displayName),
        phone: profileDraft.phone,
        birthDate: profileDraft.birthDate,
        gender: profileDraft.gender,
      },
      {
        onSuccess: (result) => {
          saveStoredV1Session(result.session);
          clearV1IdentityCache(queryClient);
          trackEvent('sign_up_complete', { method: 'kakao' });
          router.replace(result.next.route);
        },
        onError: (nextError) => {
          if (nextError instanceof V1ApiError && nextError.code === 'NICKNAME_CONFLICT') {
            setFieldErrors({ nickname: '이미 사용 중인 닉네임이에요.' });
            setError('다른 닉네임으로 다시 시도해 주세요.');
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'TERMS_NOT_READY') {
            setError('필수 약관을 저장할 수 없어 가입을 완료하지 못했어요.');
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'TERMS_REQUIRED') {
            router.replace('/terms?mode=social');
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'SOCIAL_SIGNUP_EXPIRED') {
            setError('가입 가능 시간이 지났어요. 카카오 로그인부터 다시 시작해 주세요.');
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'PHONE_NOT_VERIFIED') {
            setError('휴대폰 본인인증을 완료해 주세요.');
            setPhoneVerified(false);
            return;
          }

          setError(nextError instanceof Error ? nextError.message : '가입을 완료하지 못했어요.');
        },
      },
    );
  };

  return (
    <AuthFrame
      stage={AUTH_WELCOME_STAGE}
      topTitle="카카오 가입"
      onBack={() => void exitFlow.exit()}
      backLabel="가입 그만두기"
      fixedAction={
        <>
          <Button
            block
            disabled={isBlocked}
            form="v1-social-signup-form"
            loading={completeProfile.isPending}
            size="lg"
            type="submit"
            variant={isBlocked ? 'neutral' : 'primary'}
          >
            {isBlocked ? '입력 확인 후 계속' : '운동 설정으로 계속'}
          </Button>
          {actionReason ? <div className="tm-text-micro tm-auth-fixed-reason">{actionReason}</div> : null}
        </>
      }
    >
      <form className="tm-auth-body" id="v1-social-signup-form" onSubmit={submit}>
        <h1 className="tm-text-heading tm-auth-heading">프로필을 완성해 주세요</h1>
        <p className="tm-text-body tm-auth-sub">카카오 계정 확인이 됐어요. 가입에 필요한 프로필 정보를 입력해 주세요.</p>
        <div className="tm-auth-form tm-auth-signup-form">
          <label className="tm-auth-field">
            <span className="tm-text-label">닉네임</span>
            <span className="tm-auth-field-with-action">
              <input
                className={`tm-input tm-auth-input ${fieldErrors.nickname ? 'tm-auth-input-error' : nicknameVerified ? 'tm-auth-input-success' : ''}`}
                minLength={2}
                onChange={(event) => {
                  setNickname(event.target.value);
                  setNicknameCheck({ status: 'idle', value: '' });
                  setFieldErrors((current) => ({ ...current, nickname: undefined }));
                }}
                placeholder="사용할 닉네임"
                required
                type="text"
                value={nickname}
                aria-invalid={fieldErrors.nickname ? true : undefined}
                aria-describedby={fieldErrors.nickname || nicknameVerified ? 'social-signup-nickname-helper' : undefined}
              />
              <Button disabled={nickname.trim().length < 2} loading={checkNickname.isPending} onClick={runNicknameCheck} size="md" type="button" variant="neutral">중복 확인</Button>
            </span>
            {fieldErrors.nickname || nicknameVerified ? (
              <span
                id="social-signup-nickname-helper"
                role={fieldErrors.nickname ? 'alert' : undefined}
                className={`tm-text-caption tm-auth-field-helper ${fieldErrors.nickname ? 'tm-auth-field-helper-error' : 'tm-auth-field-helper-success'}`}
              >
                {fieldErrors.nickname ?? '사용 가능한 닉네임이에요.'}
              </span>
            ) : null}
          </label>
          <div className="tm-auth-field">
            <span className="tm-text-label">성별</span>
            <div
              className="tm-auth-segmented"
              role="radiogroup"
              aria-label="성별"
              aria-invalid={fieldErrors.gender ? true : undefined}
              aria-describedby={fieldErrors.gender ? 'social-signup-gender-error' : undefined}
            >
              <button className={`tm-auth-segment ${gender === 'male' ? 'tm-auth-segment-active' : ''}`} type="button" role="radio" aria-checked={gender === 'male'} disabled={lockedGender} onClick={() => {
                setGender('male');
                setFieldErrors((current) => ({ ...current, gender: undefined }));
              }}>
                남
              </button>
              <button className={`tm-auth-segment ${gender === 'female' ? 'tm-auth-segment-active' : ''}`} type="button" role="radio" aria-checked={gender === 'female'} disabled={lockedGender} onClick={() => {
                setGender('female');
                setFieldErrors((current) => ({ ...current, gender: undefined }));
              }}>
                여
              </button>
            </div>
            {lockedGender ? (
              <span className="tm-text-caption tm-auth-field-helper">카카오 계정에서 가져온 정보예요.</span>
            ) : null}
            {fieldErrors.gender ? (
              <span id="social-signup-gender-error" role="alert" className="tm-text-caption tm-auth-field-helper-error">
                {fieldErrors.gender}
              </span>
            ) : null}
          </div>
          <label className="tm-auth-field">
            <span className="tm-text-label">이름</span>
            <input
              className="tm-input tm-auth-input"
              maxLength={40}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="실명 또는 확인 가능한 이름"
              readOnly={lockedName}
              required
              type="text"
              value={displayName}
            />
            {lockedName ? (
              <span className="tm-text-caption tm-auth-field-helper">카카오 계정에서 가져온 정보예요.</span>
            ) : null}
          </label>
          <label className="tm-auth-field">
            <span className="tm-text-label">휴대폰 번호</span>
            <input
              className="tm-input tm-auth-input"
              inputMode="numeric"
              onChange={(event) => {
                setPhoneDigits(normalizeSeparatedDigits(event.target.value));
                setPhoneVerified(false);
              }}
              placeholder="010-0000-0000"
              required
              value={formatPhone(phoneDigits)}
            />
          </label>

          {phoneDigits.length === 11 && !phoneVerified ? (
            <PhoneVerificationCard mode="authed" phone={phoneDigits} onVerified={() => setPhoneVerified(true)} surface="inset" />
          ) : null}

          {phoneVerified ? (
            <div
              className="tm-text-caption"
              role="status"
              style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--blue700)' }}
            >
              <span
                aria-hidden="true"
                style={{ width: 6, height: 6, borderRadius: 'var(--radius-circle)', background: 'var(--blue500)', display: 'inline-block' }}
              />
              휴대폰 본인인증이 완료됐어요
            </div>
          ) : null}

          <label className="tm-auth-field">
            <span className="tm-text-label">생년월일</span>
            <DatePickerTextInput
              dateValue={formatBirthDate(birthDateDigits)}
              inputClassName="tm-auth-input"
              onDateChange={(value) => setBirthDateDigits(normalizeSeparatedDigits(value))}
              onTextChange={(value) => setBirthDateDigits(normalizeSeparatedDigits(value))}
              placeholder="예: 1995-01-15"
              required
              value={formatBirthDate(birthDateDigits)}
            />
          </label>
        </div>
        {error ? (
          <Card pad={16} className="tm-auth-soft-card tm-auth-soft-card-error">
            <div className="tm-text-body-lg">가입을 완료하지 못했어요</div>
            <div className="tm-text-caption">{error}</div>
          </Card>
        ) : null}
        {exitFlow.error ? (
          <Card pad={16} className="tm-auth-soft-card tm-auth-soft-card-error">
            <div className="tm-text-body-lg">가입을 취소하지 못했어요</div>
            <div className="tm-text-caption">{exitFlow.error}</div>
          </Card>
        ) : null}
      </form>
      {exitFlow.ConfirmModal}
    </AuthFrame>
  );
}
