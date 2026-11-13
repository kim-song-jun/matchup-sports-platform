'use client';

import Link from 'next/link';
import { usableWithdrawalDate } from '@/lib/withdrawal-grace';
import type { V1FoundAccount } from '@/types/api';
import { describeFoundAccount } from './found-account-login';
import { KakaoButtonFace } from './kakao-symbol';
import { WithdrawalPendingGuide } from './withdrawal-pending-guide';

/** 방법 1 의 첫 단계 보충 문구 — 이 계정이 실제로 쓰는 로그인 수단을 말한다. */
function loginStepBody(account: V1FoundAccount, socialNames: string, hasEmail: boolean): string | undefined {
  if (!account.hasPassword) return socialNames ? `${socialNames} 로그인으로 가입한 계정이에요.` : undefined;
  if (socialNames) return `이메일이나 ${socialNames} 로그인으로 들어갈 수 있어요.`;
  return hasEmail ? '위 이메일로 가입한 계정이에요.' : '가입한 방법으로 로그인해 주세요.';
}

/**
 * 계정 찾기(번호 또는 이메일)나 이메일 비밀번호 재설정에서 찾은 계정이 탈퇴 유예 중일 때의 결과. 로그인하면 탈퇴 철회 화면이 이어지므로 버튼은
 * 그 계정의 로그인 수단으로 가는 길이다. 로그인할 수 있는 수단이 이 환경에 없으면 문의 창구로 보낸다.
 * 끝나는 날(`until`)을 모르면 "방법 2 · 기다리기"는 그리지 않고 로그인하면 취소할 수 있다는 말만 남긴다 — 번호 인증만 마친 결과가 그렇다.
 */
export function FoundAccountWithdrawalGuide({ account, until, emailLoginHref, loginHref, via = 'phone' }: {
  account: V1FoundAccount;
  /** 유예가 끝나는 시각(ISO). 모르면 null. */
  until: string | null;
  emailLoginHref: string;
  loginHref: string;
  /** 무엇으로 이 계정을 찾았는지 — 유예가 끝나면 다시 쓸 수 있게 되는 것(번호 또는 이메일)을 문구에 맞춘다. */
  via?: 'phone' | 'email';
}) {
  // 목적격 조사까지 붙여 둔다 — 번호는 모음으로, 이메일은 받침으로 끝난다.
  const reused = via === 'email' ? '이메일을' : '번호를';
  const summary = describeFoundAccount(account, { emailLoginHref, loginHref });
  const [primary, ...others] = summary.links;
  const hasWays = usableWithdrawalDate(until) !== null;

  return (
    <WithdrawalPendingGuide
      className="tm-wpg-below-field"
      focusHeadingOnMount
      passwordHelp={account.hasPassword}
      until={until}
      head={{
        title: '탈퇴를 신청한 계정이에요',
        lead: hasWays ? `이 ${reused} 다시 쓰는 방법은 두 가지예요.` : '로그인하면 탈퇴를 취소할 수 있어요.',
        account: summary.maskedEmail
          ? { label: summary.label, value: summary.maskedEmail }
          : summary.methods.length > 0 ? { label: summary.label, methods: summary.methods } : undefined,
      }}
      steps={[
        { title: '계정에 로그인해요', body: loginStepBody(account, summary.socialNames, Boolean(account.maskedEmail)) },
        { title: '탈퇴 신청을 취소해요', body: '로그인하면 취소할 수 있는 화면이 나와요.' },
        { title: '계정을 다시 쓸 수 있어요' },
      ]}
      waitedText={`이 ${reused} 다시 쓸 수 있어요`}
      actions={(
        <>
          {primary ? (
            <Link className="tm-btn tm-btn-lg tm-btn-block tm-btn-primary" href={primary.href}>로그인하고 탈퇴 취소하기</Link>
          ) : (
            <Link className="tm-btn tm-btn-lg tm-btn-block tm-btn-primary" href="/contact">문의 창구 보기</Link>
          )}
          {others.map((link) => (
            <Link
              key={link.label}
              className={`tm-btn tm-btn-lg tm-btn-block ${link.kakao ? 'tm-auth-kakao' : 'tm-btn-neutral'}`}
              href={link.href}
            >
              {link.kakao ? <KakaoButtonFace label={link.label} /> : link.label}
            </Link>
          ))}
          {summary.appleUnavailable ? <p className="tm-text-caption tm-wpg-note">Apple 로그인은 iOS 앱에서 쓸 수 있어요.</p> : null}
        </>
      )}
    />
  );
}
