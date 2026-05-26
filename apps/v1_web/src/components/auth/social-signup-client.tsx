'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/v1-ui/primitives';
import { useV1CheckNickname, useV1CompleteSocialProfile } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { saveStoredV1Session } from '@/lib/session-storage';
import { AuthFrame } from './auth-page';

type SocialSignupGender = 'male' | 'female';
type FieldErrors = Partial<Record<'nickname' | 'gender', string>>;
type DuplicateCheckState = {
  status: 'idle' | 'available' | 'taken' | 'error';
  value: string;
};

export function SocialSignupClient() {
  const router = useRouter();
  const completeProfile = useV1CompleteSocialProfile();
  const checkNickname = useV1CheckNickname();
  const [nickname, setNickname] = useState('');
  const [gender, setGender] = useState<SocialSignupGender | null>(null);
  const [nicknameCheck, setNicknameCheck] = useState<DuplicateCheckState>({ status: 'idle', value: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);

  const nicknameVerified = nicknameCheck.status === 'available' && nicknameCheck.value === nickname.trim();
  const isBlocked = completeProfile.isPending || checkNickname.isPending || !gender || !nicknameVerified;
  const disabledReason = !gender
      ? '성별을 선택해주세요.'
      : !nicknameVerified
        ? '닉네임 중복 확인이 필요합니다.'
        : null;

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
        setFieldErrors((current) => ({ ...current, nickname: '중복 확인에 실패했습니다. 다시 시도해 주세요.' }));
      },
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!gender) {
      setFieldErrors({ gender: '성별을 선택해주세요.' });
      return;
    }

    if (!nicknameVerified) {
      setFieldErrors({ nickname: '닉네임 중복 확인이 필요합니다.' });
      return;
    }

    completeProfile.mutate(
      { nickname, gender },
      {
        onSuccess: (result) => {
          saveStoredV1Session(result.session);
          router.replace(result.next?.route ?? '/onboarding/sport');
        },
        onError: (nextError) => {
          if (nextError instanceof V1ApiError && nextError.code === 'NICKNAME_CONFLICT') {
            setFieldErrors({ nickname: '이미 사용 중인 닉네임이에요.' });
            setError('다른 닉네임으로 다시 시도해주세요.');
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'TERMS_NOT_READY') {
            setError('필수 약관을 저장할 수 없어 가입을 완료하지 못했습니다.');
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'TERMS_REQUIRED') {
            router.replace('/terms?mode=social');
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'SOCIAL_SIGNUP_EXPIRED') {
            setError('가입 시간이 만료되었습니다. 카카오 로그인부터 다시 진행해 주세요.');
            return;
          }

          setError(nextError instanceof Error ? nextError.message : '소셜 가입을 완료하지 못했습니다.');
        },
      },
    );
  };

  return (
    <AuthFrame
      topTitle="카카오 가입"
      fixedAction={
        <>
          <button className={`tm-btn tm-btn-lg ${isBlocked ? 'tm-btn-neutral' : 'tm-btn-primary'} tm-btn-block`} disabled={isBlocked} form="v1-social-signup-form" type="submit">
            {completeProfile.isPending ? '저장 중' : isBlocked ? '입력 확인 후 계속' : '운동 설정으로 계속'}
          </button>
          {disabledReason ? <div className="tm-text-micro tm-auth-fixed-reason">{disabledReason}</div> : null}
        </>
      }
    >
      <form className="tm-auth-body" id="v1-social-signup-form" onSubmit={submit}>
        <h1 className="tm-text-heading tm-auth-heading">프로필을 완성하고 운동 설정을 이어가요</h1>
        <p className="tm-text-body tm-auth-sub">카카오 계정은 확인됐습니다. Teameet에서 사용할 정보만 입력해 주세요.</p>
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
              />
              <button className="tm-btn tm-btn-md tm-btn-neutral" disabled={checkNickname.isPending || nickname.trim().length < 2} onClick={runNicknameCheck} type="button">{checkNickname.isPending ? '확인중' : '중복확인'}</button>
            </span>
            {fieldErrors.nickname || nicknameVerified ? (
              <span className={`tm-text-caption tm-auth-field-helper ${fieldErrors.nickname ? 'tm-auth-field-helper-error' : 'tm-auth-field-helper-success'}`}>
                {fieldErrors.nickname ?? '사용 가능한 닉네임이에요.'}
              </span>
            ) : null}
          </label>
          <div className="tm-auth-field">
            <span className="tm-text-label">성별</span>
            <div className="tm-auth-segmented" role="group" aria-label="성별 선택">
              {[
                ['male', '남성'],
                ['female', '여성'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`tm-auth-segment ${gender === value ? 'tm-auth-segment-active' : ''}`}
                  type="button"
                  onClick={() => {
                    setGender(value as SocialSignupGender);
                    setFieldErrors((current) => ({ ...current, gender: undefined }));
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {fieldErrors.gender ? <span className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">{fieldErrors.gender}</span> : null}
          </div>
        </div>
        {error ? (
          <Card pad={16} className="tm-auth-soft-card tm-auth-soft-card-error">
            <div className="tm-text-body-lg">가입을 완료하지 못했어요</div>
            <div className="tm-text-caption">{error}</div>
          </Card>
        ) : null}
      </form>
    </AuthFrame>
  );
}
