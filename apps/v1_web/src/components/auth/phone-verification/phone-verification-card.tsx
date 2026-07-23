'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, QrCode, RefreshCw, Smartphone } from 'lucide-react';
import { AlertBanner, Card } from '@/components/v1-ui/primitives';
import { detectDeviceKind, type DeviceKind } from '@/lib/device-kind';
import { buildSmsLink } from '@/lib/octomo-sms-link';
import {
  useV1AuthedPhoneConfirm,
  useV1AuthedPhoneRequest,
  useV1PhoneIssue,
  useV1PhoneVerify,
} from '@/hooks/use-v1-api';

type Props = {
  /** public: 비로그인 회원가입 전 pre-account 인증(proofToken 발급). authed: 로그인 후 카카오/레거시 구제. */
  mode: 'public' | 'authed';
  phone: string;
  /** public 모드는 proofToken을 전달하고, authed 모드는 서버가 이미 phoneVerifiedAt을 세팅하므로 인자 없이 호출된다. */
  onVerified: (proofToken?: string) => void;
};

type Issued = { code: string; destNumber: string; qrCode?: string; expiresAt: string };

const COUNTDOWN_TICK_MS = 1000;
const NOT_ARRIVED_MESSAGE = '아직 문자가 확인되지 않았어요. 문자를 보낸 뒤 다시 눌러 주세요.';

