'use client';

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
 * 단계 화면의 하단 고정 버튼(`AuthFrame` 의 `fixedAction` 자리). 버튼이 잠겨 있으면 `hint` 가 이유를 알려 주고,
 * 잠겨 있지 않을 때 덧붙일 말은 `footnote` 로 준다. 둘 다 있으면 이유를 먼저 보여 준다.
 *
 * `formId` 를 주면 버튼이 그 폼의 제출 버튼이 된다. 버튼이 폼 바깥(하단 고정 영역)에 있어도 입력칸에서 Enter 를 누르면
 * 브라우저가 이 버튼을 눌러 폼을 제출한다 — 잠긴 버튼이면 제출되지 않는다.
 */
export function AuthStepCta({ action, hint, footnote, formId }: {
  action: AuthStepAction;
  hint?: string | null;
  footnote?: string | null;
  formId?: string;
}) {
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
      ) : footnote ? (
        <p className="tm-text-caption tm-auth-fixed-reason">{footnote}</p>
      ) : null}
    </>
  );
}
