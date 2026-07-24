'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, Copy, MessageSquare, QrCode, RefreshCw, Send, Smartphone } from 'lucide-react';
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
/** 문자 도착 자동 감지 폴링 간격. 백엔드 MAX_POLL_ATTEMPTS(180)·verify @Throttle(40/60s)와 정합. */
const POLL_INTERVAL_MS = 2000;

export function PhoneVerificationCard({ mode, phone, onVerified }: Props) {
  const publicIssue = useV1PhoneIssue();
  const publicVerify = useV1PhoneVerify();
  const authedRequest = useV1AuthedPhoneRequest();
  const authedConfirm = useV1AuthedPhoneConfirm();

  const [device, setDevice] = useState<DeviceKind>('desktop');
  const [issued, setIssued] = useState<Issued | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [verified, setVerified] = useState(false);
  const [copied, setCopied] = useState(false);
  const inFlightRef = useRef(false);

  const issue = useCallback(
    async (channel: DeviceKind) => {
      setError(null);
      setIssuing(true);
      try {
        const res =
          mode === 'public'
            ? await publicIssue.mutateAsync({ phone, channel })
            : await authedRequest.mutateAsync({ phone, channel });
        setIssued(res);
        setRemainingMs(Math.max(0, new Date(res.expiresAt).getTime() - Date.now()));
      } catch (err) {
        setError(err instanceof Error ? err.message : '인증번호 준비에 실패했어요. 잠시 후 다시 시도해 주세요.');
      } finally {
        setIssuing(false);
      }
    },
    [mode, phone, publicIssue, authedRequest],
  );

  // 마운트/번호 변경 시 기기 판별 후 자동 발급(별도 "인증번호 받기" 단계 제거).
  useEffect(() => {
    const detected = detectDeviceKind();
    setDevice(detected);
    void issue(detected);
    // issue는 phone에만 의존하도록 유지 — device 갱신으로 재발급 루프를 만들지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, mode]);

  const expired = issued !== null && !verified && remainingMs <= 0;

  // "다른 방법으로" — QR은 desktop 채널로 발급된 코드에만 딸려 오므로, 기기 뷰를 바꾸면
  // 새 채널로 즉시 재발급해 QR/딥링크 불일치를 막는다.
  const toggleDevice = useCallback(() => {
    const next: DeviceKind = device === 'mobile' ? 'desktop' : 'mobile';
    setDevice(next);
    void issue(next);
  }, [device, issue]);

  const verifyOnce = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      if (mode === 'public') {
        const res = await publicVerify.mutateAsync({ phone });
        if (res.verified) {
          setVerified(true);
          onVerified(res.proofToken);
        }
      } else {
        const res = await authedConfirm.mutateAsync({ phone });
        if (res.verified) {
          setVerified(true);
          onVerified();
        }
      }
    } catch {
      // 폴링 중 실패(만료·시도초과·스로틀)는 조용히 삼킨다. 다음 폴링 주기가 재시도하고,
      // 만료 시엔 카운트다운이 만료 UI(다시 시작하기)로 전환한다.
    } finally {
      inFlightRef.current = false;
    }
  }, [mode, phone, publicVerify, authedConfirm, onVerified]);

  // 문자 도착 자동 감지: 코드를 노출·복사 제공하므로 사용자가 어떤 경로(복사·딥링크·직접 입력)로
  // 보내든 감지되도록, 기기 구분 없이 발급 직후부터 폴링한다. (MAX_POLL_ATTEMPTS·throttle가 상한을 보장)
  const polling = issued !== null && !verified && !expired;
  const primedRef = useRef(false);
  useEffect(() => {
    if (!polling) {
      primedRef.current = false;
      return;
    }
    // 폴링 진입 즉시 1회 확인(간격만큼 기다리지 않아 체감 지연을 없앤다). 이후 주기 폴링.
    // verifyOnce 재생성으로 effect가 재실행돼도 즉시확인을 중복하지 않도록 primedRef로 1회만 발화.
    if (!primedRef.current) {
      primedRef.current = true;
      void verifyOnce();
    }
    const id = window.setInterval(() => {
      void verifyOnce();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [polling, verifyOnce]);

  // 카운트다운
  useEffect(() => {
    if (!issued || verified) return;
    const id = window.setInterval(() => {
      const left = new Date(issued.expiresAt).getTime() - Date.now();
      setRemainingMs(left > 0 ? left : 0);
    }, COUNTDOWN_TICK_MS);
    return () => window.clearInterval(id);
  }, [issued, verified]);

  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  const smsLink = useMemo(() => (issued ? buildSmsLink(issued.destNumber, issued.code) : '#'), [issued]);

  const copyCode = useCallback(() => {
    if (!issued) return;
    // clipboard 실패(비지원·권한거부)해도 코드는 화면에 노출돼 있어 수동 선택 복사가 가능하므로 무시한다.
    void navigator.clipboard
      ?.writeText(issued.code)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }, [issued]);

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
    <Card pad={18} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p className="tm-text-label" style={{ margin: 0 }}>
          휴대폰 본인인증
        </p>
        {issued && !expired ? (
          <button
            type="button"
            className="tm-btn tm-btn-sm tm-btn-ghost"
            onClick={toggleDevice}
            disabled={issuing}
            aria-label={device === 'mobile' ? 'QR 코드로 인증 방법 바꾸기' : '문자 보내기로 인증 방법 바꾸기'}
          >
            {device === 'mobile' ? <QrCode size={16} aria-hidden="true" /> : <Smartphone size={16} aria-hidden="true" />}
            다른 방법으로
          </button>
        ) : null}
      </div>

      {!issued ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0', color: 'var(--text-muted)' }}>
          <span className="tm-spinner" aria-hidden="true" />
          <span className="tm-text-caption">인증을 준비하고 있어요…</span>
        </div>
      ) : expired ? (
        <>
          <p className="tm-text-caption" style={{ margin: 0, color: 'var(--red500)' }}>
            인증 시간이 지났어요. 다시 시작해 주세요.
          </p>
          <button
            type="button"
            className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
            disabled={issuing}
            onClick={() => void issue(device)}
          >
            <RefreshCw size={16} aria-hidden="true" />
            다시 시작하기
          </button>
        </>
      ) : (
        <>
          {/* 아이콘 + ①보내기 → ②자동 인증 한 줄 안내 (미니멀 + 스텝 하이브리드) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <span
              aria-hidden="true"
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                display: 'grid',
                placeItems: 'center',
                background: 'var(--blue50)',
                color: 'var(--blue500)',
              }}
            >
              <MessageSquare size={24} strokeWidth={2} />
            </span>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-muted)',
              }}
            >
              <span>① 문자 보내기</span>
              <ArrowRight size={14} aria-hidden="true" />
              <span>② 자동으로 인증</span>
            </div>
          </div>

          {/* 인증 코드 — 딥링크가 본문을 못 채우는 기기가 있어 명확히 노출·복사 지원(오타 방지). */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 14,
              borderRadius: 14,
              background: 'var(--blue50)',
              border: '1px solid var(--border)',
            }}
          >
            <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
              받는 번호 <b style={{ color: 'var(--text)' }}>1666-3538</b>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <code
                style={{
                  flex: 1,
                  margin: 0,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 26,
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  color: 'var(--blue500)',
                  textAlign: 'center',
                }}
              >
                {issued.code}
              </code>
              <button
                type="button"
                className="tm-btn tm-btn-sm tm-btn-ghost"
                onClick={copyCode}
                aria-label="인증 코드 복사"
              >
                {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                {copied ? '복사됨' : '복사'}
              </button>
            </div>
          </div>

          {device === 'desktop' ? (
            issued.qrCode ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <img
                  src={issued.qrCode}
                  alt="휴대폰 카메라로 스캔하면 인증 문자가 자동으로 준비돼요"
                  width={180}
                  height={180}
                  style={{ borderRadius: 12, border: '1px solid var(--border)' }}
                />
                <p className="tm-text-caption" style={{ margin: 0, textAlign: 'center' }}>
                  휴대폰 카메라로 QR을 스캔하면 문자 앱이 열려요. 그대로 전송하면 자동 인증돼요. 스캔이 어려우면 위 코드를 직접 보내도 돼요.
                </p>
              </div>
            ) : (
              <p className="tm-text-caption" style={{ margin: 0, textAlign: 'center' }}>
                QR을 준비하고 있어요. 잠시만 기다려 주세요.
              </p>
            )
          ) : (
            <>
              <p className="tm-text-caption" style={{ margin: 0, textAlign: 'center' }}>
                위 코드를 문자 앱에서 <b style={{ color: 'var(--text)' }}>그대로 전송</b>하면 자동으로 인증돼요. 버튼을 누르면 문자 앱이 코드와 함께 열려요(안 채워지면 위 코드를 복사해 붙여넣어 주세요).
              </p>
              <a
                href={smsLink}
                className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
                aria-label="문자 앱 열기"
              >
                <Send size={18} aria-hidden="true" />
                문자 앱 열기
              </a>
            </>
          )}

          {polling ? (
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, color: 'var(--text-muted)' }}
              role="status"
              aria-live="polite"
            >
              <span className="tm-spinner" aria-hidden="true" />
              <span className="tm-text-caption">문자 도착을 확인하고 있어요…</span>
            </div>
          ) : null}

          <p className="tm-text-caption" style={{ margin: 0, textAlign: 'center', color: 'var(--text-subtle, var(--text-muted))' }}>
            남은 시간 {minutes}:{String(seconds).padStart(2, '0')}
          </p>
        </>
      )}

      {error ? <AlertBanner message={error} tone="error" /> : null}
    </Card>
  );
}
