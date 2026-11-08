'use client';

import { useLayoutEffect, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { ActionBanner } from '@/components/v1-ui/action-banner';
import { useToast } from '@/components/v1-ui/toast';
import { buildEmailVerifyHref } from '@/components/auth/email-verification/email-verify-route';
import { isEmailVerifyNudgeDue, recordEmailVerifyNudgeClosed } from './email-verify-nudge';

/**
 * 마이 탭 맨 위의 이메일 인증 권유. 대상 판정은 호출부(emailVerifyNudgeTarget)가 하고,
 * 여기서는 이 기기의 닫음 기록만 본다.
 *
 * 닫음은 localStorage 라서 서버 렌더에서는 알 수 없다 — 그리기 전에(layout effect) 정해서 아래 내용이 한 번 밀려 내려가지 않게 한다.
 * 닫기 버튼이 사라지면 키보드 포커스가 body 로 떨어지므로, 배너 바로 뒤의 조작 요소로 옮긴다(보이는 포커스 링이 남는다).
 */
export function EmailVerifyBanner({ userId, className }: { userId: string; className?: string }) {
  const [visible, setVisible] = useState(false);
  const { showToast, toast } = useToast();

  useLayoutEffect(() => {
    setVisible(isEmailVerifyNudgeDue(userId));
  }, [userId]);

  const close = (event: MouseEvent<HTMLButtonElement>) => {
    const next = nextFocusableAfter(event.currentTarget.closest('.tm-action-banner'));
    const { willReturn } = recordEmailVerifyNudgeClosed(userId);
    setVisible(false);
    next?.focus();
    // 마지막 닫기에서는 다시 알린다고 약속하지 않는다.
    if (willReturn) showToast('14일 뒤에 다시 알려 드릴게요');
  };

  // 토스트는 고정 위치라 자리를 차지하지 않는다. 배너가 두 열 레이아웃 바로 앞 형제여야 하므로(desktop/my.css) 토스트를 앞에 둔다.
  return (
    <>
      {toast}
      {visible ? (
        <ActionBanner className={className} message="이메일 인증을 마치면 비밀번호를 잊어도 찾을 수 있어요.">
          <Link className="tm-btn tm-btn-sm tm-btn-primary" href={buildEmailVerifyHref('/my')}>
            인증하기
          </Link>
          <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost" aria-label="이메일 인증 안내 닫기" onClick={close}>
            닫기
          </button>
        </ActionBanner>
      ) : null}
    </>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 문서 순서로 `anchor` 다음에 오는 첫 조작 요소. 숨겨진 영역(hidden·aria-hidden) 안의 것은 건너뛴다. */
function nextFocusableAfter(anchor: Element | null): HTMLElement | null {
  if (!anchor) return null;
  for (const element of document.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (anchor.contains(element)) continue;
    if (!(anchor.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    if (element.closest('[hidden], [aria-hidden="true"]')) continue;
    return element;
  }
  return null;
}