export function PhoneVerificationCard({ mode, phone, onVerified }: Props) {
  const publicIssue = useV1PhoneIssue();
  const publicVerify = useV1PhoneVerify();
  const authedRequest = useV1AuthedPhoneRequest();
  const authedConfirm = useV1AuthedPhoneConfirm();

  const [device, setDevice] = useState<DeviceKind>('desktop');
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [verified, setVerified] = useState(false);

  // 서버 사이드 렌더에서는 navigator/matchMedia가 없어 항상 'desktop'을 반환하므로,
  // 마운트 이후 실제 기기 판별로 갱신한다(hydration mismatch 방지).
  useEffect(() => {
    setDevice(detectDeviceKind());
  }, []);

  const issue = useCallback(
    async (explicitChannel?: DeviceKind) => {
      const channel = explicitChannel ?? device;
      setError(null);
      setPending(true);
      try {
        const res =
          mode === 'public'
            ? await publicIssue.mutateAsync({ phone, channel })
            : await authedRequest.mutateAsync({ phone, channel });
        setIssued(res);
        setRemainingMs(Math.max(0, new Date(res.expiresAt).getTime() - Date.now()));
      } catch (err) {
        setError(err instanceof Error ? err.message : '인증번호 발급에 실패했어요.');
      } finally {
        setPending(false);
      }
    },
    [mode, phone, device, publicIssue, authedRequest],
  );

  // "다른 방법으로" — QR은 desktop 채널로 발급된 코드에만 딸려 오므로, 이미 발급된 상태에서
  // 기기 뷰를 바꾸면 새 채널로 즉시 재발급해 QR/딥링크 불일치를 막는다.
  const toggleDevice = useCallback(() => {
    const next: DeviceKind = device === 'mobile' ? 'desktop' : 'mobile';
    setDevice(next);
    setError(null);
    if (issued && !verified) {
      void issue(next);
    }
  }, [device, issued, verified, issue]);

  const verify = useCallback(async () => {
    setError(null);
    setPending(true);
    try {
      if (mode === 'public') {
        const res = await publicVerify.mutateAsync({ phone });
        if (res.verified) {
          setVerified(true);
          onVerified(res.proofToken);
        } else {
          setError(NOT_ARRIVED_MESSAGE);
        }
      } else {
        const res = await authedConfirm.mutateAsync({ phone });
        if (res.verified) {
          setVerified(true);
          onVerified();
        } else {
          setError(NOT_ARRIVED_MESSAGE);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '인증 확인에 실패했어요.');
    } finally {
      setPending(false);
    }
  }, [mode, phone, publicVerify, authedConfirm, onVerified]);

  useEffect(() => {
    if (!issued || verified) return;
    const id = window.setInterval(() => {
      const left = new Date(issued.expiresAt).getTime() - Date.now();
      setRemainingMs(left > 0 ? left : 0);
    }, COUNTDOWN_TICK_MS);
    return () => window.clearInterval(id);
  }, [issued, verified]);

  const expired = issued !== null && !verified && remainingMs <= 0;
  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  const smsLink = useMemo(() => (issued ? buildSmsLink(issued.destNumber, issued.code) : '#'), [issued]);

  if (verified) {
    return (
      <Card pad={16} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--blue50)' }}>
        <CheckCircle2 size={20} color="var(--blue500)" aria-hidden="true" />
        <p className="tm-text-label" style={{ margin: 0, color: 'var(--blue500)' }}>
          휴대폰 본인인증이 완료됐어요.
        </p>
      </Card>
    );
  }

  return (
    <Card pad={16} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p className="tm-text-label" style={{ margin: 0 }}>
          휴대폰 본인인증
        </p>
        {issued ? (
          <button
            type="button"
            className="tm-btn tm-btn-sm tm-btn-ghost"
            onClick={toggleDevice}
            disabled={pending}
            aria-label={device === 'mobile' ? 'QR 코드로 인증 방법 바꾸기' : '문자 보내기로 인증 방법 바꾸기'}
          >
            {device === 'mobile' ? (
              <QrCode size={16} aria-hidden="true" />
            ) : (
              <Smartphone size={16} aria-hidden="true" />
            )}
            다른 방법으로
          </button>
        ) : null}
      </div>

      {!issued ? (
        <>
          <p className="tm-text-caption" style={{ margin: 0 }}>
            본인 명의 휴대폰으로 인증번호를 받아 인증해 주세요.
          </p>
          <button
            type="button"
            className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
            disabled={pending}
            onClick={() => void issue()}
          >
            인증번호 받기
          </button>
        </>
      ) : expired ? (
        <>
          <p className="tm-text-caption" style={{ margin: 0, color: 'var(--red500)' }}>
            인증번호가 만료됐어요. 다시 받아 주세요.
          </p>
          <button
            type="button"
            className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
            disabled={pending}
            onClick={() => void issue()}
          >
            <RefreshCw size={16} aria-hidden="true" />
            인증번호 다시 받기
          </button>
        </>
      ) : (
        <>
          <p className="tm-text-caption" style={{ margin: 0 }}>
            본인 명의 휴대폰으로 아래 번호에 인증번호를 보내면 확인돼요.
          </p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--blue50)',
            }}
          >
            <div>
              <p className="tm-text-caption" style={{ margin: 0 }}>
                인증번호
              </p>
              <p
                className="tm-text-label"
                style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: 1, color: 'var(--blue500)' }}
              >
                {issued.code}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p className="tm-text-caption" style={{ margin: 0 }}>
                받는 번호
              </p>
              <p className="tm-text-label" style={{ margin: 0 }}>
                {issued.destNumber}
              </p>
            </div>
          </div>

          {device === 'desktop' && issued.qrCode ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <img
                src={issued.qrCode}
                alt="휴대폰 카메라로 스캔하면 인증 문자가 자동으로 준비돼요"
                width={180}
                height={180}
                style={{ borderRadius: 12, border: '1px solid var(--border)' }}
              />
              <p className="tm-text-caption" style={{ margin: 0, textAlign: 'center' }}>
                휴대폰 카메라로 QR을 스캔하면 인증 문자가 자동으로 준비돼요.
              </p>
            </div>
          ) : null}

          {device === 'mobile' ? (
            <a href={smsLink} className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" aria-label="인증문자 보내기">
              인증문자 보내기
            </a>
          ) : null}

          <p className="tm-text-caption" style={{ margin: 0 }}>
            남은 시간 {minutes}:{String(seconds).padStart(2, '0')}
          </p>

          <button
            type="button"
            className={`tm-btn tm-btn-md tm-btn-block ${device === 'mobile' ? 'tm-btn-outline' : 'tm-btn-primary'}`}
            disabled={pending}
            onClick={() => void verify()}
          >
            인증 확인
          </button>
        </>
      )}

      {error ? <AlertBanner message={error} tone="error" /> : null}
    </Card>
  );
}
