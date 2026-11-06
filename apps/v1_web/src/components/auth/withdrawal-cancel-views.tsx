'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/v1-ui/button';
import { Card } from '@/components/v1-ui/primitives';
import { getLoginPathForRedirect } from '@/lib/session-storage';
import { AUTH_NOTICE_STAGE, AuthFrame, AuthIllustration, JOURNEY_DONE_STAGE } from './auth-page';
import type { AuthExceptionViewModel } from './auth.types';

export type WithdrawalCancelNotice = 'login-required' | 'token-invalid' | 'already-processed';

/** 철회를 이어 갈 수 없는 세 갈래의 안내. 모두 다음에 할 수 있는 행동 링크 하나가 중심이다. */
export function getWithdrawalCancelNoticeModel(kind: WithdrawalCancelNotice, returnTo: string | null): AuthExceptionViewModel {
  const loginHref = getLoginPathForRedirect(returnTo ?? '');
  switch (kind) {
    case 'login-required':
      return {
        backHref: '/login',
        badge: '로그인 필요',
        title: '다시 로그인해 주세요',
        body: '탈퇴 신청 취소는 로그인한 직후에만 할 수 있어요. 다시 로그인하면 이어서 취소할 수 있어요.',
        tone: 'orange',
        primary: { label: '다시 로그인하기', href: loginHref },
      };
    case 'token-invalid':
      return {
        backHref: '/login',
        badge: '다시 로그인 필요',
        title: '이 요청은 더 이상 쓸 수 없어요',
        // 만료 말고도 다른 탭에서 이미 취소한 경우가 같은 코드로 온다.
        body: '다시 로그인해 주세요. 탈퇴 신청이 아직 남아 있다면 이어서 취소할 수 있어요.',
        tone: 'orange',
        primary: { label: '다시 로그인하기', href: loginHref },
      };
    case 'already-processed':
      return {
        backHref: '/login',
        badge: '탈퇴 완료',
        title: '이미 탈퇴 처리가 끝난 계정이에요',
        body: '이 화면에서는 되살릴 수 없어요. 다시 이용하려면 새로 가입하거나 고객센터에 문의해 주세요.',
        tone: 'red',
        primary: { label: '새로 가입하기', href: '/terms?mode=signup' },
        secondary: { label: '문의하기', href: '/contact', tone: 'neutral' },
      };
  }
}

export function WithdrawalCancelIntroView({ onOpenConfirm, onKeep }: { onOpenConfirm: () => void; onKeep: () => void }) {
  return (
    <AuthFrame
      topTitle="로그인 확인"
      onBack={onKeep}
      backLabel="탈퇴 신청을 그대로 두고 나가기"
      stage={AUTH_NOTICE_STAGE}
      fixedAction={(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button variant="primary" size="lg" block onClick={onOpenConfirm}>탈퇴 신청 취소하고 다시 쓰기</Button>
          <Button variant="neutral" size="lg" block onClick={onKeep}>그대로 두기</Button>
        </div>
      )}
    >
      <div className="tm-auth-exception">
        <AuthIllustration name={AUTH_NOTICE_STAGE.illustration} className="tm-hide-desktop" />
        <span className="tm-badge tm-badge-orange">탈퇴 신청 중</span>
        <h1 className="tm-text-heading tm-auth-heading">탈퇴를 신청한 계정이에요</h1>
        <p className="tm-text-body tm-auth-sub">
          30일 안에는 신청을 취소하고 다시 쓸 수 있어요. 신청할 때 빠진 팀과 경기 명단은 돌아오지 않아요.
        </p>
      </div>
    </AuthFrame>
  );
}

/** 로그인이 끝난 직후 화면이라, 되살린 계정에서 사용자가 직접 챙겨야 하는 것을 단계 카드로 알린다. */
const DONE_STEPS = [
  { title: '계정이 다시 활성화됐어요', body: '이제 평소처럼 쓸 수 있어요.', done: true },
  { title: '팀과 경기 명단을 확인해 주세요', body: '신청할 때 빠진 팀과 명단은 돌아오지 않았어요.', done: false },
  { title: '알림을 다시 켜 주세요', body: '탈퇴를 신청하며 기기 알림이 꺼졌어요.', done: false },
] as const;

export function WithdrawalCancelDoneView({ destination }: { destination: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // 화면이 통째로 바뀌므로 스크린리더가 결과를 읽도록 제목으로 포커스를 옮긴다.
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <AuthFrame
      stage={JOURNEY_DONE_STAGE}
      fixedAction={(
        <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href={destination}>
          {destination === '/home' ? '홈으로 가기' : '계속하기'}
        </Link>
      )}
    >
      <div className="tm-auth-complete">
        <AuthIllustration name={JOURNEY_DONE_STAGE.illustration} className="tm-hide-desktop tm-complete-check" />
        <h1 ref={headingRef} tabIndex={-1} className="tm-text-heading tm-auth-heading">탈퇴 신청을 취소했어요</h1>
        <p className="tm-text-body tm-auth-sub">다시 만나서 반가워요. 아래 두 가지만 확인해 주세요.</p>
        <div className="tm-auth-stack">
          {DONE_STEPS.map((step) => (
            <Card key={step.title} pad={16} className="tm-auth-step-card">
              <span className={`tm-auth-check ${step.done ? 'tm-auth-check-on' : ''}`} aria-hidden="true">✓</span>
              <div>
                <div className="tm-text-body-lg">{step.title}</div>
                <div className="tm-text-caption">{step.body}</div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </AuthFrame>
  );
}
