'use client';

import { useId } from 'react';
import { Button } from '@/components/v1-ui/button';

export type AuthStepAction = {
  label: string;
  disabled: boolean;
  loading: boolean;
  /** 눌러도 되지만 주된 행동이 아닐 때(예: 다른 번호로 인증하기). */
  neutral?: boolean;
  /** `formId` 를 줄 때는 쓰지 않는다 — 폼의 `onSubmit` 이 같은 일을 한다. */
  onClick?: () => void;
};

/**
 * 단계 화면의 하단 고정 버튼(`AuthFrame` 의 `fixedAction` 자리). 버튼이 잠겨 있으면 `hint` 가 이유를 알려 준다.
 *
 * `secondary` 는 주된 버튼 아래에 놓이는 눈에 보이는 출구(예: 나중에 할게요)이고, 잠금 이유와 무관하게 늘 보인다.
 * 그 아래의 `note` 는 출구를 누르면 어떻게 되는지를 알린다.
 *
 * `formId` 를 주면 버튼이 그 폼의 제출 버튼이 된다. 버튼이 폼 바깥(하단 고정 영역)에 있어도 입력칸에서 Enter 를 누르면
 * 브라우저가 이 버튼을 눌러 폼을 제출한다 — 잠긴 버튼이면 제출되지 않는다.
 */
export function AuthStepCta({ action, hint, secondary, formId }: {
  action: AuthStepAction;
  hint?: string | null;
  secondary?: { label: string; onClick: () => void; note: string };
  formId?: string;
}) {
  const noteId = useId();
  return (
    <>
      <button
        className={`tm-btn tm-btn-lg ${action.disabled || action.neutral ? 'tm-btn-neutral' : 'tm-btn-primary'} tm-btn-block`}
        disabled={action.disabled}
        type={formId ? 'submit' : 'button'}
        form={formId}
        onClick={formId ? undefined : action.onClick}
      >
        {action.loading ? <span className="tm-spinner" aria-hidden="true" /> : null}
        {action.label}
      </button>
      {hint ? (
        <p className="tm-text-caption" role="status" style={{ margin: '8px 0 0', textAlign: 'center' }}>
          {hint}
        </p>
      ) : null}
      {secondary ? (
        <>
          <Button aria-describedby={noteId} block size="md" style={{ marginTop: 8 }} type="button" variant="ghost" onClick={secondary.onClick}>
            {secondary.label}
          </Button>
          <p id={noteId} className="tm-text-caption tm-auth-fixed-reason">{secondary.note}</p>
        </>
      ) : null}
    </>
  );
}
